param(
    [Parameter(Mandatory = $true)][string]$ArchiveDirectory,
    [Parameter(Mandatory = $true)][string]$BackupDirectory
)
$ErrorActionPreference = 'Stop'
$source = [IO.Path]::GetFullPath($ArchiveDirectory).TrimEnd('\')
$backup = [IO.Path]::GetFullPath($BackupDirectory).TrimEnd('\')
if ($backup -eq [IO.Path]::GetPathRoot($backup).TrimEnd('\')) { throw 'Bitte einen eigenen Sicherungs-Unterordner verwenden, kein ganzes Laufwerk.' }
if (Test-Path -LiteralPath $backup) {
    if ((Get-Item -LiteralPath $backup).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Der Sicherungsordner darf keine Verknuepfung sein.' }
    if (Get-ChildItem -LiteralPath $backup -Force | Where-Object { -not $_.PSIsContainer -or $_.Name -notmatch '^\d{4}-\d{2}-\d{2}$' } | Select-Object -First 1) {
        throw 'Bitte einen eigenen Sicherungsordner ohne andere Dateien verwenden.'
    }
}
if ($source -eq $backup -or $backup.StartsWith($source + '\', [StringComparison]::OrdinalIgnoreCase) -or $source.StartsWith($backup + '\', [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Sicherung und Archiv muessen in getrennten Ordnern liegen. Empfohlen: andere Festplatte.'
}
if (-not (Test-Path -LiteralPath (Join-Path $source 'samples') -PathType Container)) { throw 'Archivordner samples fehlt.' }
New-Item -ItemType Directory -Path $backup -Force | Out-Null
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
& icacls.exe $backup /inheritance:r /grant:r "*$($sid):(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Sicherungsberechtigungen konnten nicht gesetzt werden.' }
# Dated snapshots; never mirror deletions or copy the live config/token/staging.
$destination = Join-Path $backup (Get-Date -Format 'yyyy-MM-dd')
New-Item -ItemType Directory -Path $destination -Force | Out-Null
& robocopy.exe (Join-Path $source 'samples') (Join-Path $destination 'samples') /E /COPY:DAT /DCOPY:DAT /R:1 /W:1 /XJ /NFL /NDL /NP
if ($LASTEXITCODE -ge 8) { throw "Sicherung fehlgeschlagen: Robocopy-Code $LASTEXITCODE" }
$node = (Get-Command node.exe -ErrorAction Stop).Source
& $node (Join-Path $PSScriptRoot 'dataset.cjs') verify $destination
if ($LASTEXITCODE -ne 0) { throw 'Sicherungspruefung fehlgeschlagen.' }
Write-Host "Gepruefte Sicherung: $destination"
