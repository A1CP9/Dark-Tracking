import sys
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from remote_runtime import RemoteRuntime


class RemoteRuntimeTests(unittest.TestCase):
    def test_failed_attempt_keeps_home_working_and_clean_retry_is_reused(self):
        with TemporaryDirectory() as tmp, patch.object(sys, 'path', list(sys.path)):
            root = Path(tmp)
            cache = root / 'remote-components'
            runtime = RemoteRuntime(root, cache)
            self.assertFalse(cache.exists())
            with patch.object(runtime, 'run', side_effect=[0, 1]) as failed:
                with self.assertRaises(ValueError):
                    runtime.ensure()
                self.assertIn('pyee==8.2.2', failed.call_args_list[0].args[0])
            self.assertFalse((cache / 'active').exists())
            self.assertEqual(list(cache.glob('modules-*')), [])
            with patch.object(runtime, 'run', side_effect=[0, 0]) as fixed:
                runtime.ensure()
                runtime.ensure()
                self.assertEqual(fixed.call_count, 2)
            active = (cache / 'active').read_text()
            self.assertEqual(Path(sys.path[0]), cache / active)
            reopened = RemoteRuntime(root, cache)
            with patch.object(reopened, 'run', return_value=0) as reuse:
                reopened.ensure()
                self.assertEqual(reuse.call_count, 1)
                self.assertEqual(reuse.call_args.args[0][0], '-c')
