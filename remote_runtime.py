"""Prepare Remote Play only after the user starts login or a connection."""
import importlib
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import threading

REMOTE_REQUIREMENTS = (
    'pyremoteplay==0.7.6', 'pyee==8.2.2', 'async-timeout==5.0.1',
    'av==12.3.0', 'Pillow',
)
PROBE = """
import sys
sys.path.insert(0, sys.argv[1])
from pyee import ExecutorEventEmitter
import netifaces
netifaces.interfaces()
netifaces.gateways()
from remote_session import dependencies
dependencies()
from runtime_video_check import check_video
check_video()
"""


class RemoteRuntime:
    def __init__(self, root, cache):
        self.root = Path(root)
        self.cache = Path(cache)
        self.lock = threading.Lock()
        self.loaded = False

    def run(self, args, log):
        return subprocess.run(
            [sys.executable, *args], cwd=self.root, stdout=log,
            stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL,
            creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0),
        ).returncode

    def ensure(self):
        with self.lock:
            if self.loaded:
                return
            self.cache.mkdir(parents=True, exist_ok=True)
            marker = self.cache / 'active'
            with (self.cache / 'remote-setup.log').open('a', encoding='utf-8') as log:
                try:
                    name = marker.read_text(encoding='ascii').strip()
                except (FileNotFoundError, UnicodeError):
                    name = ''
                path = self.cache / name
                if not (name.startswith('modules-') and Path(name).name == name and
                        path.is_dir() and self.run(['-c', PROBE, str(path)], log) == 0):
                    path = Path(tempfile.mkdtemp(prefix='modules-', dir=self.cache))
                    wheel = self.root / 'netifaces-0.11.0+darktracking.1-py3-none-any.whl'
                    try:
                        args = ['-m', 'pip', '--disable-pip-version-check', 'install',
                                '--only-binary=netifaces-plus,av', '--target', str(path),
                                str(wheel), *REMOTE_REQUIREMENTS]
                        if self.run(args, log) or self.run(['-c', PROBE, str(path)], log):
                            raise ValueError('تعذّر تجهيز Remote Play. يمكنك متابعة تعديل ملف اللعبة والمحاولة مرة أخرى.')
                        # Each attempt has a unique module directory and pointer temp file.
                        pending = path.with_suffix('.tmp')
                        pending.write_text(path.name, encoding='ascii')
                        os.replace(pending, marker)
                    except Exception:
                        shutil.rmtree(path, ignore_errors=True)
                        raise
            sys.path.insert(0, str(path))
            importlib.invalidate_caches()
            self.loaded = True
