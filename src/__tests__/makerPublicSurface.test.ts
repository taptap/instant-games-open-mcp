/**
 * Maker-only public documentation regression tests.
 */

import fs from 'node:fs';
import path from 'node:path';

const INTERNAL_ENVIRONMENT_PATTERN = /\brnd\b|xdrnd|TAPTAP_MCP_ENV|--env/iu;

describe('Maker public documentation', () => {
  test('documents the QR orientation gate and test whitelist proxy workflow', () => {
    for (const file of ['AGENTS.md', 'README.md', 'docs/MAKER.md']) {
      const text = fs.readFileSync(path.resolve(file), 'utf8');
      expect(text).toContain('add_test_whitelist');
      expect(text).toContain('confirmed_screen_orientation');
      expect(text).toContain('landscape');
      expect(text).toContain('portrait');
    }
  });

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
      '不能依赖该字段修复项目上下文',
      '8.3 短路径名称可能未启用',
      '%~sI',
      '外层 shell 的引号或转义失败',
      'stderr 解码失败',
      '不能替代 MCP 子进程',
      '-32003',
      'MCP 已连接但 tool/resource 调用失败',
      'mcp verify` 不是首要检查',
      '完整、已脱敏的 `remote_result`',
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
      'wrapper_error:',
      'stdout:',
      'stderr:',
      'stderr_encoding:',
      'occurred_at:',
      'os_arch:',
      'client_version:',
      'maker_package_version:',
      'failed_operation:',
      'redacted_request_params:',
      'tools_list:',
      'error_code:',
      'error_message:',
      'error_data:',
      'remote_result:',
      'request_or_correlation_id:',
      'reproduction_steps:',
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
      'If WorkBuddy ignores configured cwd, do not keep rewriting the cwd field',
      'Do not assume Windows 8.3 short paths exist or differ from the original long path',
      'Separate outer shell quoting or stderr decoding failures from the MCP child process result',
      'If the MCP connection is established but a tool or resource call fails, including `-32003`',
      '`mcp verify` is not the primary check for an already connected session',
      'complete sanitized `remote_result`',
      'failed tool/resource, redacted request parameters, current `tools/list`',
    ]) {
      expect(normalizedSkill).toContain(expected);
    }
    expect(skill).not.toMatch(INTERNAL_ENVIRONMENT_PATTERN);
  });

  test('Maker package preparation includes the full troubleshooting guide', () => {
    const prepareScript = fs.readFileSync(path.resolve('scripts/prepare-maker-package.js'), 'utf8');

    expect(prepareScript).toContain("'docs/'");
    expect(prepareScript).toContain(
      "join(packageRoot, 'docs', 'MAKER_MCP_CONNECTION_TROUBLESHOOTING.md')"
    );
    expect(prepareScript).toContain(
      "join(projectRoot, 'docs', 'MAKER_MCP_CONNECTION_TROUBLESHOOTING.md')"
    );
    expect(prepareScript).toContain(
      'Full connection and tool-call troubleshooting guide: `docs/MAKER_MCP_CONNECTION_TROUBLESHOOTING.md`.'
    );
  });
});
