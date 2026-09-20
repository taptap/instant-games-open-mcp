import type { MakerQrcodePublication } from '../qrcodePreflight.js';
import type { MakerQrcodeInteraction, MakerQrcodeRecovery } from '../qrcodeInteraction.js';
import type { MakerIssueCategory, MakerMcpReportContext } from '../cli/mcpIssueReport.js';

export interface ConsoleProject {
  key: string;
  projectid: string;
  name: string;
  path: string;
  valid: boolean;
  error?: string;
}

export const CONSOLE_ACTIONS = [
  'build',
  'qrcode',
  'lua-lsp.check',
  'preview.start',
  'preview.refresh',
  'preview.stop',
  'preview.install',
] as const;
export type ConsoleAction = (typeof CONSOLE_ACTIONS)[number];
export interface ConsoleProgress {
  phase: string;
  message: string;
  progress?: number;
  total?: number;
}
export interface ConsoleTask {
  reportOffer?: { category: MakerIssueCategory; fingerprint: string };
  report?: { status: 'running' | 'created' | 'unavailable' | 'unknown'; issue_url?: string };
  id: string;
  projectKey: string;
  projectName: string;
  projectPath?: string;
  projectid?: string;
  sourceTaskId?: string;
  interaction?: MakerQrcodeInteraction;
  recovery?: MakerQrcodeRecovery;
  action: ConsoleAction;
  status: 'running' | 'succeeded' | 'failed' | 'unknown';
  startedAt: string;
  finishedAt?: string;
  output: string;
  progress?: ConsoleProgress;
  result?: unknown;
  error?: string;
}
export type ConsoleExecutor = (options: {
  project: string;
  action: ConsoleAction | 'preview.status' | 'preview.logs' | 'issue.report';
  reportContext?: MakerMcpReportContext;
  onOutput: (text: string) => void;
  onProgress?: (progress: ConsoleProgress) => void;
  signal?: AbortSignal;
  confirmedOrientation?: 'landscape' | 'portrait';
  publication?: MakerQrcodePublication;
  confirmedBuild?: boolean;
}) => Promise<{ ok: boolean; unknown?: boolean; error?: string; [key: string]: unknown }>;

export class ConsoleError extends Error {
  constructor(
    message: string,
    readonly status = 400
  ) {
    super(message);
  }
}
