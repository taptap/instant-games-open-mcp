import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createConsoleExecutor } from '../maker/console/executor';
import { executeBuildCommand } from '../maker/cli/build';
import { claimConsoleServerLock, openConsoleLog, runConsoleCli } from '../maker/console/cli';
import { createMakerRemoteBuildError } from '../maker/server/mcp';

describe('Maker console CLI adapters', () => {
  let directory: string;
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-console-cli-'));
    fs.mkdirSync(path.join(directory, '.maker-mcp'));
    fs.writeFileSync(
      path.join(directory, '.maker-mcp/config.json'),
      '{"project_id":"test-project"}'
    );
  });
  afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

  test('executes only the exact CLI action with an explicit target directory', async () => {
    const fixture = path.join(directory, 'fixture.cjs');
    fs.writeFileSync(fixture, 'console.log(JSON.stringify({ok:true,args:process.argv.slice(2)}))');
    const execute = createConsoleExecutor({ entry: fixture, execArgv: [] });
    const result = await execute({
      project: directory,
      action: 'preview.status',
      onOutput: () => {},
    });
    expect(result.args).toEqual(['preview', 'status', '--target-dir', directory, '--json']);
    await expect(
      execute({ project: directory, action: 'shell' as 'build', onOutput: () => {} })
    ).rejects.toThrow();
  });

  test('reports unsuccessful JSON as failed even if a child exits zero', async () => {
    const fixture = path.join(directory, 'fixture.cjs');
    fs.writeFileSync(
      fixture,
      'console.log(JSON.stringify({ok:false,error:"unsupported platform"}))'
    );
    const result = await createConsoleExecutor({ entry: fixture, execArgv: [] })({
      project: directory,
      action: 'preview.start',
      onOutput: () => {},
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('unsupported platform');
  });

  test('unknown child results never imply successful build', async () => {
    const fixture = path.join(directory, 'fixture.cjs');
    fs.writeFileSync(fixture, 'console.log("unexpected output")');
    const result = await createConsoleExecutor({ entry: fixture, execArgv: [] })({
      project: directory,
      action: 'build',
      onOutput: () => {},
    });
    expect(result.ok).toBe(false);
    expect(result.unknown).toBe(true);
  });

  test('does not launch a read command whose signal is already aborted', async () => {
    const fixture = path.join(directory, 'fixture.cjs');
    const marker = path.join(directory, 'launched');
    fs.writeFileSync(fixture, `require('fs').writeFileSync(${JSON.stringify(marker)},'yes')`);
    const controller = new AbortController();
    controller.abort();
    const result = await createConsoleExecutor({ entry: fixture, execArgv: [] })({
      project: directory,
      action: 'preview.status',
      onOutput: () => {},
      signal: controller.signal,
    });
    expect(result.ok).toBe(false);
    expect(fs.existsSync(marker)).toBe(false);
  });

  test('aborts a stuck child with bounded escalation and releases abort listeners', async () => {
    const fixture = path.join(directory, 'fixture.cjs');
    fs.writeFileSync(
      fixture,
      'process.on("SIGTERM",()=>{}); process.stderr.write("ready\\n"); setInterval(()=>{},1000);'
    );
    const controller = new AbortController();
    const remove = jest.spyOn(controller.signal, 'removeEventListener');
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
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  test('streams complete progress lines before completion and redacts credentials', async () => {
    const fixture = path.join(directory, 'fixture.cjs');
    fs.writeFileSync(
      fixture,
      [
        'process.stderr.write(\'{"phase":"prepare"}\\n\');',
        'setTimeout(()=>{process.stderr.write("Authorization: Bearer abcdefghijklmnop\\n"); console.log(\'{"ok":true}\')},300);',
      ].join('\n')
    );
    let finished = false;
    const chunks: string[] = [];
    let progressBeforeFinish = false;
    const result = await createConsoleExecutor({ entry: fixture, execArgv: [] })({
      project: directory,
      action: 'build',
      onOutput: (text) => {
        chunks.push(text);
        if (!finished && text.includes('prepare') && !text.includes('Authorization'))
          progressBeforeFinish = true;
      },
    }).then((value) => {
      finished = true;
      return value;
    });
    expect(result.ok).toBe(true);
    expect(progressBeforeFinish).toBe(true);
    expect(chunks.join('')).not.toContain('abcdefghijklmnop');
  });

  test('decodes split build progress without mistaking logs for progress', async () => {
    const fixture = path.join(directory, 'fixture.cjs');
    fs.writeFileSync(
      fixture,
      [
        'process.stderr.write(\'{"phase":"sync","progress":8,\');',
        'setTimeout(()=>{process.stderr.write(\'"total":100,"message":"Syncing"}\\nordinary log\\n\');console.log(\'{"ok":true}\')},50);',
      ].join('\n')
    );
    const onProgress = jest.fn();
    await createConsoleExecutor({ entry: fixture, execArgv: [] })({
      project: directory,
      action: 'build',
      onOutput: () => {},
      onProgress,
    });
    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalledWith({
      phase: 'sync',
      progress: 8,
      total: 100,
      message: 'Syncing',
    });
  });

  test('build delegates directly, retains project target, and maps the outcome', async () => {
    const build = jest.fn(async () => ({ mode: 'remote_build' }));
    const result = await executeBuildCommand(directory, {
      build: build as never,
      access: async () => ({ blocked: false }),
      format: () => 'done',
    });
    expect(build).toHaveBeenCalledWith(
      expect.objectContaining({ targetDir: fs.realpathSync(directory) })
    );
    expect(result.ok).toBe(true);
  });

  test('does not build when access is explicitly restricted', async () => {
    const build = jest.fn();
    const result = await executeBuildCommand(directory, {
      build,
      access: async () => ({ blocked: true, message: 'restricted' }),
      format: () => '',
    });
    expect(result.ok).toBe(false);
    expect(build).not.toHaveBeenCalled();
  });

  test('enforces supervisor ownership even for a direct server entry', () => {
    const release = claimConsoleServerLock(directory);
    expect(() => claimConsoleServerLock(directory)).toThrow();
    release();
    const releaseAgain = claimConsoleServerLock(directory);
    releaseAgain();
  });

  test('bounds retained supervisor logs across restarts', () => {
    const file = path.join(directory, 'server.log');
    const old = fs.openSync(file, 'w');
    fs.ftruncateSync(old, 2 * 1024 * 1024);
    fs.closeSync(old);
    const current = openConsoleLog(file);
    try {
      expect(fs.statSync(file).size).toBe(0);
    } finally {
      fs.closeSync(current);
    }
  });

  test('retains uncertainty when transport fails after submission', async () => {
    const result = await executeBuildCommand(directory, {
      build: (async () => ({
        mode: 'build_failed_after_submit',
        buildFailure: { message: 'connection reset' },
      })) as never,
      access: async () => ({ blocked: false }),
      format: () => 'connection reset',
    });
    expect(result.ok).toBe(false);
    expect(result.unknown).toBe(true);
  });

  test('does not reclaim a stale ownership file while another recovery holds its guard', () => {
    fs.writeFileSync(path.join(directory, 'server.lock'), '2147483647:stale');
    fs.writeFileSync(path.join(directory, 'server.lock.recovery'), 'another-recovery');
    expect(() => claimConsoleServerLock(directory)).toThrow();
    expect(fs.readFileSync(path.join(directory, 'server.lock'), 'utf8')).toBe('2147483647:stale');
  });

  test('new owners cannot bypass an in-progress recovery after the old lock disappears', () => {
    fs.writeFileSync(path.join(directory, 'server.lock.recovery'), 'recovery');
    expect(() => claimConsoleServerLock(directory)).toThrow();
    expect(fs.existsSync(path.join(directory, 'server.lock'))).toBe(false);
  });

  test.each([
    [true, false],
    [false, false],
    [false, true],
  ])(
    'checks latest draining ownership: initially=%s replaced=%s',
    async (initiallyDraining, replaced) => {
      const oldHome = process.env.TAPTAP_MAKER_HOME;
      process.env.TAPTAP_MAKER_HOME = directory;
      fs.mkdirSync(path.join(directory, 'console'));
      fs.writeFileSync(
        path.join(directory, 'console/session.json'),
        JSON.stringify({
          schema: 1,
          origin: 'http://127.0.0.1:54321',
          token: 'a'.repeat(64),
          instanceId: '11111111-1111-4111-8111-111111111111',
          launcher: 'test',
          pid: process.pid,
          draining: initiallyDraining,
        })
      );
      const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async () => {
        const file = path.join(directory, 'console/session.json');
        const record = JSON.parse(fs.readFileSync(file, 'utf8'));
        fs.writeFileSync(
          file,
          JSON.stringify({
            ...record,
            draining: true,
            ...(replaced ? { instanceId: '22222222-2222-4222-8222-222222222222' } : {}),
          })
        );
        throw new TypeError('fetch failed');
      });
      const output = jest.spyOn(process.stdout, 'write').mockReturnValue(true);
      try {
        if (replaced) {
          await expect(runConsoleCli('status', { json: true })).rejects.toThrow('fetch failed');
          expect(output).not.toHaveBeenCalled();
        } else {
          await runConsoleCli('status', { json: true });
          expect(JSON.parse(String(output.mock.calls[0][0]))).toMatchObject({
            running: true,
            draining: true,
          });
        }
      } finally {
        fetchMock.mockRestore();
        output.mockRestore();
        if (oldHome === undefined) delete process.env.TAPTAP_MAKER_HOME;
        else process.env.TAPTAP_MAKER_HOME = oldHome;
      }
    }
  );

  test('keeps a received remote compilation failure distinct from a lost result', async () => {
    const error = createMakerRemoteBuildError({
      isError: true,
      content: [{ type: 'text', text: 'compile failed' }],
    });
    expect(error.remote_result).toMatchObject({ isError: true });
    const result = await executeBuildCommand(directory, {
      build: (async () => ({
        mode: 'build_failed_after_submit',
        buildFailure: {
          name: error.name,
          message: error.message,
          remote_result: error.remote_result,
        },
      })) as never,
      access: async () => ({ blocked: false }),
      format: () => 'compile failed',
    });
    expect(result.ok).toBe(false);
    expect(result.unknown).toBe(false);
  });
});
