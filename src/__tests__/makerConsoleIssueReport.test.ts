import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildMakerMcpIssue, parseMakerMcpReportContext } from '../maker/cli/mcpIssueReport';
import { consoleReportOffer, consoleReportContext } from '../maker/console/issueReport';
import { previewDirectory } from '../maker/preview/protocol';
import type { ConsoleTask } from '../maker/console/types';

describe('console issue reports', () => {
  let root: string;
  let oldHome: string | undefined;
  const task = (overrides: Partial<ConsoleTask> = {}): ConsoleTask => ({
    id: 'test-task',
    projectKey: 'project-key',
    projectPath: root,
    projectName: 'Test',
    action: 'preview.start',
    status: 'failed',
    startedAt: new Date().toISOString(),
    output: '',
    error: 'TIMEOUT: preview supervisor did not open its control channel',
    ...overrides,
  });
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'console-report-'));
    oldHome = process.env.TAPTAP_MAKER_HOME;
    process.env.TAPTAP_MAKER_HOME = path.join(root, 'home');
  });
  afterEach(() => {
    if (oldHome === undefined) delete process.env.TAPTAP_MAKER_HOME;
    else process.env.TAPTAP_MAKER_HOME = oldHome;
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('offers categorized feedback for infrastructure failures, not project mistakes', () => {
    expect(consoleReportOffer(task())?.category).toBe('runtime');
    expect(consoleReportOffer(task({ status: 'unknown' }))?.category).toBe('runtime');
    expect(
      consoleReportOffer(task({ action: 'build', error: 'HTTP 503 unavailable' }))?.category
    ).toBe('build');
    for (const overrides of [
      { status: 'running' },
      { status: 'succeeded' },
      { error: '找不到本地预览入口 scripts/main.lua，请先创建入口脚本或检查项目配置。' },
      { error: 'Runtime is missing. run preview install' },
      { error: 'PAT expired; run taptap-maker login' },
      { action: 'lua-lsp.check', error: 'Lua syntax error' },
      { action: 'build', error: 'Please commit your changes or stash them before you merge.' },
    ])
      expect(consoleReportOffer(task(overrides as Partial<ConsoleTask>))).toBeUndefined();
    expect(consoleReportOffer(task({ id: 'other' }))?.fingerprint).toBe(
      consoleReportOffer(task())?.fingerprint
    );
  });

  test('reads bounded supervisor evidence even without a live runtime and does not trust error paths', () => {
    const directory = previewDirectory(root);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(
      path.join(directory, 'supervisor.log'),
      'x'.repeat(20000) + '\nstartup failed'
    );
    const context = consoleReportContext(task(), root);
    expect(JSON.stringify(context)).toContain('startup failed');
    expect(JSON.stringify(context).length).toBeLessThan(24000);
    fs.unlinkSync(path.join(directory, 'supervisor.log'));
    const outside = path.join(root, 'secret.txt');
    fs.writeFileSync(outside, 'must-not-read');
    fs.symlinkSync(outside, path.join(directory, 'supervisor.log'));
    expect(
      JSON.stringify(consoleReportContext(task({ error: 'Inspect ' + outside }), root))
    ).not.toContain('must-not-read');
  });

  test('does not attach the current preview round to an older failed task', () => {
    const directory = previewDirectory(root);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'supervisor.log'), 'current supervisor output');
    fs.writeFileSync(
      path.join(directory, 'session.json'),
      JSON.stringify({
        protocol_version: 1,
        project_realpath: root,
        session_id: '11111111-1111-4111-8111-111111111111',
        reload_id: 2,
        token: 'a'.repeat(64),
        supervisor_id: 'supervisor',
        supervisor_pid: 123,
        started_at: new Date().toISOString(),
        port: 1234,
        executable: '/tmp/UrhoXRuntime',
        state: 'failed',
        runtime: {
          protocol_version: 1,
          runtime_version: 'test',
          platform: process.platform,
          arch: process.arch,
          capabilities: [],
        },
      })
    );
    const context = consoleReportContext(
      task({
        result: {
          session_id: '22222222-2222-4222-8222-222222222222',
          reload_id: 1,
        },
      }),
      root
    );
    expect(context.error_data).toMatchObject({
      logs: {},
      preview: { status: 'unavailable' },
    });
  });

  test('shared report formatting keeps category and redacts console evidence', () => {
    const context = parseMakerMcpReportContext(
      JSON.stringify({
        ...consoleReportContext(task(), root),
        error_data: { log: 'Authorization: Bearer secret-value\n' + root + '/log.txt' },
      })
    );
    const issue = buildMakerMcpIssue({
      context,
      homeDir: root,
      diagnostics: {
        occurred_at: 'now',
        os_arch: 'win32 x64',
        node_version: 'v22',
        maker_package_version: '0.0.34-beta.5',
        process_cwd: root,
        target_dir: root,
        project_context: {},
        client_config: {},
        mcp_verify: {},
      },
    });
    expect(issue.title).toMatch(/^\[UrhoX Runtime\]/);
    expect(issue.body).toContain('console');
    expect(issue.body).not.toContain('secret-value');
    expect(issue.body).not.toContain(root);
    expect(
      parseMakerMcpReportContext('{"category":"bogus","error_message":"EIO"}').category
    ).toBeUndefined();
  });
});
