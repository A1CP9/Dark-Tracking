$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[Windows.Forms.Application]::EnableVisualStyles()
$base=Join-Path $env:LOCALAPPDATA 'DarkTracking'
$log=Join-Path $base 'setup.log'
$dir=Join-Path $base 'releases\0.68'
$installed=Join-Path $dir 'Dark Tracking.exe'
$icon=Join-Path $dir 'icons\musashi.ico'
$guard=New-Object System.Threading.Mutex($false,'Local\DarkTrackingSetup058')
if (!$guard.WaitOne(0)) { [void][Windows.Forms.MessageBox]::Show('نافذة التثبيت مفتوحة بالفعل.','Dark Tracking'); exit 0 }
function Set-AppShortcuts([switch]$KeepExisting) {
    $ws=New-Object -ComObject WScript.Shell
    foreach ($folder in @('DesktopDirectory','Programs')) {
        $linkDir=[Environment]::GetFolderPath($folder)
        $name='Dark Tracking.lnk'
        $file=Join-Path $linkDir $name
        if ($KeepExisting -and (Test-Path -LiteralPath $file)) { continue }
        $link=$ws.CreateShortcut($file)
        $link.TargetPath=$installed
        $link.Arguments=''
        $link.WorkingDirectory=$dir
        $link.IconLocation=$icon+',0'
        $link.Save()
        # Ensure exact display capitalization on case-insensitive Windows volumes.
        $actual=Get-Item -LiteralPath $file
        if ($actual.Name -cne $name) {
            $tempName=[Guid]::NewGuid().ToString('N')+'.lnk'
            Rename-Item -LiteralPath $file -NewName $tempName
            Rename-Item -LiteralPath (Join-Path $linkDir $tempName) -NewName $name
        }
    }
}
$fromSetup=![string]::Equals($env:DT_INSTALLER,$installed,[StringComparison]::OrdinalIgnoreCase)
$stage='تثبيت ملفات التطبيق'
try {
    [IO.Directory]::CreateDirectory($dir) | Out-Null
    if ($fromSetup) {
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        $archive=[IO.Compression.ZipFile]::OpenRead($env:DT_INSTALLER)
        try {
            foreach ($item in $archive.Entries) {
                $dest=[IO.Path]::GetFullPath((Join-Path $dir $item.FullName))
                if (!$dest.StartsWith($dir+'\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid application path' }
                [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($dest)) | Out-Null
                [IO.Compression.ZipFileExtensions]::ExtractToFile($item,$dest,$true)
            }
        } finally { $archive.Dispose() }
        Copy-Item -LiteralPath $env:DT_INSTALLER -Destination $installed -Force
    }
} catch {
    $detail=$_.Exception.Message
    try { Add-Content -LiteralPath $log -Value "$stage - $detail" } catch {}
    $answer=[Windows.Forms.MessageBox]::Show("$stage： $detail`nفتح سجل التثبيت؟",'Dark Tracking','YesNo','Error')
    if ($answer -eq 'Yes' -and (Test-Path $log)) { Start-Process notepad.exe -ArgumentList ('"'+$log+'"') }
    exit 1
}
function Find-UsableRuntime {
    $candidates=@(
        (Join-Path $dir 'venv\Scripts'),
        (Join-Path $base 'releases\0.67\venv\Scripts'),
        (Join-Path $base 'releases\0.66\venv\Scripts'),
        (Join-Path $base 'releases\0.65\venv\Scripts'),
        (Join-Path $base 'releases\0.64\venv\Scripts'),
        (Join-Path $base 'releases\0.63\venv\Scripts'),
        (Join-Path $base 'releases\0.62\venv\Scripts'),
        (Join-Path $base 'releases\0.61\venv\Scripts'),
        (Join-Path $base 'releases\0.60\venv\Scripts'),
        (Join-Path $env:LOCALAPPDATA 'Programs\Python\Python311')
    )
    foreach ($scripts in $candidates) {
        $console=Join-Path $scripts 'python.exe'
        $window=Join-Path $scripts 'pythonw.exe'
        if (!(Test-Path -LiteralPath $console) -or !(Test-Path -LiteralPath $window)) { continue }
        Push-Location -LiteralPath $dir
        try {
            & $console (Join-Path $dir 'native_window.py') --check-startup
            if ($LASTEXITCODE -eq 0) { return $window }
        } catch { Add-Content -LiteralPath $log -Value $_.Exception.Message }
        finally { Pop-Location }
    }
}
function Stop-OwnedProcessTree($Process) {
    if ($Process.HasExited) { return }
    # pythonw.exe from a venv is a launcher on Windows: Kill() would end only the launcher and
    # leave the real interpreter (and its WebView2/Edge window) running. Kill this PID's tree only.
    $killer=Start-Process -FilePath "$env:SystemRoot\System32\taskkill.exe" -ArgumentList ('/PID '+$Process.Id+' /T /F') -WindowStyle Hidden -PassThru
    try {
        if (!$killer.WaitForExit(5000)) { throw 'انتهت مهلة إغلاق نافذة التشغيل السابقة.' }
        if ($killer.ExitCode -ne 0 -and !$Process.HasExited) { throw 'تعذّر إغلاق عملية التطبيق.' }
    } finally { $killer.Dispose() }
    if (!$Process.WaitForExit(5000)) { throw 'تعذّر إغلاق نافذة التشغيل السابقة.' }
}
function Start-Session($PythonWindow,[switch]$UpdateShortcuts,[int]$TimeoutSeconds=45) {
    foreach ($mode in @('native','browser')) {
        $ticket=[Guid]::NewGuid().ToString('N')
        $receipt=Join-Path $base ("window-"+$ticket+".ready")
        $env:DT_START_TICKET=$ticket
        $child=$null
        try {
            $arguments='"'+(Join-Path $dir 'native_window.py')+'"'
            if ($mode -eq 'browser') { $arguments+=' --browser-window' }
            $child=Start-Process -FilePath $PythonWindow -ArgumentList $arguments -WorkingDirectory $dir -PassThru
            $clock=[Diagnostics.Stopwatch]::StartNew()
            $confirmed=$false
            while ($true) {
                # Read the stop condition before the receipt, so a receipt written just before
                # exit or timeout is still seen by the check that follows.
                $stop=$child.HasExited -or ($clock.Elapsed.TotalSeconds -ge $TimeoutSeconds)
                if ((Test-Path -LiteralPath $receipt) -and !$child.HasExited) { $confirmed=$true; break }
                if ($stop) { break }
                Start-Sleep -Milliseconds 160
            }
            if ($confirmed) {
                if ($UpdateShortcuts) {
                    try { Set-AppShortcuts }
                    catch { Add-Content -LiteralPath $log -Value ("Shortcut: "+$_.Exception.Message) }
                }
                return
            }
            Stop-OwnedProcessTree $child
            Add-Content -LiteralPath $log -Value ("Window did not confirm readiness: "+$mode)
        } finally {
            if ($child) { $child.Dispose() }
            Remove-Item Env:DT_START_TICKET -ErrorAction SilentlyContinue
            Remove-Item -LiteralPath $receipt -ErrorAction SilentlyContinue
        }
    }
    throw 'تعذّر فتح مكتبة الألعاب بعد تجربتي التشغيل.'
}
$available=Find-UsableRuntime
if ($available) {
    try { Start-Session $available -UpdateShortcuts:$fromSetup; exit 0 }
    catch {
        Add-Content -LiteralPath $log -Value $_.Exception.Message
        [void][Windows.Forms.MessageBox]::Show($_.Exception.Message,'Dark Tracking')
        exit 1
    }
}
$form=New-Object Windows.Forms.Form
$form.Text='Dark Tracking'
$form.Icon=New-Object Drawing.Icon($icon)
$form.StartPosition='CenterScreen'
$form.Size=New-Object Drawing.Size(760,460)
$form.MinimumSize=New-Object Drawing.Size(600,390)
$form.AutoScaleMode='Dpi'
$form.BackColor=[Drawing.Color]::FromArgb(24,29,37)
$form.ForeColor=[Drawing.Color]::White
$form.RightToLeft='Yes'
$form.Font=New-Object Drawing.Font('Segoe UI',12)
$panel=New-Object Windows.Forms.FlowLayoutPanel
$panel.Dock='Fill';$panel.FlowDirection='TopDown';$panel.WrapContents=$false
$panel.Padding=New-Object Windows.Forms.Padding(26)
$form.Controls.Add($panel)
$picture=New-Object Windows.Forms.PictureBox
$picture.Size=New-Object Drawing.Size(88,88)
$picture.SizeMode='Zoom'
$picture.Image=[Drawing.Image]::FromFile((Join-Path $dir 'icons\musashi.png'))
$panel.Controls.Add($picture)
$title=New-Object Windows.Forms.Label
$title.AutoSize=$true;$title.Text='Dark Tracking';$title.Font=New-Object Drawing.Font('Segoe UI',23)
$panel.Controls.Add($title)
$status=New-Object Windows.Forms.Label
$status.AutoSize=$true;$status.MaximumSize=New-Object Drawing.Size(570,0)
$status.Text='جارٍ إعداد Dark Tracking لأول تشغيل.'
$panel.Controls.Add($status)
function New-Action($text) {
    $button=New-Object Windows.Forms.Button
    $button.AutoSize=$true;$button.Text=$text;$button.ForeColor=[Drawing.Color]::Black
    $button.BackColor=[Drawing.Color]::White
    $panel.Controls.Add($button)
    return $button
}
$start=New-Action 'تجهيز التطبيق'
$logs=New-Action 'فتح سجل التثبيت'
$logs.Visible=Test-Path $log
$logs.Add_Click({if(Test-Path $log){Start-Process notepad.exe -ArgumentList ('"'+$log+'"')}})
$timer=New-Object Windows.Forms.Timer
$timer.Interval=600
$start.Add_Click({
    try {
        $start.Enabled=$false
        $status.Text='جارٍ تجهيز واجهة التطبيق.'
        Remove-Item -LiteralPath (Join-Path $dir 'setup-error.txt') -ErrorAction SilentlyContinue
        $prep=Join-Path $dir 'prepare-runtime.ps1'
        $instructions=[IO.File]::ReadAllText($prep)
        $encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($instructions))
        $script:worker=Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList ('-NoProfile -EncodedCommand '+$encoded) -WorkingDirectory $dir -WindowStyle Hidden -PassThru -RedirectStandardError (Join-Path $base 'runtime-error.log')
        $timer.Start()
    } catch { $status.Text=$_.Exception.Message;$start.Enabled=$true }
})
$timer.Add_Tick({
    $logs.Visible=Test-Path $log
    if(!$script:worker.HasExited){return}
    $timer.Stop()
    $available=Find-UsableRuntime
    if($available){
        try { Start-Session $available -UpdateShortcuts; $form.Close() }
        catch { $status.Text=$_.Exception.Message; $start.Enabled=$true }
        return
    }
    $reason=Join-Path $dir 'setup-error.txt'
    $probeLog=Join-Path $base 'startup.log'
    if(Test-Path $probeLog){Get-Content -Encoding UTF8 -LiteralPath $probeLog -Tail 12 | Add-Content -LiteralPath $log}
    $status.Text='تعذّر تشغيل مكونات التطبيق. راجع نتيجة فحص التشغيل في سجل التثبيت. '
    if(Test-Path $reason){$status.Text+=(Get-Content -Raw -Encoding UTF8 $reason)}
    $stderr=Join-Path $base 'runtime-error.log'
    if(Test-Path $stderr){Get-Content -LiteralPath $stderr -Tail 35 | Add-Content -LiteralPath $log}
    $logs.Visible=Test-Path $log
    $start.Text='إعادة المحاولة';$start.Enabled=$true
})
$form.Add_Shown({$start.PerformClick()})
[void]$form.ShowDialog()
$timer.Dispose();$picture.Image.Dispose();$form.Dispose()
