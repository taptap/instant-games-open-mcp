import {
  buildWindowsBackgroundLaunchScripts,
  launchBackgroundProcess,
  type BackgroundProcessLaunch,
} from '../system/backgroundProcess.js';

export type PreviewProcessLaunchOptions = {
  execPath: string;
  execArgv: string[];
  entry: string;
  project: string;
  sessionId?: string;
  cwd: string;
  logFile: string;
  env: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  signal?: AbortSignal;
};

export function buildWindowsPreviewLaunchScripts(options: PreviewProcessLaunchOptions): {
  broker: string;
  process: string;
} {
  return buildWindowsBackgroundLaunchScripts({
    command: options.execPath,
    args: [
      ...options.execArgv,
      options.entry,
      '__maker-preview-supervisor',
      options.project,
      ...(options.sessionId ? [options.sessionId] : []),
    ],
    cwd: options.cwd,
    logFile: options.logFile,
    env: options.env,
    platform: options.platform,
    signal: options.signal,
  });
}

export function launchPreviewSupervisorProcess(
  options: PreviewProcessLaunchOptions
): Promise<BackgroundProcessLaunch> {
  return launchBackgroundProcess({
    command: options.execPath,
    args: [
      ...options.execArgv,
      options.entry,
      '__maker-preview-supervisor',
      options.project,
      ...(options.sessionId ? [options.sessionId] : []),
    ],
    cwd: options.cwd,
    logFile: options.logFile,
    env: options.env,
    platform: options.platform,
    signal: options.signal,
  });
}
