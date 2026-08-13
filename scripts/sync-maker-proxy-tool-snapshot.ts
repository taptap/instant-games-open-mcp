import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { format } from 'prettier';
import remoteProxyManagerModule from '../src/maker/server/remoteProxyManager.js';
import mcpModule from '../src/maker/server/mcp.js';
import remoteProxyToolContractModule, {
  type RemoteProxyToolSnapshot,
} from '../src/maker/server/remoteProxyToolContract.js';
import toolDescriptionsModule from '../src/maker/server/toolDescriptions.js';

const { createMakerRemoteProxyManager } = remoteProxyManagerModule;
const { createRemoteProxyContext, MAKER_REMOTE_PROXY_EXPOSED_TOOL_NAMES } = mcpModule;
const { buildRemoteProxyToolSnapshot, findRemoteProxyToolSchemaDrift } =
  remoteProxyToolContractModule;
const { getMakerRemoteProxyPublicDescriptionOverride } = toolDescriptionsModule;

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDir, '..');
const snapshotPath = path.join(
  repositoryRoot,
  'src',
  'maker',
  'server',
  'remoteProxyToolSnapshot.json'
);

const args = process.argv.slice(2);
const targetDir = readOption(args, '--target-dir');
const write = args.includes('--write');

if (!targetDir) {
  throw new Error(
    'Missing --target-dir. Pass one bound Maker project so the script can read the live remote tools/list contract.'
  );
}

const manager = createMakerRemoteProxyManager();
try {
  const context = createRemoteProxyContext({
    targetDir,
    exposedTools: MAKER_REMOTE_PROXY_EXPOSED_TOOL_NAMES,
  });
  const remoteTools = await manager.listTools(context);

  if (write) {
    const snapshot = buildRemoteProxyToolSnapshot({
      remoteTools,
      exposedToolNames: MAKER_REMOTE_PROXY_EXPOSED_TOOL_NAMES,
      getPublicDescription: getMakerRemoteProxyPublicDescriptionOverride,
    });
    const formattedSnapshot = await format(JSON.stringify(snapshot), { parser: 'json' });
    fs.writeFileSync(snapshotPath, formattedSnapshot, 'utf8');
    console.log(`Updated ${path.relative(repositoryRoot, snapshotPath)} from live tools/list.`);
  } else {
    const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8')) as RemoteProxyToolSnapshot;
    const drift = findRemoteProxyToolSchemaDrift({
      remoteTools,
      exposedToolNames: MAKER_REMOTE_PROXY_EXPOSED_TOOL_NAMES,
      snapshot,
    });
    if (drift.length > 0) {
      console.error('Maker remote proxy tool schema drift detected:');
      for (const item of drift) {
        console.error(`- ${item.path}`);
      }
      console.error('Run the same command with --write, review the diff, then rerun --check.');
      process.exitCode = 1;
    } else {
      console.log('Maker remote proxy tool snapshot matches the live remote schema.');
    }
  }
} finally {
  await manager.closeAll();
}

function readOption(values: string[], name: string): string | undefined {
  const index = values.indexOf(name);
  return index >= 0 ? values[index + 1] : undefined;
}
