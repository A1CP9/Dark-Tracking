"""Run the packaged entry on Linux. A stand-in window fetches the live app URL."""
import os
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
from zipfile import ZipFile

with TemporaryDirectory() as tmp:
    root = Path(tmp)
    app = root / 'installed'
    with ZipFile(sys.argv[1]) as setup:
        setup.extractall(app)
    browser = root / 'programs' / 'Microsoft/Edge/Application/msedge.exe'
    browser.parent.mkdir(parents=True)
    browser.write_text('''#!/usr/bin/env python3
import json, os, sys, urllib.request
from pathlib import Path
from urllib.parse import urlsplit
address = next(a[6:] for a in sys.argv[1:] if a.startswith("--app="))
parts = urlsplit(address)
assert parts.hostname == "127.0.0.1"
origin = parts.scheme + "://" + parts.netloc
with urllib.request.urlopen(origin+parts.path) as page:
    assert 'مكتبة الألعاب' in page.read().decode()
headers = {"Origin":origin, "Content-Type":"application/json", "X-Dark-Session":parts.fragment.split("=")[1]}
def post(data):
    req = urllib.request.Request(origin+"/rp/profile",data=json.dumps(data).encode(),headers=headers)
    return json.load(urllib.request.urlopen(req))["profile"]
profile = post({})
assert profile["device"] == "keyboard"
profile["adsSensitivity"] = 69
post({"profile":profile})
assert post({})["adsSensitivity"] == 69
ticket = os.environ["DT_START_TICKET"]
receipt = Path(os.environ["LOCALAPPDATA"],"DarkTracking","window-"+ticket+".ready")
assert not receipt.exists()
assert json.load(urllib.request.urlopen(urllib.request.Request(origin+"/rp/window-ready",data=b"{}",headers=headers)))["ready"]
assert receipt.exists()
Path(os.environ["LOCALAPPDATA"],"opened").touch()
''')
    browser.chmod(0o755)
    env = dict(os.environ, LOCALAPPDATA=str(root), DT_START_TICKET="12"*16, PROGRAMFILES=str(root / 'programs'))
    (root / 'DarkTracking').mkdir()
    args = [sys.executable,'-S',str(app/'native_window.py')]
    subprocess.run([*args,'--check-startup'],env=env,check=True,timeout=15)
    subprocess.run(args,env=env,check=True,timeout=15)
    assert (root/'opened').is_file()
    (root/'opened').unlink()
    env['DT_START_TICKET']='34'*16
    subprocess.run([*args,'--browser-window'],env=env,check=True,timeout=15)
    assert (root/'opened').is_file()
    print('PASS explicit browser recovery with independent launch receipt')
    print('PASS packaged entry, missing WebView, fallback URL, library, profile read/write, shutdown')
