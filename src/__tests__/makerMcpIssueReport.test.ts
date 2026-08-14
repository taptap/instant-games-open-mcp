/**
 * Maker MCP issue reporting tests.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildMakerMcpIssue,
  collectMakerMcpIssueDiagnostics,
  extractMakerMcpServerConfig,
  inspectMakerMcpClientConfig,
  parseMakerMcpReportContext,
  submitMakerMcpIssue,
} from '../maker/cli/mcpIssueReport';

describe('Maker MCP issue report', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-mcp-report-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('accepts structured AI session context and plain error text', () => {
    expect(
      parseMakerMcpReportContext(
        JSON.stringify({
          summary: 'Proxy tool timed out',
          error_message: 'Request timed out after 60000ms',
          workspace_roots: ['C:\\Users\\alice\\MakerGame\\demo'],
        })
      )
    ).toEqual({
      summary: 'Proxy tool timed out',
      error_message: 'Request timed out after 60000ms',
      workspace_roots: ['C:\\Users\\alice\\MakerGame\\demo'],
    });

    expect(parseMakerMcpReportContext('MCP error -32000: Connection closed')).toEqual({
      summary: 'Maker MCP problem report',
      error_message: 'MCP error -32000: Connection closed',
    });
  });

  test('drops unknown AI context fields instead of trusting the caller privacy boundary', () => {
    const context = parseMakerMcpReportContext(
      JSON.stringify({
        summary: 'Proxy timeout',
        error_message: 'timed out',
        complete_conversation: 'private chat transcript',
        project_source: 'private source code',
        environment: { DATABASE_PASSWORD: 'secret' },
      })
    );

    expect(context).toEqual({
      summary: 'Proxy timeout',
      error_message: 'timed out',
    });
  });

  test('extracts only the Maker server entry and never exposes environment values', () => {
    const extracted = extractMakerMcpServerConfig(
      {
        mcpServers: {
          'taptap-maker': {
            command: 'C:\\Users\\alice\\node.exe',
            args: ['C:\\Users\\alice\\npm-cli.js', 'exec', '@taptap/maker'],
            cwd: 'D:\\Maker Games\\demo',
            env: {
              TAPTAP_MCP_CLIENT_IDE: 'workbuddy',
              TAPTAP_MCP_PAT: 'secret-pat',
            },
            disabled: false,
          },
          private_database: {
            command: 'database-mcp',
            env: { DATABASE_PASSWORD: 'do-not-upload' },
          },
        },
      },
      'taptap-maker'
    );

    expect(extracted).toEqual({
      command: 'C:\\Users\\alice\\node.exe',
      args: ['C:\\Users\\alice\\npm-cli.js', 'exec', '@taptap/maker'],
      cwd: 'D:\\Maker Games\\demo',
      disabled: false,
      env_keys: ['TAPTAP_MCP_CLIENT_IDE', 'TAPTAP_MCP_PAT'],
      client_ide: 'workbuddy',
    });
    expect(JSON.stringify(extracted)).not.toContain('secret-pat');
    expect(JSON.stringify(extracted)).not.toContain('private_database');
    expect(JSON.stringify(extracted)).not.toContain('do-not-upload');
  });

  test('redacts legacy argv secrets, credential URLs, and GitHub tokens', () => {
    const extracted = extractMakerMcpServerConfig(
      {
        mcpServers: {
          'taptap-maker': {
            command: 'node',
            args: [
              'maker.js',
              '--pat',
              'legacy-pat-value',
              '--token=inline-token-value',
              '--database-password',
              'database-password-value',
              '--session-cookie=session-cookie-value',
              '--request-signature',
              'request-signature-value',
            ],
          },
        },
      },
      'taptap-maker'
    );
    const issue = buildMakerMcpIssue({
      context: {
        summary: 'Connection failure',
        error_message: [
          'Failed https://alice:password@example.com',
          'github_pat_abcdefghijklmnopqrstuvwxyz123456',
          '--pat spaced-pat-value',
          '--database-password "spaced-database-password-value"',
          '--token comma-token-value,continued-token-value',
          "--token apostrophe-token-value'continued-apostrophe-value",
          'password=plain-password-value',
          'token=ampersand-token-value&continued-token-value',
          'token=quote-token-value"continued-quote-value',
          'token=compound-token-value&X-Amz-Signature=compound-signature-value&error=timeout',
          'access_token=query-token-value&error=timeout',
          'TAPTAP_MCP_PAT=environment-pat-value',
        ].join(' '),
        error_data: {
          database_password: 'structured-database-password',
          'proxy-password': 'structured-proxy-password',
          session_cookie: 'structured-session-cookie',
          request_signature: 'structured-request-signature',
        },
      },
      diagnostics: {
        occurred_at: '2026-08-14T12:00:00+08:00',
        os_arch: 'win32 x64',
        node_version: 'v22.22.2',
        maker_package_version: '0.0.30-beta.1',
        process_cwd: 'C:\\Users\\alice\\dialogues',
        target_dir: 'C:\\Users\\alice\\MakerGame\\demo',
        project_context: { status: 'bound' },
        client_config: { status: 'found', server: extracted },
        mcp_verify: { ok: false },
      },
      homeDir: 'C:\\Users\\alice',
    });

    expect(extracted?.args).toEqual([
      'maker.js',
      '--pat',
      '<redacted>',
      '--token=<redacted>',
      '--database-password',
      '<redacted>',
      '--session-cookie=<redacted>',
      '--request-signature',
      '<redacted>',
    ]);
    expect(issue.body).not.toContain('legacy-pat-value');
    expect(issue.body).not.toContain('inline-token-value');
    expect(issue.body).not.toContain('alice:password');
    expect(issue.body).not.toContain('github_pat_abcdefghijklmnopqrstuvwxyz123456');
    expect(issue.body).not.toContain('spaced-pat-value');
    expect(issue.body).not.toContain('spaced-database-password-value');
    expect(issue.body).not.toContain('comma-token-value');
    expect(issue.body).not.toContain('continued-token-value');
    expect(issue.body).not.toContain('apostrophe-token-value');
    expect(issue.body).not.toContain('continued-apostrophe-value');
    expect(issue.body).not.toContain('plain-password-value');
    expect(issue.body).not.toContain('ampersand-token-value');
    expect(issue.body).not.toContain('quote-token-value');
    expect(issue.body).not.toContain('continued-quote-value');
    expect(issue.body).not.toContain('compound-token-value');
    expect(issue.body).not.toContain('compound-signature-value');
    expect(issue.body).not.toContain('query-token-value');
    expect(issue.body).toContain('error=timeout');
    expect(issue.body).not.toContain('environment-pat-value');
    expect(issue.body).not.toContain('structured-database-password');
    expect(issue.body).not.toContain('structured-proxy-password');
    expect(issue.body).not.toContain('structured-session-cookie');
    expect(issue.body).not.toContain('structured-request-signature');
  });

  test('builds a public-safe issue body with normalized home paths and redacted credentials', () => {
    const issue = buildMakerMcpIssue({
      context: {
        summary: 'generate_image timed out',
        error_message:
          'Request failed in C:\\Users\\alice\\MakerGame\\demo with token=abc123secretvalue',
        failed_operation: 'generate_image',
        error_data: {
          authorization: 'Bearer abcdefghijklmnopqrstuvwxyz',
          password: 'private-password',
          nested: { status: 504 },
        },
        workspace_roots: ['C:\\Users\\alice\\MakerGame\\demo'],
        reproduction_steps: ['Open project', 'Call generate_image'],
      },
      diagnostics: {
        occurred_at: '2026-08-14T12:00:00+08:00',
        client: 'workbuddy',
        os_arch: 'win32 x64',
        node_version: 'v22.22.2',
        maker_package_version: '0.0.30-beta.1',
        process_cwd: 'C:\\Users\\alice\\AppData\\Local\\WorkBuddy\\dialogues\\123',
        target_dir: 'C:\\Users\\alice\\MakerGame\\demo',
        project_context: { status: 'bound', source: 'target_dir' },
        client_config: {
          path: 'C:\\Users\\alice\\.workbuddy\\mcp.json',
          status: 'found',
          server: {
            command: 'C:\\Users\\alice\\node.exe',
            args: ['C:\\Users\\alice\\npm-cli.js', 'exec', '@taptap/maker'],
          },
        },
        mcp_verify: {
          ok: false,
          stage: 'initialize',
          stderr: 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz',
        },
      },
      homeDir: 'C:\\Users\\alice',
    });

    expect(issue.title).toBe('[Maker MCP] generate_image timed out');
    expect(issue.body).toContain('generate_image');
    expect(issue.body).toContain('504');
    expect(issue.body).toContain(JSON.stringify('~\\MakerGame\\demo').slice(1, -1));
    expect(issue.body).toContain(JSON.stringify('~\\.workbuddy\\mcp.json').slice(1, -1));
    expect(issue.body).toContain('由 TapTap Maker AI 故障上报流程自动生成');
    expect(issue.body).not.toContain('C:\\Users\\alice');
    expect(issue.body).not.toContain('abc123secretvalue');
    expect(issue.body).not.toContain('abcdefghijklmnopqrstuvwxyz');
    expect(issue.body).not.toContain('private-password');
    expect(issue.body).toContain('<redacted>');
  });

  test('caps oversized diagnostic payloads before GitHub submission', () => {
    const issue = buildMakerMcpIssue({
      context: {
        summary: 'Oversized proxy response',
        remote_result: { logs: 'x'.repeat(100_000) },
      },
      diagnostics: {
        occurred_at: '2026-08-14T12:00:00+08:00',
        os_arch: 'win32 x64',
        node_version: 'v22.22.2',
        maker_package_version: '0.0.30-beta.1',
        process_cwd: 'C:\\Users\\alice\\dialogues',
        target_dir: 'C:\\Users\\alice\\MakerGame\\demo',
        project_context: { status: 'bound' },
        client_config: { status: 'found' },
        mcp_verify: { ok: true },
      },
      homeDir: 'C:\\Users\\alice',
    });

    expect(issue.body.length).toBeLessThan(60_000);
    expect(issue.body).toContain('<truncated>');
  });

  test('normalizes multiline and control characters out of the public issue title', () => {
    const issue = buildMakerMcpIssue({
      context: { summary: 'Proxy\n timeout\u0000 on generate_image' },
      diagnostics: {
        occurred_at: '2026-08-14T12:00:00+08:00',
        os_arch: 'win32 x64',
        node_version: 'v22.22.2',
        maker_package_version: '0.0.30-beta.1',
        process_cwd: 'C:\\Users\\alice\\dialogues',
        target_dir: 'C:\\Users\\alice\\MakerGame\\demo',
        project_context: { status: 'bound' },
        client_config: { status: 'found' },
        mcp_verify: { ok: true },
      },
      homeDir: 'C:\\Users\\alice',
    });

    expect(issue.title).toBe('[Maker MCP] Proxy timeout on generate_image');
  });

  test('reads the active Windows WorkBuddy config without other MCP entries', () => {
    const configPath = path.join(tempDir, '.workbuddy', 'mcp.json');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        mcpServers: {
          'taptap-maker': {
            command: 'C:\\Program Files\\nodejs\\node.exe',
            args: ['C:\\npm\\npm-cli.js', 'exec', '@taptap/maker'],
            env: { TAPTAP_MCP_CLIENT_IDE: 'workbuddy', TAPTAP_MCP_PAT: 'never-upload' },
          },
          another: { command: 'private-server' },
        },
      }),
      'utf8'
    );

    expect(
      inspectMakerMcpClientConfig({
        ide: 'workbuddy',
        homeDir: tempDir,
        platform: 'win32',
      })
    ).toEqual({
      ide: 'workbuddy',
      status: 'found',
      entries: [
        {
          path: configPath,
          status: 'found',
          server: {
            command: 'C:\\Program Files\\nodejs\\node.exe',
            args: ['C:\\npm\\npm-cli.js', 'exec', '@taptap/maker'],
            env_keys: ['TAPTAP_MCP_CLIENT_IDE', 'TAPTAP_MCP_PAT'],
            client_ide: 'workbuddy',
          },
        },
      ],
    });
  });

  test('prefers the official WorkBuddy config over an inactive legacy config', () => {
    const workBuddyDir = path.join(tempDir, '.workbuddy');
    const officialPath = path.join(workBuddyDir, 'mcp.json');
    const legacyPath = path.join(workBuddyDir, '.mcp.json');
    fs.mkdirSync(workBuddyDir, { recursive: true });
    fs.writeFileSync(
      officialPath,
      JSON.stringify({
        mcpServers: { 'taptap-maker': { command: 'official-node', disabled: false } },
      }),
      'utf8'
    );
    fs.writeFileSync(
      legacyPath,
      JSON.stringify({
        mcpServers: {
          'taptap-maker': { command: 'legacy-node', cwd: 'D:\\stale-project' },
        },
      }),
      'utf8'
    );

    const inspection = inspectMakerMcpClientConfig({
      ide: 'workbuddy',
      homeDir: tempDir,
      platform: 'win32',
    });

    expect(inspection.entries).toHaveLength(1);
    expect(inspection.entries[0]).toMatchObject({
      path: officialPath,
      server: { command: 'official-node' },
    });
    expect(JSON.stringify(inspection)).not.toContain('legacy-node');
    expect(JSON.stringify(inspection)).not.toContain('stale-project');
  });

  test('reads OpenCode JSONC and Codex TOML Maker entries', () => {
    const openCodePath = path.join(tempDir, '.config', 'opencode', 'opencode.jsonc');
    fs.mkdirSync(path.dirname(openCodePath), { recursive: true });
    fs.writeFileSync(
      openCodePath,
      `{
        // user comment
        "mcp": {
          "taptap-maker": {
            "type": "local",
            "command": ["node", "maker.js"],
          },
        },
      }`,
      'utf8'
    );

    const codexPath = path.join(tempDir, '.codex', 'config.toml');
    fs.mkdirSync(path.dirname(codexPath), { recursive: true });
    fs.writeFileSync(
      codexPath,
      [
        '[mcp_servers."taptap-maker"]',
        'command = "C:\\\\nodejs\\\\node.exe"',
        'args = ["C:\\\\npm\\\\npm-cli.js", "exec", "@taptap/maker"]',
        '',
        '[mcp_servers."taptap-maker".env]',
        'TAPTAP_MCP_CLIENT_IDE = "codex"',
        'SECRET_TOKEN = "never-upload"',
        '',
        '[mcp_servers.other]',
        'command = "private-server"',
      ].join('\n'),
      'utf8'
    );

    const openCode = inspectMakerMcpClientConfig({
      ide: 'opencode',
      homeDir: tempDir,
      platform: 'linux',
    });
    expect(openCode.status).toBe('found');
    expect(openCode.entries[0].server).toEqual({
      type: 'local',
      command: ['node', 'maker.js'],
    });

    const codex = inspectMakerMcpClientConfig({
      ide: 'codex',
      homeDir: tempDir,
      platform: 'win32',
    });
    expect(codex.status).toBe('found');
    expect(codex.entries[0].server).toEqual({
      command: 'C:\\nodejs\\node.exe',
      args: ['C:\\npm\\npm-cli.js', 'exec', '@taptap/maker'],
      env_keys: ['SECRET_TOKEN', 'TAPTAP_MCP_CLIENT_IDE'],
      client_ide: 'codex',
    });
    expect(JSON.stringify(codex)).not.toContain('never-upload');
    expect(JSON.stringify(codex)).not.toContain('private-server');
  });

  test('reads DSH user and profile patch entries without exposing environment values', () => {
    const dshHome = path.join(tempDir, '.dsh');
    const userPatch = path.join(dshHome, 'cordis.patch.yml');
    const profilePatch = path.join(dshHome, 'profiles', 'web', 'cordis.patch.yml');
    fs.mkdirSync(path.dirname(profilePatch), { recursive: true });
    fs.writeFileSync(userPatch, '[]\n', 'utf8');
    fs.writeFileSync(
      profilePatch,
      [
        '- insert:',
        '    - id: mcp-taptap-maker',
        "      name: '@deepseek-ai/dsh-mcp-client'",
        '      config:',
        '        serverName: taptap-maker',
        '        transport: stdio',
        '        command: C:\\Program Files\\nodejs\\node.exe',
        '        args:',
        '          - C:\\Users\\alice\\.taptap-maker\\mcp-runtime\\maker.js',
        '        env:',
        '          TAPTAP_MCP_CLIENT_IDE: dsh',
        '          TAPTAP_MCP_PAT: never-upload',
        '        toolCallTimeoutMs: 3600000',
        '        failOnStartupError: true',
        '',
      ].join('\n'),
      'utf8'
    );

    const inspection = inspectMakerMcpClientConfig({
      ide: 'dsh',
      homeDir: tempDir,
      platform: 'win32',
      dshHome,
    });

    expect(inspection.status).toBe('found');
    expect(inspection.entries).toEqual(
      expect.arrayContaining([
        {
          path: profilePatch,
          status: 'found',
          server: {
            id: 'mcp-taptap-maker',
            name: '@deepseek-ai/dsh-mcp-client',
            server_name: 'taptap-maker',
            transport: 'stdio',
            command: 'C:\\Program Files\\nodejs\\node.exe',
            args: ['C:\\Users\\alice\\.taptap-maker\\mcp-runtime\\maker.js'],
            env_keys: ['TAPTAP_MCP_CLIENT_IDE', 'TAPTAP_MCP_PAT'],
            client_ide: 'dsh',
            tool_call_timeout_ms: 3_600_000,
            fail_on_startup_error: true,
          },
        },
      ])
    );
    expect(JSON.stringify(inspection)).not.toContain('never-upload');
  });

  test('uses Windows APPDATA when collecting the active Trae config', async () => {
    const appData = path.join(tempDir, 'custom-roaming');
    const configPath = path.join(appData, 'TRAE SOLO', 'User', 'mcp.json');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        mcpServers: {
          'taptap-maker': { command: 'node.exe', args: ['maker.js'] },
        },
      }),
      'utf8'
    );

    const diagnostics = await collectMakerMcpIssueDiagnostics({
      ide: 'trae',
      homeDir: tempDir,
      platform: 'win32',
      arch: 'x64',
      processCwd: tempDir,
      targetDir: tempDir,
      makerVersion: 'dev',
      environment: { APPDATA: appData },
      verify: async () => ({ ok: true, stage: 'tools_list' }),
    });

    expect(diagnostics.client_config).toMatchObject({
      status: 'found',
      entries: [expect.objectContaining({ path: configPath, status: 'found' })],
    });
  });

  test('creates an issue when GitHub CLI succeeds', () => {
    const result = submitMakerMcpIssue(
      { title: '[Maker MCP] timeout', body: 'sanitized body' },
      {
        run: () => ({
          status: 0,
          stdout: 'https://github.com/taptap/instant-games-open-mcp/issues/123\n',
          stderr: '',
        }),
      }
    );

    expect(result).toEqual({
      status: 'created',
      issue_url: 'https://github.com/taptap/instant-games-open-mcp/issues/123',
    });
  });

  test('collects bounded local diagnostics without project or account identifiers', async () => {
    fs.mkdirSync(path.join(tempDir, '.maker-mcp'), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, '.maker-mcp', 'config.json'),
      JSON.stringify({
        project_id: 'private-project-id',
        user_id: 'private-user-id',
      }),
      'utf8'
    );
    const trustPath = path.join(
      tempDir,
      '.workbuddy',
      'connectors',
      'private-account-id',
      'connector-states.json'
    );
    fs.mkdirSync(path.dirname(trustPath), { recursive: true });
    fs.writeFileSync(
      trustPath,
      JSON.stringify({
        enabled: ['taptap-maker'],
        everConnected: ['taptap-maker'],
        userDisabled: [],
      }),
      'utf8'
    );

    const diagnostics = await collectMakerMcpIssueDiagnostics({
      ide: 'workbuddy',
      homeDir: tempDir,
      platform: 'win32',
      arch: 'x64',
      processCwd: path.join(tempDir, 'dialogues', 'session-1'),
      targetDir: tempDir,
      makerVersion: '0.0.30-beta.1',
      environment: {
        HTTP_PROXY: 'http://user:password@private-proxy.example',
        NO_PROXY: 'localhost,private.example',
      },
      now: () => new Date('2026-08-14T04:00:00.000Z'),
      verify: async () => ({
        ok: true,
        stage: 'tools_list',
        launcher_kind: 'node_npm_cli',
        command: 'node npm-cli.js exec @taptap/maker',
        tools: ['maker_status_lite', 'generate_image'],
      }),
    });

    expect(diagnostics).toMatchObject({
      occurred_at: '2026-08-14T04:00:00.000Z',
      client: 'workbuddy',
      os_arch: 'win32 x64',
      node_version: process.version,
      maker_package_version: '0.0.30-beta.1',
      process_cwd: path.join(tempDir, 'dialogues', 'session-1'),
      target_dir: tempDir,
      project_context: {
        status: 'bound',
        source: 'cwd',
        project_root: tempDir,
        config_path: path.join(tempDir, '.maker-mcp', 'config.json'),
      },
      mcp_verify: {
        ok: true,
        stage: 'tools_list',
        tools: ['maker_status_lite', 'generate_image'],
      },
      network_proxy: {
        http_proxy_configured: true,
        https_proxy_configured: false,
        no_proxy_configured: true,
      },
      workbuddy_trust: {
        status: 'trusted',
        accounts_checked: 1,
        trusted_accounts: 1,
        disabled_accounts: 0,
        pending_accounts: 0,
        unreadable_accounts: 0,
      },
    });
    expect(JSON.stringify(diagnostics)).not.toContain('private-project-id');
    expect(JSON.stringify(diagnostics)).not.toContain('private-user-id');
    expect(JSON.stringify(diagnostics)).not.toContain('private-account-id');
    expect(JSON.stringify(diagnostics)).not.toContain('private-proxy');
    expect(JSON.stringify(diagnostics)).not.toContain('password');
  });

  test('reports mixed WorkBuddy trust without exposing account identifiers', async () => {
    const connectorsDir = path.join(tempDir, '.workbuddy', 'connectors');
    const states = [
      {
        account: 'trusted-private-account',
        value: { enabled: ['taptap-maker'], everConnected: ['taptap-maker'], userDisabled: [] },
      },
      {
        account: 'disabled-private-account',
        value: {
          enabled: ['taptap-maker'],
          everConnected: ['taptap-maker'],
          userDisabled: ['taptap-maker'],
        },
      },
      {
        account: 'unrelated-private-account',
        value: { enabled: ['another-mcp'], everConnected: [], userDisabled: [] },
      },
    ];
    for (const state of states) {
      const statePath = path.join(connectorsDir, state.account, 'connector-states.json');
      fs.mkdirSync(path.dirname(statePath), { recursive: true });
      fs.writeFileSync(statePath, JSON.stringify(state.value), 'utf8');
    }

    const diagnostics = await collectMakerMcpIssueDiagnostics({
      ide: 'workbuddy',
      homeDir: tempDir,
      platform: 'win32',
      targetDir: tempDir,
      makerVersion: 'test',
      verify: async () => ({ ok: false }),
    });

    expect(diagnostics.workbuddy_trust).toEqual({
      status: 'mixed',
      accounts_checked: 2,
      trusted_accounts: 1,
      disabled_accounts: 1,
      pending_accounts: 0,
      unreadable_accounts: 0,
    });
    expect(JSON.stringify(diagnostics)).not.toContain('trusted-private-account');
    expect(JSON.stringify(diagnostics)).not.toContain('disabled-private-account');
    expect(JSON.stringify(diagnostics)).not.toContain('unrelated-private-account');
  });

  test('degrades unreadable WorkBuddy connector directories without aborting the report', async () => {
    const connectorsDir = path.join(tempDir, '.workbuddy', 'connectors');
    fs.mkdirSync(connectorsDir, { recursive: true });
    const readdirSpy = jest.spyOn(fs, 'readdirSync').mockImplementation((target, options) => {
      if (String(target) === connectorsDir) {
        throw new Error('EACCES');
      }
      return jest
        .requireActual<typeof import('node:fs')>('node:fs')
        .readdirSync(target as fs.PathLike, options as never) as never;
    });

    try {
      const diagnostics = await collectMakerMcpIssueDiagnostics({
        ide: 'workbuddy',
        homeDir: tempDir,
        platform: 'win32',
        targetDir: tempDir,
        makerVersion: 'test',
        verify: async () => ({ ok: false }),
      });

      expect(diagnostics.workbuddy_trust).toEqual({
        status: 'unreadable',
        accounts_checked: 0,
        trusted_accounts: 0,
        disabled_accounts: 0,
        pending_accounts: 0,
        unreadable_accounts: 0,
      });
    } finally {
      readdirSpy.mockRestore();
    }
  });

  test('turns missing GitHub CLI, auth, and network failures into manual fallback', () => {
    const issue = { title: '[Maker MCP] timeout', body: 'sanitized body' };
    const missing = submitMakerMcpIssue(issue, {
      run: () => {
        throw new Error('spawn gh ENOENT');
      },
    });
    const unavailable = submitMakerMcpIssue(issue, {
      run: () => ({ status: 1, stdout: '', stderr: 'network unavailable with token=secret' }),
    });

    for (const result of [missing, unavailable]) {
      expect(result.status).toBe('manual_required');
      expect(result.issue_url).toBe('https://github.com/taptap/instant-games-open-mcp/issues/new');
      expect(result).toMatchObject(issue);
      expect(JSON.stringify(result)).not.toContain('network unavailable');
      expect(JSON.stringify(result)).not.toContain('secret');
    }
  });
});
