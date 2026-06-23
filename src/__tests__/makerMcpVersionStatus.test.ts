const mockServers: Array<{
  handlers: Map<unknown, (...args: any[]) => any>;
}> = [];

jest.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: class MockServer {
    handlers = new Map<unknown, (...args: any[]) => any>();

    constructor(..._args: unknown[]) {
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
  beforeEach(() => {
    mockServers.length = 0;
    jest.clearAllMocks();
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
  });
});
