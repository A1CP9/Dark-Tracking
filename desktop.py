"""Local DARK TRACKING desktop launcher. Requires Python 3.9+ on Windows."""
import hashlib
import hmac
import json
import os
import re
from pathlib import Path
import secrets
import shutil
import subprocess
import tempfile
import threading
import urllib.request
import webbrowser
import zipfile
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent
VERSION = "0.1.0"
ASSET = f"KeyboardDS5-{VERSION}-windows-x64.zip"
URL = f"https://github.com/tejasbnshetty/keyboard-ds5/releases/download/v{VERSION}/{ASSET}"
DIGEST = "f842fd1ff5619afe56df9a4447e2e4cf95c7a7ea0bdffb850d2f86d9c5639286"
MAX_BYTES = 50 * 1024 * 1024


def verify(path, expected=DIGEST):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(131072), b""):
            digest.update(chunk)
    return hmac.compare_digest(digest.hexdigest(), expected)


def package(cache):
    cache.mkdir(parents=True, exist_ok=True)
    target = cache / ASSET
    if target.is_file() and verify(target):
        return target
    with tempfile.NamedTemporaryFile(dir=cache, delete=False) as pending:
        temp = Path(pending.name)
    try:
        with urllib.request.urlopen(URL, timeout=45) as response, temp.open("wb") as output:
            size = 0
            for chunk in iter(lambda: response.read(131072), b""):
                size += len(chunk)
                if size > MAX_BYTES:
                    raise ValueError("تجاوز التنزيل الحجم المتوقع.")
                output.write(chunk)
        if not verify(temp):
            raise ValueError("لم تتطابق بصمة الإصدار. أوقف التشغيل.")
        os.replace(temp, target)
        return target
    finally:
        temp.unlink(missing_ok=True)


class Controller:
    def __init__(self):
        self.lock = threading.Lock()
        self.process = None
        self.session = None

    def launch(self):
        with self.lock:
            if self.process is not None and self.process.poll() is None:
                return "نافذة Keyboard DS5 مفتوحة بالفعل."
            if os.name != "nt":
                raise ValueError("تشغيل وحدة التحكم يحتاج Windows.")
            archive = package(Path(os.environ["LOCALAPPDATA"]) / "DarkTracking" / "downloads")
            if self.session:
                shutil.rmtree(self.session, ignore_errors=True)
            self.session = Path(tempfile.mkdtemp(prefix="DarkTracking-"))
            try:
                with zipfile.ZipFile(archive) as payload:
                    payload.extractall(self.session)
                matches = list(self.session.rglob("KeyboardDS5.exe"))
                if len(matches) != 1 or not (matches[0].parent / "_internal").is_dir():
                    raise ValueError("لم يُعثر على وحدة التشغيل كاملة.")
                self.process = subprocess.Popen([str(matches[0])], cwd=matches[0].parent)
            except Exception:
                shutil.rmtree(self.session, ignore_errors=True)
                raise
            return "فُتحت وحدة التحكم. اختر Gaming واضغط F1 داخل نافذتها."


from remote_session import Remote


BIND_ACTIONS = set("up down left right aim fire jump reload swap crouch".split())
BIND_KEYS = set("KeyW KeyS KeyA KeyD Mouse2 Mouse0 Space KeyR KeyQ KeyC Mouse1 ShiftLeft ControlLeft KeyE KeyF ArrowLeft ArrowRight ArrowUp ArrowDown".split())


BIND_KEYS.update("Key" + chr(i) for i in range(65, 91))
BIND_KEYS.update("Digit" + str(i) for i in range(10))
BIND_KEYS.update(("Mouse3","Mouse4","AltLeft","ShiftRight","ControlRight","Tab"))


def valid_bindings(value):
    return (isinstance(value, dict) and value.keys() == BIND_ACTIONS
            and all(isinstance(key, str) and key in BIND_KEYS for key in value.values())
            and len(set(value.values())) == len(BIND_ACTIONS))


def valid_pad_map(value):
    actions = {"CROSS","CIRCLE","SQUARE","TRIANGLE","L1","R1","L2","R2","L3","R3"}
    return (isinstance(value, dict) and value.keys() == actions and
            all(type(v) is int and 0 <= v <= 16 for v in value.values()) and
            len(set(value.values())) == len(actions))

PROFILE_DEFAULTS = {
    "device": "keyboard", "sensitivity": 100, "interval": 25,
    "doubleSwap": False, "track": True, "correct": False, "gain": 25,
}


