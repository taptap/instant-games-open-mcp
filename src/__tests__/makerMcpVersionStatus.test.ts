const mockServers: Array<{
  handlers: Map<unknown, (...args: any[]) => any>;
  options?: Record<string, unknown>;
}> = [];

jest.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: class MockServer {
    handlers = new Map<unknown, (...args: any[]) => any>();
    options?: Record<string, unknown>;

    constructor(_serverInfo: unknown, options?: Record<string, unknown>) {
      this.options = options;
      mockServers.push(this);
    }

    setRequestHandler(schema: unknown, handler: (...args: any[]) => any): void {
      this.handlers.set(schema, handler);
    }

    async connect(_transport: unknown): Promise<void> {
      return undefined;
    }

    getClientCapabilities(): undefined {
      return undefined;
    }

    async listRoots(): Promise<{ roots: [] }> {
      return { roots: [] };
    }
  },
}));

jest.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: class MockStdioServerTransport {},
}));

jest.mock('@modelcontextprotocol/sdk/types.js', () => ({
  CallToolRequestSchema: 'call-tool',
  ListResourcesRequestSchema: 'list-resources',
  ListToolsRequestSchema: 'list-tools',
  ReadResourceRequestSchema: 'read-resource',
  McpError: class MockMcpError extends Error {},
  ErrorCode: {
    InvalidParams: 'InvalidParams',
    MethodNotFound: 'MethodNotFound',
  },
}));

jest.mock('../maker/versionCheck', () => ({
  startMakerPackageUpdateCheck: jest.fn(),
  getMakerPackageUpdateStatus: jest.fn(async () => ({
    status: 'required_upgrade',
    current_version: '0.0.5',
    target_version: '0.0.8',
    reason: 'below_minimum_supported',
    next_action:
      'Ask the user for approval, then run `taptap-maker upgrade --target-dir <PROJECT_DIR>`.',
    restart_required: true,
  })),
  formatMakerPackageUpdateStatus: jest.fn(() =>
    [
      'Maker MCP package update',
      '',
      '- status: required_upgrade',
      '- next_action: Ask the user for approval, then run `taptap-maker upgrade --target-dir <PROJECT_DIR>`.',
    ].join('\n')
  ),
}));

jest.mock('../maker/server/identify', () => ({
  identifyMakerProject: jest.fn(() => ({
    source: 'config_not_found',
    projectId: undefined,
    projectRoot: undefined,
    configPath: undefined,
    config: undefined,
  })),
  formatIdentifyHint: jest.fn(() => 'identify hint'),
}));

jest.mock('../maker/lifecycle', () => ({
  logLifecycleEvent: jest.fn(),
}));

jest.mock('../maker/storage', () => ({
  getPatPath: jest.fn(() => '/tmp/maker/pat.json'),
  getTapAuthPath: jest.fn(() => '/tmp/maker/tap-auth.json'),
  loadProjectConfig: jest.fn(),
  loadJwt: jest.fn(),
  loadPat: jest.fn(() => undefined),
  loadTapAuth: jest.fn(() => undefined),
}));

jest.mock('../maker/cli/projects', () => ({
  inspectMakerDirectoryGitStatus: jest.fn(() => ({
    isUsableMakerGitRepo: false,
    issue: 'unbound',
    targetDir: '/tmp/maker-project',
    makerProjectRoot: undefined,
    gitRoot: undefined,
    gitDir: undefined,
    isOwnGitRoot: false,
    message: undefined,
  })),
  readMakerProjectLocalChanges: jest.fn(),
  pushMakerProject: jest.fn(),
}));

jest.mock('../maker/projectSettings', () => ({
  formatMakerProjectHealthStatus: jest.fn(),
  formatMakerProjectSettingsStatus: jest.fn(),
  inspectMakerProjectHealth: jest.fn(() => ({
    canBuild: true,
    status: 'ready',
    issues: [],
  })),
  inspectMakerProjectSettings: jest.fn(),
  isMakerProjectSettingsBlocking: jest.fn(),
}));

jest.mock('../maker/auth/patTap', () => ({
  requestTapAuthWithPat: jest.fn(),
}));

jest.mock('../maker/config', () => ({
  getMakerEndpoints: jest.fn(),
  getMakerEnvironment: jest.fn(() => 'production'),
  getMakerWebUrl: jest.fn(),
  requireMakerEndpoint: jest.fn(),
}));

jest.mock('../maker/system/git', () => ({
  MakerGitNotFoundError: class MakerGitNotFoundError extends Error {},
  checkGitEnvironment: jest.fn(() => ({ installed: true })),
  formatGitEnvironmentStatus: jest.fn(() => 'Git environment\n\n- status: ready'),
}));

