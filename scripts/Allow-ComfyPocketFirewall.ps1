param([string]$AllowedSubnet='192.168.1.0/24',[int]$Port=8189)
# Run explicitly as administrator if the existing Node rule does not permit the phone.
# For WireGuard without source NAT, add the VPN client subnet to AllowedSubnet instead.
$ErrorActionPreference='Stop'
$name='ComfyPocket-HTTPS-'+$Port
if(Get-NetFirewallRule -Name $name -ErrorAction SilentlyContinue){throw 'Règle existante. Vérifiez-la avant de la remplacer.'}
New-NetFirewallRule -Name $name -DisplayName 'Comfy Pocket HTTPS privé' -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -RemoteAddress $AllowedSubnet -Program (Get-Command node).Source -Profile Any
