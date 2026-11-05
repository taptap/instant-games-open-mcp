import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const skillRoot = fileURLToPath(new URL('../', import.meta.url));
// Include validation and shared publication changes, not only the vendor path.
const primaryPaths = [
  'taptap-maker',
  '.tests/taptap-maker.test.mjs',
  '.tests/taptap-maker-upgrade.test.mjs',
  '.tests/taptap-maker-local-validation.test.mjs',
  '.github/maker-runtime',
  '.github/scripts/sync-maker-runtime.mjs',
  'docs/taptap-maker-maintenance.md',
  'docs/taptap-maker-maintenance.zh-CN.md',
];
const sharedPaths = [
  'README.md', 'README.zh-CN.md', 'provisioning.json', '.github',
  '.tests/plugin-contract.test.mjs', '.tests/localization.test.mjs',
  '.tests/provisioning.test.mjs', '.tests/publish-workflows.test.mjs',
];

function git(root, args) {
  return execFileSync('git', args, {
    cwd: root, encoding: 'utf8', windowsHide: true,
    maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function commits(output) {
  return output.split(/\r?\n/).filter(Boolean).map(line => {
    const [hash, ...subject] = line.split(' ');
    return { hash, subject: subject.join(' ') };
  });
}

export function findUnrecorded(entries, ledger) {
  const recorded = new Set(ledger.match(/\b[a-f0-9]{40}\b/g) || []);
  return entries.filter(entry => !recorded.has(entry.hash));
}

export function collectHistory(root) {
  if (!existsSync(path.join(root, 'taptap-maker/ghost.json')) ||
      !existsSync(path.join(root, '.github/scripts/sync-maker-runtime.mjs'))) {
    throw new Error('目标目录不是包含 Maker 插件及同步器的 Cindy 插件仓库');
  }
  const common = ['log', '--all', '--full-history', '--reverse', '--format=%H %s'];
  const ordinary = commits(git(root, [...common, '--no-merges', '--', ...primaryPaths]));
  const merges = commits(git(root, [...common, '--merges', '--', ...primaryPaths]));
  const combined = merges.filter(entry => git(root, [
    'show', '--format=', '--cc', '--name-only', entry.hash, '--', ...primaryPaths,
  ]));
  const shared = commits(git(root, [
    ...common, '--no-merges', '-G', 'taptap-maker|maker-runtime', '--', ...sharedPaths,
  ]));
  return {
    head: git(root, ['rev-parse', 'HEAD']),
    shallow: git(root, ['rev-parse', '--is-shallow-repository']) === 'true',
    ordinary, combined, shared, merges,
  };
}

function parseArgs(argv) {
  let plugins;
  let ledger = path.join(skillRoot, 'sources/history.md');
  for (let i = 0; i < argv.length; i++) {
    if (!['--plugins', '--ledger'].includes(argv[i]) || !argv[i + 1] ||
        argv[i + 1].startsWith('--')) {
      throw new Error('用法：node check-history.mjs --plugins <插件仓根目录> [--ledger <历史台账>]');
    }
    const option = argv[i];
    const value = argv[++i];
    if (option === '--plugins') plugins = value;
    else ledger = value;
  }
  if (!plugins) throw new Error('必须用 --plugins 指定 Cindy 插件仓库，不能默认当前 Maker 仓库');
  return { plugins: path.resolve(plugins), ledger: path.resolve(ledger) };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const history = collectHistory(args.plugins);
  const ledger = readFileSync(args.ledger, 'utf8');
  const unrecordedPrimary = findUnrecorded([...history.ordinary, ...history.combined], ledger);
  const unrecordedSharedCandidates = findUnrecorded(history.shared, ledger);
  console.log(JSON.stringify({
    head: history.head, shallow: history.shallow,
    ordinaryCommits: history.ordinary.length, examinedMerges: history.merges.length,
    combinedDiffCommits: history.combined, unrecordedPrimary, unrecordedSharedCandidates,
    mergeReviewCandidates: history.merges, scope: primaryPaths,
    limitation: '只读本地可达 refs；需人工核对 refs 新鲜度、每父树合并差异、路径迁移及无 Maker 字样的共享变更。hash 已记录不证明 diff 已审查、保护已通过或已经发布。',
  }, null, 2));
  if (history.shallow || unrecordedPrimary.length || unrecordedSharedCandidates.length) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error('历史清单检查失败：' + (error.code || error.message) + '。请核对参数、Git 和插件仓库路径后重试。');
    process.exitCode = 1;
  }
}
