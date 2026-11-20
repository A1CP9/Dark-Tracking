import asyncio
import time
import unittest
from unittest.mock import Mock
from PIL import Image
from remote_session import controls, NEUTRAL, Remote, send_state


class RemoteTests(unittest.TestCase):
    def test_failed_login_never_reuses_previous_account(self):
        from unittest.mock import AsyncMock
        from remote_session import SessionError
        device = Mock()
        device.async_get_status = AsyncMock(return_value=True)
        device.get_users.return_value = ["previous"]
        factory = Mock(return_value=device)
        factory.get_profiles.return_value.new_user.return_value = None
        data = {"user": "previous", "redirect": "https://remoteplay.dl.playstation.net/remoteplay/redirect?code=test", "pin": "12345678"}
        with self.assertRaisesRegex(SessionError, "تسجيل الدخول"):
            asyncio.run(Remote().stream(factory, None, Mock(), "127.0.0.1", data))
        device.register.assert_not_called()
        device.get_users.assert_not_called()
        device.create_session.assert_not_called()

    def test_release(self):
        pad = Mock()
        move = controls({"left":[1,1],"right":[.5,0],"buttons":["R2"]})
        send_state(pad, NEUTRAL, move)
        send_state(pad, move, NEUTRAL)
        pad.button.assert_any_call("R2","release")
        pad.stick.assert_any_call("right",point=(0,0))
        with self.assertRaises(ValueError):
            controls({"left":[4,0],"right":[0,0]})

    def test_same_session(self):
        from unittest.mock import AsyncMock
        remote = Remote()
        device = Mock()
        device.async_get_status = AsyncMock(return_value=True)
        device.get_users.return_value = ["player"]
        device.connect = AsyncMock(return_value=True)
        device.async_wait_for_session = AsyncMock(return_value=True)
        remote.controls = controls({"left":[0,-1],"right":[.5,0],"buttons":[]})
        remote.confirmed_at = remote.last_input = time.monotonic()
        remote.require_release = False
        receiver = Mock()
        frame = Mock()
        frame.to_image.return_value = Image.new("RGB",(80,45),"#FF000A")
        def get_frame():
            remote.stop.set()
            return frame
        receiver.get_video_frame.side_effect = get_frame
        asyncio.run(remote.stream(lambda host: device,None,lambda **kwargs:receiver,"192.168.1.22",{}))
        self.assertEqual(remote.frame[:2],b'\xff\xd8')
        device.create_session.assert_called_once_with("player",receiver=receiver,resolution="720p",fps="low")
        device.controller.stick.assert_any_call("right",point=(.5,0))
        device.controller.stick.assert_any_call("right",point=(0,0))
        device.disconnect.assert_called_once()

    def test_no_first_frame_disconnects_and_allows_retry(self):
        from unittest.mock import AsyncMock, patch
        from remote_session import SessionError
        remote = Remote()
        device, receiver = Mock(), Mock()
        device.async_get_status = AsyncMock(return_value=True)
        device.get_users.return_value = ["player"]
        device.connect = AsyncMock(return_value=True)
        device.async_wait_for_session = AsyncMock(return_value=True)
        receiver.get_video_frame.return_value = None
        with patch("remote_session.FIRST_FRAME_TIMEOUT", 0):
            with self.assertRaisesRegex(SessionError, "أول صورة"):
                asyncio.run(remote.stream(lambda _: device, None, lambda **_: receiver, "192.168.1.2", {}))
        device.disconnect.assert_called_once()
        self.assertIsNone(remote.frame)
        self.assertEqual(remote.controls, NEUTRAL)

    def test_stop_while_waiting_for_ready_skips_input(self):
        from unittest.mock import AsyncMock
        remote, device = Remote(), Mock()
        device.async_get_status = AsyncMock(return_value=True)
        device.get_users.return_value = ["player"]
        device.connect = AsyncMock(return_value=True)
        async def ready():
            remote.handle("stop", {})
            return True
        device.async_wait_for_session = ready
        asyncio.run(remote.stream(lambda _: device, None, Mock(), "192.168.1.2", {}))
        device.controller.start.assert_not_called()
        device.disconnect.assert_called_once()

    def test_pending_preparation_cannot_start_after_stop_or_replacement(self):
        from concurrent.futures import ThreadPoolExecutor
        from threading import Event
        from unittest.mock import patch
        for replace in (False, True):
            with self.subTest(replace=replace):
                remote = Remote()
                entered, resume = Event(), Event()
                def prepare():
                    entered.set()
                    if not resume.wait(3):
                        raise RuntimeError("preparation did not resume")
                with patch("remote_session.dependencies", return_value=(None, None, None)), \
                     patch.object(remote, "run") as run, ThreadPoolExecutor(max_workers=1) as pool:
                    first = pool.submit(remote.handle, "connect", {"host":"192.168.1.2"}, prepare)
                    try:
                        self.assertTrue(entered.wait(3))
                        if replace:
                            remote.handle("connect", {"host":"192.168.1.3"})
                            remote.thread.join(3)
                        else:
                            remote.handle("stop", {})
                    finally:
                        resume.set()
                    with self.assertRaisesRegex(ValueError, "أُلغيت"):
                        first.result(3)
                    if replace:
                        run.assert_called_once()
                        self.assertEqual(run.call_args.args[3], "192.168.1.3")
                    else:
                        run.assert_not_called()
                        self.assertTrue(remote.stop.is_set())

    def test_cancel_during_profile_lookup_skips_registration(self):
        from types import SimpleNamespace
        from unittest.mock import AsyncMock
        remote, device, factory = Remote(), Mock(), Mock()
        factory.return_value = device
        device.async_get_status = AsyncMock(return_value=True)

        def finish_login(*args, **kwargs):
            remote.handle("stop", {})
            return SimpleNamespace(name="player")

        factory.get_profiles.return_value.new_user.side_effect = finish_login
        data = {"redirect": "https://remoteplay.dl.playstation.net/remoteplay/redirect?code=test", "pin": "12345678"}
        device.get_users.return_value = ["player"]
        asyncio.run(remote.stream(factory, None, Mock(), "192.168.1.2", data))
        device.register.assert_not_called()
        device.create_session.assert_not_called()
        device.disconnect.assert_called_once()

    def test_multiple_profiles_require_selection(self):
        from unittest.mock import AsyncMock
        from remote_session import SessionError
        device = Mock()
        device.async_get_status = AsyncMock(return_value=True)
        device.get_users.return_value = ["first", "second"]
        with self.assertRaisesRegex(SessionError, "أكثر من حساب"):
            asyncio.run(Remote().stream(lambda _: device, None, Mock(), "192.168.1.2", {}))
        device.create_session.assert_not_called()

    def test_frozen_frame_releases_and_requires_neutral(self):
        from unittest.mock import patch
        remote = Remote()
        idle = {"left":[0,0],"right":[0,0],"buttons":[]}
        held = dict(idle, buttons=["R2"], right=[0.6,0])
        def poll(now, seen, controls):
            with patch("remote_session.time.monotonic",return_value=now):
                remote.handle("poll",dict(controls,seen=seen))
        remote.frame,remote.counter,remote.frame_at = b"jpeg",1,10
        poll(10,0,held)
        self.assertEqual(remote.controls,NEUTRAL)
        poll(10.1,1,idle)
        poll(10.2,1,held)
        self.assertIn("R2",remote.controls[2])
        poll(10.55,1,held)
        self.assertEqual(remote.controls,NEUTRAL)
        remote.counter,remote.frame_at=2,11
        poll(11,1,held)
        poll(11.1,2,held)
        self.assertEqual(remote.controls,NEUTRAL)
        poll(11.2,2,idle)
        poll(11.3,2,held)
        self.assertIn("R2",remote.controls[2])

    def test_not_ready_disconnects_without_starting_input(self):
        from unittest.mock import AsyncMock
        from remote_session import SessionError
        device = Mock()
        device.async_get_status = AsyncMock(return_value=True)
        device.get_users.return_value = ["player"]
        device.connect = AsyncMock(return_value=True)
        device.async_wait_for_session = AsyncMock(return_value=False)
        with self.assertRaises(SessionError):
            asyncio.run(Remote().stream(lambda _:device,None,Mock(),"192.168.1.2",{"user":"player"}))
        device.controller.start.assert_not_called()
        device.disconnect.assert_called_once()

    def test_missing_host_reports_actionable_error(self):
        with self.assertRaisesRegex(ValueError,"IPv4"):
            Remote().handle("connect",{})

    def test_taps_between_snapshots_and_held_state(self):
        from unittest.mock import call
        from remote_session import button_edges
        pad = Mock()
        changes = [["CROSS",True],["CROSS",False],["SQUARE",True],["SQUARE",True]]
        state = controls({"left":[0,0],"right":[0,0],"buttons":["SQUARE"]})
        send_state(pad,NEUTRAL,state,button_edges({"edges":changes}))
        send_state(pad,state,NEUTRAL)
        self.assertEqual(pad.button.call_args_list,[call("CROSS","press"),call("CROSS","release"),
                         call("SQUARE","press"),call("SQUARE","release")])
        with self.assertRaises(ValueError):
            button_edges({"edges":[["SQUARE","false"]]})

    def test_stale_video_discards_quick_tap(self):
        from unittest.mock import patch
        remote = Remote()
        remote.offered = (4,10)
        with patch("remote_session.time.monotonic",return_value=11):
            remote.handle("poll",{"seen":4,"edges":[["CROSS",True],["CROSS",False]],
                                  "left":[0,0],"right":[0,0],"buttons":[]})
        self.assertEqual(remote.edges,[])
        self.assertTrue(remote.require_release)
