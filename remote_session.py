"""One authenticated PS5 session for manual input and decoded game frames."""
import asyncio
import io
import ipaddress
import math
import threading
import time
from urllib.parse import urlsplit

NEUTRAL = ((0, 0), (0, 0), frozenset())


FRAME_TIMEOUT = 0.5
FIRST_FRAME_TIMEOUT = 15.0


def controls(data):
    def pair(key):
        coords = data.get(key)
        if not isinstance(coords, list) or len(coords) != 2 or not all(
            isinstance(v, (float, int)) and math.isfinite(v) and abs(v) <= 1 for v in coords
        ):
            raise ValueError("قيمة العصا غير صالحة.")
        length = max(1, math.hypot(*coords))
        return tuple(v / length for v in coords)
    buttons = data.get("buttons", [])
    if not isinstance(buttons, list) or any(not isinstance(b,str) or b not in BUTTONS for b in buttons):
        raise ValueError("زر غير صالح.")
    return pair("left"), pair("right"), frozenset(buttons)


BUTTONS = {"L1","R1","L3","R3","R2","L2","CROSS","SQUARE","TRIANGLE","CIRCLE"}


def button_edges(data):
    events = data.get("edges", [])
    if not isinstance(events, list) or len(events) > 64:
        raise ValueError("قائمة ضغطات غير صالحة.")
    for event in events:
        if (not isinstance(event, list) or len(event) != 2 or not isinstance(event[0], str)
                or event[0] not in BUTTONS or type(event[1]) is not bool):
            raise ValueError("ضغطة غير صالحة.")
    return events


def send_state(controller, prior, state, edges=()):
    left, right, buttons = state
    for name, before, after in zip(("left","right"), prior[:2], (left,right)):
        if before != after:
            controller.stick(name, point=after)
    held = set(prior[2])
    for button, down in edges:
        if (button in held) == down:
            continue
        controller.button(button, "press" if down else "release")
        if down:
            held.add(button)
        else:
            held.discard(button)
    for button in held - buttons:
        controller.button(button, "release")
    for button in buttons - held:
        controller.button(button, "press")


def dependencies():
    try:
        from pyremoteplay import RPDevice, oauth
        from pyremoteplay.receiver import QueueReceiver
        from PIL import Image
    except (ImportError, OSError) as err:
        raise ValueError("تعذّر تحميل مكتبات الاتصال بالـ PS5.") from err
    return RPDevice, oauth, QueueReceiver


