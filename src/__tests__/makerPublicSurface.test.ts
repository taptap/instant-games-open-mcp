/**
 * Maker-only public documentation regression tests.
 */

import fs from 'node:fs';
import path from 'node:path';

const INTERNAL_ENVIRONMENT_PATTERN = /\brnd\b|xdrnd|TAPTAP_MCP_ENV|--env/iu;

describe('Maker public documentation', () => {
  test('Maker-facing docs do not expose internal environment selection', () => {
    const readme = fs.readFileSync(path.resolve('README.md'), 'utf8');
    const makerSection = readme.match(
      /## .*TapTap Maker 本地开发（CLI-first）[\s\S]*?(?=\n## )/u
    )?.[0];
    expect(makerSection).toBeDefined();

    for (const text of [
      makerSection!,
      fs.readFileSync(path.resolve('docs/MAKER.md'), 'utf8'),
      fs.readFileSync(path.resolve('skills/taptap-maker-local/SKILL.md'), 'utf8'),
    ]) {
      expect(text).not.toMatch(INTERNAL_ENVIRONMENT_PATTERN);
    }
  });

  test('Maker workflow guide does not infer service configuration from build intent', () => {
    const skill = fs.readFileSync(path.resolve('skills/taptap-maker-local/SKILL.md'), 'utf8');

    expect(skill).toContain(
      'Do not infer or set a service environment from preview, build, test, or local-development intent'
    );
    expect(skill).toContain('Do not add environment parameters');
  });

  test('offline connection troubleshooting guide covers known startup failures', () => {
    const guidePath = path.resolve('docs/MAKER_MCP_CONNECTION_TROUBLESHOOTING.md');
    expect(fs.existsSync(guidePath)).toBe(true);

    if (!fs.existsSync(guidePath)) {
      return;
    }
    const guide = fs.readFileSync(guidePath, 'utf8');
    for (const expected of [
      '-32000',
      'Connection closed',
      'command not found',
      '启动后立即退出',
      'WorkBuddy',
      'cwd',
      'MCP Roots',
      'npx',
      'PATH',
      'stderr',
      'connector-states.json',
      'npx -y -p @taptap/maker taptap-maker mcp verify --json',
      'npx.cmd -y -p @taptap/maker taptap-maker mcp verify --json',
      'command、status、signal、stdout、stderr、error 和 failure_type',
      '不会启动 Maker MCP server',
      '不会读取或验证客户端实际生效的 MCP 配置',
      '成功不代表客户端 MCP 配置正常',
      '按证据分类根因',
      '仅在证据确认实际配置项损坏时',
    ]) {
      expect(guide).toContain(expected);
    }

    for (const field of [
      'client:',
      'config_path:',
      'command:',
      'args:',
      'cwd:',
      'node_path:',
      'npm_path:',
      'npx_path:',
      'client_PATH:',
      'exit_status:',
      'signal:',
      'spawn_error:',
      'stdout:',
      'stderr:',
      'workbuddy_trust:',
      'workspace_roots:',
      'classification:',
      'evidence:',
      'repair:',
      'verification:',
    ]) {
      expect(guide).toContain(field);
    }
    expect(guide).toContain('凭证值必须脱敏');
    expect(guide).toContain('不要自动修改 trust storage、PATH、cwd、凭证或游戏业务代码');
    expect(guide).not.toMatch(INTERNAL_ENVIRONMENT_PATTERN);
  });

  test('bundled Maker skill defines the same evidence-first offline recovery boundary', () => {
    const skill = fs.readFileSync(path.resolve('skills/taptap-maker-local/SKILL.md'), 'utf8');
    const normalizedSkill = skill.replace(/\s+/gu, ' ');

    for (const expected of [
      'npx -y -p @taptap/maker taptap-maker mcp verify --json',
      'standard `@taptap/maker` npx/CLI launch path',
      'does not start the Maker MCP server',
      "does not read or validate the client's active MCP config",
      'A successful verify result does not prove that the client MCP config works',
      'config path, command, ordered args, cwd',
      'Classify the root cause from evidence before repairing it',
      'only after evidence confirms that the active config entry is damaged',
      'Do not automatically change trust storage, PATH, cwd, credentials',
    ]) {
      expect(normalizedSkill).toContain(expected);
    }
    expect(skill).not.toMatch(INTERNAL_ENVIRONMENT_PATTERN);
  });
});
