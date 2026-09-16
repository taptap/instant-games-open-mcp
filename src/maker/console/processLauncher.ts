import {
  buildWindowsBackgroundLaunchScripts,
  launchBackgroundProcess,
  openBackgroundProcessLog,
  selectWindowsBackgroundEnvironment,
  type BackgroundProcessLaunch,
} from '../system/backgroundProcess.js';

export type ConsoleProcessLaunch = BackgroundProcessLaunch;

export type ConsoleProcessLaunchOptions = {
  execPath: string;
  execArgv: string[];
  entry: string;
  cwd: string;
  logFile: string;
  env: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
};

export const openConsoleLog = openBackgroundProcessLog;
export const selectWindowsConsoleEnvironment = selectWindowsBackgroundEnvironment;

export function buildWindowsConsoleLaunchScripts(options: ConsoleProcessLaunchOptions): {
  broker: string;
  server: string;
} {
  const scripts = buildWindowsBackgroundLaunchScripts({
    command: options.execPath,
    args: [...options.execArgv, options.entry, '__maker-console-server'],
    cwd: options.cwd,
    logFile: options.logFile,
    env: options.env,
    platform: options.platform,
  });
  return { broker: scripts.broker, server: scripts.process };
}

export function launchConsoleServerProcess(
  options: ConsoleProcessLaunchOptions
): Promise<ConsoleProcessLaunch> {
  return launchBackgroundProcess({
    command: options.execPath,
    args: [...options.execArgv, options.entry, '__maker-console-server'],
    cwd: options.cwd,
    logFile: options.logFile,
    env: options.env,
    platform: options.platform,
  });
}
