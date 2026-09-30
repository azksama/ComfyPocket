param([Parameter(Mandatory)][string]$ProbeExecutable)
$ErrorActionPreference='Stop'
$exe=(Resolve-Path -LiteralPath $ProbeExecutable).Path
if([IO.Path]::GetFileName($exe) -ne 'standalone_probe.exe'){throw 'Use the standalone probe built by Cargo, not the application.'}
$resultFile=Join-Path ([IO.Path]::GetTempPath()) ('mochi-job-'+[guid]::NewGuid().ToString('N')+'.txt')
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class MochiJobTest {
 [StructLayout(LayoutKind.Sequential)] public struct BasicLimits {
  public long PerProcessUserTimeLimit, PerJobUserTimeLimit;
  public uint LimitFlags;
  public UIntPtr MinimumWorkingSetSize, MaximumWorkingSetSize;
  public uint ActiveProcessLimit; public UIntPtr Affinity; public uint PriorityClass, SchedulingClass;
 }
 [StructLayout(LayoutKind.Sequential)] public struct IoCounters { public ulong ReadOps,WriteOps,OtherOps,ReadBytes,WriteBytes,OtherBytes; }
 [StructLayout(LayoutKind.Sequential)] public struct ExtendedLimits { public BasicLimits Basic; public IoCounters Io; public UIntPtr ProcessMemory,JobMemory,PeakProcessMemory,PeakJobMemory; }
 [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public struct Startup {
  public uint cb; public string reserved, desktop, title; public uint x,y,width,height,xChars,yChars,fill,flags;
  public ushort show,reserved2; public IntPtr reservedBytes,input,output,error;
 }
 [StructLayout(LayoutKind.Sequential)] public struct ProcessInfo { public IntPtr process,thread; public uint pid,tid; }
 [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)] public static extern IntPtr CreateJobObject(IntPtr attributes,string name);
 [DllImport("kernel32.dll", SetLastError=true)] public static extern bool SetInformationJobObject(IntPtr job,int kind,ref ExtendedLimits limits,uint size);
 [DllImport("kernel32.dll", SetLastError=true)] public static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
 [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)] public static extern bool CreateProcess(string app,StringBuilder command,IntPtr processAttr,IntPtr threadAttr,bool inherit,uint flags,IntPtr env,string cwd,ref Startup startup,out ProcessInfo process);
 [DllImport("kernel32.dll", SetLastError=true)] public static extern uint ResumeThread(IntPtr thread);
 [DllImport("kernel32.dll", SetLastError=true)] public static extern bool CloseHandle(IntPtr handle);
}
'@
$job=[MochiJobTest]::CreateJobObject([IntPtr]::Zero,$null)
if($job -eq [IntPtr]::Zero){throw 'CreateJobObject failed'}
$child=New-Object MochiJobTest+ProcessInfo
$worker=$null
try {
 $limits=New-Object MochiJobTest+ExtendedLimits
 $limits.Basic.LimitFlags=8192 # KILL_ON_JOB_CLOSE, as used by parent process supervisors.
 if(-not [MochiJobTest]::SetInformationJobObject($job,9,[ref]$limits,[uint32][Runtime.InteropServices.Marshal]::SizeOf($limits))){throw 'SetInformationJobObject failed'}
 $startup=New-Object MochiJobTest+Startup
 $startup.cb=[Runtime.InteropServices.Marshal]::SizeOf($startup)
 $line=New-Object Text.StringBuilder ('"'+$exe+'" "'+$resultFile+'"')
 if(-not [MochiJobTest]::CreateProcess($exe,$line,[IntPtr]::Zero,[IntPtr]::Zero,$false,134217732,[IntPtr]::Zero,(Split-Path $exe -Parent),[ref]$startup,[ref]$child)){throw 'CreateProcess failed'}
 if(-not [MochiJobTest]::AssignProcessToJobObject($job,$child.process)){throw 'AssignProcessToJobObject failed'}
 if([MochiJobTest]::ResumeThread($child.thread) -eq [uint32]::MaxValue){throw 'ResumeThread failed'}
 $deadline=(Get-Date).AddSeconds(40)
 while(-not(Test-Path -LiteralPath $resultFile)){
  if((Get-Date) -gt $deadline){throw 'Independent worker did not report readiness'}
  Start-Sleep -Milliseconds 100
 }
 $parts=(Get-Content -LiteralPath $resultFile -Raw).Split(' ')
 if($parts[1] -ne 'false' -or [int]$parts[0] -eq $child.pid){throw 'Worker remained in the parent job'}
 $worker=Get-CimInstance Win32_Process -Filter "ProcessId=$($parts[0])"
 if(-not $worker -or $worker.ExecutablePath -ine $exe){throw 'Independent worker missing'}
 [MochiJobTest]::CloseHandle($job) | Out-Null
 $job=[IntPtr]::Zero
 Start-Sleep -Milliseconds 250
 $live=Get-CimInstance Win32_Process -Filter "ProcessId=$($worker.ProcessId)"
 if(-not $live -or $live.CreationDate -ne $worker.CreationDate){throw 'Worker terminated when the parent job closed'}
 Write-Output 'PASS: independent worker survived closure of the launching Windows job.'
} finally {
 if($job -ne [IntPtr]::Zero){[MochiJobTest]::CloseHandle($job) | Out-Null}
 if($child.thread -ne [IntPtr]::Zero){[MochiJobTest]::CloseHandle($child.thread) | Out-Null}
 if($child.process -ne [IntPtr]::Zero){[MochiJobTest]::CloseHandle($child.process) | Out-Null}
 if($worker){
  $live=Get-CimInstance Win32_Process -Filter "ProcessId=$($worker.ProcessId)"
  if($live -and $live.CreationDate -eq $worker.CreationDate -and $live.ExecutablePath -ieq $exe){Stop-Process -Id $worker.ProcessId}
 }
 if(Test-Path -LiteralPath $resultFile){Remove-Item -LiteralPath $resultFile}
}
