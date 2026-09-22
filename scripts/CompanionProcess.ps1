function Test-ComfyPocketProcess {
 param($Process, [string]$ScriptPath, [string]$ConfigDirectory)
 if(-not $Process -or -not $Process.ExecutablePath -or [IO.Path]::GetFileName($Process.ExecutablePath) -ine 'node.exe'){return $false}
 $tokens=@([regex]::Matches($Process.CommandLine, '"[^"]*"|\S+') | ForEach-Object {$_.Value.Trim('"')})
 if($tokens.Count -lt 4){return $false}
 try {
  if([IO.Path]::GetFullPath($tokens[1]) -ine [IO.Path]::GetFullPath($ScriptPath)){return $false}
  $positions=@(2..($tokens.Count-1) | Where-Object {$tokens[$_] -eq '--config-dir'})
  if($positions.Count -ne 1 -or $positions[0]+1 -ge $tokens.Count){return $false}
  if([IO.Path]::GetFullPath($tokens[$positions[0]+1]) -ine [IO.Path]::GetFullPath($ConfigDirectory)){return $false}
 } catch {return $false}
 return $true
}

function Test-ComfyEngineProcess {
 param($Process, $Parent, [string]$ComfyDirectory)
 if(-not $Process -or -not $Process.ExecutablePath){return $false}
 $python=[IO.Path]::GetFullPath((Join-Path $ComfyDirectory 'venv\Scripts\python.exe'))
 $tokens=@([regex]::Matches($Process.CommandLine, '"[^"]*"|\S+') | ForEach-Object {$_.Value.Trim('"')})
 if($tokens.Count -lt 2 -or ($tokens[1] -ne 'main.py' -and $tokens[1] -ine (Join-Path $ComfyDirectory 'main.py'))){return $false}
 if([IO.Path]::GetFullPath($Process.ExecutablePath) -ieq $python){return $true}
 # Windows venv python forwards execution to the base interpreter in a child process.
 if(-not $Parent -or -not $Parent.ExecutablePath -or $Process.ParentProcessId -ne $Parent.ProcessId -or [IO.Path]::GetFullPath($Parent.ExecutablePath) -ine $python){return $false}
 $parentTokens=@([regex]::Matches($Parent.CommandLine, '"[^"]*"|\S+') | ForEach-Object {$_.Value.Trim('"')})
 return ($parentTokens.Count -eq $tokens.Count -and (($parentTokens | Select-Object -Skip 1) -join "`n") -ceq (($tokens | Select-Object -Skip 1) -join "`n"))
}

function Restart-StaleComfyPocket {
 param([string]$ScriptPath, [string]$ConfigDirectory, [int]$Port)
 $listeners=@(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
 $owners=@($listeners | Select-Object -ExpandProperty OwningProcess -Unique)
 if($owners.Count -ne 1){throw "Le port $Port ne correspond pas a une instance unique du compagnon. Aucun processus n'a ete arrete."}
 $candidate=Get-CimInstance Win32_Process -Filter "ProcessId = $($owners[0])"
 if(-not(Test-ComfyPocketProcess $candidate $ScriptPath $ConfigDirectory)){throw "Le port $Port appartient a un autre programme ou une autre installation. Aucun processus n'a ete arrete."}
 $current=Get-CimInstance Win32_Process -Filter "ProcessId = $($owners[0])"
 if(-not $current -or $current.CreationDate -ne $candidate.CreationDate -or -not(Test-ComfyPocketProcess $current $ScriptPath $ConfigDirectory)){throw 'Le processus a change pendant le controle. Relancez le lanceur.'}
 Write-Host 'Ancienne instance du compagnon detectee : rechargement de l identite conservee sur ce PC.'
 Stop-Process -Id $candidate.ProcessId -ErrorAction Stop
 $deadline=(Get-Date).AddSeconds(10)
 while(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue){
  if((Get-Date) -gt $deadline){throw 'Le port du compagnon ne se libere pas.'}
  Start-Sleep -Milliseconds 200
 }
}
