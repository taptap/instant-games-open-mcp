#!/usr/bin/env node

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const pluginRoot = process.env.CODEBUDDY_PLUGIN_ROOT || path.resolve(__dirname, '..');
const bundlePath = path.join(pluginRoot, 'dist', 'maker.js');

function writeHookOutput(additionalContext) {
  const hookSpecificOutput = additionalContext ? { additionalContext } : {};
  process.stdout.write(`${JSON.stringify({ hookSpecificOutput })}\n`);
}

function inspectLegacyMakerMcp() {
  const result = spawnSync(
    process.execPath,
    [bundlePath, 'plugin', 'inspect', '--client', 'workbuddy', '--json'],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        TAPTAP_MAKER_DISTRIBUTION: 'workbuddy_plugin',
        TAPTAP_MCP_CLIENT_IDE: 'workbuddy',
      },
    }
  );
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `inspect exited with status ${String(result.status)}`);
  }
  return JSON.parse(result.stdout.trim());
}

try {
  const inspection = inspectLegacyMakerMcp();
  if (inspection.status === 'active') {
    writeHookOutput(
      'TapTap Maker 插件检测到旧的独立 Maker MCP 仍处于启用状态。继续 Maker 工作前，必须向用户说明两套 Maker MCP 会造成重复工具和双 runtime 冲突，并询问是否禁用旧 MCP。只有得到用户明确确认后，才执行插件内 CLI 的 plugin migrate --client workbuddy --confirm --json；未确认时不得修改配置。'
    );
  } else if (inspection.status === 'ambiguous') {
    writeHookOutput(
      `TapTap Maker 插件在多个 WorkBuddy 配置中检测到仍启用的独立 Maker MCP：${inspection.config_paths.join(', ')}。继续 Maker 工作前必须告知用户存在重复注册；不要自动选择或修改配置，应请用户先明确保留哪一个旧注册。`
    );
  } else {
    writeHookOutput();
  }
} catch (error) {
  writeHookOutput(
    `TapTap Maker 插件未能完成旧 MCP 冲突检查：${error instanceof Error ? error.message : String(error)}。开始 Maker 工作前应加载 taptap-maker-plugin-lifecycle Skill 并执行只读检查，不要假设旧 MCP 已禁用。`
  );
}
