import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createConsoleExecutor } from '../maker/console/executor';
import { executeBuildCommand } from '../maker/cli/build';
import {
  claimConsoleServerLock,
  createConsoleLauncherIdentity,
  ensureCompatibleConsoleLauncher,
  openConsoleLog,
  runConsoleCli,
} from '../maker/console/cli';
import {
  buildWindowsConsoleLaunchScripts,
  selectWindowsConsoleEnvironment,
} from '../maker/console/processLauncher';
import { createMakerRemoteBuildError } from '../maker/server/mcp';

function mutexPort(directory: string): number {
  const filename = path.join(fs.realpathSync(directory), 'server.lock');
  return 49152 + (createHash('sha256').update(filename).digest().readUInt16BE(0) % 16384);
}

describe('Maker console CLI adapters', () => {
  let directory: string;
  beforeEach(async () => {
    // The mutex deliberately fails closed on unrelated high-port listeners.
    // Select a free fixture port without contacting or modifying those peers.
    for (let attempt = 0; ; attempt++) {
      directory = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-console-cli-'));
      const probe = createServer();
      try {
        await new Promise<void>((resolve, reject) => {
          probe.once('error', reject);
          probe.listen({ host: '127.0.0.1', port: mutexPort(directory), exclusive: true }, resolve);
        });
        await new Promise<void>((resolve, reject) =>
          probe.close((error) => (error ? reject(error) : resolve()))
        );
        break;
      } catch (error) {
        fs.rmSync(directory, { recursive: true, force: true });
        if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE' || attempt >= 19) throw error;
      }
    }
    fs.mkdirSync(path.join(directory, '.maker-mcp'));
    fs.writeFileSync(
      path.join(directory, '.maker-mcp/config.json'),
      '{"project_id":"test-project"}'
    );
  });
  afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

  test.each(['created', 'manual_required'])(
    'report sends context through stdin and handles %s without false success',
    async (status) => {
      const fixture = path.join(directory, 'fixture.cjs');
      fs.writeFileSync(
        fixture,
        `
      let input = '';
      process.stdin.on('data', data => input += data);
      process.stdin.on('end', () => {
        const context = JSON.parse(input);
        const args = process.argv.slice(2);
        if (context.source !== 'console' || context.error_message !== 'supervisor timeout' ||
          args.includes('supervisor timeout') || args.slice(0,4).join(' ') !== 'mcp report --context-stdin --consent')
          process.exit(1);
        console.log(JSON.stringify({status:${JSON.stringify(status)},issue_url:'https://github.com/taptap/instant-games-open-mcp/issues/123'}));
      });
    `
      );
      const result = await createConsoleExecutor({ entry: fixture, execArgv: [] })({
        project: directory,
        action: 'issue.report',
        onOutput: () => {},
        reportContext: {
          source: 'console',
          category: 'runtime',
          summary: 'Preview',
          error_message: 'supervisor timeout',
        },
      });
      expect(result.ok).toBe(status === 'created');
      expect(result.status).toBe(status === 'created' ? 'created' : 'unavailable');
      if (status !== 'created') expect(result.issue_url).toBeUndefined();
    }
  );

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

  test('passes QR publishing choices and build consent as literal CLI arguments', async () => {
    const fixture = path.join(directory, 'fixture.cjs');
    fs.writeFileSync(fixture, 'console.log(JSON.stringify({ok:true,args:process.argv.slice(2)}))');
    const result = await createConsoleExecutor({ entry: fixture, execArgv: [] })({
      project: directory,
      action: 'qrcode',
      onOutput: () => {},
      confirmedOrientation: 'portrait',
      publication: { title: '拼豆 $(literal)', category: 'puzzle', developer_id: 123 },
      confirmedBuild: true,
    });
    expect(result.args).toEqual([
      'qrcode',
      '--confirmed-screen-orientation',
      'portrait',
      '--confirmed-developer-id',
      '123',
      '--confirmed-title=拼豆 $(literal)',
      '--confirmed-category',
      'puzzle',
      '--confirmed-build',
      '--target-dir',
      directory,
      '--json',
    ]);
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

  test('enforces supervisor ownership even for a direct server entry', async () => {
    const release = await claimConsoleServerLock(directory);
    await expect(claimConsoleServerLock(directory)).rejects.toThrow();
    release();
    const releaseAgain = await claimConsoleServerLock(directory);
    releaseAgain();
  });

  test('shares a console identity across AI clients for the same Maker version', () => {
    expect(
      createConsoleLauncherIdentity('0.0.34', {
        entry: 'C:\\Codex\\plugins\\maker.js',
        mtimeMs: 1,
      })
    ).toBe(
      createConsoleLauncherIdentity('0.0.34', {
        entry: 'D:\\WorkBuddy\\plugins\\maker.js',
        mtimeMs: 2,
      })
    );
    expect(createConsoleLauncherIdentity('0.0.34')).not.toBe(
      createConsoleLauncherIdentity('0.0.35')
    );
    expect(createConsoleLauncherIdentity('dev', { entry: '/tmp/a/maker.js', mtimeMs: 1 })).not.toBe(
      createConsoleLauncherIdentity('dev', { entry: '/tmp/b/maker.js', mtimeMs: 1 })
    );
    expect(() => ensureCompatibleConsoleLauncher('same', 'same')).not.toThrow();
    expect(() => ensureCompatibleConsoleLauncher('old-version', 'new-version')).toThrow(
      'Another Maker version'
    );
  });

  test('builds a Windows system-broker launch without forwarding credential variables', () => {
    const scripts = buildWindowsConsoleLaunchScripts({
      execPath: 'C:\\Program Files\\nodejs\\node.exe',
      execArgv: ['--no-warnings'],
      entry: 'C:\\Users\\Maker User\\dist\\maker.js',
      cwd: 'C:\\Users\\Maker User\\.taptap-maker\\console',
      logFile: 'C:\\Users\\Maker User\\.taptap-maker\\console\\server.log',
      env: {
        PATH: 'C:\\Windows\\System32',
        TAPTAP_MAKER_HOME: 'C:\\Users\\Maker User\\.taptap-maker',
        TAPTAP_MAKER_PAT_URL: 'https://maker.example/pat',
        TAPTAP_MAKER_TAP_TOKEN_URL: 'https://maker.example/tap-token',
        FRAMECRATE_STUDIO_DIR: "D:\\Maker's Studio",
        TAPTAP_MCP_MAC_TOKEN: 'must-not-leak',
        TAPTAP_MCP_CLIENT_SECRET: 'must-not-leak-either',
      },
    });

    expect(scripts.broker).toContain('Invoke-CimMethod');
    expect(scripts.server).toContain("Maker''s Studio");
    expect(scripts.server).toContain('https://maker.example/pat');
    expect(scripts.server).toContain('https://maker.example/tap-token');
    expect(scripts.server).toContain('__maker-console-server');
    expect(scripts.server).not.toContain('must-not-leak');
    expect(scripts.server).not.toContain('TAPTAP_MCP_MAC_TOKEN');
    expect(scripts.server).not.toContain('TAPTAP_MCP_CLIENT_SECRET');

    const forwarded = selectWindowsConsoleEnvironment({
      PATH: 'C:\\Windows\\System32',
      TAPTAP_MAKER_PAT_URL: 'https://maker.example/pat',
      TAPTAP_MCP_MAC_TOKEN: 'must-not-leak',
      TAPTAP_MCP_CLIENT_SECRET: 'must-not-leak-either',
    });
    expect(forwarded).toMatchObject({
      PATH: 'C:\\Windows\\System32',
      TAPTAP_MAKER_PAT_URL: 'https://maker.example/pat',
    });
    expect(forwarded).not.toHaveProperty('TAPTAP_MCP_MAC_TOKEN');
    expect(forwarded).not.toHaveProperty('TAPTAP_MCP_CLIENT_SECRET');
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

  test('does not reclaim a stale ownership file while another recovery holds its guard', async () => {
    fs.writeFileSync(path.join(directory, 'server.lock'), '2147483647:stale');
    fs.writeFileSync(path.join(directory, 'server.lock.recovery'), 'another-recovery');
    await expect(claimConsoleServerLock(directory)).rejects.toThrow();
    expect(fs.readFileSync(path.join(directory, 'server.lock'), 'utf8')).toBe('2147483647:stale');
  });

  test('new owners cannot bypass an in-progress recovery after the old lock disappears', async () => {
    fs.writeFileSync(path.join(directory, 'server.lock.recovery'), 'recovery');
    await expect(claimConsoleServerLock(directory)).rejects.toThrow();
    expect(fs.existsSync(path.join(directory, 'server.lock'))).toBe(false);
  });

  test('reclaims an abandoned empty recovery guard after its grace period', async () => {
    const recovery = path.join(directory, 'server.lock.recovery');
    fs.writeFileSync(recovery, '');
    const stale = new Date(Date.now() - 10_000);
    fs.utimesSync(recovery, stale, stale);

    const release = await claimConsoleServerLock(directory);
    expect(fs.existsSync(path.join(directory, 'server.lock'))).toBe(true);
    expect(fs.existsSync(recovery)).toBe(false);
    release();
  });

  test('reclaims a recovery guard whose recorded owner is absent', async () => {
    fs.writeFileSync(path.join(directory, 'server.lock.recovery'), '2147483647:abandoned');

    const release = await claimConsoleServerLock(directory);
    expect(fs.existsSync(path.join(directory, 'server.lock.recovery'))).toBe(false);
    release();
  });

  test.each(['2147483647:abandoned', ''])(
    'allows only one concurrent owner when reclaiming guard %j',
    async (content) => {
      const recovery = path.join(directory, 'server.lock.recovery');
      fs.writeFileSync(recovery, content);
      const stale = new Date(Date.now() - 10_000);
      fs.utimesSync(recovery, stale, stale);
      fs.writeFileSync(path.join(directory, 'server.lock'), '2147483647:stale');
      const results = await Promise.allSettled(
        Array.from({ length: 16 }, () => claimConsoleServerLock(directory))
      );
      try {
        expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
        for (const result of results) {
          if (result.status === 'rejected') expect(result.reason.status).toBe(409);
        }
        const owner = fs.readFileSync(path.join(directory, 'server.lock'), 'utf8');
        await expect(claimConsoleServerLock(directory)).rejects.toThrow('already running');
        expect(fs.readFileSync(path.join(directory, 'server.lock'), 'utf8')).toBe(owner);
        expect(fs.existsSync(recovery)).toBe(false);
      } finally {
        for (const result of results) {
          if (result.status === 'fulfilled') result.value();
        }
      }
    }
  );

  test('does not reclaim an aged guard while its live owner is writing its identity', async () => {
    const recovery = path.join(directory, 'server.lock.recovery');
    const write = fs.writeFileSync.bind(fs);
    let competed = false;
    let competing: Promise<unknown> | undefined;
    let competingRelease: (() => void) | undefined;
    const spy = jest.spyOn(fs, 'writeFileSync').mockImplementation((filename, data, options) => {
      if (typeof filename === 'number' && !competed) {
        competed = true;
        const stale = new Date(Date.now() - 10_000);
        fs.utimesSync(recovery, stale, stale);
        competing = claimConsoleServerLock(directory).then(
          (release) => {
            competingRelease = release;
            throw new Error('A competing owner acquired the lock');
          },
          (error) => expect(error.status).toBe(409)
        );
      }
      write(filename, data, options);
    });
    let release: (() => void) | undefined;
    try {
      release = await claimConsoleServerLock(directory);
      await competing;
      expect(competed).toBe(true);
      await expect(claimConsoleServerLock(directory)).rejects.toThrow('already running');
    } finally {
      spy.mockRestore();
      release?.();
      competingRelease?.();
    }
  });

  test.each([`${process.pid}:live`, 'invalid-owner'])(
    'preserves an aged recovery guard with live or unknown ownership: %s',
    async (content) => {
      const recovery = path.join(directory, 'server.lock.recovery');
      fs.writeFileSync(recovery, content);
      const stale = new Date(Date.now() - 10_000);
      fs.utimesSync(recovery, stale, stale);
      await expect(claimConsoleServerLock(directory)).rejects.toThrow('recovery');
      expect(fs.readFileSync(recovery, 'utf8')).toBe(content);
    }
  );

  test('ignores an obsolete disk reclamation gate', async () => {
    const recovery = path.join(directory, 'server.lock.recovery');
    const gate = recovery + '.claim';
    fs.writeFileSync(recovery, '2147483647:abandoned');
    fs.mkdirSync(gate);
    const stale = new Date(Date.now() - 10_000);
    fs.utimesSync(gate, stale, stale);
    const release = await claimConsoleServerLock(directory);
    expect(fs.existsSync(recovery)).toBe(false);
    expect(fs.existsSync(path.join(directory, 'server.lock'))).toBe(true);
    expect(fs.statSync(gate).isDirectory()).toBe(true);
    release();
  });

  test('closes the descriptor and releases the socket when guard publication fails', async () => {
    const recovery = path.join(directory, 'server.lock.recovery');
    const write = fs.writeFileSync.bind(fs);
    let descriptor: number | undefined;
    const spy = jest.spyOn(fs, 'writeFileSync').mockImplementation((filename, data, options) => {
      if (typeof filename === 'number') {
        descriptor = filename;
        throw Object.assign(new Error('guard write failed'), { code: 'EIO' });
      }
      write(filename, data, options);
    });
    try {
      await expect(claimConsoleServerLock(directory)).rejects.toThrow('guard write failed');
      expect(descriptor).toBeDefined();
      expect(() => fs.fstatSync(descriptor!)).toThrow();
      expect(fs.existsSync(recovery)).toBe(false);
      expect(fs.existsSync(recovery + '.claim')).toBe(false);
    } finally {
      spy.mockRestore();
    }
    const release = await claimConsoleServerLock(directory);
    release();
  });

  test('leaves an unrelated listener and lock files untouched when the mutex port is busy', async () => {
    const filename = path.join(fs.realpathSync(directory), 'server.lock');
    const port = mutexPort(directory);
    const peer = createServer((socket) => socket.destroy());
    const connection = jest.fn();
    peer.on('connection', connection);
    await new Promise<void>((resolve, reject) => {
      peer.once('error', reject);
      peer.listen({ host: '127.0.0.1', port, exclusive: true }, resolve);
    });
    fs.writeFileSync(filename, '2147483647:stale');
    fs.writeFileSync(filename + '.recovery', '2147483647:abandoned');
    try {
      await expect(claimConsoleServerLock(directory)).rejects.toMatchObject({ status: 409 });
      expect(peer.listening).toBe(true);
      expect(connection).not.toHaveBeenCalled();
      expect(fs.readFileSync(filename, 'utf8')).toBe('2147483647:stale');
      expect(fs.readFileSync(filename + '.recovery', 'utf8')).toBe('2147483647:abandoned');
    } finally {
      await new Promise<void>((resolve, reject) =>
        peer.close((error) => (error ? reject(error) : resolve()))
      );
    }
    const release = await claimConsoleServerLock(directory);
    release();
  });

  test('recovers after a process is killed while publishing its guard under the socket mutex', async () => {
    const fixture = path.join(directory, 'crash.mts');
    const entry = pathToFileURL(path.resolve(__dirname, '../maker/console/cli.ts')).href;
    fs.writeFileSync(
      fixture,
      [
        "import fs from 'node:fs';",
        `import * as cli from ${JSON.stringify(entry)};`,
        'const { claimConsoleServerLock } = cli.default ?? cli;',
        'const write = fs.writeFileSync.bind(fs);',
        'fs.writeFileSync = (file, ...args) => {',
        '  write(file, ...args);',
        "  if (typeof file === 'number') process.kill(process.pid, 'SIGKILL');",
        '};',
        `await claimConsoleServerLock(${JSON.stringify(directory)});`,
      ].join('\n')
    );
    const child = spawnSync(process.execPath, ['--import', 'tsx', fixture], {
      encoding: 'utf8',
      timeout: 15000,
    });
    expect(child.error).toBeUndefined();
    expect(child.stderr).toBe('');
    expect(child.signal).toBe('SIGKILL');
    const recovery = path.join(directory, 'server.lock.recovery');
    expect(fs.readFileSync(recovery, 'utf8')).toMatch(new RegExp(`^${child.pid}:`));
    const release = await claimConsoleServerLock(directory);
    expect(fs.existsSync(recovery)).toBe(false);
    expect(fs.existsSync(recovery + '.claim')).toBe(false);
    release();
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

  test.each([false, true])('opens token-free URLs with legacy session field=%s', async (legacy) => {
    const oldHome = process.env.TAPTAP_MAKER_HOME;
    process.env.TAPTAP_MAKER_HOME = directory;
    const entry = fs.realpathSync(process.argv[1]);
    const instanceId = '11111111-1111-4111-8111-111111111111';
    fs.mkdirSync(path.join(directory, 'console'));
    fs.writeFileSync(
      path.join(directory, 'console/session.json'),
      JSON.stringify({
        schema: 1,
        origin: 'http://127.0.0.1:54321',
        instanceId,
        launcher: createConsoleLauncherIdentity('dev', {
          entry,
          mtimeMs: fs.statSync(entry).mtimeMs,
        }),
        pid: process.pid,
        ...(legacy ? { token: 'unused-legacy-value' } : {}),
      })
    );
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ instanceId, draining: false }),
    } as Response);
    const output = jest.spyOn(process.stdout, 'write').mockReturnValue(true);
    try {
      await runConsoleCli('open', { no_open: true, json: true });
      expect(JSON.parse(String(output.mock.calls[0][0])).url).toBe('http://127.0.0.1:54321/');
      await runConsoleCli('status', { json: true });
      await runConsoleCli('stop', { json: true });
      expect(fetchMock).toHaveBeenCalledWith(
        'http://127.0.0.1:54321/api/shutdown',
        expect.objectContaining({ method: 'POST' })
      );
      for (const [, init] of fetchMock.mock.calls) {
        expect(init?.headers).not.toHaveProperty('Authorization');
        expect(init?.headers).toHaveProperty('Origin', 'http://127.0.0.1:54321');
      }
    } finally {
      fetchMock.mockRestore();
      output.mockRestore();
      if (oldHome === undefined) delete process.env.TAPTAP_MAKER_HOME;
      else process.env.TAPTAP_MAKER_HOME = oldHome;
    }
  });

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
