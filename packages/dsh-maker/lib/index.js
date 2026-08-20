/**
 * @taptap/dsh-maker — DeepSeek Harness plugin for TapTap Maker.
 *
 * Mounts, at activation:
 *   1. The Maker skills (a host-plane `skill-filesystem` instance, the DSH
 *      "repository plugin" pattern) — always available, read-only from this
 *      package's `skills/` directory, HMR-live.
 *   2. The Maker MCP server (`@deepseek-ai/dsh-mcp-client`) — launched via the
 *      bundled `@taptap/maker` package's `dist/maker.js`, with DSH-safe defaults
 *      (1h tool timeout, no project cwd, explicit env, graceful reconnect).
 *   3. A `DSH_TAPTAP_MAKER_BIN` shell-env fact (`ctx.shellEnv`) pointing at the
 *      bundled `@taptap/maker` CLI, so the agent can run one-time init / upgrade
 *      / report commands without guessing a path or hitting the network.
 *
 * `skills` / `tools` are resolved by the two child plugins themselves; this
 * plugin only declares `shellEnv` because it uses that service directly.
 */
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as mcpClient from '@deepseek-ai/dsh-mcp-client';
import * as skillFilesystem from '@deepseek-ai/dsh-skill-filesystem';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.dirname(__dirname);

export const name = 'taptap-maker';
export const inject = ['shellEnv'];

/** Default per-call timeout for Maker MCP tools (1h; Maker builds/assets exceed the 60s default). */
const DEFAULT_TOOL_CALL_TIMEOUT_MS = 3600000;

/**
 * Resolve the bundled `@taptap/maker` entries (MCP stdio + CLI) at runtime.
 *
 * `dsh plugin add` materializes `@taptap/maker` under the profile's
 * `node_modules` (pnpm), and Node resolves it from this plugin's location. This
 * never depends on the profile name, the pnpm layout, or a hand-written `npx`
 * command — `npx` cold-start can fail inside the DSH sandbox.
 */
function resolveMakerPaths() {
  const mcpEntry = require.resolve('@taptap/maker');
  const expectedSuffix = path.join('dist', 'maker.js');
  if (!mcpEntry || !mcpEntry.endsWith(expectedSuffix)) {
    throw new Error(
      `@taptap/dsh-maker: unexpected @taptap/maker entry "${mcpEntry}"; expected .../${expectedSuffix}`
    );
  }
  const packageRoot = path.dirname(path.dirname(mcpEntry));
  const cliEntry = path.join(packageRoot, 'bin', 'taptap-maker');
  if (!existsSync(cliEntry)) {
    throw new Error(`@taptap/dsh-maker: @taptap/maker CLI missing at "${cliEntry}"`);
  }
  return { mcpEntry, cliEntry };
}

/**
 * Normalize the plugin `config` surface. Only the `mcp` branch is meaningful;
 * the child mcp-client's own Config schema performs final validation and fills
 * any remaining defaults.
 */
function resolveMcpConfig(config) {
  const mcp = config && typeof config.mcp === 'object' ? config.mcp : {};
  return {
    serverName: mcp.serverName ?? 'taptap-maker',
    toolCallTimeoutMs: mcp.toolCallTimeoutMs ?? DEFAULT_TOOL_CALL_TIMEOUT_MS,
    // Keep the Maker MCP child lenient on startup: this plugin also mounts the
    // skills, and a transient Maker startup failure must neither dispose those
    // skills nor block DSH startup. The mcp-client still logs the failure and
    // keeps reconnecting, so a broken server is loud without being fatal.
    failOnStartupError: mcp.failOnStartupError ?? false,
    env: {
      TAPTAP_MCP_CLIENT_IDE: 'dsh',
      TAPTAP_MAKER_DISTRIBUTION: 'dsh_plugin',
      ...(mcp.env ?? {}),
    },
    cwd: mcp.cwd,
  };
}

export async function apply(ctx, config = {}) {
  const makerPaths = resolveMakerPaths();

  // 1. Skills — host-plane repository-plugin pattern. Isolated provider name and
  //    default-roots disabled so it only contributes this package's own guides,
  //    never double-scanning the project/user roots owned by the standard preset.
  ctx.plugin(skillFilesystem, {
    providerName: 'maker',
    includeDefaultRoots: false,
    bundledSkillDir: path.join(PACKAGE_ROOT, 'skills'),
  });

  // 2. CLI discoverability — expose the bundled `taptap-maker` CLI to the model
  //    shell so one-time init / upgrade / report commands work with zero network
  //    and zero path guessing. The profile's node_modules/.bin is not on the
  //    shell PATH, so this DSH shell-env fact is the reliable channel.
  ctx.shellEnv.register({
    name: 'taptap-maker',
    variables: {
      DSH_TAPTAP_MAKER_BIN: {
        description:
          'Absolute path to the bundled TapTap Maker CLI (bin/taptap-maker); run `node "$DSH_TAPTAP_MAKER_BIN" <subcommand>`.',
      },
    },
    resolve() {
      return { DSH_TAPTAP_MAKER_BIN: makerPaths.cliEntry };
    },
  });

  // 3. Maker MCP — self-contained stdio bridge over the bundled @taptap/maker.
  const mcp = resolveMcpConfig(config);
  await ctx.plugin(mcpClient, {
    transport: 'stdio',
    command: process.execPath,
    args: [makerPaths.mcpEntry],
    serverName: mcp.serverName,
    env: mcp.env,
    toolCallTimeoutMs: mcp.toolCallTimeoutMs,
    failOnStartupError: mcp.failOnStartupError,
    ...(mcp.cwd ? { cwd: mcp.cwd } : {}),
  });
}
