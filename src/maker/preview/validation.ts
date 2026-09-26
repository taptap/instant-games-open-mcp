import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { previewDirectory, previewRoundDirectory, writePrivateJson } from './protocol.js';
import { PreviewLogs, trimPreviewEvidence } from './evidence.js';
import { withPreviewLock } from './installation.js';
import { previewStatus } from './session.js';
import { preflightPreview, previewWindow, requireManifestPreviewPlatform } from './runtime.js';
import { preparePreviewProject } from './prepare.js';
import { classifyPreviewProject } from './configuration.js';
import { startPreviewAssetServer, type PreviewAssetServer } from './assets.js';
import { preparePreviewServer } from './network.js';
import { sanitizeDiagnosticValue } from '../server/diagnosticRedaction.js';

export type PreviewValidationMode = 'validate' | 'screenshot' | 'both';

type ValidationIdentity = {
  protocol_version: number;
  project_realpath: string;
  session_id: string;
  reload_id: number;
};

const VALIDATE_FRAMES = 60;
const SCREENSHOT_FRAME = 120;
const VALIDATE_TIMEOUT_SECONDS = 45;
const PROCESS_TIMEOUT_MS = 120_000;
const POST_START_SCREENSHOT_CAPABILITY = 'screenshot-after-start';

function validationResult(
  identity: ValidationIdentity,
  result: string,
  fields: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    ...identity,
    ok: result === 'PASS',
    result,
    artifacts: [],
    ...fields,
  };
}

function appendOutput(logs: PreviewLogs, chunk: Buffer | string): void {
  for (const line of String(chunk).split(/\r?\n/)) {
    if (line) logs.append(line.slice(0, 65536));
  }
}

function readJsonFile(filename: string): Record<string, unknown> | undefined {
  if (!fs.existsSync(filename)) return undefined;
  const stat = fs.lstatSync(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4 * 1024 * 1024)
    throw new Error('Validation report is not a regular file.');
  try {
    const value = JSON.parse(fs.readFileSync(filename, 'utf8')) as unknown;
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  } catch (error) {
    throw new Error('Validation report is not valid JSON: ' + String(error));
  }
}

function artifact(
  kind: string,
  filename: string,
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  const stat = fs.statSync(filename);
  return { kind, path: filename, bytes: stat.size, ...extra };
}

function reportPassed(report: Record<string, unknown>): boolean {
  const summary = report.summary as Record<string, unknown> | undefined;
  return (
    report.version === 2 &&
    report.result === 'PASS' &&
    Number.isSafeInteger(report.frames_completed) &&
    Number(report.frames_completed) > 0 &&
    !!summary &&
    ['lua_errors', 'resource_errors', 'engine_errors', 'total_errors'].every(
      (name) => summary[name] === 0
    ) &&
    Array.isArray(report.missing_resources) &&
    report.missing_resources.length === 0 &&
    report.test_result !== 'FAILED'
  );
}

function screenshotArtifact(filename: string): Record<string, unknown> {
  const stat = fs.lstatSync(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 45 || stat.size > 128 * 1024 * 1024)
    throw new Error('Runtime screenshot is not a regular PNG file.');
  const descriptor = fs.openSync(filename, 'r');
  const header = Buffer.alloc(24);
  const tail = Buffer.alloc(12);
  try {
    fs.readSync(descriptor, header, 0, header.length, 0);
    fs.readSync(descriptor, tail, 0, tail.length, stat.size - tail.length);
  } finally {
    fs.closeSync(descriptor);
  }
  if (
    !header.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) ||
    header.readUInt32BE(8) !== 13 ||
    header.toString('ascii', 12, 16) !== 'IHDR' ||
    !tail.equals(Buffer.from('0000000049454e44ae426082', 'hex')) ||
    header.readUInt32BE(16) === 0 ||
    header.readUInt32BE(20) === 0
  )
    throw new Error('Runtime screenshot is not a complete PNG.');
  return artifact('screenshot', filename, {
    width: header.readUInt32BE(16),
    height: header.readUInt32BE(20),
  });
}

export async function runPreviewValidation(
  executable: string,
  project: string,
  mode: PreviewValidationMode,
  signal?: AbortSignal
): Promise<Record<string, unknown>> {
  return withPreviewLock(project, async () => {
    const status = await previewStatus(project);
    if (status.process_alive !== false || !['stopped', 'failed'].includes(String(status.state)))
      throw new Error('Stop the active local preview before running one-shot validation.');
    return runValidation(executable, project, mode, signal);
  });
}

