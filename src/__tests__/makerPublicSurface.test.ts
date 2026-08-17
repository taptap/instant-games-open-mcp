/**
 * Maker-only public documentation regression tests.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { formatMakerSkillStatus } from '../maker/cli/skill';

const INTERNAL_ENVIRONMENT_PATTERN = /\brnd\b|xdrnd|TAPTAP_MCP_ENV|--env/iu;

describe('Maker public documentation', () => {
  test('Codex plugin lifecycle skill defines safe migration and plugin-native initialization', () => {
    const skillPath = path.resolve('skills/taptap-maker-plugin-lifecycle/SKILL.md');
    expect(fs.existsSync(skillPath)).toBe(true);
    const skill = fs.readFileSync(skillPath, 'utf8');

    for (const expected of [
      'taptap-maker plugin inspect --client codex --json',
      'taptap-maker plugin migrate --client codex --confirm --json',
      'taptap-maker plugin restore --client codex --confirm --json',
      '--skip-mcp-install',
      'enabled = false',
      '${PLUGIN_ROOT}',
    ]) {
      expect(skill).toContain(expected);
    }
    expect(skill).toContain('Do not delete');
    expect(skill).toContain('explicit confirmation');
  });

  test('Maker skill status exposes plugin lifecycle guidance only in Codex plugin mode', () => {
    const previousDistribution = process.env.TAPTAP_MAKER_DISTRIBUTION;
    try {
      delete process.env.TAPTAP_MAKER_DISTRIBUTION;
      expect(formatMakerSkillStatus()).not.toContain('taptap-maker-plugin-lifecycle');

      process.env.TAPTAP_MAKER_DISTRIBUTION = 'codex_plugin';
      const pluginStatus = formatMakerSkillStatus();
      expect(pluginStatus).toContain('taptap-maker-plugin-lifecycle');
      expect(pluginStatus).toContain('taptap-maker init --skip-mcp-install');
      expect(pluginStatus).toContain('Update the installed Codex plugin');
    } finally {
      if (previousDistribution === undefined) {
        delete process.env.TAPTAP_MAKER_DISTRIBUTION;
      } else {
        process.env.TAPTAP_MAKER_DISTRIBUTION = previousDistribution;
      }
    }
  });

  test('Maker package preparation script remains valid JavaScript', () => {
    const scriptPath = path.resolve('scripts/prepare-maker-package.js');
    const result = spawnSync(process.execPath, ['--check', scriptPath], {
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
  });

  test('documents consent-gated non-MCP issue reporting and non-blocking fallback', () => {
    for (const file of [
      'AGENTS.md',
      'README.md',
      'docs/MAKER.md',
      'docs/MAKER_MCP_CONNECTION_TROUBLESHOOTING.md',
    ]) {
      const text = fs.readFileSync(path.resolve(file), 'utf8');
      expect(text).toContain('@taptap/maker@<exact-version>');
      expect(text).toMatch(/(?:原样|优先).*当前客户端|active client/iu);
      expect(text).toContain('--context-stdin');
      expect(text).toContain('--consent');
      expect(text).toContain('manual_required');
    }

    const prepareScript = fs.readFileSync(path.resolve('scripts/prepare-maker-package.js'), 'utf8');
    expect(prepareScript).toContain(
      'npx -y --package @taptap/maker@${version} taptap-maker mcp report'
    );
    expect(prepareScript).toContain("'@taptap/maker@<exact-version>'");
    expect(prepareScript).toContain(
      "rewriteExactMakerVersion(join(packageRoot, 'dist', 'maker.js'), version)"
    );
    expect(prepareScript).toContain('user consent');
    expect(prepareScript).toContain('manual_required');
  });

  test('documents the QR orientation gate and test whitelist proxy workflow', () => {
    for (const file of ['AGENTS.md', 'README.md', 'docs/MAKER.md']) {
      const text = fs.readFileSync(path.resolve(file), 'utf8');
      expect(text).toContain('add_test_whitelist');
      expect(text).toContain('confirmed_screen_orientation');
      expect(text).toContain('只有');
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
      'taptap-maker mcp verify --json',
      'stable self runtime',
      'npm_environment_error',
      'evaluated_target_dir',
      'project_context_source',
      'launcher_kind、command、stage、tools、stderr、error 和',
      '`initialize` 和 `tools/list`',
      '不会读取',
      '客户端实际生效的配置',
      '按证据分类根因',
      '仅在证据确认实际配置项损坏时',
      '不要把项目路径写入用户级 MCP 配置',
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
      'taptap-maker mcp verify --json',
      'same stable launcher as MCP install',
      'completes MCP initialize and tools/list',
      "does not read the client's active config",
      'client config caching, or Roots',
      'First identify the active AI client from reliable evidence',
      'Only when the active client is confirmed to be WorkBuddy',
      "Never use one client's configuration or trust state to diagnose another client",
      "`doctor` does not inspect the active AI client's loaded tools or configuration",
      'config path, command, ordered args, cwd',
      'Classify the root cause from evidence before repairing it',
      'only after evidence confirms that the active config entry is damaged',
      'Do not automatically change trust storage, PATH, cwd, credentials',
      'User-level MCP config must not contain a project cwd',
      'Do not assume Windows 8.3 short paths exist or differ from the original long path',
      'Separate outer shell quoting or stderr decoding failures from the MCP child process result',
      'If the MCP connection is established but a tool or resource call fails, including `-32003`',
      '`mcp verify` is not the primary check for an already connected session',
      'complete sanitized `remote_result`',
      'failed tool/resource, redacted request parameters, current `tools/list`',
      'absolute Node plus the versioned self runtime',
      "reuse that config's absolute command and ordered args",
    ]) {
      expect(normalizedSkill).toContain(expected);
    }
    expect(skill).not.toMatch(INTERNAL_ENVIRONMENT_PATTERN);
    expect(normalizedSkill).not.toContain('keep `cmd.exe`, `npx.cmd`');
  });

  test('bundled update skill never persists a Maker project in user-level MCP config', () => {
    const skill = fs.readFileSync(path.resolve('skills/update-taptap-mcp/SKILL.md'), 'utf8');

    expect(skill).toContain('never contains a project `cwd`');
    expect(skill).toContain('only selects the project whose managed `AGENTS.md` policy is updated');
    expect(skill).toContain('@taptap/maker@<TARGET_VERSION>');
    expect(skill).toContain('stable self runtime');
    expect(skill).toContain('`--launcher npx`');
    expect(skill).not.toContain('Refreshes AI client MCP config to launch `npx');
    expect(skill).not.toContain('Pins `cwd`');
    expect(skill).not.toContain('wrong `cwd`');
  });

  test('technical docs keep project-local service selection out of user-level MCP config', () => {
    for (const file of ['AGENTS.md', 'docs/MAKER.md']) {
      const text = fs.readFileSync(path.resolve(file), 'utf8');
      expect(text).toContain('项目级本地研发服务选择只在调用时解析');
      expect(text).toContain('不会提升为用户级 MCP 启动环境');
    }
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
    expect(prepareScript).toContain('never stores a project \\`cwd\\`');
    expect(prepareScript).toContain('selects the project whose managed \\`AGENTS.md\\` policy');
    expect(prepareScript).toContain('pass \\`target_dir\\` on each');
    expect(prepareScript).toContain('concrete Maker tool call');
  });

  test('Maker overview reports Windows verification without claiming an unrun real-machine test', () => {
    const overview = fs.readFileSync(
      path.resolve('docs/MAKER_CLI_MCP_SKILL_REWORK_OVERVIEW.md'),
      'utf8'
    );

    expect(overview).not.toContain('- Windows 自测流程通过。');
    expect(overview).toContain('Windows 路径与启动器自动化测试通过');
    expect(overview).toContain('Windows 真机验收尚未执行');
  });

  test('Maker proxy acceptance guide keeps each pass criterion once', () => {
    const guide = fs.readFileSync(
      path.resolve('docs/MAKER_PROXY_TOOLS_FIX_AND_E2E_TEST.md'),
      'utf8'
    );

    expect(guide.match(/- 项目状态为 `bound`。/gu)).toHaveLength(1);
  });
});
