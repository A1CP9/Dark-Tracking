import hashlib
import http.client
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch

import desktop


class DesktopTests(unittest.TestCase):
    def test_button_route(self):
        calls = []
        with desktop.Desktop(lambda: calls.append(1) or "OK") as server:
            worker = threading.Thread(target=server.serve_forever)
            worker.start()
            try:
                headers = {"Origin": "http://" + server.host, "X-Dark-Session": server.token}
                for update, status in [({"Origin": "http://other"}, 403), ({"Host": "other"}, 403),
                                       ({"X-Dark-Session": "expired"}, 403), ({}, 200)]:
                    conn = http.client.HTTPConnection(server.host)
                    conn.request("POST", "/desktop/controller", headers={**headers, **update})
                    self.assertEqual(conn.getresponse().status, status)
                    conn.close()
                self.assertEqual(calls, [1])
            finally:
                server.shutdown()
                worker.join()

    def test_reject_corrupt_download(self):
        from io import BytesIO
        with tempfile.TemporaryDirectory() as path, patch("desktop.urllib.request.urlopen",return_value=BytesIO(b"bad")):
            with self.assertRaises(ValueError):
                desktop.package(Path(path))
            self.assertEqual(list(Path(path).iterdir()), [])

    def test_cache(self):
        with tempfile.TemporaryDirectory() as path:
            target = Path(path) / desktop.ASSET
            target.write_bytes(b"sample")
            self.assertTrue(desktop.verify(target, hashlib.sha256(b"sample").hexdigest()))

    def test_bindings_survive_restart_and_invalid_edit(self):
        keys = dict(up="KeyW",down="KeyS",left="KeyA",right="KeyD",aim="Mouse2",fire="Mouse0",
                    jump="Space",reload="KeyE",swap="KeyQ",crouch="KeyC")
        with tempfile.TemporaryDirectory() as path, patch.dict("os.environ",LOCALAPPDATA=path):
            with desktop.Desktop(lambda: None) as first, desktop.Desktop(lambda: None) as second:
                self.assertNotEqual(first.host, second.host)
                self.assertIsNone(desktop.bindings_file(first.bindings,{})["map"])
                desktop.bindings_file(first.bindings,{"map":keys})
                with self.assertRaises(ValueError):
                    desktop.bindings_file(second.bindings,{"map":dict(keys,fire="KeyA")})
                self.assertEqual(desktop.bindings_file(second.bindings,{})["map"],keys)
                second.bindings.write_text("{")
                self.assertIsNone(desktop.bindings_file(second.bindings,{})["map"])
