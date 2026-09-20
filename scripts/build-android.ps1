param([ValidateSet('aarch64','x86_64')][string]$Target='aarch64',[switch]$Release)
$ErrorActionPreference='Stop'
$repo=Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $repo
if(-not $env:JAVA_HOME){$env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'}
if(-not $env:ANDROID_HOME){$env:ANDROID_HOME=Join-Path $env:LOCALAPPDATA 'Android\Sdk'}
if(-not $env:NDK_HOME){$ndk=Get-ChildItem (Join-Path $env:ANDROID_HOME 'ndk') -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1;if($ndk){$env:NDK_HOME=$ndk.FullName}}
if(-not $env:NDK_HOME){throw 'Définissez NDK_HOME vers un Android NDK r27 ou plus récent.'}
$ErrorActionPreference='Continue'
$buildArgs=@('run','tauri','--','android','build','--apk','--target',$Target)
if(-not $Release){$buildArgs+='--debug'}
$output=& npm.cmd @buildArgs 2>&1
$code=$LASTEXITCODE
$output | Write-Output
$ErrorActionPreference='Stop'
if($code -ne 0 -and ($output -join "`n") -notmatch 'Creation symbolic link is not allowed'){throw 'La compilation Tauri a échoué.'}
$triple=if($Target -eq 'aarch64'){'aarch64-linux-android'}else{'x86_64-linux-android'}
$abi=if($Target -eq 'aarch64'){'arm64-v8a'}else{'x86_64'}
$arch=if($Target -eq 'aarch64'){'Arm64'}else{'X86_64'}
$profile=if($Release){'release'}else{'debug'}
$variant=if($Release){'Release'}else{'Debug'}
$source=Join-Path $repo "src-tauri\target\$triple\$profile\libcomfy_pocket_lib.so"
if(-not(Test-Path -LiteralPath $source)){throw 'Bibliothèque Rust compilée absente.'}
$jni=Join-Path $repo "src-tauri\gen\android\app\src\main\jniLibs\$abi"
New-Item -ItemType Directory -Force -Path $jni | Out-Null
$dest=Join-Path $jni 'libcomfy_pocket_lib.so'
if(Test-Path -LiteralPath $dest){if((Get-Item -LiteralPath $dest).LinkType){Remove-Item -LiteralPath $dest}}
Copy-Item -LiteralPath $source -Destination $dest -Force
& (Join-Path $env:NDK_HOME 'toolchains\llvm\prebuilt\windows-x86_64\bin\llvm-strip.exe') --strip-debug $dest
if($LASTEXITCODE -ne 0){throw 'Échec llvm-strip.'}
Push-Location (Join-Path $repo 'src-tauri\gen\android')
try{& .\gradlew.bat "assemble${arch}${variant}" -x "rustBuild${arch}${variant}";if($LASTEXITCODE -ne 0){throw 'Échec Gradle.'}}finally{Pop-Location}
$flavor=if($Target -eq 'aarch64'){'arm64'}else{'x86_64'}
$apkName=if($Release){"app-$flavor-release-unsigned.apk"}else{"app-$flavor-debug.apk"}
$apk=Join-Path $repo "src-tauri\gen\android\app\build\outputs\apk\$flavor\$profile\$apkName"
$suffix=if($Release){''}else{'-debug'}
$published=Join-Path (Split-Path $repo -Parent) "Mochi-$flavor$suffix.apk"
if($Release){
 if(-not $env:COMFY_KEYSTORE -or -not $env:COMFY_STORE_PASSWORD){throw 'Définissez COMFY_KEYSTORE et COMFY_STORE_PASSWORD pour signer la version release.'}
 $tools=Get-ChildItem (Join-Path $env:ANDROID_HOME 'build-tools') -Directory | Sort-Object Name -Descending | Select-Object -First 1
 & (Join-Path $tools.FullName 'apksigner.bat') sign --ks $env:COMFY_KEYSTORE --ks-key-alias comfypocket --ks-pass env:COMFY_STORE_PASSWORD --key-pass env:COMFY_STORE_PASSWORD --out $published $apk
 if($LASTEXITCODE -ne 0){throw 'Échec de signature.'}
 & (Join-Path $tools.FullName 'apksigner.bat') verify $published
 if($LASTEXITCODE -ne 0){throw 'Signature APK invalide.'}
}else{Copy-Item -LiteralPath $apk -Destination $published -Force}
Write-Host "APK $profile signé : $published"
