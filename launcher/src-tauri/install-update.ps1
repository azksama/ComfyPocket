$ErrorActionPreference='Stop'
$c=Get-Content -Encoding UTF8 -LiteralPath (Join-Path $PSScriptRoot 'install.json') -Raw | ConvertFrom-Json
Wait-Process -Id $c.pid -ErrorAction SilentlyContinue
try {
 $p=Start-Process -FilePath $c.installer -ArgumentList ('/S /D='+$c.directory) -WindowStyle Hidden -Wait -PassThru
 if($p.ExitCode -ne 0){throw ('Installation: '+$p.ExitCode)}
} catch { $_ | Out-File -LiteralPath (Join-Path $PSScriptRoot 'install-error.log') }
if($c.resume){Start-Process -FilePath $c.exe -ArgumentList '--start-engine' -WindowStyle Hidden}else{Start-Process -FilePath $c.exe -WindowStyle Hidden}
