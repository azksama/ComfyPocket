param(
 [string]$StabilityRoot='E:\Stability',
 [string]$ListenAddress='0.0.0.0',
 [int]$Port=8189,
 [string]$ConfigDirectory=(Join-Path $env:LOCALAPPDATA 'ComfyPocketPC')
)
$ErrorActionPreference='Stop'
$repo=Split-Path $PSScriptRoot -Parent
$node=(Get-Command node -ErrorAction Stop).Source
$comfy=Join-Path $StabilityRoot 'Data\Packages\ComfyUI'
if(-not(Test-Path (Join-Path $comfy 'main.py'))){throw "Installation ComfyUI introuvable : $comfy"}
if(-not(Test-Path (Join-Path $repo 'node_modules\ws')) -or -not(Test-Path (Join-Path $repo 'node_modules\sharp'))){Push-Location $repo;try{npm.cmd ci --omit=dev;if($LASTEXITCODE -ne 0){throw 'Installation des dépendances échouée.'}}finally{Pop-Location}}
New-Item -ItemType Directory -Force -Path $ConfigDirectory | Out-Null
if(-not(Test-Path (Join-Path $ConfigDirectory 'config.json'))){
 & $node (Join-Path $repo 'bridge\cli.mjs') init --config-dir $ConfigDirectory --host $ListenAddress --port $Port --output (Join-Path $comfy 'output') --extra-output (Join-Path $StabilityRoot 'Data\Images') --models (Join-Path $StabilityRoot 'Data\Models')
 if($LASTEXITCODE -ne 0){throw 'Initialisation du compagnon échouée.'}
}
$ready=$false
try{Invoke-RestMethod 'http://127.0.0.1:8188/system_stats' -TimeoutSec 3 | Out-Null;$ready=$true}catch{}
if(-not $ready){
 $python=Join-Path $comfy 'venv\Scripts\python.exe'
 if(-not(Test-Path $python)){throw 'Python ComfyUI absent. Lancez ComfyUI depuis Stability Matrix.'}
 # Profil validé sur RTX 4070 SUPER (12 Go) : mêmes réglages que Stability Matrix.
 # PyTorch sélectionne déjà SDPA automatiquement ; l'option rend ce choix explicite.
 $comfyArgs=@('main.py','--listen','127.0.0.1','--port','8188','--preview-method','auto','--use-pytorch-cross-attention','--reserve-vram','0.9')
 if(Select-String -LiteralPath (Join-Path $comfy 'comfy\cli_args.py') -SimpleMatch '"--disable-dynamic-vram"' -Quiet){$comfyArgs+='--disable-dynamic-vram'}
 Start-Process -FilePath $python -ArgumentList $comfyArgs -WorkingDirectory $comfy -WindowStyle Hidden -RedirectStandardOutput (Join-Path $ConfigDirectory 'comfy.stdout.log') -RedirectStandardError (Join-Path $ConfigDirectory 'comfy.stderr.log') | Out-Null
 Write-Host 'Démarrage de ComfyUI en arrière-plan…'
}
$config=Get-Content (Join-Path $ConfigDirectory 'config.json') -Raw | ConvertFrom-Json
Write-Host "Appairage : $(Join-Path $ConfigDirectory 'pairing.json')"
Write-Host "Écoute du serveur : $($config.host):$($config.port)"
$pairing=Get-Content (Join-Path $ConfigDirectory 'pairing.json') -Raw | ConvertFrom-Json
Write-Host "Connexion locale : $($pairing.url)"
$publicPairing=Join-Path $ConfigDirectory 'pairing-public.json'
if(Test-Path $publicPairing){$public=Get-Content $publicPairing -Raw | ConvertFrom-Json;Write-Host "Connexion publique : $($public.url)"}
Write-Host "Importez pairing.json dans l’app Android. Gardez ce fichier privé."
$listener=Get-NetTCPConnection -LocalPort $config.port -State Listen -ErrorAction SilentlyContinue
if($listener){
 & $node (Join-Path $repo 'bridge\health.mjs') $ConfigDirectory
 if($LASTEXITCODE -ne 0){throw 'Le port est occupé par un service différent ou un ancien appairage.'}
 return
}
Write-Host 'Gardez cette console ouverte. Ctrl+C arrête le compagnon, sans arrêter ComfyUI.'
& $node (Join-Path $repo 'bridge\cli.mjs') --config-dir $ConfigDirectory --models (Join-Path $StabilityRoot 'Data\Models')
