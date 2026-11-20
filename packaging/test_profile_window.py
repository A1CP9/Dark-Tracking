"""Exercise the packaged profile manager in Chromium on localhost without PSN.

Run with the installer path. The test uses an isolated application-data directory,
a new browser context on each launch and the Playwright development dependency.
"""
import json
import os
import shutil
import subprocess
import sys
from contextlib import contextmanager
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Thread
from urllib.parse import urlsplit
from zipfile import ZipFile



@contextmanager
def local_app():
    from desktop import Desktop
    with Desktop(lambda: None) as server:
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            yield f'http://{server.host}/remote.html#desktop={server.token}'
        finally:
            server.shutdown()
            thread.join()


def exercise(browser, data_dir):
    from playwright.sync_api import expect
    for launch in range(2):
        with local_app() as url, browser.new_context() as context:
            context.route("**/*", lambda route: route.continue_()
                          if urlsplit(route.request.url).hostname == "127.0.0.1" else route.abort())
            page = context.new_page()
            errors = []
            remote_actions = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.on('request', lambda request: remote_actions.append(request.url)
                    if urlsplit(request.url).path in {'/rp/login', '/rp/connect', '/rp/prepare'} else None)
            page.goto(url)
            expect(page.locator('#library')).to_be_visible()
            expect(page.locator('#remotePanel')).to_be_hidden()
            page.locator('#chooseMW4').click()
            expect(page.locator('#profile')).to_be_visible()
            device = page.locator('#device')
            sensitivity = page.locator('#sensitivity')
            interval = page.locator('#interval')
            expect(device).to_be_enabled()
            # Use the normal selectors so persistence covers the rendered controls.
            if launch == 1:
                expect(device).to_have_value('pad')
            device.select_option('keyboard')
            page.locator('#editBindings').click()
            keyboard = page.locator('#bindings').get_by_label('أمام', exact=True)
            expect(page.locator('#padBindings')).to_be_hidden()
            if launch == 0:
                with page.expect_response(lambda r: r.url.endswith('/rp/bindings') and r.request.post_data_json.get('map')) as saved:
                    keyboard.select_option('KeyZ')
                assert saved.value.ok
            else:
                expect(keyboard).to_have_value('KeyZ')
            page.locator('#editInput').click()
            device.select_option('pad')
            page.locator('#editBindings').click()
            pad = page.locator('#padBindings').get_by_label('زر PS5 ×', exact=True)
            expect(page.locator('#bindings')).to_be_hidden()
            if launch == 0:
                with page.expect_response(lambda r: r.url.endswith('/rp/pad-bindings') and r.request.post_data_json.get('map')) as saved:
                    pad.select_option('1')
                assert saved.value.ok
            expect(pad).to_have_value('1')
            expect(page.locator('#padBindings').get_by_label('زر PS5 ○', exact=True)).to_have_value('0')
            page.locator('#editInput').click()
            if launch == 0:
                sensitivity.focus()
                sensitivity.press('End')
                interval.select_option('16')
                device.select_option('pad')
                # Wait for the persisted settings, including changes queued before
                # the final selection, before tearing down the browser and server.
                from time import monotonic, sleep
                deadline = monotonic() + 5
                while monotonic() < deadline:
                    files = list(data_dir.rglob('*.json'))
                    if any(all(json.loads(p.read_text()).get(k) == v for k, v in
                               {'sensitivity': 200, 'device': 'pad', 'interval': 16}.items())
                           for p in files):
                        break
                    sleep(0.05)
                else:
                    raise AssertionError('Profile changes did not persist')
            else:
                expect(device).to_have_value('pad')
                expect(sensitivity).to_have_value('200')
                expect(interval).to_have_value('16')
            page.locator('#openRemote').click()
            expect(page.locator('#remotePanel')).to_be_visible()
            expect(page.locator('#login')).to_be_attached()
            page.locator('#backProfile').click()
            expect(page.locator('#profile')).to_be_visible()
            assert not remote_actions, remote_actions
            assert not errors, errors


def main():
    with TemporaryDirectory() as temp:
        root = Path(temp)
        app = root / 'app'
        with ZipFile(sys.argv[1]) as installer:
            installer.extractall(app)
        data_dir = root / 'user'
        os.environ['LOCALAPPDATA'] = str(data_dir)
        sys.path.insert(0, str(app))
        if '--simulate' in sys.argv:
            runner = Path(__file__).with_name('test_profile_flow.js')
            for launch in range(2):
                with local_app() as url:
                    subprocess.run(['node', runner, app, str(launch)], check=True,
                                   env=dict(os.environ, DT_LOCAL_TEST_URL=url))
            return
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            with p.chromium.launch(executable_path=shutil.which('chromium')) as browser:
                exercise(browser, data_dir)
                print('PASS: profile selection, settings, relaunch and optional Remote Play')


if __name__ == '__main__':
    main()