jest.mock('../maker/system/python', () => ({
  checkMakerPythonEnvironment: jest.fn(() => ({ ready: true })),
  formatMakerPythonEnvironmentStatus: jest.fn(() => 'Python environment\n\n- status: ready'),
}));

jest.mock('../maker/system/luaLsp', () => ({
  checkMakerLuaLspEnvironment: jest.fn(() => ({ ready: true })),
  formatMakerLuaLspEnvironmentStatus: jest.fn(() => 'Lua LSP environment\n\n- status: ready'),
}));

jest.mock('../maker/cli/skill', () => ({
  formatMakerSkillStatus: jest.fn(() => 'Maker skill status\n\n- status: ready'),
}));

jest.mock('../maker/cli/agentsPolicy', () => ({
  formatMakerAgentsPolicyStatus: jest.fn(),
}));

jest.mock('../maker/cli/devKit', () => ({
  DEV_KIT_GITIGNORE_STAGING_FILE: '.gitignore.dev-kit-before-clone',
  checkAiDevKitUpdate: jest.fn(),
  inspectAiDevKit: jest.fn(),
  inspectAiDevKitSkillInstallStatus: jest.fn(),
}));

describe('maker MCP version status integration', () => {
  const originalDistribution = process.env.TAPTAP_MAKER_DISTRIBUTION;

  beforeEach(() => {
    mockServers.length = 0;
    jest.clearAllMocks();
    delete process.env.TAPTAP_MAKER_DISTRIBUTION;
  });

  afterEach(() => {
    if (originalDistribution === undefined) {
      delete process.env.TAPTAP_MAKER_DISTRIBUTION;
    } else {
      process.env.TAPTAP_MAKER_DISTRIBUTION = originalDistribution;
    }
  });

  test('starts package update check on MCP startup and includes update status in maker_status_lite', async () => {
    const { startMakerMcpServer } = await import('../maker/server/mcp');
    const { CallToolRequestSchema } = await import('@modelcontextprotocol/sdk/types.js');
    const versionCheck = await import('../maker/versionCheck');

    await startMakerMcpServer();

    expect(versionCheck.startMakerPackageUpdateCheck).toHaveBeenCalledTimes(1);
    expect(versionCheck.startMakerPackageUpdateCheck).toHaveBeenCalledWith({
      currentVersion: expect.any(String),
    });

    const server = mockServers[0];
    expect(server).toBeDefined();

    const handler = server.handlers.get(CallToolRequestSchema);
    expect(handler).toBeDefined();

    const result = await handler(
      {
        params: {
          name: 'maker_status_lite',
          arguments: {
            target_dir: '/tmp/maker-project',
            skip_remote_sync: true,
            detail: true,
          },
        },
      },
      {}
    );

    expect(versionCheck.getMakerPackageUpdateStatus).toHaveBeenCalledWith({
      currentVersion: expect.any(String),
      allowRemoteFetch: false,
    });
    expect(result.content[0].text).toContain('Maker MCP package update');
    expect(result.content[0].text).toContain('- status: required_upgrade');
    expect(result.content[0].text).toContain('- next_action: Ask the user for approval');

    await handler(
      {
        params: {
          name: 'maker_status_lite',
          arguments: {
            target_dir: '/tmp/maker-project',
          },
        },
      },
      {}
    );

    expect(versionCheck.getMakerPackageUpdateStatus).toHaveBeenLastCalledWith({
      currentVersion: expect.any(String),
      allowRemoteFetch: false,
      backgroundRefresh: false,
    });
  });

  test('does not add an update action when a plugin distribution manages the package', async () => {
    process.env.TAPTAP_MAKER_DISTRIBUTION = 'codex_plugin';
    const versionCheck = await import('../maker/versionCheck');
    jest.mocked(versionCheck.getMakerPackageUpdateStatus).mockResolvedValue({
      status: 'managed_by_plugin',
      current_version: '0.0.30',
      restart_required: false,
    });
    jest
      .mocked(versionCheck.formatMakerPackageUpdateStatus)
      .mockReturnValue(
        [
          'Maker MCP package update',
          '',
          '- status: managed_by_plugin',
          '- current_version: 0.0.30',
        ].join('\n')
      );
    const { startMakerMcpServer } = await import('../maker/server/mcp');
    const { CallToolRequestSchema } = await import('@modelcontextprotocol/sdk/types.js');

    await startMakerMcpServer();
    const handler = mockServers[0].handlers.get(CallToolRequestSchema);
    const result = await handler(
      {
        params: {
          name: 'maker_status_lite',
          arguments: {
            target_dir: '/tmp/maker-project',
            skip_remote_sync: true,
            detail: true,
          },
        },
      },
      {}
    );

    expect(result.content[0].text).toContain('- status: managed_by_plugin');
    expect(result.content[0].text).not.toContain('- target_version:');
    expect(result.content[0].text).not.toContain('Update the installed Codex plugin');
  });

  test('marks a blocked Maker submission as a tool error', async () => {
    const projects = await import('../maker/cli/projects');
    const storage = await import('../maker/storage');
    const { startMakerMcpServer } = await import('../maker/server/mcp');
    const { CallToolRequestSchema } = await import('@modelcontextprotocol/sdk/types.js');

    (storage.loadProjectConfig as jest.Mock).mockReturnValue({ project_id: 'app-1' });
    (projects.readMakerProjectLocalChanges as jest.Mock).mockResolvedValue({
      hasChanges: true,
      projectRoot: '/tmp/maker-project',
      files: ['scripts/main.lua'],
      rawStatus: ' M scripts/main.lua',
    });
    (projects.pushMakerProject as jest.Mock).mockResolvedValue({
      branch: 'main',
      committed: false,
      pushed: false,
      status: 'clean',
      failure: {
        stage: 'remote_sync',
        classification: 'remote_rejected',
        retryable: false,
        message: 'Maker remote is ahead',
        nextAction: 'Ask the user whether to sync the Maker remote changes before retrying.',
      },
    });

    await startMakerMcpServer();
    const handler = mockServers[0].handlers.get(CallToolRequestSchema);
    const result = await handler(
      {
        params: {
          name: 'maker_build_current_directory',
          arguments: { target_dir: '/tmp/maker-project' },
        },
      },
      {}
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('submit blocked before commit/push');
    expect(result.content[0].text).toContain('remote_rejected');
  });

  test('exposes a concise capability routing index through initialize instructions', async () => {
    const { startMakerMcpServer } = await import('../maker/server/mcp');

    await startMakerMcpServer();

    const instructions = mockServers[0]?.options?.instructions;
    expect(typeof instructions).toBe('string');
    expect(instructions).toContain('TapTap Maker routing index:');
    expect(instructions).toContain('maker://status');
    expect(instructions).toContain('maker_status_lite');
    expect(instructions).toContain('maker_build_current_directory');
    expect(instructions).toContain('generate_test_qrcode');
    expect(instructions).toContain(
      'Ads: read maker://ads-integration-guide before any ad-related work.'
    );
    expect((instructions as string).match(/^- Ads:/gmu)).toHaveLength(1);
    expect(instructions).toContain('get_debug_feedbacks');
    expect(instructions).toContain("current Maker game's online player feedback");
    expect(instructions).toContain('real-device game logs');
    expect(instructions).toContain('server/Lua logs for a specified game session');
    expect(instructions).toContain('exposed by the current Maker tool list');
    expect(instructions).toContain('MCP/proxy infrastructure failure');
    expect(instructions).toContain('ask once for user consent');
    expect(instructions).toContain("active client's exact Maker command/args with `mcp report`");
    expect(instructions).toContain('never use an unversioned npm package');
    expect(instructions).toContain('Do not report expected project or business errors');
    expect(instructions).toContain('image, video, music, sound-effect');
    expect((instructions as string).length).toBeLessThanOrEqual(1200);
    expect(instructions).not.toMatch(
      /agents update|global memory|~\/.(?:codex|claude|workbuddy)/iu
    );
  });

  test('exposes the built-in Maker ads integration entry document', async () => {
    const { startMakerMcpServer } = await import('../maker/server/mcp');
    const { ListResourcesRequestSchema, ReadResourceRequestSchema } = await import(
      '@modelcontextprotocol/sdk/types.js'
    );

    await startMakerMcpServer();

    const server = mockServers[0];
    const listHandler = server.handlers.get(ListResourcesRequestSchema);
    const readHandler = server.handlers.get(ReadResourceRequestSchema);
    const listed = await listHandler({}, {});

    expect(listed.resources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          uri: 'maker://ads-integration-guide',
          name: 'Maker ads integration guide',
        }),
      ])
    );

    const result = await readHandler(
      { params: { uri: 'maker://ads-integration-guide' } },
      { requestId: 'ads-guide-test' }
    );
    const text = result.contents[0].text;

    expect(text).toContain('get_ad_config');
    expect(text).toContain('engine-docs/recipes/sdk.md');
    expect(text).toContain('sdk:ShowRewardVideoAd');
    expect(text).toContain('result.success');
    expect(text).toContain('consecutive steps');
  });
});
