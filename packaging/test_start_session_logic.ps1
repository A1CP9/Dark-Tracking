<# Logic test for Start-Session in install.ps1 (works on Windows PowerShell 5.1/7 and on Linux pwsh).
   Start-Process / Start-Sleep are MOCKED: this verifies control flow (ticket isolation, retry count,
   receipt-vs-exit ordering, which kill path is used). It does NOT prove real process-tree termination;
   that is packaging/test_start_session_windows.ps1. #>
param([string]$Installer = (Join-Path $PSScriptRoot 'install.ps1'),[string[]]$Only)
$ErrorActionPreference = 'Stop'
$tokens=$null; $errs=$null
$ast=[Management.Automation.Language.Parser]::ParseFile($Installer,[ref]$tokens,[ref]$errs)
if ($errs.Count) { throw "parse errors in $Installer" }
foreach ($name in 'Stop-OwnedProcessTree','Start-Session') {
    $fn=$ast.Find({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $name},$true)
    if ($fn) { . ([scriptblock]::Create($fn.Extent.Text)) }
}
$hasTimeout=(Get-Command Start-Session).Parameters.ContainsKey('TimeoutSeconds')
$T = if ($hasTimeout) { 1 } else { 45 }

$base=Join-Path ([IO.Path]::GetTempPath()) ('dt-test-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $base | Out-Null
$dir=$base; $log=Join-Path $base 'setup.log'
$script:shortcuts=0
function Set-AppShortcuts { $script:shortcuts++ }

# ---- mocks -------------------------------------------------------------------------------------
$script:launches=@(); $script:procs=@(); $script:taskkills=@(); $script:plan=@{}; $script:nextId=1000
function New-FakeProc($mode,$ticket,$scenario) {
    $p=[pscustomobject]@{Id=($script:nextId++);Mode=$mode;Ticket=$ticket;Scenario=$scenario;Exited=$false;
        Born=[Diagnostics.Stopwatch]::StartNew();LateDone=$false;OrphanLeft=$false;KillCalls=0}
    $p | Add-Member ScriptProperty HasExited { $this.Exited -or ($this.Scenario -eq 'readyexit' -and $this.Born.ElapsedMilliseconds -gt 60) }
    $p | Add-Member ScriptMethod Kill { $this.KillCalls++; $this.Exited=$true; $this.OrphanLeft=$true }   # launcher only
    $p | Add-Member ScriptMethod WaitForExit { param($ms) return $this.HasExited }
    $p | Add-Member ScriptMethod Dispose { }
    return $p
}
function Start-Process {
    param($FilePath,$ArgumentList,$WorkingDirectory,[switch]$PassThru,[switch]$Wait,$WindowStyle)
    if ("$FilePath" -like '*taskkill*') {
        $id=[int](($ArgumentList -split ' ')[1]); $script:taskkills+=$ArgumentList
        $target=$script:procs | Where-Object Id -eq $id
        if ($target) { $target.Exited=$true; $target.OrphanLeft=$false }   # /T kills the tree
        $killer=[pscustomobject]@{ExitCode=0}
        $killer | Add-Member ScriptMethod Dispose {}
        $killer | Add-Member ScriptMethod WaitForExit { param($ms) return $true }
        return $killer
    }
    $mode=if ("$ArgumentList" -match '--browser-window') {'browser'} else {'native'}
    $ticket=$env:DT_START_TICKET
    $sc=$script:plan[$mode]
    $p=New-FakeProc $mode $ticket $sc
    $script:procs+=$p; $script:launches+=[pscustomobject]@{Mode=$mode;Ticket=$ticket}
    switch ($sc) {
        'ok'        { New-Item -ItemType File -Path (Join-Path $base "window-$ticket.ready") | Out-Null }
        'exit'      { $p.Exited=$true }
    }
    return $p
}
function Start-Sleep {
    param([int]$Milliseconds=0,[int]$Seconds=0)
    Microsoft.PowerShell.Utility\Start-Sleep -Milliseconds ($Milliseconds+1000*$Seconds)
    foreach ($p in $script:procs) {   # a 'late' window confirms 1.5 timeouts after its launch, even after being killed
        if ($p.Scenario -eq 'readyexit' -and !$p.LateDone) { $p.LateDone=$true; New-Item -ItemType File -Force -Path (Join-Path $base ("window-"+$p.Ticket+".ready")) | Out-Null }
        if ($p.Scenario -eq 'late' -and !$p.LateDone -and $p.Born.Elapsed.TotalSeconds -gt 1.5*$T) {
            $p.LateDone=$true
            New-Item -ItemType File -Force -Path (Join-Path $base ("window-"+$p.Ticket+".ready")) | Out-Null
        }
    }
}

function Want($n) { return (!$Only -or ($Only -contains $n)) }
function Run-Case($native,$browser,[switch]$UpdateShortcuts) {
    $script:launches=@(); $script:procs=@(); $script:taskkills=@(); $script:shortcuts=0
    $script:plan=@{native=$native;browser=$browser}
    $threw=$false
    try {
        if ($hasTimeout) { Start-Session 'fake' -UpdateShortcuts:$UpdateShortcuts -TimeoutSeconds $T }
        else { Start-Session 'fake' -UpdateShortcuts:$UpdateShortcuts }
    } catch { $threw=$true }
    # a late confirmation may land after Start-Session returned/threw
    Microsoft.PowerShell.Utility\Start-Sleep -Milliseconds 200
    [pscustomobject]@{Threw=$threw;Modes=($script:launches.Mode -join ',');Tickets=@($script:launches.Ticket);
        Shortcuts=$script:shortcuts;Orphans=@($script:procs|Where-Object OrphanLeft).Count;Taskkills=$script:taskkills.Count}
}

$results=@()
function Check($case,$cond,$detail) {
    $script:results+=[pscustomobject]@{Case=$case;Pass=[bool]$cond;Detail=$detail}
    "{0}  {1}  {2}" -f $(if($cond){'PASS'}else{'FAIL'}),$case,$detail | Write-Host
}

if (Want '1') {
$r=Run-Case 'ok' 'ok' -UpdateShortcuts
Check '1 normal open' (!$r.Threw -and $r.Modes -eq 'native' -and $r.Shortcuts -eq 1 -and $r.Taskkills -eq 0) "modes=$($r.Modes) shortcuts=$($r.Shortcuts) threw=$($r.Threw)"
}

if (Want '2') {
$r=Run-Case 'exit' 'ok' -UpdateShortcuts
Check '2 early exit -> browser once' (!$r.Threw -and $r.Modes -eq 'native,browser' -and $r.Shortcuts -eq 1 -and $r.Taskkills -eq 0) "modes=$($r.Modes) shortcuts=$($r.Shortcuts)"
}

if (Want '3') {
$r=Run-Case 'hang' 'ok' -UpdateShortcuts
Check '3a alive-no-ready -> browser once' (!$r.Threw -and $r.Modes -eq 'native,browser' -and $r.Shortcuts -eq 1) "modes=$($r.Modes) shortcuts=$($r.Shortcuts)"
Check '3b hung window killed as a tree (no orphan)' ($r.Orphans -eq 0 -and $r.Taskkills -eq 1) "orphans=$($r.Orphans) taskkill-calls=$($r.Taskkills)"
}

if (Want '4') {
$r=Run-Case 'hang' 'hang' -UpdateShortcuts
Check '4a both fail -> throws after exactly 2 launches' ($r.Threw -and $r.Modes -eq 'native,browser' -and $r.Shortcuts -eq 0) "modes=$($r.Modes) threw=$($r.Threw) shortcuts=$($r.Shortcuts)"
Check '4b both hung windows cleaned' ($r.Orphans -eq 0 -and $r.Taskkills -eq 2) "orphans=$($r.Orphans) taskkill-calls=$($r.Taskkills)"
$r=Run-Case 'exit' 'exit' -UpdateShortcuts
Check '4c both exit early -> throws, no kill needed' ($r.Threw -and $r.Modes -eq 'native,browser' -and $r.Taskkills -eq 0) "modes=$($r.Modes) threw=$($r.Threw)"
}

if (Want '5') {
$r=Run-Case 'late' 'hang' -UpdateShortcuts
Check '5 late receipt of attempt 1 must not pass attempt 2' ($r.Threw -and $r.Shortcuts -eq 0 -and $r.Tickets[0] -ne $r.Tickets[1]) "threw=$($r.Threw) shortcuts=$($r.Shortcuts) distinct-tickets=$($r.Tickets[0] -ne $r.Tickets[1])"
}

if (Want '6') {
$r=Run-Case 'readyexit' 'ok' -UpdateShortcuts
Check '6 receipt from exited process triggers recovery' (!$r.Threw -and $r.Modes -eq 'native,browser' -and $r.Shortcuts -eq 1) "modes=$($r.Modes) shortcuts=$($r.Shortcuts)"
}

Remove-Item -Recurse -Force $base -ErrorAction SilentlyContinue
$failed=@($results|Where-Object {!$_.Pass}).Count
"`n{0} checks, {1} failed (hasTimeoutParam={2}, timeout={3}s, mocked Start-Process)" -f $results.Count,$failed,$hasTimeout,$T | Write-Host
exit ([int]($failed -gt 0))
