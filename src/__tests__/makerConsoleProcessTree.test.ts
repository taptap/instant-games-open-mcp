import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { createConsoleExecutor } from '../maker/console/executor';

type FixtureProcesses = { cli: number; helper: number; independent: number };

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false;
    throw error;
  }
}

function stopFixture(pid: number): void {
  try {
    process.kill(pid, 'SIGKILL');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
  }
}

async function until(check: () => boolean, timeout = 3000): Promise<void> {
  const deadline = Date.now() + timeout;
  while (!check()) {
    if (Date.now() >= deadline) throw new Error('Timed out waiting for fixture process state.');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe('Maker console owned process cleanup', () => {
  let directory: string;
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-console-process-tree-'));
  });
  afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

  const posixTest = process.platform === 'win32' ? test.skip : test;

  posixTest.each([false, true])(
    'startup IPC loss obeys captured group ownership: %s',
    async (ownsGroup) => {
      const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
      const fixture = path.join(directory, 'must-not-run.cjs');
      const preload = path.join(directory, 'disconnect.cjs');
      const signalLog = path.join(directory, 'signals.json');
      const marker = path.join(directory, 'entry-ran');
      fs.writeFileSync(
        fixture,
        `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran');`
      );
      fs.writeFileSync(
        preload,
        `
      process.kill = (pid, signal) => {
        require('node:fs').writeFileSync(${JSON.stringify(signalLog)}, JSON.stringify({
          pid, signal, ownGroup: -process.pid
        }));
        return true;
      };
      process.disconnect();
    `
      );
      try {
        if (!ownsGroup) Object.defineProperty(process, 'platform', { ...platform, value: 'win32' });
        const result = await createConsoleExecutor({
          entry: fixture,
          execArgv: ['--require', preload],
        })({ project: directory, action: 'preview.status', onOutput: () => {} });
        expect(result.ok).toBe(false);
        expect(fs.existsSync(marker)).toBe(false);
        if (ownsGroup) {
          const signal = JSON.parse(fs.readFileSync(signalLog, 'utf8'));
          expect(signal).toMatchObject({ pid: signal.ownGroup, signal: 'SIGKILL' });
        } else {
          expect(fs.existsSync(signalLog)).toBe(false);
        }
      } finally {
        Object.defineProperty(process, 'platform', platform);
      }
    }
  );

  test.each(['cjs', 'mjs'])(
    'preserves %s entry arguments and execArgv with an unref IPC guard',
    async (extension) => {
      const fixture = path.join(directory, `entry.${extension}`);
      fs.writeFileSync(
        fixture,
        `
      console.log(JSON.stringify({
        ok: true, argv: process.argv.slice(1), execArgv: process.execArgv,
        connected: process.connected === true
      }));
    `
      );
      const result = await createConsoleExecutor({ entry: fixture, execArgv: ['--no-warnings'] })({
        project: directory,
        action: 'preview.status',
        onOutput: () => {},
      });
      expect(result).toMatchObject({
        ok: true,
        argv: [fixture, 'preview', 'status', '--target-dir', directory, '--json'],
        execArgv: ['--no-warnings'],
        connected: true,
      });
    }
  );

  posixTest(
    'bundled executor parent SIGKILL reaps CLI and helper without killing detached reentry',
    async () => {
      const bundle = path.join(directory, 'executor.cjs');
      execFileSync(
        process.execPath,
        [
          '-e',
          'require("esbuild").buildSync({entryPoints:[process.argv[1]],outfile:process.argv[2],bundle:true,platform:"node",format:"cjs"});',
          path.resolve(__dirname, '../maker/console/executor.ts'),
          bundle,
        ],
        { cwd: path.resolve(__dirname, '../..'), timeout: 10000 }
      );
      const fixture = path.join(directory, 'cli.cjs');
      const parentFixture = path.join(directory, 'parent.cjs');
      const pidsFile = path.join(directory, 'pids.json');
      const ready = path.join(directory, 'parent-ready');
      const helperReady = path.join(directory, 'helper-ready');
      const independentReady = path.join(directory, 'independent-ready');
      fs.writeFileSync(
        fixture,
        `
      const fs = require('node:fs');
      const { spawn } = require('node:child_process');
      if (process.argv[2] === '__independent') {
        fs.writeFileSync(${JSON.stringify(independentReady)}, JSON.stringify({
          pid: process.pid, connected: process.connected === true, execArgv: process.execArgv
        }));
        setInterval(() => {}, 1000);
      } else {
        const helper = spawn(process.execPath, ['-e', ${JSON.stringify(`
          process.on('SIGTERM', () => {});
          require('node:fs').writeFileSync(${JSON.stringify(helperReady)}, String(process.pid));
          setInterval(() => {}, 1000);
        `)}], { stdio: 'ignore' });
        const independent = spawn(process.execPath, [
          ...process.execArgv, process.argv[1], '__independent'
        ], { detached: true, stdio: 'ignore' });
        independent.unref();
        fs.writeFileSync(${JSON.stringify(pidsFile)}, JSON.stringify({
          cli: process.pid, helper: helper.pid, independent: independent.pid
        }));
        const timer = setInterval(() => {
          if (fs.existsSync(${JSON.stringify(helperReady)}) &&
              fs.existsSync(${JSON.stringify(independentReady)})) {
            clearInterval(timer);
            process.stderr.write('ready\\n');
          }
        }, 10);
        setInterval(() => {}, 1000);
      }
    `
      );
      fs.writeFileSync(
        parentFixture,
        `
      const { createConsoleExecutor } = require(${JSON.stringify(bundle)});
      createConsoleExecutor({entry:${JSON.stringify(fixture)},execArgv:[]})({
        project:${JSON.stringify(directory)},action:'preview.status',
        onOutput: text => {
          if (text.includes('ready'))
            require('node:fs').writeFileSync(${JSON.stringify(ready)}, 'ready');
        }
      });
    `
      );
      const parent = spawn(process.execPath, [parentFixture], { stdio: 'ignore' });
      const closed = new Promise<void>((resolve, reject) => {
        parent.once('error', reject);
        parent.once('close', () => resolve());
      });
      let processes: FixtureProcesses | undefined;
      try {
        await until(() => fs.existsSync(ready), 5000);
        processes = JSON.parse(fs.readFileSync(pidsFile, 'utf8'));
        expect(JSON.parse(fs.readFileSync(independentReady, 'utf8'))).toMatchObject({
          pid: processes!.independent,
          connected: false,
          execArgv: [],
        });
        expect(alive(processes!.cli)).toBe(true);
        expect(alive(processes!.helper)).toBe(true);
        parent.kill('SIGKILL');
        await closed;
        await until(() => !alive(processes!.cli) && !alive(processes!.helper), 1500);
        expect(alive(processes!.independent)).toBe(true);
      } finally {
        if (parent.exitCode === null && parent.signalCode === null) parent.kill('SIGKILL');
        await closed;
        if (!processes && fs.existsSync(pidsFile))
          processes = JSON.parse(fs.readFileSync(pidsFile, 'utf8'));
        for (const pid of Object.values(processes || {})) stopFixture(pid);
        if (processes) await until(() => Object.values(processes!).every((pid) => !alive(pid)));
      }
    },
    15000
  );

  posixTest.each([
    {
      name: 'CLI exits on TERM and helper has no inherited pipes',
      stubborn: false,
      timeout: false,
    },
    { name: 'CLI and helper require KILL escalation', stubborn: true, timeout: false },
    { name: 'timeout uses the same owned process cleanup', stubborn: true, timeout: true },
    {
      name: 'external SIGKILL with inherited helper pipes resolves promptly',
      stubborn: true,
      timeout: false,
      externalKill: true,
    },
    {
      name: 'successful CLI exit with inherited helper pipes resolves promptly',
      stubborn: true,
      timeout: false,
      exitCode: 0,
    },
    {
      name: 'successful CLI completion reaps unref helpers',
      stubborn: false,
      timeout: false,
      exitCode: 0,
    },
    {
      name: 'unsuccessful CLI completion reaps unref helpers',
      stubborn: false,
      timeout: false,
      exitCode: 2,
    },
  ])(
    '$name: helper stops but an independent detached process survives',
    async ({ stubborn, timeout, exitCode, externalKill }) => {
      const fixture = path.join(directory, 'cli.cjs');
      const pidsFile = path.join(directory, 'pids.json');
      const helperReady = path.join(directory, 'helper-ready');
      const independentReady = path.join(directory, 'independent-ready');
      const sleeper = (ready: string) => `
      process.on('SIGTERM', () => {});
      require('node:fs').writeFileSync(${JSON.stringify(ready)}, String(process.pid));
      setInterval(() => {}, 1000);
    `;
      fs.writeFileSync(
        fixture,
        `
      const fs = require('node:fs');
      const { spawn } = require('node:child_process');
      ${stubborn ? "process.on('SIGTERM', () => {});" : ''}
      const helper = spawn(process.execPath, ['-e', ${JSON.stringify(sleeper(helperReady))}], {
        stdio: ${stubborn ? "['ignore', 'inherit', 'inherit']" : "'ignore'"}
      });
      ${exitCode !== undefined ? 'helper.unref();' : ''}
      const independent = spawn(process.execPath, ['-e', ${JSON.stringify(sleeper(independentReady))}], {
        detached: true, stdio: 'ignore'
      });
      independent.unref();
      fs.writeFileSync(${JSON.stringify(pidsFile)}, JSON.stringify({
        cli: process.pid, helper: helper.pid, independent: independent.pid
      }));
      const ready = setInterval(() => {
        if (fs.existsSync(${JSON.stringify(helperReady)}) &&
            fs.existsSync(${JSON.stringify(independentReady)})) {
          clearInterval(ready);
          process.stderr.write('ready\\n');
          ${
            exitCode !== undefined
              ? `
            console.log(JSON.stringify({
              ok: ${exitCode === 0},
              ${exitCode !== 0 ? 'error: "fixture command failed"' : ''}
            }));
            process.exitCode = ${exitCode};
          `
              : ''
          }
        }
      }, 10);
      ${exitCode === undefined ? 'setInterval(() => {}, 1000);' : ''}
    `
      );
      const controller = new AbortController();
      let expire: (() => void) | undefined;
      const schedule = global.setTimeout;
      const timer = jest
        .spyOn(global, 'setTimeout')
        .mockImplementation((callback, delay, ...args) => {
          // Run the real timeout handler after fixture readiness, without a 30-second test delay.
          if (delay === 30000) expire = () => callback(...args);
          return schedule(callback, delay, ...args);
        });
      let processes: FixtureProcesses | undefined;
      let execution: ReturnType<ReturnType<typeof createConsoleExecutor>> | undefined;
      try {
        execution = createConsoleExecutor({
          entry: fixture,
          execArgv: [],
          killGraceMs: 60,
        })({
          project: directory,
          action: 'preview.status',
          signal: controller.signal,
          onOutput: (text) => {
            if (!text.includes('ready')) return;
            processes = JSON.parse(fs.readFileSync(pidsFile, 'utf8'));
            if (externalKill) {
              stopFixture(processes!.cli);
              return;
            }
            if (exitCode !== undefined) return;
            if (timeout) expire!();
            else controller.abort();
          },
        });
        if (externalKill || exitCode !== undefined) {
          let settled = false;
          void execution.then(() => {
            settled = true;
          });
          await until(() => settled, 1500);
          expect(controller.signal.aborted).toBe(false);
        }
        const result = await execution;
        expect(processes).toBeDefined();
        if (exitCode === undefined) {
          expect(result).toMatchObject({ ok: false, unknown: true });
        } else {
          expect(result.ok).toBe(exitCode === 0);
          expect(result.unknown).toBeUndefined();
          if (exitCode !== 0) expect(result.error).toBe('fixture command failed');
        }
        if (timeout) expect(result.error).toContain('CLI timed out');
        await until(() => !alive(processes!.helper));
        await until(() => !alive(processes!.cli));
        expect(alive(processes!.independent)).toBe(true);
      } finally {
        timer.mockRestore();
        controller.abort();
        if (!processes && fs.existsSync(pidsFile))
          processes = JSON.parse(fs.readFileSync(pidsFile, 'utf8'));
        for (const pid of Object.values(processes || {})) {
          stopFixture(pid);
        }
        if (execution) await execution;
        if (processes) await until(() => Object.values(processes!).every((pid) => !alive(pid)));
      }
    },
    15000
  );

  posixTest('does not report verified success when final group cleanup fails', async () => {
    const fixture = path.join(directory, 'cleanup-error.cjs');
    fs.writeFileSync(fixture, 'console.log(JSON.stringify({ok:true}));');
    const originalKill = process.kill;
    const kill = jest.spyOn(process, 'kill').mockImplementation((pid, signal) => {
      if (pid < 0) throw Object.assign(new Error('group cleanup denied'), { code: 'EPERM' });
      return originalKill(pid, signal);
    });
    try {
      const result = await createConsoleExecutor({ entry: fixture, execArgv: [] })({
        project: directory,
        action: 'preview.status',
        onOutput: () => {},
      });
      expect(result).toMatchObject({ ok: false, unknown: true });
      expect(result.error).toContain('process-group cleanup could not be verified');
    } finally {
      kill.mockRestore();
    }
  });

  test('Windows cancellation explicitly reports direct-child-only cleanup', async () => {
    const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
    const fixture = path.join(directory, 'windows-policy.cjs');
    fs.writeFileSync(
      fixture,
      `
      process.stderr.write('ready\\n');
      setInterval(() => {}, 1000);
    `
    );
    const controller = new AbortController();
    try {
      Object.defineProperty(process, 'platform', { ...platform, value: 'win32' });
      const result = await createConsoleExecutor({
        entry: fixture,
        execArgv: [],
        killGraceMs: 30,
      })({
        project: directory,
        action: 'preview.status',
        signal: controller.signal,
        onOutput: () => controller.abort(),
      });
      expect(result).toMatchObject({ ok: false, unknown: true });
      expect(result.error).toMatch(/Windows.*helper.*unverified/);
    } finally {
      controller.abort();
      Object.defineProperty(process, 'platform', platform);
    }
  });
});
