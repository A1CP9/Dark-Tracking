"""Exercise the HTTP application extracted from the actual Windows installer."""
import http.client
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from zipfile import ZipFile
from threading import Thread


def probe():
    from desktop import Desktop
    keys = dict(up="KeyW", down="KeyS", left="KeyA", right="KeyD", aim="Mouse2",
                fire="Mouse0", jump="Space", reload="KeyE", swap="KeyQ", crouch="KeyC")
    profile = dict(device="pad", sensitivity=152, interval=8, doubleSwap=True, track=False, correct=True, gain=35)
    for attempt in range(2):
        with Desktop(lambda: "ok") as server:
            preparations = []
            def fail_remote():
                preparations.append(True)
                raise ValueError("test: remote unavailable")
            server.ensure_remote = fail_remote
            thread = Thread(target=server.serve_forever)
            thread.start()
            try:
                def request(method, path, code, data=None):
                    conn = http.client.HTTPConnection(server.host, timeout=5)
                    try:
                        headers = {"Origin": "http://" + server.host, "X-Dark-Session": server.token}
                        conn.request(method, path, json.dumps(data) if data is not None else None, headers)
                        r = conn.getresponse()
                        assert r.status == code, (path, r.status)
                        return r.read()
                    finally:
                        conn.close()
                assert b'id="connect"' in request("GET", "/remote.html", 200)
                assert request("GET", "/icons/musashi.png", 200).startswith(b"\x89PNG")
                request("POST", "/rp/connect", 422, {"host": ""})
                if attempt == 0:
                    request("POST", "/rp/bindings", 200, {"map": keys})
                assert json.loads(request("POST", "/rp/bindings", 200, {}))["map"] == keys
                if attempt == 0:
                    assert json.loads(request("POST", "/rp/color", 200, {}))["color"] is None
                    request("POST", "/rp/color", 200, {"color": "#0088af"})
                    request("POST", "/rp/color", 422, {"color": "broken"})
                else:
                    assert json.loads(request("POST", "/rp/color", 200, {}))["color"] == "#0088af"
                    request("POST", "/rp/color", 200, {"color": "#ff000a"})
                    assert json.loads(request("POST", "/rp/color", 200, {}))["color"] == "#ff000a"
                expected_profile = dict(profile, adsSensitivity=profile["sensitivity"], rapid=False, recoil=False,
                                        katm=False, rapidPeriod=160, recoilPower=15, katmTime=80, yyTime=65, region=100, tolerance=45)
                if attempt == 0:
                    assert json.loads(request("POST","/rp/last-console",200,{}))["host"] is None
                    request("POST","/rp/last-console",200,{"host":"192.168.1.25"})
                    request("POST","/rp/last-console",422,{"host":"invalid"})
                else:
                    assert json.loads(request("POST","/rp/last-console",200,{}))["host"] == "192.168.1.25"
                saved = json.loads(request("POST", "/rp/profile", 200, {}))["profile"]
                if attempt == 0:
                    assert saved["device"] == "keyboard" and saved["sensitivity"] == 100
                    request("POST", "/rp/profile", 200, {"profile": profile})
                    for changes in ({"interval": 9}, {"device": []}, {"gain": True}, {"sensitivity": 201}, {"track": 0}):
                        request("POST", "/rp/profile", 422, {"profile": dict(profile, **changes)})
                else:
                    assert saved == expected_profile
                assert not preparations
                for url, data in (("/rp/login", {}), ("/rp/connect", {"host": "192.168.1.2"})):
                    assert json.loads(request("POST", url, 422, data))["message"] == "test: remote unavailable"
                assert len(preparations) == 2
                assert json.loads(request("POST", "/rp/profile", 200, {}))["profile"] == expected_profile
                state = {"seen": 0, "left": [0, 0], "right": [0, 0], "buttons": [], "edges": []}
                assert json.loads(request("POST", "/rp/poll", 200, state))["running"] is False
                request("POST", "/rp/stop", 200, {})
            finally:
                server.shutdown()
                thread.join()


if __name__ == "__main__":
    if sys.argv[1] == "--probe":
        probe()
    else:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            with ZipFile(sys.argv[1]) as installer:
                installer.extractall(root / "app")
            env = dict(os.environ, LOCALAPPDATA=str(root / "profile"), PYTHONPATH=str(root / "app"))
            subprocess.run([sys.executable, str(Path(__file__).resolve()), "--probe"],
                           cwd=root, env=env, check=True)
