import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { projectEntry, writePrivateJson } from './protocol.js';
import { previewStatus } from './session.js';
import { withPreviewLock, previewInstallation } from './installation.js';
import { probeRuntime, previewWindow } from './runtime.js';
import { ensurePreviewRuntimeResources } from './runtimeResources.js';
import { classifyPreviewProject } from './configuration.js';
import { preparePreviewProject, requireManifestPreviewPlatform } from './prepare.js';
import { startPreviewAssetServer, type PreviewAssetServer } from './assets.js';
import { PreviewLogs } from './evidence.js';
import { PreviewLuaLog } from './luaLog.js';
import { selectWindowsBackgroundEnvironment } from '../system/backgroundProcess.js';
import { sanitizeDiagnosticValue } from '../server/diagnosticRedaction.js';
import { repairLocalValidationSkillFilter } from '../cli/devKit.js';
import {
  archiveValidationRun,
  cleanValidationHistory,
  createValidationRun,
  finishValidationRun,
  isCompleteValidationPng,
  requireNoActiveValidationRuntime,
  updateValidationRun,
  type ValidationHandle,
} from './validationHistory.js';

type Options = Record<string, string | boolean>;

function numberOption(options: Options, name: string, fallback: number, max = 2147483647): number {
  const raw = options[name];
  const value =
    raw === undefined ? fallback : typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(value) || value < 1 || value > max)
    throw new Error(`--${name.replace(/_/g, '-')} must be an integer between 1 and ${max}.`);
  return value;
}

function scriptOption(project: string, options: Options, name: string): string | undefined {
  if (options[name] === undefined) return undefined;
  if (typeof options[name] !== 'string' || String(options[name]).startsWith('-'))
    throw new Error(`--${name.replace(/_/g, '-')} requires a Lua file relative to scripts/.`);
  return projectEntry(project, String(options[name]));
}

function captureOutput(stream: NodeJS.ReadableStream, append: (line: string) => void): void {
  const decoder = new StringDecoder('utf8');
  let pending = '';
  stream.on('data', (chunk: Buffer) => {
    pending += decoder.write(chunk);
    let newline: number;
    while ((newline = pending.indexOf('\n')) >= 0) {
      append(pending.slice(0, newline).replace(/\r$/, '').slice(0, 65536));
      pending = pending.slice(newline + 1);
    }
    if (pending.length > 65536) {
      append(pending.slice(0, 65536));
      pending = '';
    }
  });
  stream.on('end', () => {
    pending += decoder.end();
    if (pending) append(pending.slice(0, 65536));
  });
}

function readArtifact(filename: string, max: number): Buffer {
  const stat = fs.lstatSync(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0 || stat.size > max)
    throw new Error('Missing, empty or invalid artifact: ' + filename);
  return fs.readFileSync(filename);
}

export async function runSkillValidation(
  project: string,
  options: Options,
  signal: AbortSignal
): Promise<Record<string, unknown>> {
  const run = await createValidationRun(project);
  const paths = {
    run_id: run.run_id,
    evidence_directory: run.directory,
    log_path: path.join(run.directory, 'runtime.log'),
    invocation_path: path.join(run.directory, 'invocation.json'),
    started_at: run.started_at,
  };
  process.stderr.write(JSON.stringify({ event: 'validation.started', ...paths }) + '\n');
  let output: Record<string, unknown>;
  try {
    writePrivateJson(paths.invocation_path, {
      requested_options: sanitizeDiagnosticValue(options),
    });
    if (
      options.output_dir !== undefined &&
      (typeof options.output_dir !== 'string' || !path.isAbsolute(options.output_dir))
    )
      throw new Error('--output-dir must be an absolute directory.');
    output = await executeSkillValidation(project, options, signal, run);
  } catch (error) {
    output = {
      ok: false,
      result: signal.aborted ? 'CANCELLED' : 'FAIL',
      error: sanitizeDiagnosticValue(error instanceof Error ? error.message : String(error)),
    };
    try {
      new PreviewLogs(run.directory).append(String(output.error));
    } catch (logError) {
      output.error =
        String(output.error) +
        '\nValidation error log could not be saved: ' +
        String(sanitizeDiagnosticValue(String(logError)));
    }
  }
  output = {
    ...output,
    ...paths,
    project_realpath: project,
    finished_at: new Date().toISOString(),
  };
  finishValidationRun(run, output);
  if (typeof options.output_dir === 'string') {
    try {
      output.archive_directory = await archiveValidationRun(run, options.output_dir);
    } catch (error) {
      output.ok = false;
      output.result = 'FAIL';
      output.error = [
        output.error,
        'Evidence archive failed: ' + String(sanitizeDiagnosticValue(String(error))),
      ]
        .filter(Boolean)
        .join('\n');
    }
  }
  // Retention is best effort; it must not obscure this run's diagnostics.
  try {
    output.warnings = [
      ...(Array.isArray(output.warnings) ? output.warnings : []),
      ...(await cleanValidationHistory(project)),
    ];
  } catch (error) {
    output.warnings = [
      ...(Array.isArray(output.warnings) ? output.warnings : []),
      'Validation history cleanup skipped: ' + String(sanitizeDiagnosticValue(String(error))),
    ];
  }
  finishValidationRun(run, output);
  return output;
}

