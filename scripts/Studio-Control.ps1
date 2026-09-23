param(
 [ValidateSet('start','stop')][string]$Action,
 [Parameter(Mandatory)][string]$SettingsFile,
 [Parameter(Mandatory)][string]$ConfigDirectory,
 [string]$LegacyScriptPath=''
)
$ErrorActionPreference='Stop'
$settings=Get-Content -Encoding UTF8 -LiteralPath $SettingsFile -Raw | ConvertFrom-Json
$repo=Split-Path $PSScriptRoot -Parent
. (Join-Path $PSScriptRoot 'CompanionProcess.ps1')
if($Action -eq 'start'){
 & (Join-Path $PSScriptRoot 'Start-ComfyPocket.ps1') -ComfyDirectory $settings.comfyDirectory -ModelsDirectory $settings.modelsDirectory -ConfigDirectory $ConfigDirectory -NodeExecutable (Join-Path $repo 'node.exe') -ReserveVram $settings.reserveVram -Preview $settings.preview -Attention $settings.attention -DisableDynamicVram $settings.disableDynamicVram -ExtraModelPaths (Join-Path $ConfigDirectory "studio-model-paths.yaml") -LegacyScriptPath $LegacyScriptPath
 exit
}
$config=Get-Content -Encoding UTF8 (Join-Path $ConfigDirectory 'config.json') -Raw | ConvertFrom-Json
# Refuse to interrupt queued or running generations, including jobs sent by the phone.
try {
 $queue=Invoke-RestMethod "$($config.comfyUrl)/queue" -TimeoutSec 4
} catch {
 if(Get-NetTCPConnection -State Listen -LocalPort 8188 -ErrorAction SilentlyContinue){throw}
}
if($queue -and ($queue.queue_running.Count -gt 0 -or $queue.queue_pending.Count -gt 0)){throw 'Des images sont en cours ou en attente. Terminez la file avant d arreter le moteur.'}
if($queue -and ($null -eq $queue.queue_running -or $null -eq $queue.queue_pending)){throw 'Etat de la file inconnu. Aucun arret force.'}
$activeComfy=if($config.roots.Count -gt 0 -and (Split-Path $config.roots[0].path -Leaf) -eq 'output'){Split-Path $config.roots[0].path -Parent}else{$settings.comfyDirectory}
$engineOwners=@(Get-NetTCPConnection -State Listen -LocalPort 8188 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
$engines=@()
foreach($owner in $engineOwners){
 $process=Get-CimInstance Win32_Process -Filter "ProcessId = $owner"
 $parent=Get-CimInstance Win32_Process -Filter "ProcessId = $($process.ParentProcessId)"
 if(-not(Test-ComfyEngineProcess $process $parent $activeComfy)){throw 'Le port ComfyUI appartient a un autre programme. Aucun arret force.'}
 $engines+=$process
}
$bridgeOwners=@(Get-NetTCPConnection -State Listen -LocalPort $config.port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
if($bridgeOwners.Count){
 $candidate=Get-CimInstance Win32_Process -Filter "ProcessId = $($bridgeOwners[0])"
 $scriptPath=Join-Path $repo 'bridge\cli.mjs'
 if($LegacyScriptPath -and (Test-ComfyPocketProcess $candidate $LegacyScriptPath $ConfigDirectory)){$scriptPath=$LegacyScriptPath}
 Restart-StaleComfyPocket -ScriptPath $scriptPath -ConfigDirectory $ConfigDirectory -Port $config.port
}
foreach($process in $engines){
 $current=Get-CimInstance Win32_Process -Filter "ProcessId = $($process.ProcessId)"
 if($current.CreationDate -ne $process.CreationDate){throw 'Le processus a change. Reessayez.'}
 Stop-Process -Id $process.ProcessId -ErrorAction Stop
}
Write-Output 'Moteur arrete.'
