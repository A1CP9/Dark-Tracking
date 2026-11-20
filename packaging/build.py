"""Cross-build a Windows PE installer using gcc and GNU binutils on x86-64 Linux."""
from coff import assemble
from icon_resource import resource_assembly
import base64
import os
from pathlib import Path
import subprocess
import tempfile
import zipfile

here=Path(__file__).resolve().parent
root=here.parent
target=here/'DARK_TRACKING_Setup.exe'
def run(*args):
    subprocess.run(args,check=True)
with tempfile.TemporaryDirectory() as tmp:
    os.chdir(tmp)
    script=(here/'install.ps1').read_text()
    encoded=base64.b64encode(script.encode('utf-16le')).decode()
    strings={'command':'powershell.exe -NoProfile -EncodedCommand '+encoded,
             'pstail':r'\WindowsPowerShell\v1.0\powershell.exe','envname':'DT_INSTALLER',
             'title':'Dark Tracking','message':r'Installation failed. See %LOCALAPPDATA%\DarkTracking\setup.log'}
    source=(here/'setup.s').read_text()+'\n.data\n'
    for name,value in strings.items():
        source+=name+': .byte '+','.join(map(str,(value+'\0').encode('utf-16le')))+'\n'
    assert len(strings["command"]) < 32767
    assemble(source+resource_assembly((root/"icons/musashi.ico").read_bytes()))
    for dll,names in {'kernel32':'GetModuleFileNameW SetEnvironmentVariableW GetSystemDirectoryW CreateProcessW CloseHandle WaitForSingleObject GetExitCodeProcess ExitProcess','user32':'MessageBoxW'}.items():
        # Create link-time import libraries for documented Windows SDK functions.
        Path('imports.s').write_text('.text\n'+''.join(f'.globl {n}\n{n}: ret\n' for n in names.split()))
        run('as','--64','imports.s','-o','imports.o')
        run('objcopy','-O','pe-x86-64','imports.o','imports.obj')
        Path('exports.def').write_text('LIBRARY '+dll+'.dll\nEXPORTS\n'+'\n'.join(names.split()))
        run('ld','-mi386pep','--dll','exports.def','--out-implib',dll+'.a','imports.obj','-o',dll+'.dll')
    run('ld','-mi386pep','--no-insert-timestamp','--image-base','0x400000','--subsystem','windows','--entry','entry','-s','setup.obj','kernel32.a','user32.a','-o',str(target))
    with zipfile.ZipFile(target,'a',zipfile.ZIP_DEFLATED) as bundle:
        def add_file(path, name):
            entry = zipfile.ZipInfo(str(name).replace(os.sep, '/'), (1980, 1, 1, 0, 0, 0))
            entry.create_system = 3
            entry.external_attr = 0o100644 << 16
            bundle.writestr(entry, path.read_bytes(), compress_type=zipfile.ZIP_DEFLATED)
        add_file(here/'prepare-runtime.ps1','prepare-runtime.ps1')
        for pattern in ('netifaces-0.11.0+darktracking.1-py3-none-any.whl','*.html','*.js','desktop.py','remote_session.py','native_window.py','runtime_video_check.py','remote_runtime.py','icons/*','weapons.csv'):
            for path in sorted(root.glob(pattern)):
                if path.is_file() and not path.name.startswith('test_'):
                    add_file(path,path.relative_to(root))