async function executeSkillValidation(
  project: string,
  options: Options,
  signal: AbortSignal,
  run: ValidationHandle
): Promise<Record<string, unknown>> {
  return withPreviewLock(project, async () => {
    requireManifestPreviewPlatform();
    if (signal.aborted) throw new Error('CANCELLED');
    await requireNoActiveValidationRuntime(project, run.run_id);
    const previous = await previewStatus(project);
    if (previous.process_alive !== false || !['stopped', 'failed'].includes(String(previous.state)))
      throw new Error(
        'An active or unverified preview blocks validation. Stop it explicitly first.'
      );
    const classification = classifyPreviewProject(project);
    if (classification.network_required)
      return {
        ok: false,
        result: 'UNSUPPORTED',
        error: 'run-lua-validate supports single-player projects only.',
      };

    const mode = options.mode ?? 'validate';
    if (!['validate', 'screenshot', 'both'].includes(String(mode)))
      throw new Error('--mode must be validate, screenshot or both.');
    const capture = mode !== 'validate';
    const validate = mode !== 'screenshot';
    if (capture && options.screenshot_frame === undefined)
      throw new Error('Choose --screenshot-frame for the current game and validation goal.');
    if (!capture && options.screenshot_frame !== undefined)
      throw new Error('--screenshot-frame requires screenshot or both mode.');
    if (
      !validate &&
      ['validate_frames', 'validate_test', 'validate_spike_threshold'].some(
        (key) => options[key] !== undefined
      )
    )
      throw new Error(
        '--validate-frames, --validate-test and --validate-spike-threshold require validate or both mode.'
      );
    const frame = capture ? numberOption(options, 'screenshot_frame', 0, 2147483567) : undefined;
    const frames = numberOption(options, 'validate_frames', mode === 'both' ? frame! + 80 : 60);
    const timeout = numberOption(options, 'validate_timeout', capture ? 100 : 45, 580);
    if (mode === 'both' && frames < frame! + 3)
      throw new Error(
        '--validate-frames must leave at least 3 frames after --screenshot-frame for readback.'
      );
    const entry = scriptOption(project, options, 'entry') ?? projectEntry(project);
    const test = scriptOption(project, options, 'validate_test');
    const window = previewWindow(project);
    const width = numberOption(options, 'width', window.width, 4096);
    const height = numberOption(options, 'height', window.height, 4096);
    if (width < 100 || height < 100)
      throw new Error('Validation width and height must be 100..4096.');
    const spike =
      options.validate_spike_threshold === undefined
        ? undefined
        : numberOption(options, 'validate_spike_threshold', 100);
    if (options.nosound !== undefined && options.nosound !== true)
      throw new Error('--nosound is a flag, without a value.');
    const external = typeof options.runtime === 'string';
    const configured = external ? String(options.runtime) : previewInstallation(project).executable;
    if (!configured)
      throw new Error(
        'Runtime is missing. Use preview install through the current Maker distribution.'
      );
    if (!path.isAbsolute(configured))
      throw new Error('--runtime must be an absolute executable path.');
    const executable = fs.realpathSync(configured);
    await probeRuntime(executable, signal);
    if (!external) ensurePreviewRuntimeResources(executable);

    const identity = {
      protocol_version: 1,
      project_realpath: project,
      session_id: run.run_id,
      reload_id: 0,
    };
    const directory = run.directory;
    const logs = new PreviewLogs(directory);
    const failures: string[] = [];
    let logWriteFailed = false;
    const appendLog = (line: string): void => {
      try {
        logs.append(line);
      } catch (error) {
        if (!logWriteFailed)
          failures.push(
            'Runtime log collection failed: ' + String(sanitizeDiagnosticValue(String(error)))
          );
        logWriteFailed = true;
      }
    };
    const lua = new PreviewLuaLog(executable, appendLog);
    const reportPath = path.join(directory, 'validate.json');
    const pngPath = path.join(directory, 'screenshot.png');
    const artifacts: Record<string, unknown>[] = [];
    const warnings = repairLocalValidationSkillFilter(project);
    let report: Record<string, unknown> | undefined;
    let preparation: Record<string, unknown> | undefined;
    let assets: PreviewAssetServer | undefined;
    let cache: string | undefined;
    let exitCode: number | null = null;
    let exitSignal: NodeJS.Signals | null = null;
    let timedOut = false;
    const started = run.started_at;
    const invocationPath = path.join(directory, 'invocation.json');

    try {
      let source = project;
      let runtimeEntry = entry;
      if (classification.preparation_required) {
        preparation = await preparePreviewProject(
          project,
          directory,
          signal,
          options.entry === undefined ? undefined : entry
        );
        source = String(preparation.source_directory);
        runtimeEntry = String(preparation.entry);
      }
      if (signal.aborted) throw new Error('CANCELLED');
      let args: string[];
      if (classification.preparation_required) {
        assets = await startPreviewAssetServer(source, signal);
        cache = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'maker-validate-')));
        args = ['-game_url=' + assets.url, '-game_path=' + cache];
      } else {
        args = [runtimeEntry, '-tapcode_dir=' + source];
      }
      args.push('-skip_login', '-p=Res', '-log=info', '-w', '-width=' + width, '-height=' + height);
      if (options.nosound === true) args.push('-nosound');
      if (validate) {
        args.push(
          '-validate',
          '-validate-frames=' + frames,
          '-validate-timeout=' + timeout,
          '-validate-output=' + reportPath
        );
        if (!capture) args.push('-graphicsheadless');
        if (test) args.push('-validate-test=' + path.join(source, 'scripts', test));
        if (spike !== undefined) args.push('-validate-spike-threshold=' + spike);
      }
      if (capture) args.push('-screenshot=' + pngPath, '-screenshot-frame=' + frame);
      if (signal.aborted) throw new Error('CANCELLED');
      writePrivateJson(invocationPath, {
        executable,
        args: sanitizeDiagnosticValue(args),
        cwd: source,
      });
      updateValidationRun(run, { phase: 'starting', runtime_launch_pending: true });
      const child = spawn(executable, args, {
        cwd: source,
        shell: false,
        detached: false,
        windowsHide: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        env:
          process.platform === 'win32'
            ? selectWindowsBackgroundEnvironment(process.env)
            : process.env,
      });
      const append = (line: string): void => {
        lua.observe(line);
        appendLog(assets ? line.split(assets.url).join('[local-preview]/') : line);
      };
      captureOutput(child.stdout, append);
      captureOutput(child.stderr, append);
      exitCode = await new Promise<number | null>((resolve, reject) => {
        let force: ReturnType<typeof setTimeout> | undefined;
        let spawnError: Error | undefined;
        const stop = (): void => {
          if (child.exitCode !== null || child.signalCode !== null || force) return;
          child.kill('SIGTERM');
          force = setTimeout(() => child.kill('SIGKILL'), 3000);
        };
        const timer = setTimeout(
          () => {
            timedOut = true;
            stop();
          },
          (timeout + 20) * 1000
        );
        signal.addEventListener('abort', stop, { once: true });
        child.once('error', (error) => {
          spawnError = error;
        });
        child.once('close', (code, terminatedBy) => {
          exitSignal = terminatedBy;
          clearTimeout(timer);
          clearTimeout(force);
          signal.removeEventListener('abort', stop);
          if (spawnError) reject(spawnError);
          else resolve(code);
        });
        // Register after installing cleanup listeners so a disk error cannot orphan Runtime.
        try {
          updateValidationRun(run, {
            phase: 'running',
            runtime_pid: child.pid,
            runtime_launch_pending: !child.pid,
          });
        } catch (error) {
          spawnError = error instanceof Error ? error : new Error(String(error));
          stop();
        }
        if (signal.aborted) stop();
      });
    } catch (error) {
      failures.push(
        String(sanitizeDiagnosticValue(error instanceof Error ? error.message : error))
      );
    } finally {
      if (!(await lua.finish())) failures.push('Final Lua log collection is incomplete.');
      try {
        await assets?.close();
        if (cache) {
          if (fs.lstatSync(cache).isSymbolicLink() || fs.realpathSync(cache) !== cache)
            failures.push('Validation cache ownership changed; cache retained.');
          else fs.rmSync(cache, { recursive: true, force: true });
        }
      } catch (error) {
        failures.push(String(error));
      }
    }

    // Evidence is independent: a missing report must not hide a screenshot (or vice versa).
    if (validate) {
      try {
        report = JSON.parse(readArtifact(reportPath, 4 * 1024 * 1024).toString('utf8'));
        if (!report || !['PASS', 'FAIL', 'TIMEOUT'].includes(String(report.result)))
          throw new Error('Runtime report is missing a recognized result.');
        artifacts.push({ kind: 'validate-report', path: reportPath });
        const summary = report.summary as Record<string, unknown> | undefined;
        if (
          !Number.isSafeInteger(report.frames_completed) ||
          Number(report.frames_completed) < 0 ||
          !summary ||
          !['lua_errors', 'resource_errors', 'engine_errors', 'total_errors'].every(
            (key) => Number.isSafeInteger(summary[key]) && Number(summary[key]) >= 0
          ) ||
          !Array.isArray(report.missing_resources)
        )
          throw new Error('Runtime report is incomplete; inspect the retained raw report.');
        if (test && !['PASSED', 'FAILED'].includes(String(report.test_result)))
          throw new Error(
            'The requested assertion script did not run. Inspect the log; update through the current Maker distribution if this Runtime lacks -validate-test.'
          );
      } catch (error) {
        failures.push('Could not collect validate report: ' + String(error));
      }
    }
    if (capture) {
      try {
        const png = readArtifact(pngPath, 128 * 1024 * 1024);
        if (!isCompleteValidationPng(png))
          throw new Error('Runtime did not produce a complete PNG.');
        artifacts.push({
          kind: 'screenshot',
          path: pngPath,
          frame,
          width: png.readUInt32BE(16),
          height: png.readUInt32BE(20),
        });
      } catch (error) {
        failures.push(
          'Could not collect screenshot: ' +
            String(error) +
            '. Check this run log, permissions and desktop session; upgrade through the current Maker distribution only if Runtime support is missing.'
        );
      }
    }
    const prepareLog = path.join(directory, 'prepare.log');
    if (fs.existsSync(prepareLog)) artifacts.push({ kind: 'prepare-log', path: prepareLog });
    if (exitCode !== 0 && !(exitCode === 1 && report?.result === 'FAIL'))
      failures.push('Runtime did not complete normally; inspect its logs and original report.');
    const result = signal.aborted
      ? 'CANCELLED'
      : timedOut || report?.result === 'TIMEOUT'
        ? 'TIMEOUT'
        : failures.length
          ? 'FAIL'
          : 'COMPLETED';
    const output = {
      ...identity,
      protocol_version: 1,
      ok: result === 'COMPLETED',
      result,
      mode,
      game_review_required: true,
      visual_check_required: capture,
      report,
      artifacts,
      preparation,
      exit_code: exitCode,
      exit_signal: exitSignal,
      warnings,
      error: failures.length ? failures.join('\n') : undefined,
      log_path: path.join(directory, 'runtime.log'),
      invocation_path: invocationPath,
      evidence_directory: directory,
      started_at: started,
      finished_at: new Date().toISOString(),
    };
    return output;
  });
}
