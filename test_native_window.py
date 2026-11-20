import unittest
from native_window import login_callback

class NativeLoginTests(unittest.TestCase):
    def test_only_accept_official_https_callback_with_code(self):
        self.assertTrue(login_callback('https://remoteplay.dl.playstation.net/remoteplay/redirect?code=sample'))
        for url in ('https://remoteplay.dl.playstation.net.example.com/?code=x','http://remoteplay.dl.playstation.net/?code=x',
                    'https://remoteplay.dl.playstation.net/remoteplay/redirect?error=cancel',None):
            self.assertFalse(login_callback(url))

    def test_callback_waits_for_main_window(self):
        from unittest.mock import Mock
        from native_window import complete_login
        popup, main = Mock(), Mock()
        page = "http://127.0.0.1:8000/remote.html"
        popup.get_current_url.return_value = "https://remoteplay.dl.playstation.net/remoteplay/redirect?code=sample"
        for current in (None, page + "/other"):
            main.get_current_url.return_value = current
            complete_login(popup, main, page)
        main.evaluate_js.assert_not_called()
        popup.destroy.assert_not_called()
        main.get_current_url.return_value = page
        complete_login(popup, main, page)
        self.assertEqual(main.evaluate_js.call_count, 2)
        popup.destroy.assert_called_once()

class InstalledRuntimeRecoveryTests(unittest.TestCase):
    def test_invalid_install_reopens_setup_and_preserves_settings(self):
        from pathlib import Path
        from tempfile import TemporaryDirectory
        from unittest.mock import Mock, patch
        from native_window import load_runtime
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            marker = root / 'runtime.ready'
            marker.touch()
            settings = root / 'bindings.json'
            settings.write_text('{"jump":"Space"}')
            with patch.dict('sys.modules', webview=None):
                with self.assertRaisesRegex(RuntimeError, 'تجهيز التطبيق'):
                    load_runtime(root)
            self.assertFalse(marker.exists())
            marker.touch()
            with patch.dict('sys.modules', webview=Mock()) as modules, patch('native_window.dependencies', side_effect=ValueError) as remote:
                self.assertIs(load_runtime(root), modules['webview'])
            remote.assert_not_called()
            self.assertEqual(settings.read_text(), '{"jump":"Space"}')
            self.assertTrue(marker.exists())
