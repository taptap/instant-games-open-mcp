param([ValidateSet('start','check')][string]$Action='start',[string]$Directory,[switch]$IncludeLegacy)
$ErrorActionPreference='Stop'
if($env:OS -ne 'Windows_NT'){throw 'Windows only'}
if($Action -eq 'check'){
  $jobSource=@'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
public static class MakerProbeJob {
 [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr OpenProcess(uint access,bool inherit,int pid);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool IsProcessInJob(IntPtr process,IntPtr job,out bool result);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
 public static bool InJob(int pid){
   IntPtr handle=OpenProcess(0x1000u,false,pid);
   if(handle==IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
   try { bool result; if(!IsProcessInJob(handle,IntPtr.Zero,out result))throw new Win32Exception(Marshal.GetLastWin32Error());return result; }
   finally { CloseHandle(handle); }
 }
}
'@
  Add-Type -TypeDefinition $jobSource

  if(-not $Directory -or -not (Test-Path -LiteralPath (Join-Path $Directory 'manifest.json'))){throw 'Pass probe directory'}
  $manifest=Get-Content -LiteralPath (Join-Path $Directory 'manifest.json') -Raw | ConvertFrom-Json
  foreach($entry in $manifest.entries){
    $file=Join-Path $Directory ($entry.mode+'.json')
    $beat=if(Test-Path -LiteralPath $file){Get-Content -LiteralPath $file -Raw | ConvertFrom-Json}else{$null}
    $age=if($beat){[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()-$beat.at}else{$null}
    $alive=($null -ne $age -and $age -ge 0 -and $age -lt 3000 -and $beat.nonce -eq $manifest.nonce)
    $inJob=if($alive){ try {[MakerProbeJob]::InJob([int]$beat.pid)}catch{'unknown'} }else{'unknown'}
    [pscustomobject]@{Mode=$entry.mode;Start=$entry.status;Pid=$beat.pid;Ppid=$beat.ppid;Alive=$alive;InJob=$inJob}
  }
  return
}
if($Directory){throw 'Directory is only for check'}
$source=@'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;
public static class MakerProbeNative {
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] public struct StartupInfo {
  public int cb; public string reserved,desktop,title; public int x,y,width,height,charsX,charsY,fill,flags;
  public short show,reserved2; public IntPtr reservedPtr,stdin,stdout,stderr;
 }
 [StructLayout(LayoutKind.Sequential)] public struct ProcessInfo {public IntPtr process,thread; public int pid,tid;}
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CreateProcessW(string app,StringBuilder command,IntPtr attrs,IntPtr threadAttrs,bool inherit,uint flags,IntPtr env,string cwd,ref StartupInfo startup,out ProcessInfo info);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool IsProcessInJob(IntPtr process,IntPtr job,out bool result);
 [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
 public static bool InJob(){bool result;if(!IsProcessInJob(GetCurrentProcess(),IntPtr.Zero,out result))throw new Win32Exception(Marshal.GetLastWin32Error());return result;}
 public static int Start(string app,string args,string cwd,bool breakaway){
  var startup=new StartupInfo();startup.cb=Marshal.SizeOf(typeof(StartupInfo));ProcessInfo info;
  if(!CreateProcessW(app,new StringBuilder("\""+app+"\" "+args),IntPtr.Zero,IntPtr.Zero,false,breakaway?0x01000000u:0u,IntPtr.Zero,cwd,ref startup,out info))throw new Win32Exception(Marshal.GetLastWin32Error());
  CloseHandle(info.thread);CloseHandle(info.process);return info.pid;
 }
}
'@
Add-Type -TypeDefinition $source
$node=(Get-Command node.exe -ErrorAction Stop).Source
$worker=Join-Path $PSScriptRoot 'windows-launch-probe-child.cjs'
$directory=Join-Path (Join-Path $env:LOCALAPPDATA 'TapTap/Maker/launch-probes') ([guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $directory -Force | Out-Null
$nonce=[guid]::NewGuid().ToString('N');$entries=@()
function ArgsFor([string]$mode){'"'+$worker+'" "'+$directory+'" "'+$mode+'" "'+$nonce+'"'}
function Record([string]$mode,[scriptblock]$start){
 try{$result=& $start;$script:entries+=@{mode=$mode;status='created';pid=$result}}
 catch{$script:entries+=@{mode=$mode;status=('failed: '+$_.Exception.Message)}}
}
$inJob=[MakerProbeNative]::InJob()
Record 'node-detached' {
 $launcher=Join-Path $PSScriptRoot 'windows-launch-probe-detached.cjs'
 $pidValue=& $node $launcher $worker $directory $nonce
 if($LASTEXITCODE -ne 0 -or -not $pidValue){throw 'Node detached launcher failed'}
 $pidValue
}
Record 'create-process' {[MakerProbeNative]::Start($node,(ArgsFor 'create-process'),$directory,$false)}
Record 'create-process-breakaway' {[MakerProbeNative]::Start($node,(ArgsFor 'create-process-breakaway'),$directory,$true)}
Record 'shell-execute' {
 $info=New-Object System.Diagnostics.ProcessStartInfo
 $info.FileName=$node;$info.Arguments=ArgsFor 'shell-execute';$info.UseShellExecute=$true;$info.WorkingDirectory=$directory
 [System.Diagnostics.Process]::Start($info).Id
}
Record 'explorer-com' {
 $shell=New-Object -ComObject Shell.Application
 $shell.ShellExecute($node,(ArgsFor 'explorer-com'),$directory,'open',0)
 'shell-requested'
}
if($IncludeLegacy){
 Record 'cim-direct' {
  $result=Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine=('"'+$node+'" '+(ArgsFor 'cim-direct'));CurrentDirectory=$directory}
  if($result.ReturnValue -ne 0){throw "CIM error $($result.ReturnValue)"};$result.ProcessId
 }
 Record 'cim-encoded' {
  $command='"'+$node+'" '+(ArgsFor 'cim-encoded')
  $encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes("& $command"))
  $result=Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine="powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -EncodedCommand $encoded";CurrentDirectory=$directory}
  if($result.ReturnValue -ne 0){throw "CIM error $($result.ReturnValue)"};$result.ProcessId
 }
}
@{inJob=$inJob;nonce=$nonce;entries=$entries;startedAt=(Get-Date).ToString('o')} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $directory 'manifest.json') -Encoding UTF8
Start-Sleep -Seconds 2
Write-Output "Job membership: $inJob; directory: $directory"
Write-Output 'Children exit after 90 seconds; check after CLI/IDE exit within 90 seconds.'
& $PSCommandPath -Action check -Directory $directory
