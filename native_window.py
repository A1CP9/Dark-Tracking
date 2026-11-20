"""Installed Windows window for the integrated Remote Play client."""
import ctypes
import inspect
import json
import os
import sys
import threading
import subprocess
import tempfile
import traceback
from pathlib import Path
from urllib.parse import urlsplit, parse_qs
from desktop import Desktop, ROOT
from remote_session import dependencies
from remote_runtime import RemoteRuntime

def login_callback(url):
    parsed = urlsplit(url or "")
    return (parsed.scheme == "https" and parsed.netloc == "remoteplay.dl.playstation.net"
            and bool(parse_qs(parsed.query).get("code")))

def complete_login(popup, main_window, main_url):
    url = popup.get_current_url()
    current = main_window.get_current_url() or ""
    if login_callback(url) and current.split("#")[0] == main_url:
        main_window.evaluate_js("document.getElementById('redirect').value=" + json.dumps(url))
        main_window.evaluate_js("document.getElementById('pairing').open=true;document.getElementById('status').textContent='رجعت من PlayStation. أدخل رمز الربط لأول مرة ثم اضغط بدء الاتصال.';document.getElementById('pin').focus()")
        popup.destroy()


def load_runtime(root):
    try:
        import webview
    except (ImportError, OSError) as error:
        (root / "runtime.ready").unlink(missing_ok=True)
        raise RuntimeError(
            "تعذّر تحميل واجهة التطبيق. افتح اختصار Dark Tracking مجددًا "
            "واضغط «تجهيز التطبيق» لإصلاح التثبيت."
        ) from error
    return webview


def browser_path():
    for folder in ("PROGRAMFILES(X86)", "PROGRAMFILES", "LOCALAPPDATA"):
        if not os.environ.get(folder):
            continue
        for product in ("Microsoft/Edge/Application/msedge.exe", "Google/Chrome/Application/chrome.exe"):
            candidate = Path(os.environ[folder]) / product
            if candidate.is_file():
                return candidate
    return None


def check_startup():
    for name in ("remote.html", "remote.js", "game-manager.js"):
        if not (ROOT / name).is_file():
            raise FileNotFoundError(name)
    if not browser_path():
        import webview
    with Desktop(lambda: None):
        pass


def run_window(server, main_url, session_url):
    import webview
    main_window = webview.create_window("Dark Tracking", session_url, width=1280, height=860, maximized=True)
    def login():
        _, oauth, _ = dependencies()
        popup = webview.create_window("PlayStation", oauth.get_login_url(), width=640, height=760)
        popup.events.loaded += lambda: complete_login(popup, main_window, main_url)
        return {"embedded": True}
    server.native_login = login
    options = {"gui": "edgechromium"}
    if "icon" in inspect.signature(webview.start).parameters:
        options["icon"] = str(ROOT / "icons/musashi.ico")
    webview.start(**options)


def main(browser_only=False):
    base = Path(os.environ["LOCALAPPDATA"]) / "DarkTracking"
    base.mkdir(parents=True, exist_ok=True)
    with Desktop(lambda: "Open the integrated session.") as server:
        main_url = "http://" + server.host + "/remote.html"
        session_url = main_url + "#desktop=" + server.token
        server.ensure_remote = RemoteRuntime(ROOT, base / "remote-components" / ROOT.name).ensure
        worker = threading.Thread(target=server.serve_forever, daemon=True)
        worker.start()
        try:
            if not browser_only:
                try:
                    run_window(server, main_url, session_url)
                    return
                except (Exception, SystemExit):
                    with (base / "startup.log").open("a", encoding="utf-8") as log:
                        traceback.print_exc(file=log)
            browser = browser_path()
            if not browser:
                raise RuntimeError("تعذّر تشغيل واجهة التطبيق ولم يُعثر على Edge أو Chrome.")
            server.native_login = None
            with tempfile.TemporaryDirectory(prefix="dt-window-", ignore_cleanup_errors=True) as profile:
                subprocess.run([str(browser), "--no-first-run", "--no-default-browser-check",
                                "--user-data-dir=" + profile, "--app=" + session_url], check=True)
        finally:
            server.remote.handle("stop", {})
            server.shutdown()
            worker.join()
if __name__ == "__main__":
    if sys.argv[1:] == ["--check-startup"]:
        log_path = Path(os.environ["LOCALAPPDATA"]) / "DarkTracking" / "startup.log"
        try:
            check_startup()
        except Exception:
            with log_path.open("a", encoding="utf-8") as log:
                traceback.print_exc(file=log)
            sys.exit(1)
        sys.exit(0)
    try:
        main(browser_only=sys.argv[1:] == ["--browser-window"])
    except Exception as error:
        ctypes.windll.user32.MessageBoxW(0, str(error), "Dark Tracking", 16)
        raise