class Remote:
    def __init__(self):
        self.guard = threading.Lock()
        self.thread = None
        self.connection_attempt = 0
        self.stop = threading.Event()
        self.message = "غير متصل"
        self.controls = NEUTRAL
        self.last_input = self.last_poll = 0
        self.frame = None
        self.counter = 0
        self.frame_at = 0
        self.offered = (0, 0)
        self.confirmed_at = 0
        self.require_release = True
        self.edges = []

    def handle(self, action, data, prepare=None):
        if action == "login":
            _, oauth, _ = dependencies()
            return {"url": oauth.get_login_url()}
        if action == "connect":
            try:
                addr = ipaddress.IPv4Address(str(data.get("host","")).strip())
            except ipaddress.AddressValueError:
                raise ValueError("أدخل عنوان IPv4 للسوني، مثل 192.168.1.10.") from None
            if not addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_unspecified:
                raise ValueError("أدخل عنوان السوني في شبكتك المحلية.")
            with self.guard:
                if self.thread and self.thread.is_alive():
                    raise ValueError("جلسة قيد التشغيل.")
                self.connection_attempt += 1
                attempt = self.connection_attempt
            if prepare is not None:
                prepare()
            device_type, oauth, receiver = dependencies()
            with self.guard:
                if attempt != self.connection_attempt:
                    raise ValueError("أُلغيت محاولة الاتصال.")
                self.edges.clear()
                self.stop.clear()
                self.offered = (0, 0)
                self.confirmed_at = 0
                self.require_release = True
                self.frame = None
                self.counter = 0
                self.last_poll = time.monotonic()
                self.controls = NEUTRAL
                self.message = "جارٍ الاتصال"
                self.thread = threading.Thread(target=self.run, args=(device_type, oauth, receiver, str(addr), data), daemon=True)
                self.thread.start()
            return {}
        with self.guard:
            if action == "stop":
                self.connection_attempt += 1
                self.edges.clear()
                self.stop.set()
                self.controls = NEUTRAL
            elif action == "poll":
                requested = controls(data)
                events = button_edges(data)
                now = time.monotonic()
                self.last_poll = self.last_input = now
                seen = data.get("seen")
                number, timestamp = self.offered
                if seen == number and number > 0:
                    self.confirmed_at = timestamp
                if not self.confirmed_at or now - self.confirmed_at >= FRAME_TIMEOUT:
                    self.require_release = True
                elif requested == NEUTRAL and not events:
                    self.require_release = False
                if self.require_release or len(self.edges) + len(events) > 64:
                    self.edges.clear()
                else:
                    self.edges.extend((now, event) for event in events)
                self.controls = NEUTRAL if self.require_release else requested
                if self.frame and self.counter != data.get("seen"):
                    self.offered = (self.counter, self.frame_at)
                    return self.frame, self.counter, int(1000*(time.monotonic()-self.frame_at))
            else:
                raise ValueError("طلب غير معروف.")
            return {"message": self.message, "running": bool(self.thread and self.thread.is_alive())}

    def run(self, *args):
        try:
            asyncio.run(self.stream(*args))
        except Exception as error:
            # Never surface account URLs, PINs or pairing keys in error output.
            self.message = str(error) if isinstance(error, SessionError) else "تعذر الاتصال أو فك الصورة. تحقق من الإقران والتوافق."
        finally:
            with self.guard:
                self.frame = None
                self.controls = NEUTRAL

    async def stream(self, device_type, oauth, receiver_type, host, data):
        device = device_type(host)
        prior = NEUTRAL
        try:
            if not await asyncio.wait_for(device.async_get_status(), 10):
                raise SessionError("لم يرد السوني. تحقق من العنوان وتفعيل Remote Play.")
            if self.stop.is_set():
                return
            name = data.get("user","").strip()
            redirect = data.pop("redirect","").strip()
            if redirect:
                url = urlsplit(redirect)
                if url.scheme != "https" or url.hostname != "remoteplay.dl.playstation.net":
                    raise SessionError("عنوان إعادة التوجيه غير مطابق لصفحة PlayStation.")
                profiles = device_type.get_profiles()
                profile = await asyncio.to_thread(profiles.new_user, redirect, save=True)
                if self.stop.is_set():
                    return
                if not profile or not getattr(profile, "name", None):
                    raise SessionError("تعذّر تأكيد تسجيل الدخول إلى PlayStation. أعد تسجيل الدخول ثم حاول مجددًا.")
                name = profile.name
            pin = data.pop("pin","").strip()
            if pin:
                if not (pin.isascii() and pin.isdigit() and len(pin)==8 and name):
                    raise SessionError("أدخل اسم PSN ورمز الربط المكوّن من ثمانية أرقام.")
                if not await asyncio.to_thread(device.register, name, pin, save=True):
                    raise SessionError("تعذّر الإقران. تحقق من الحساب ورمز الربط.")
            users = list(device.get_users() or [])
            if not name and len(users) == 1:
                name = users[0]
            if not name and len(users) > 1:
                raise SessionError("عندك أكثر من حساب مقترن. افتح إعدادات الحساب وأدخل اسم الحساب المطلوب.")
            if name not in users:
                raise SessionError("اختر حساب PSN المقترن أو أكمل الربط الأول.")
            if self.stop.is_set():
                return
            receiver = receiver_type(max_frames=1)
            device.create_session(name, receiver=receiver, resolution="720p", fps="low")
            if not await asyncio.wait_for(device.connect(), 20):
                raise SessionError("رفض الجهاز بدء جلسة البث.")
            if not await asyncio.wait_for(device.async_wait_for_session(), 20):
                raise SessionError("لم تصبح جلسة اللعب جاهزة. أعد الاتصال.")
            if self.stop.is_set():
                return
            device.controller.start()
            self.message = "متصل، بانتظار الصورة"
            with self.guard:
                self.last_poll = time.monotonic()
                first_frame_deadline = self.last_poll + FIRST_FRAME_TIMEOUT
            while device.connected and not self.stop.is_set():
                with self.guard:
                    now = time.monotonic()
                    if now-self.last_poll > 8:
                        break
                    if not self.confirmed_at or now - self.confirmed_at >= FRAME_TIMEOUT or now-self.last_input >= .35:
                        self.require_release = True
                        self.controls = NEUTRAL
                    events = [] if self.require_release else [event for stamp, event in self.edges if now-stamp < .15]
                    self.edges.clear()
                    state = self.controls
                send_state(device.controller, prior, state, events)
                prior = state
                frame = receiver.get_video_frame()
                if frame is None and first_frame_deadline is not None and now >= first_frame_deadline:
                    raise SessionError("اتصل البلايستيشن، لكن لم تصل أول صورة خلال 15 ثانية. أعد الاتصال.")
                if frame is not None:
                    first_frame_deadline = None
                    buffer = io.BytesIO()
                    frame.to_image().save(buffer, format="JPEG", quality=78)
                    with self.guard:
                        self.frame = buffer.getvalue()
                        self.frame_at = time.monotonic()
                        self.counter += 1
                await asyncio.sleep(.02)
            self.message = "انتهت الجلسة"
        finally:
            try:
                if prior != NEUTRAL:
                    send_state(device.controller, prior, NEUTRAL)
            finally:
                device.disconnect()


class SessionError(Exception):
    pass
