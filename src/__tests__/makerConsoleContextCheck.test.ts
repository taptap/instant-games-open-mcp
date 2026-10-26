import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { inspectContext } from '../maker/console/contextCheck.js';
import { listCodexMcpRegistrations } from '../maker/cli/codexMcpConfig.js';

describe('offline console context inventory', () => {
  let directory: string;
  let projectDir: string;
  let homeDir: string;
  async function write(base: string, name: string, content: string) {
    const filename = path.join(base, name);
    await fs.mkdir(path.dirname(filename), { recursive: true });
    await fs.writeFile(filename, content);
    return filename;
  }
  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'maker-context-'));
    projectDir = path.join(directory, 'project');
    homeDir = path.join(directory, 'home');
    await fs.mkdir(projectDir);
    await fs.mkdir(homeDir);
  });
  afterEach(async () => {
    await fs.rm(directory, { recursive: true, force: true });
  });

  test('inventories only known locations without returning content or credentials', async () => {
    await write(projectDir, 'AGENTS.md', 'private project instructions');
    await write(projectDir, 'memory/topic.md', 'private user memory');
    await write(projectDir, 'skills/example/SKILL.md', 'private skill body');
    await write(projectDir, 'skills/example/reference.md', 'not inventoried');
    await write(projectDir, 'src/AGENTS.md', 'nested rules outside scope');
    await write(
      projectDir,
      '.mcp.json',
      JSON.stringify({
        mcpServers: {
          maker: { command: 'private-command', env: { TOKEN: 'private-token' } },
          stopped: { url: 'https://secret.invalid', disabled: true },
        },
      })
    );
    await write(homeDir, '.claude/CLAUDE.md', 'global not requested');
    const result = await inspectContext({ projectDir, homeDir });
    expect(result.complete).toBe(true);
    expect(result.sources).toHaveLength(4);
    expect(result.sources.find((source) => source.kind === 'rules')).toMatchObject({
      loading: 'entry',
      bytes: 28,
    });
    expect(result.sources.find((source) => source.kind === 'skills')).toMatchObject({
      loading: 'on-demand',
    });
    expect(result.sources.find((source) => source.kind === 'mcp')?.registrations).toEqual([
      { name: 'maker', enabled: true },
      { name: 'stopped', enabled: false },
    ]);
    expect(JSON.stringify(result)).not.toMatch(
      /private-|private project|private user|private skill|secret.invalid|global not requested/
    );
  });

  test('stops at each Skill entry without inspecting its nested references or external resource links', async () => {
    await write(projectDir, 'skills/bundle/example/SKILL.md', 'entry instructions');
    await write(
      projectDir,
      'skills/bundle/example/references/deep/nested/SKILL.md',
      'not a catalog entry'
    );
    await fs.symlink(homeDir, path.join(projectDir, 'skills/bundle/example/external'), 'dir');
    const result = await inspectContext({ projectDir });
    expect(result.complete).toBe(true);
    expect(result.sources.map((source) => source.path)).toEqual(['skills/bundle/example/SKILL.md']);
    expect(result.warnings).toEqual([]);
  });

  test('inventories large files without inferring risk or actual context loading', async () => {
    await write(projectDir, 'AGENTS.md', 'a'.repeat(20 * 1024 - 1));
    await write(projectDir, 'MEMORY.md', 'b'.repeat(20 * 1024));
    await write(projectDir, 'skills/medium/SKILL.md', 'c'.repeat(50 * 1024 - 1));
    await write(projectDir, 'skills/high/SKILL.md', 'd'.repeat(50 * 1024));
    await write(
      projectDir,
      '.mcp.json',
      JSON.stringify({ mcpServers: {}, unused: 'x'.repeat(50 * 1024) })
    );
    const result = await inspectContext({ projectDir });
    expect(result.sources).toHaveLength(5);
    expect(result).not.toHaveProperty('sizeLimits');
    for (const source of result.sources) expect(source).not.toHaveProperty('sizeRisk');
    expect(result.findings).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.warningCounts).toEqual({ invalid: 0, unverified: 0, skipped: 0 });
  });

  test('does not label read failures as broken files', async () => {
    const file = await fs.realpath(await write(projectDir, 'AGENTS.md', 'instructions'));
    const original = fs.open;
    const spy = jest.spyOn(fs, 'open').mockImplementation((...args: Parameters<typeof fs.open>) => {
      if (args[0] === file)
        return Promise.reject(Object.assign(new Error('private path'), { code: 'EACCES' }));
      return original(...args);
    });
    try {
      const result = await inspectContext({ projectDir });
      expect(result.complete).toBe(false);
      expect(result.warningCounts).toEqual({ invalid: 0, unverified: 1, skipped: 0 });
      expect(result.warnings).toEqual([{ kind: 'unverified', message: '无法读取：AGENTS.md' }]);
      expect(JSON.stringify(result)).not.toContain('private path');
    } finally {
      spy.mockRestore();
    }
  });

  test('makes warning truncation explicit for projects with many broken Skill links', async () => {
    await fs.mkdir(path.join(projectDir, 'skills'));
    for (let i = 0; i < 25; i++) {
      await fs.symlink(
        path.join(projectDir, 'missing-' + i),
        path.join(projectDir, 'skills/link-' + i)
      );
    }
    const result = await inspectContext({ projectDir });
    expect(result.complete).toBe(false);
    expect(result.warnings).toHaveLength(20);
    expect(result.omittedWarningCount).toBe(5);
    expect(result.warningCounts).toEqual({ invalid: 25, unverified: 0, skipped: 0 });
  });

  test('reports identical copies, but counts a same-file link only once', async () => {
    const skill = await write(projectDir, 'skills/example/SKILL.md', 'same instructions');
    await write(projectDir, '.claude/skills/example/SKILL.md', 'same instructions');
    await fs.mkdir(path.join(projectDir, '.agents/skills/example'), { recursive: true });
    await fs.symlink(skill, path.join(projectDir, '.agents/skills/example/SKILL.md'));
    const result = await inspectContext({ projectDir });
    expect(result.sources).toHaveLength(2);
    expect(result.sources[0].aliases).toEqual(['.agents/skills/example/SKILL.md']);
    expect(result.findings).toEqual([
      expect.objectContaining({
        title: '发现内容完全相同的副本',
        sourceIds: result.sources.map((source) => source.id),
      }),
    ]);
    expect(result.findings[0].detail).toContain('不代表当前会话重复加载');
  });

  test('confines symlinks to the selected project or client folder', async () => {
    const other = await write(homeDir, 'other-project/AGENTS.md', 'outside-secret');
    await fs.symlink(other, path.join(projectDir, 'AGENTS.md'));
    await write(homeDir, '.claude/CLAUDE.md', 'allowed');
    await fs.mkdir(path.join(homeDir, '.claude/skills'), { recursive: true });
    await fs.symlink(path.dirname(other), path.join(homeDir, '.claude/skills/escape'), 'dir');
    await fs.symlink(other, path.join(homeDir, '.claude.json'));
    await write(homeDir, '.codex/AGENTS.md', 'unselected');
    const result = await inspectContext({ projectDir, homeDir, client: 'claude' });
    expect(result.sources.map((source) => source.path)).toEqual(['~/.claude/CLAUDE.md']);
    expect(result.complete).toBe(false);
    expect(result.warnings).toHaveLength(3);
    expect(result.warningCounts).toEqual({ invalid: 0, unverified: 0, skipped: 3 });
    expect(JSON.stringify(result)).not.toContain('outside-secret');
  });

  test('does not accept a client directory symlink to another home subtree', async () => {
    await write(homeDir, 'other-project/CLAUDE.md', 'outside-secret');
    await fs.symlink(path.join(homeDir, 'other-project'), path.join(homeDir, '.claude'), 'dir');
    const result = await inspectContext({ projectDir, homeDir, client: 'claude' });
    expect(result.sources).toEqual([]);
    expect(result.complete).toBe(false);
  });

  test('includes shared Codex skills only when that client is selected', async () => {
    await write(homeDir, '.agents/skills/shared/SKILL.md', 'shared instructions');
    await write(homeDir, '.codex/config.toml', '[mcp_servers.maker]\nenabled = false');
    const result = await inspectContext({ projectDir, homeDir, client: 'codex' });
    expect(result.sources.map((source) => source.path)).toEqual([
      '~/.codex/config.toml',
      '~/.agents/skills/shared/SKILL.md',
    ]);
    expect(result.sources[0].registrations).toEqual([{ name: 'maker', enabled: false }]);
  });

  test('reports parse failures and limits without returning input text', async () => {
    await write(projectDir, '.mcp.json', '{private-token: broken');
    await write(projectDir, 'AGENTS.md', 'x'.repeat(1024 * 1024 + 1));
    const result = await inspectContext({ projectDir });
    expect(result.complete).toBe(false);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        { kind: 'skipped', message: '文件超过 1 MiB，未读取：AGENTS.md' },
        { kind: 'invalid', message: '无法解析 MCP 配置：.mcp.json' },
      ])
    );
    expect(JSON.stringify(result)).not.toContain('private-token');
    expect(result.sources.find((source) => source.path === 'AGENTS.md')).toMatchObject({
      bytes: 1024 * 1024 + 1,
    });
    expect(result.warningCounts).toEqual({ invalid: 1, unverified: 0, skipped: 1 });
  });

  test('reports broken and cyclic links as incomplete instead of an empty successful scan', async () => {
    await fs.symlink(path.join(projectDir, 'missing'), path.join(projectDir, 'AGENTS.md'));
    await fs.mkdir(path.join(projectDir, 'skills'));
    await fs.symlink(path.join(projectDir, 'skills'), path.join(projectDir, 'skills/loop'), 'dir');
    const result = await inspectContext({ projectDir });
    expect(result.complete).toBe(false);
    expect(result.sources).toEqual([]);
    expect(result.warnings).toEqual([
      { kind: 'invalid', message: '跳过失效链接：AGENTS.md' },
      { kind: 'invalid', message: '跳过循环链接：skills/loop' },
    ]);
  });

  test('bounds registration output without inventing duplicates from truncated names', async () => {
    await write(
      projectDir,
      '.mcp.json',
      JSON.stringify({
        mcpServers: Object.fromEntries([
          ['x'.repeat(161) + 'a', {}],
          ['x'.repeat(161) + 'b', {}],
          ...Array.from({ length: 201 }, (_, index) => ['server-' + index, {}]),
        ]),
      })
    );
    await write(projectDir, '.codex/config.toml', '[mcp_servers.same]\n[mcp_servers.same]');
    const result = await inspectContext({ projectDir });
    expect(result.complete).toBe(false);
    expect(result.sources[0].registrations).toHaveLength(200);
    expect(result.findings).toEqual([
      expect.objectContaining({
        title: '同一配置存在重复 MCP 注册',
        sourceIds: [result.sources[1].id],
      }),
    ]);
  });

  test('identifies the known preview-to-remote-build guidance and supports cancellation', async () => {
    const packageRoot = path.join(directory, 'maker');
    await write(
      packageRoot,
      'skills/taptap-maker-dev-kit-guide/SKILL.md',
      '“预览”, “跑一下” runs the remote build'
    );
    const result = await inspectContext({ projectDir, packageRoot });
    expect(result.findings[0].title).toBe('Maker 开发指南仍包含旧预览指引');
    expect(result.sources[0].scope).toBe('maker');
    const controller = new AbortController();
    controller.abort();
    await expect(inspectContext({ projectDir, signal: controller.signal })).rejects.toThrow();
    await expect(inspectContext({ projectDir, client: '../other' })).rejects.toThrow(
      '不支持的客户端'
    );
  });

  test('reads TOML tables without mistaking comments, nested tables or strings for registrations', () => {
    expect(
      listCodexMcpRegistrations(
        [
          '# [mcp_servers.fake]',
          'text = """',
          '[mcp_servers.inside_string]',
          '"""',
          '[mcp_servers."with.dot"]',
          'enabled = false # comment',
          '[mcp_servers."with.dot".env]',
          'SECRET = "hidden"',
          "[mcp_servers.'literal']",
          'command = "hidden"',
          '[mcp_servers.duplicate]',
          '[mcp_servers.duplicate]',
        ].join('\n')
      )
    ).toEqual([
      { name: 'with.dot', enabled: false },
      { name: 'literal', enabled: true },
      { name: 'duplicate', enabled: true },
      { name: 'duplicate', enabled: true },
    ]);
  });
});
