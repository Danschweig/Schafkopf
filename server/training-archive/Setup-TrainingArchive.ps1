param(
    [string]$AppOrigin = 'https://danschweig.github.io',
    [string]$ArchiveDirectory = (Join-Path $env:LOCALAPPDATA 'SchafkopfTraining'),
    [string]$BackupDirectory,
    [switch]$Autostart
)
$ErrorActionPreference = 'Stop'
$origin = [Uri]$AppOrigin
if ($origin.Scheme -ne 'https' -or $origin.AbsolutePath -ne '/' -or $origin.Query -or $origin.Fragment -or $origin.UserInfo) {
    throw 'AppOrigin muss der HTTPS-Ursprung der Schafkopf-App ohne Pfad sein, zum Beispiel https://deinname.github.io'
}
$node = (Get-Command node.exe -ErrorAction Stop).Source
if ([int]((& $node -p 'process.versions.node.split(".")[0]') | Select-Object -Last 1) -lt 22) { throw 'Bitte zuerst Node.js LTS (mindestens 22) installieren.' }
$ArchiveDirectory = [IO.Path]::GetFullPath($ArchiveDirectory)
if ($ArchiveDirectory.TrimEnd('\') -eq [IO.Path]::GetPathRoot($ArchiveDirectory).TrimEnd('\')) { throw 'Bitte einen eigenen Archiv-Unterordner verwenden, kein ganzes Laufwerk.' }
if (Test-Path -LiteralPath $ArchiveDirectory) {
    if ((Get-Item -LiteralPath $ArchiveDirectory).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Der Archivordner darf keine Verknuepfung sein.' }
    if ((Get-ChildItem -LiteralPath $ArchiveDirectory -Force | Select-Object -First 1) -and -not (Test-Path -LiteralPath (Join-Path $ArchiveDirectory 'config.json'))) {
        throw 'Bitte einen leeren, eigenen Archivordner verwenden. Vorhandene andere Dateien werden nicht veraendert.'
    }
}
New-Item -ItemType Directory -Path $ArchiveDirectory -Force | Out-Null
# Restrict the archive, local access token and logs to this Windows account and SYSTEM.
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
& icacls.exe $ArchiveDirectory /inheritance:r /grant:r "*$($sid):(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Die privaten Dateiberechtigungen konnten nicht gesetzt werden.' }
$configPath = Join-Path $ArchiveDirectory 'config.json'
if (Test-Path -LiteralPath $configPath) {
    $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
    if ([IO.Path]::GetFullPath($config.directory) -ne $ArchiveDirectory) { throw 'Die vorhandene Konfiguration gehoert zu einem anderen Archiv.' }
    $config.allowedOrigins = @($origin.GetLeftPart([UriPartial]::Authority))
} else {
    $secretBytes = New-Object byte[] 32
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($secretBytes) } finally { $rng.Dispose() }
    $config = [pscustomobject]@{
        directory = $ArchiveDirectory
        token = [Convert]::ToBase64String($secretBytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
        allowedOrigins = @($origin.GetLeftPart([UriPartial]::Authority))
        port = 8787
        quotaBytes = 21474836480
    }
}
$utf8 = New-Object Text.UTF8Encoding($false)
[IO.File]::WriteAllText($configPath, ($config | ConvertTo-Json -Depth 5), $utf8)
# This private file is the only place where the upload token is displayed.
$connectionPath = Join-Path $ArchiveDirectory 'Handy-Zugang.txt'
[IO.File]::WriteAllText($connectionPath, "Zugangsschluessel fuer die App (privat behandeln):`r`n$($config.token)`r`n`r`nHTTPS-Adresse: Ausgabe von tailscale serve status verwenden.`r`n", $utf8)
Push-Location $PSScriptRoot
try {
    & npm.cmd ci --omit=dev --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'Installation der Archiv-Abhaengigkeiten fehlgeschlagen.' }
} finally { Pop-Location }
$serverPath = Join-Path $PSScriptRoot 'server.cjs'
$launcher = Join-Path $ArchiveDirectory 'Start-Archive.ps1'
$quote = { param($value) "'" + $value.Replace("'", "''") + "'" }
$launchCode = "& $(& $quote $node) $(& $quote $serverPath) $(& $quote $configPath) *>> $(& $quote (Join-Path $ArchiveDirectory 'archive.log'))`r`nexit `$LASTEXITCODE`r`n"
[IO.File]::WriteAllText($launcher, $launchCode, $utf8)
if ($Autostart) {
    $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$launcher`""
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User ([Security.Principal.WindowsIdentity]::GetCurrent().Name)
    $settings = New-ScheduledTaskSettingsSet -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
    Register-ScheduledTask -TaskName 'Schafkopf Trainingsarchiv' -Action $action -Trigger $trigger -Settings $settings -Description 'Privates Fotoarchiv auf Loopback, HTTPS ueber Tailscale Serve.' -Force | Out-Null
    Start-ScheduledTask -TaskName 'Schafkopf Trainingsarchiv'
} else {
    Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', "`"$launcher`"") -WindowStyle Hidden
}
if ($BackupDirectory) {
    $BackupDirectory = [IO.Path]::GetFullPath($BackupDirectory)
    & (Join-Path $PSScriptRoot 'Backup-TrainingArchive.ps1') -ArchiveDirectory $ArchiveDirectory -BackupDirectory $BackupDirectory
    $backupScript = Join-Path $PSScriptRoot 'Backup-TrainingArchive.ps1'
    $backupAction = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$backupScript`" -ArchiveDirectory `"$ArchiveDirectory`" -BackupDirectory `"$BackupDirectory`""
    $backupTrigger = New-ScheduledTaskTrigger -Daily -At '04:00'
    $backupSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 4)
    Register-ScheduledTask -TaskName 'Schafkopf Trainingsarchiv Sicherung' -Action $backupAction -Trigger $backupTrigger -Settings $backupSettings -Force | Out-Null
}
Write-Host "Archiv eingerichtet: $ArchiveDirectory"
Write-Host "Handy-Zugang liegt privat in: $connectionPath"
Write-Host 'Naechster Schritt: tailscale serve status und tailscale funnel status pruefen.'
Write-Host 'Wenn HTTPS-Port 8443 frei ist: tailscale serve --bg --https=8443 http://127.0.0.1:8787'
Write-Host 'Es wurde kein Router-Port freigegeben und kein oeffentlicher Zugriff aktiviert.'
