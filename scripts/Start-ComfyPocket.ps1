param(
 [string]$StabilityRoot='E:\Stability',
 [string]$ListenAddress='0.0.0.0',
 [int]$Port=8189,
 [string]$ConfigDirectory=(Join-Path $env:LOCALAPPDATA 'ComfyPocketPC'),
 [string]$ComfyDirectory='',
 [string]$ModelsDirectory='',
 [string]$NodeExecutable='',
 [string]$ExtraModelPaths='',
 [double]$ReserveVram=0.9,
 [ValidateSet('auto','none','latent2rgb','taesd')][string]$Preview='auto',
 [ValidateSet('pytorch','auto')][string]$Attention='pytorch',
 [bool]$DisableDynamicVram=$true,
 [string]$LegacyScriptPath=''
)
$ErrorActionPreference='Stop'
$repo=Split-Path $PSScriptRoot -Parent
. (Join-Path $PSScriptRoot 'CompanionProcess.ps1')
$node=if($NodeExecutable){$NodeExecutable}else{(Get-Command node -ErrorAction Stop).Source}
$comfy=if($ComfyDirectory){$ComfyDirectory}else{Join-Path $StabilityRoot 'Data\Packages\ComfyUI'}
$models=if($ModelsDirectory){$ModelsDirectory}else{Join-Path $StabilityRoot 'Data\Models'}
if($ReserveVram -lt 0 -or $ReserveVram -gt 32){throw 'Reserve VRAM invalide.'}
# The classic launcher also reuses the persistent model paths saved by Studio.
if(-not $ExtraModelPaths){
 $savedPaths=Join-Path $ConfigDirectory 'studio-model-paths.yaml'
 if(Test-Path -LiteralPath $savedPaths){$ExtraModelPaths=$savedPaths}
}
$health=Join-Path $repo 'bridge\health.mjs'
if(-not(Test-Path (Join-Path $comfy 'main.py'))){throw "Installation ComfyUI introuvable : $comfy"}
$mutex=New-Object System.Threading.Mutex($false,"Local\ComfyPocket-Launcher-$Port")
$locked=$false
try {
 try {$locked=$mutex.WaitOne(0)}catch [System.Threading.AbandonedMutexException]{$locked=$true}
 if(-not $locked){throw 'Un demarrage ComfyPocket est deja en cours. Attendez sa fin.'}
 if(-not(Test-Path (Join-Path $repo 'node_modules\ws')) -or -not(Test-Path (Join-Path $repo 'node_modules\sharp'))){
  Push-Location $repo
  try {npm.cmd ci --omit=dev;if($LASTEXITCODE -ne 0){throw 'Installation des dependances echouee.'}}finally{Pop-Location}
 }
 New-Item -ItemType Directory -Force -Path $ConfigDirectory | Out-Null
 if(-not(Test-Path (Join-Path $ConfigDirectory 'config.json'))){
  & $node (Join-Path $repo 'bridge\cli.mjs') init --config-dir $ConfigDirectory --host $ListenAddress --port $Port --output (Join-Path $comfy 'output') --extra-output (Join-Path $StabilityRoot 'Data\Images') --models $models
  if($LASTEXITCODE -ne 0){throw 'Initialisation du compagnon echouee.'}
 }
 & $node $health $ConfigDirectory --identity-only --quiet
 if($LASTEXITCODE -ne 0){& $node $health $ConfigDirectory --identity-only;throw 'Identite du compagnon invalide. Aucun certificat ni appairage ne sera regenere.'}
 $config=Get-Content -Encoding UTF8 (Join-Path $ConfigDirectory 'config.json') -Raw | ConvertFrom-Json
 $ready=$false
 try {Invoke-RestMethod "$($config.comfyUrl)/system_stats" -TimeoutSec 3 | Out-Null;$ready=$true}catch{}
 if(-not $ready){
  if($config.comfyUrl.TrimEnd('/') -ne 'http://127.0.0.1:8188'){throw 'Le serveur ComfyUI configure ne repond pas. Verifiez son adresse.'}
  $comfyProcess=$null
  if(-not(Get-NetTCPConnection -LocalPort 8188 -State Listen -ErrorAction SilentlyContinue)){
   $python=Join-Path $comfy 'venv\Scripts\python.exe'
   if(-not(Test-Path $python)){throw 'Python ComfyUI absent. Verifiez son installation dans Stability Matrix.'}
   # Profil valide RTX 4070 SUPER : apercus conserves, aucune precision reduite.
   $comfyArgs=@('main.py','--listen','127.0.0.1','--port','8188','--preview-method',$Preview,'--reserve-vram',$ReserveVram.ToString([Globalization.CultureInfo]::InvariantCulture))
   if($Attention -eq 'pytorch'){$comfyArgs+='--use-pytorch-cross-attention'}
   if($DisableDynamicVram -and (Select-String -LiteralPath (Join-Path $comfy 'comfy\cli_args.py') -SimpleMatch '"--disable-dynamic-vram"' -Quiet)){$comfyArgs+='--disable-dynamic-vram'}
   if($ExtraModelPaths){
    if(-not(Test-Path -LiteralPath $ExtraModelPaths) -or $ExtraModelPaths.Contains('"')){throw 'Configuration des dossiers invalide.'}
    $comfyArgs+=@('--extra-model-paths-config',('"'+$ExtraModelPaths+'"'))
   }
   $comfyProcess=Start-Process -FilePath $python -ArgumentList $comfyArgs -WorkingDirectory $comfy -WindowStyle Hidden -RedirectStandardOutput (Join-Path $ConfigDirectory 'comfy.stdout.log') -RedirectStandardError (Join-Path $ConfigDirectory 'comfy.stderr.log') -PassThru
  }
  Write-Host 'Initialisation de ComfyUI... Patientez jusqu au message PRET (jusqu a 3 minutes).'
  $deadline=(Get-Date).AddSeconds(180)
  do {
   Start-Sleep -Seconds 1
   try {Invoke-RestMethod "$($config.comfyUrl)/system_stats" -TimeoutSec 2 | Out-Null;$ready=$true}catch{}
   if($comfyProcess){$comfyProcess.Refresh();if($comfyProcess.HasExited -and -not $ready){throw "ComfyUI s est arrete. Consultez les journaux dans $ConfigDirectory"}}
  }while(-not $ready -and (Get-Date) -lt $deadline)
  if(-not $ready){throw "ComfyUI ne repond pas apres 3 minutes. Journaux : $ConfigDirectory"}
 }
 $bridgeProcess=$null
 if(Get-NetTCPConnection -LocalPort $config.port -State Listen -ErrorAction SilentlyContinue){
  & $node $health $ConfigDirectory --quiet
  if($LASTEXITCODE -ne 0){
   # Only our exact CLI and configuration may be restarted. ComfyUI is kept alive.
   $scriptPath=Join-Path $repo 'bridge\cli.mjs'
   if($LegacyScriptPath){
    $owners=@(Get-NetTCPConnection -LocalPort $config.port -State Listen | Select-Object -ExpandProperty OwningProcess -Unique)
    if($owners.Count -eq 1 -and (Test-ComfyPocketProcess (Get-CimInstance Win32_Process -Filter "ProcessId = $($owners[0])") $LegacyScriptPath $ConfigDirectory)){$scriptPath=$LegacyScriptPath}
   }
   Restart-StaleComfyPocket -ScriptPath $scriptPath -ConfigDirectory $ConfigDirectory -Port $config.port
  }
 }
 if(-not(Get-NetTCPConnection -LocalPort $config.port -State Listen -ErrorAction SilentlyContinue)){
  $bridgeArgs=@((Join-Path $repo 'bridge\cli.mjs'),'--config-dir',$ConfigDirectory,'--models',$models)
  $quotedArgs=$bridgeArgs | ForEach-Object {'"'+$_+'"'}
  $bridgeProcess=Start-Process -FilePath $node -ArgumentList $quotedArgs -WorkingDirectory $repo -WindowStyle Hidden -RedirectStandardOutput (Join-Path $ConfigDirectory 'bridge.stdout.log') -RedirectStandardError (Join-Path $ConfigDirectory 'bridge.stderr.log') -PassThru
 }
 $verified=$false
 $deadline=(Get-Date).AddSeconds(30)
 do {
  & $node $health $ConfigDirectory --upstream --quiet
  $verified=$LASTEXITCODE -eq 0
  if($verified){break}
  if(-not $bridgeProcess){break}
  $bridgeProcess.Refresh();if($bridgeProcess.HasExited){break}
  Start-Sleep -Seconds 1
 }while((Get-Date) -lt $deadline)
 if(-not $verified){
  & $node $health $ConfigDirectory --upstream
  throw "Connexion non validee. Un autre compagnon ou un ancien certificat peut occuper le port $($config.port). Journaux : $ConfigDirectory"
 }
 Write-Host ''
 Write-Host 'PRET - ComfyPocket et ComfyUI sont accessibles.' -ForegroundColor Green
 Write-Host "Ecoute : $($config.host):$($config.port)"
 foreach($file in @('pairing.json','pairing-public.json')){
  $pairPath=Join-Path $ConfigDirectory $file
  if(Test-Path $pairPath){$pair=Get-Content $pairPath -Raw | ConvertFrom-Json;Write-Host "Connexion : $($pair.url)"}
 }
 Write-Host 'Vous pouvez fermer cette fenetre. Les services continuent en arriere-plan.'
 Write-Host "Journaux : $ConfigDirectory"
} finally {
 if($locked){$mutex.ReleaseMutex()}
 $mutex.Dispose()
}
