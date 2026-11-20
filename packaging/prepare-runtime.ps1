$ErrorActionPreference='Stop'
$dir=(Get-Location).Path
$base=Join-Path $env:LOCALAPPDATA 'DarkTracking'
Start-Transcript -Path (Join-Path $base 'setup.log') -Force | Out-Null
try {
    function Find-Python {
        foreach ($name in @('py', (Join-Path $env:LOCALAPPDATA 'Programs\Python\Python311\python.exe'), 'python')) {
            $bin = Get-Command $name -ErrorAction SilentlyContinue
            if (!$bin) { continue }
            $args311 = @()
            if ($name -eq 'py') { $args311 = @('-3.11') }
            $path = & $bin.Source @args311 -c "import sys,struct; print(sys.executable if sys.version_info[:2]==(3,11) and struct.calcsize('P')==8 else '')"
            if ($LASTEXITCODE -eq 0 -and $path) { return $path }
        }
    }
    $python = Find-Python
    if (!$python) {
        & winget install --id Python.Python.3.11 --exact --scope user --architecture x64 --silent --disable-interactivity --accept-package-agreements --accept-source-agreements
        $python = Find-Python
        if (!$python) { throw 'Python 3.11 x64 is required. Install it and retry.' }
    }
    $venv = Join-Path $dir 'venv'
    $repairArgs = @()
    if (Test-Path -LiteralPath (Join-Path $venv 'pyvenv.cfg')) {
        # Package metadata can survive a missing module. Restore its files on retry.
        $repairArgs = @('--force-reinstall')
    }
    & $python -m venv $venv
    if ($LASTEXITCODE) { throw 'Could not create runtime.' }
    $runtime = Join-Path $dir 'venv\Scripts\python.exe'
    # An installed browser can host the shell if the optional WebView package fails.
    & $runtime -m pip install @repairArgs 'pywebview==5.4'
    Push-Location -LiteralPath $dir
    try {
        & $runtime (Join-Path $dir 'native_window.py') --check-startup
        if ($LASTEXITCODE) { throw 'تعذّر تشغيل الواجهة. راجع نتيجة فحص التشغيل في السجل.' }
    } finally { Pop-Location }
    Set-Content -LiteralPath (Join-Path $dir 'runtime.ready') -Value '0.68'
} catch {
    $_.Exception.Message | Set-Content -Encoding UTF8 -LiteralPath (Join-Path $dir 'setup-error.txt')
    exit 1
} finally { Stop-Transcript | Out-Null }