PROFILE_EXTENSION = {
    "adsSensitivity": 100, "rapid": False, "recoil": False, "katm": False,
    "rapidPeriod": 160, "recoilPower": 15, "katmTime": 80, "yyTime": 65,
}
LEGACY_PROFILE_KEYS = set(PROFILE_DEFAULTS)
PROFILE_DEFAULTS.update(PROFILE_EXTENSION)
PREVIOUS_PROFILE_KEYS = set(PROFILE_DEFAULTS)
TRACKING_DEFAULTS = {"region": 100, "tolerance": 45}
PROFILE_DEFAULTS.update(TRACKING_DEFAULTS)


def upgraded_profile(value):
    if isinstance(value, dict) and value.keys() == LEGACY_PROFILE_KEYS:
        value = {**value, **PROFILE_EXTENSION, "adsSensitivity": value["sensitivity"]}
    if isinstance(value, dict) and value.keys() == PREVIOUS_PROFILE_KEYS:
        return {**value, **TRACKING_DEFAULTS}
    return value


def valid_profile(value):
    value = upgraded_profile(value)
    if not isinstance(value, dict) or value.keys() != PROFILE_DEFAULTS.keys():
        return False
    return (value["device"] in ("keyboard", "pad")
            and type(value["sensitivity"]) is int and 1 <= value["sensitivity"] <= 200
            and type(value["interval"]) is int and value["interval"] in (1, 4, 8, 16, 25)
            and type(value["gain"]) is int and 0 <= value["gain"] <= 100
            and all(type(value[key]) is bool for key in ("doubleSwap", "track", "correct", "rapid", "katm", "recoil"))
            and all(type(value[k]) is int and lo <= value[k] <= hi for k, lo, hi in
                    (("adsSensitivity",1,200), ("rapidPeriod",100,600), ("recoilPower",0,100),
                     ("katmTime",40,300), ("yyTime",40,200), ("region",10,100), ("tolerance",0,150))))


def bindings_file(path, request, validate=valid_bindings, field="map"):
    if not request:
        try:
            stored = json.loads(path.read_text(encoding="utf8"))
        except (FileNotFoundError, UnicodeError, json.JSONDecodeError):
            stored = None
        return {field: stored if validate(stored) else None}
    value = request.get(field)
    if not validate(value):
        raise ValueError("قيمة الإعداد غير صالحة.")
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as stream:
        tmp = Path(stream.name)
    try:
        tmp.write_text(json.dumps(value), encoding="utf8")
        os.replace(tmp, path)
    finally:
        tmp.unlink(missing_ok=True)
    return {field: value}


GAME_IDS = ("mw4", "warzone", "apex", "fortnite")


def preset_file(path, change):
    def valid_record(record):
        return (isinstance(record, dict) and isinstance(record.get("name"), str)
                and len(record["name"]) <= 40 and valid_profile(record.get("profile")))

    if change and ("profile" not in change or change.keys() - {"profile", "name"}):
        raise ValueError("بيانات الضبطة غير صالحة.")
    if change:
        record = {"name": change.get("name", ""), "profile": change["profile"]}
        if not valid_record(record):
            raise ValueError("اسم الضبطة أو إعداداتها غير صالحة.")
        record["name"] = record["name"].strip()
        bindings_file(path, {"record": record}, valid_record, "record")
    else:
        record = bindings_file(path, {}, lambda v: valid_record(v) or valid_profile(v), "record")["record"]
        if not valid_record(record):
            record = {"name": "", "profile": record}
    return {"name": record["name"], "profile": upgraded_profile(record["profile"])}


