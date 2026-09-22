param([Parameter(Mandatory)][string]$NodePath,[ValidateRange(1024,65535)][int]$Port)
$ErrorActionPreference='Stop'
if(-not(Test-Path -LiteralPath $NodePath -PathType Leaf)){throw 'Runtime du compagnon introuvable.'}
if($NodePath.Contains('"')){throw 'Chemin invalide.'}
$admin=([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if(-not $admin){
 $arguments="-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -NodePath `"$NodePath`" -Port $Port"
 $elevated=Start-Process -FilePath powershell.exe -ArgumentList $arguments -WindowStyle Hidden -Verb RunAs -Wait -PassThru
 exit $elevated.ExitCode
}
$rule=Get-NetFirewallRule -Name 'MochiStudio-Companion' -ErrorAction SilentlyContinue
if($rule){$rule | Remove-NetFirewallRule}
New-NetFirewallRule -Name 'MochiStudio-Companion' -DisplayName 'Mochi Studio - compagnon HTTPS' -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -Program $NodePath -Profile Any | Out-Null
