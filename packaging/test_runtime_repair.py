"""Offline regression for pip repair with surviving distribution metadata."""
from pathlib import Path
import re
import subprocess
import sys
from tempfile import TemporaryDirectory
from zipfile import ZipFile

with ZipFile(sys.argv[1]) as setup:
    script = setup.read("prepare-runtime.ps1").decode()
guard = "if (Test-Path -LiteralPath (Join-Path $venv 'pyvenv.cfg'))"
repair_flag = re.search(r"\$repairArgs = @\('([^']+)'\)", script)[1]
assert script.index(guard) < script.index(repair_flag) < script.index('pip install @repairArgs')
with TemporaryDirectory() as tmp:
    base = Path(tmp)
    wheels = base / 'wheels'
    wheels.mkdir()
    wheel = wheels / 'dtfixture-1.0-py3-none-any.whl'
    info = 'dtfixture-1.0.dist-info/'
    files = {'dtfixture.py': 'value = 42\n', info+'METADATA': 'Metadata-Version: 2.1\nName: dtfixture\nVersion: 1.0\n',
             info+'WHEEL': 'Wheel-Version: 1.0\nRoot-Is-Purelib: true\nTag: py3-none-any\n'}
    files[info+'RECORD'] = ''.join(name+',,\n' for name in [*files,info+'RECORD'])
    with ZipFile(wheel, 'w') as archive:
        for name, data in files.items():
            archive.writestr(name,data)
    env = base / 'venv'
    subprocess.run([sys.executable,'-m','venv',env],check=True)
    exe = env / ('Scripts/python.exe' if sys.platform=='win32' else 'bin/python')
    install = [exe,'-m','pip','--isolated','--disable-pip-version-check','install','--no-index','--find-links',wheels,'dtfixture==1.0']
    subprocess.run(install,check=True)
    module = Path(subprocess.check_output([exe,'-c','import dtfixture; print(dtfixture.__file__)'],text=True).strip())
    module.unlink()
    subprocess.run(install,check=True)
    assert not module.exists(), 'Expected pip to trust the surviving package metadata'
    subprocess.run([*install,repair_flag],check=True)
    subprocess.run([exe,'-c','import dtfixture; assert dtfixture.value == 42'],check=True)
