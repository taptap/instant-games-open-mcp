import path from 'node:path';

type Run = (command: string, args: string[], signal: AbortSignal) => Promise<string>;
export const CODEX_THREAD_ID_PATTERN = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

// Restart Manager is used only to query file owners. No shutdown/restart APIs are imported.
const FILE_OWNERS = String.raw`
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class MakerFileOwners {
  [StructLayout(LayoutKind.Sequential)] public struct UniqueProcess {
    public uint pid; public System.Runtime.InteropServices.ComTypes.FILETIME start;
  }
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public struct ProcessInfo {
    public UniqueProcess process;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=256)] public string app;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=64)] public string service;
    public uint type, status, session;
    [MarshalAs(UnmanagedType.Bool)] public bool restartable;
  }
  [DllImport("rstrtmgr.dll", CharSet=CharSet.Unicode)]
  static extern int RmStartSession(out uint session, uint flags, StringBuilder key);
  [DllImport("rstrtmgr.dll")] static extern int RmEndSession(uint session);
  [DllImport("rstrtmgr.dll", CharSet=CharSet.Unicode)]
  static extern int RmRegisterResources(uint session, uint files, string[] names,
    uint apps, UniqueProcess[] processes, uint services, string[] serviceNames);
  [DllImport("rstrtmgr.dll")]
  static extern int RmGetList(uint session, out uint needed, ref uint count,
    [In, Out] ProcessInfo[] result, ref uint reasons);
  public static bool IsOwner(string file, uint pid) {
    uint session;
    if (RmStartSession(out session, 0, new StringBuilder(33)) != 0)
      throw new InvalidOperationException("File owner query unavailable");
    try {
      if (RmRegisterResources(session, 1, new[]{file}, 0, null, 0, null) != 0)
        throw new InvalidOperationException("File registration unavailable");
      uint needed, count=0, reasons=0;
      int error=RmGetList(session, out needed, ref count, null, ref reasons);
      if (error == 0) return false;
      if (error != 234 || needed > 128)
        throw new InvalidOperationException("Ambiguous file owner query");
      var info=new ProcessInfo[needed]; count=needed;
      if (RmGetList(session, out needed, ref count, info, ref reasons) != 0)
        throw new InvalidOperationException("File owners changed");
      for (int i=0; i<count; i++) if (info[i].process.pid == pid) return true;
      return false;
    } finally { RmEndSession(session); }
  }
}`;

/** Resolve only a uniquely held writer lock, never the newest file or session. */
export async function findWindowsCodexThread(
  pid: number,
  home: string,
  signal: AbortSignal,
  run: Run
): Promise<string | undefined> {
  if (!Number.isSafeInteger(pid) || pid <= 1 || !path.isAbsolute(home)) return undefined;
  const directory = path.join(home, 'thread-writer-locks').replace(/'/g, "''");
  const script =
    "$ErrorActionPreference = 'Stop'; Add-Type -TypeDefinition @'\n" +
    FILE_OWNERS +
    "\n'@\n" +
    `$locks = @(Get-ChildItem -LiteralPath '${directory}' -Filter '*.lock' -File | Select-Object -First 129);\n` +
    "if ($locks.Count -gt 128) { throw 'Lock scan limit exceeded' };\n" +
    'foreach ($lock in $locks) {\n' +
    "  if ($lock.BaseName -notmatch '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$') { continue };\n" +
    `  if ([MakerFileOwners]::IsOwner($lock.FullName, ${pid})) { $lock.BaseName }\n` +
    '}';
  const output = await run(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    signal
  );
  signal.throwIfAborted();
  const ids = [
    ...new Set(
      output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
    ),
  ];
  return ids.length === 1 && CODEX_THREAD_ID_PATTERN.test(ids[0]) ? ids[0] : undefined;
}