class Desktop(ThreadingHTTPServer):
    def __init__(self, launch):
        self.token = secrets.token_urlsafe(32)
        self.launch = launch
        self.remote = Remote()
        self.bindings = Path(os.environ.get("LOCALAPPDATA", Path.home())) / "DarkTracking" / "bindings.json"
        super().__init__(("127.0.0.1", 0), Handler)
        self.host = "127.0.0.1:" + str(self.server_port)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args):
        super().__init__(*args, directory=str(ROOT))

    def log_message(self, *args):
        pass

    def list_directory(self, path):
        self.send_error(404)

    def do_POST(self):
        if self.path != "/desktop/controller" and self.path not in {"/rp/login","/rp/connect","/rp/poll","/rp/stop","/rp/bindings","/rp/pad-bindings","/rp/color","/rp/profile","/rp/last-console","/rp/last-game","/rp/window-ready","/rp/preset"}:
            return self.send_error(404)
        host = self.server.host
        if (self.headers.get("Host") != host or self.headers.get("Origin") != "http://" + host
                or not hmac.compare_digest(self.headers.get("X-Dark-Session", ""), self.server.token)):
            return self.send_error(403)
        try:
            if self.path.startswith("/rp/"):
                length = int(self.headers.get("Content-Length", "0"))
                if not 0 < length <= 8192:
                    return self.send_error(400)
                data = json.loads(self.rfile.read(length))
                if not isinstance(data, dict):
                    return self.send_error(400)
                if self.path == "/rp/window-ready":
                    ticket = os.environ.get("DT_START_TICKET", "")
                    if re.fullmatch(r"[0-9a-f]{32}", ticket):
                        receipt = self.server.bindings.parent / ("window-" + ticket + ".ready")
                        receipt.parent.mkdir(parents=True, exist_ok=True)
                        receipt.touch()
                    result = {"ready": True}
                elif self.path == "/rp/login":
                    prepare = getattr(self.server, "ensure_remote", None)
                    if prepare:
                        prepare()
                    login = getattr(self.server, "native_login", None)
                    result = login() if login else self.server.remote.handle("login", data)
                elif self.path == "/rp/connect":
                    result = self.server.remote.handle("connect", data, prepare=getattr(self.server, "ensure_remote", None))
                elif self.path == "/rp/last-game":
                    result = bindings_file(self.server.bindings.with_name("last-game.json"), data,
                                           lambda game: game in GAME_IDS, field="game")
                elif self.path == "/rp/last-console":
                    from ipaddress import IPv4Address, AddressValueError
                    def valid_console(value):
                        try:
                            return isinstance(value, str) and str(IPv4Address(value)) == value
                        except AddressValueError:
                            return False
                    result = bindings_file(self.server.bindings.with_name("last-console.json"), data, valid_console, "host")
                elif self.path in ("/rp/profile", "/rp/preset"):
                    game = data.pop("game", "mw4")
                    if game not in GAME_IDS:
                        raise ValueError("ملف اللعبة غير معروف.")
                    if self.path == "/rp/profile":
                        path = self.server.bindings.with_name(f"profile-{game}.json")
                        result = bindings_file(path, data, valid_profile, "profile")
                        result["profile"] = upgraded_profile(result["profile"]) or PROFILE_DEFAULTS
                    else:
                        slot = data.get("slot")
                        if type(slot) is not int or slot not in (0, 1, 2, 3):
                            raise ValueError("رقم الضبطة غير صالح.")
                        if slot == 0:
                            if set(data) != {"slot"}:
                                raise ValueError("ضبط المصنع للقراءة فقط.")
                            result = {"profile": PROFILE_DEFAULTS}
                        else:
                            change = {k:v for k,v in data.items() if k != "slot"}
                            path = self.server.bindings.with_name(f"preset-{game}-{slot}.json")
                            result = preset_file(path, change)
                elif self.path == "/rp/color":
                    result = bindings_file(self.server.bindings.with_name("color.json"), data,
                                           lambda v: isinstance(v, str) and re.fullmatch(r"#[0-9a-fA-F]{6}", v),
                                           field="color")
                elif self.path == "/rp/pad-bindings":
                    result = bindings_file(self.server.bindings.with_name("pad-bindings.json"), data, valid_pad_map)
                elif self.path == "/rp/bindings":
                    result = bindings_file(self.server.bindings, data)
                else:
                    result = self.server.remote.handle(self.path[4:], data)
                if isinstance(result, tuple):
                    payload, number, age = result
                    self.send_response(200)
                    self.send_header("Content-Type", "image/jpeg")
                    self.send_header("X-Frame", str(number))
                    self.send_header("X-Frame-Age-Ms", str(age))
                else:
                    payload = json.dumps(result).encode()
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json")
                self.send_header("Cache-Control", "no-store")
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)
                return
            message = self.server.launch()
            code = 200
        except ValueError as err:
            message, code = str(err), 422
        except (OSError, zipfile.BadZipFile):
            message, code = "تعذّر تنزيل وحدة التحكم أو فتحها. تحقق من الاتصال وأعد المحاولة.", 503
        body = json.dumps({"message": message}).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    controller = Controller()
    with Desktop(controller.launch) as server:
        address = "http://" + server.host + "/index.html#desktop=" + server.token
        print("Keep this window open. Press Ctrl+C to exit.", flush=True)
        webbrowser.open(address)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
