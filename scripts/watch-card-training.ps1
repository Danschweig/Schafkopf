param(
    [string]$Name = 'surfaces-v1',
    [int]$IntervalSeconds = 5,
    [switch]$Once
)

$ErrorActionPreference = 'Stop'
if ($Name -notmatch '^[a-zA-Z0-9_-]+$' -or $IntervalSeconds -lt 1) {
    throw 'Ungueltiger Trainingsname oder Abfrageabstand.'
}
$projectRoot = Split-Path -Parent $PSScriptRoot
$jobDirectory = Join-Path $projectRoot ".tools/card-training/jobs/$Name"
$statusPath = Join-Path $jobDirectory 'status.json'
$processPath = Join-Path $jobDirectory 'process.json'
$previousPhase = ''

do {
    $trainingStatus = $null
    try {
        if (Test-Path -LiteralPath $statusPath) {
            $trainingStatus = Get-Content -LiteralPath $statusPath -Raw | ConvertFrom-Json
        }
    } catch {
        # A status update can overlap this read; the next poll will be complete.
    }
    if ($null -eq $trainingStatus) {
        if ($Once) { Write-Output 'Noch keine Fortschrittsdaten vorhanden.'; break }
        Write-Host 'Warte auf Fortschrittsdaten ...'
        Start-Sleep -Seconds $IntervalSeconds
        continue
    }
    $progressText = "{0} | Epoche {1}/{2} | {3:N1}%" -f $trainingStatus.phase, $trainingStatus.epoch, $trainingStatus.epochs, $trainingStatus.percent
    if ($null -ne $trainingStatus.batches) {
        $progressText += " | Batch $($trainingStatus.batch)/$($trainingStatus.batches)"
    }
    if ($null -ne $trainingStatus.etaSeconds) {
        $progressText += ' | Rest ca. ' + [TimeSpan]::FromSeconds($trainingStatus.etaSeconds).ToString('hh\:mm\:ss')
    }
    if ($Once -or $previousPhase -ne "$($trainingStatus.epoch):$($trainingStatus.phase)" -or $trainingStatus.status -ne 'running') {
        Write-Output $progressText
        $previousPhase = "$($trainingStatus.epoch):$($trainingStatus.phase)"
    }
    if ($trainingStatus.status -eq 'complete') {
        Write-Progress -Activity 'Kartentraining' -Completed
        Write-Output "Fertig. Modell: $($trainingStatus.artifact)"
        break
    }
    if ($trainingStatus.status -eq 'failed') {
        Write-Progress -Activity 'Kartentraining' -Completed
        Write-Output "Fehlgeschlagen: $($trainingStatus.error)"
        Write-Output "Details: $jobDirectory/stderr.log"
        break
    }
    if (Test-Path -LiteralPath $processPath) {
        $trainingProcess = Get-Content -LiteralPath $processPath -Raw | ConvertFrom-Json
        if (-not (Get-Process -Id $trainingProcess.processId -ErrorAction SilentlyContinue)) {
            Write-Progress -Activity 'Kartentraining' -Completed
            Write-Output "Der Trainingsprozess laeuft nicht mehr. Details: $jobDirectory/stderr.log"
            break
        }
    }
    Write-Progress -Activity 'Kartentraining' -Status $progressText -PercentComplete ([Math]::Min(100, $trainingStatus.percent))
    if ($Once) { break }
    Start-Sleep -Seconds $IntervalSeconds
} while ($true)