async function runValidation(
  executable: string,
  project: string,
  mode: PreviewValidationMode,
  signal?: AbortSignal
): Promise<Record<string, unknown>> {
  requireManifestPreviewPlatform();
  if (!['validate', 'screenshot', 'both'].includes(mode))
    throw new Error('Validation mode must be validate, screenshot, or both.');
  if (signal?.aborted) throw new Error('CANCELLED');

  const identity: ValidationIdentity = {
    protocol_version: 1,
    project_realpath: project,
    session_id: randomUUID(),
    reload_id: 0,
  };
  const directory = previewRoundDirectory(identity);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const logs = new PreviewLogs(directory);
  const reportPath = path.join(directory, 'validate.json');
  const screenshotPath = path.join(directory, `${randomUUID()}.png`);
  let assets: PreviewAssetServer | undefined;
  let temporaryCache: string | undefined;
  let child: ReturnType<typeof spawn> | undefined;
  let timedOut = false;
  let cancelled = false;
  let screenshotAfterStartSupported = false;
  let outputTail = '';
  let report: Record<string, unknown> | undefined;
  let unsupportedCapability: string | undefined;
  const artifacts: Record<string, unknown>[] = [];
  const startedAt = new Date().toISOString();
  let exited: Promise<void> | undefined;
  let exitCode: number | null | undefined;

  const cleanup = async (): Promise<void> => {
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      const timer = setTimeout(() => child?.kill('SIGKILL'), 3000);
      try {
        // Keep resources and the project lock until the owned child has closed.
        await exited;
      } finally {
        clearTimeout(timer);
      }
    }
    await assets?.close();
    if (temporaryCache && fs.existsSync(temporaryCache)) {
      if (fs.lstatSync(temporaryCache).isSymbolicLink())
        throw new Error('Validation cache ownership changed.');
      fs.rmSync(temporaryCache, { recursive: true, force: true });
    }
  };

  try {
    const preflight = await preflightPreview(executable, project, signal);
    const classification = classifyPreviewProject(project);
    if (classification.network_required)
      return validationResult(identity, 'UNSUPPORTED', {
        error: 'run-lua-validate does not support multiplayer/server projects.',
        preflight,
      });

    let source = project;
    let entry = String(preflight.entry);
    if (classification.preparation_required) {
      const prepared = await preparePreviewProject(project, directory, signal);
      source = String(prepared.source_directory);
      entry = String(prepared.entry);
      if (typeof prepared.log_path === 'string' && fs.existsSync(prepared.log_path))
        artifacts.push(artifact('prepare-log', prepared.log_path));
    }

    const server = await preparePreviewServer(source, project, signal, false);
    if (server) throw new Error('Unexpected network configuration for local validation.');

    let runtimeArgs: string[];
    if (classification.preparation_required) {
      assets = await startPreviewAssetServer(source, signal);
      fs.mkdirSync(previewDirectory(project), { recursive: true, mode: 0o700 });
      temporaryCache = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'maker-validate-')));
      runtimeArgs = ['-game_url=' + assets.url, '-game_path=' + temporaryCache];
    } else {
      runtimeArgs = [entry, '-tapcode_dir=' + source];
    }

    const window = previewWindow(project);
    const args = [
      ...runtimeArgs,
      '-skip_login',
      '-log',
      'info',
      '-w',
      '-width=' + window.width,
      '-height=' + window.height,
    ];
    if (mode === 'validate') {
      args.push(
        '-graphicsheadless',
        '-validate',
        `-validate-frames=${VALIDATE_FRAMES}`,
        `-validate-timeout=${VALIDATE_TIMEOUT_SECONDS}`,
        '-validate-output=' + reportPath
      );
    }
    if (mode === 'both') {
      args.push(
        '-validate',
        `-validate-frames=${SCREENSHOT_FRAME + 80}`,
        `-validate-timeout=${VALIDATE_TIMEOUT_SECONDS + 55}`,
        '-validate-output=' + reportPath
      );
    }
    if (mode === 'screenshot' || mode === 'both')
      args.push(
        '-screenshot=' + screenshotPath,
        `-screenshot-frame=${SCREENSHOT_FRAME}`,
        '-screenshot-after-start'
      );

    child = spawn(executable, args, {
      cwd: source,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: false,
    });
    // Keep spawn errors handled even if persisting invocation evidence throws first.
    child.on('error', () => {});
    exited = new Promise<void>((resolve) => child!.once('close', () => resolve()));
    writePrivateJson(path.join(directory, 'invocation.json'), {
      executable,
      args: sanitizeDiagnosticValue(args),
      cwd: source,
      mode,
      started_at: startedAt,
      runtime_pid: child.pid,
    });
    const output = (chunk: Buffer): void => {
      outputTail = outputTail + String(chunk);
      if (outputTail.includes('[Screenshot] after-start enabled'))
        screenshotAfterStartSupported = true;
      outputTail = outputTail.slice(-128);
      appendOutput(logs, chunk);
    };
    child.stdout?.on('data', output);
    child.stderr?.on('data', output);

    exitCode = await new Promise<number | null>((resolve, reject) => {
      const timer = setTimeout(() => {
        timedOut = true;
        child?.kill('SIGTERM');
        reject(new Error('TIMEOUT: local validation Runtime did not exit.'));
      }, PROCESS_TIMEOUT_MS);
      const onAbort = (): void => {
        cancelled = true;
        child?.kill('SIGTERM');
        reject(new Error('CANCELLED'));
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      child?.once('error', (error) => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        reject(error);
      });
      child?.once('close', (code) => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        resolve(code);
      });
      if (signal?.aborted) onAbort();
    });

    report = mode === 'validate' || mode === 'both' ? readJsonFile(reportPath) : undefined;
    if ((mode === 'validate' || mode === 'both') && !report)
      throw new Error('Runtime exited without producing a valid validate.json report.');
    if (report) artifacts.push(artifact('validate-report', reportPath, { report }));
    if (mode === 'screenshot' || mode === 'both') {
      if (!screenshotAfterStartSupported) {
        unsupportedCapability = POST_START_SCREENSHOT_CAPABILITY;
        throw new Error(
          `UNSUPPORTED: Runtime does not confirm -${POST_START_SCREENSHOT_CAPABILITY}. ` +
            'Update the Runtime through the current distribution; no screenshot readiness claim is made.'
        );
      }
      if (!fs.existsSync(screenshotPath) || fs.statSync(screenshotPath).size === 0)
        throw new Error(
          (report?.result && report.result !== 'PASS' ? `Runtime report: ${report.result}. ` : '') +
            'Runtime exited without producing a non-empty screenshot.'
        );
      artifacts.push(screenshotArtifact(screenshotPath));
    }
    const passed =
      exitCode === 0 &&
      (mode === 'screenshot'
        ? artifacts.some((item) => item.kind === 'screenshot')
        : !!report && reportPassed(report));
    const result = validationResult(
      identity,
      passed ? 'PASS' : report?.result === 'TIMEOUT' ? 'TIMEOUT' : 'FAIL',
      {
        mode,
        report,
        artifacts,
        log_path: path.join(directory, 'runtime.log'),
        preflight,
        exit_code: exitCode,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        invocation_path: path.join(directory, 'invocation.json'),
        evidence_directory: directory,
      }
    );
    writePrivateJson(path.join(directory, 'result.json'), result);
    return result;
  } catch (error) {
    const prepareLog = path.join(directory, 'prepare.log');
    if (fs.existsSync(prepareLog) && !artifacts.some((item) => item.path === prepareLog))
      artifacts.push(artifact('prepare-log', prepareLog));
    const result = validationResult(
      identity,
      cancelled || signal?.aborted
        ? 'CANCELLED'
        : timedOut
          ? 'TIMEOUT'
          : String(error).includes('UNSUPPORTED:')
            ? 'UNSUPPORTED'
            : 'FAIL',
      {
        mode,
        error: String(sanitizeDiagnosticValue(error instanceof Error ? error.message : error)),
        ...(unsupportedCapability
          ? {
              upgrade_required: true,
              required_capabilities: [unsupportedCapability],
              runtime_capabilities: {
                [unsupportedCapability]: false,
              },
              upgrade_message:
                'Update UrhoXRuntime through the current Maker distribution and rerun validation.',
            }
          : {}),
        artifacts,
        report,
        exit_code: exitCode,
        log_path: path.join(directory, 'runtime.log'),
        invocation_path: fs.existsSync(path.join(directory, 'invocation.json'))
          ? path.join(directory, 'invocation.json')
          : undefined,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        evidence_directory: directory,
      }
    );
    writePrivateJson(path.join(directory, 'result.json'), result);
    return result;
  } finally {
    await cleanup();
    const previous = await previewStatus(project);
    // Retain an active/previous preview's evidence as well as this validation.
    trimPreviewEvidence(
      path.dirname(path.dirname(directory)),
      typeof previous.session_id === 'string' ? previous.session_id : identity.session_id,
      typeof previous.reload_id === 'number' ? previous.reload_id : 0
    );
  }
}
