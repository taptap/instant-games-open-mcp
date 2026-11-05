import { collectProjectCheck, publishProjectCheck } from './store.js';
type Collected = Awaited<ReturnType<typeof collectProjectCheck>>;
const MAX_MODULES = 48;
const running = new Map<string, ReturnType<typeof publishProjectCheck>>();
function groupOf(file: string): string {
  const parts = file.split('/');
  if (parts.length === 1) return '';
  if (parts[0] === 'scripts') return parts.length === 2 ? 'scripts' : 'scripts/' + parts[1];
  return parts[0];
}
function titleOf(group: string): string {
  if (!group) return '项目根目录';
  return group === 'scripts' ? 'scripts 根目录' : group.replace(/^scripts\//, '');
}
/** Baseline report from collected facts only: directory grouping, no source semantics, no model call. */
export function buildAutoAnalysis(collected: Collected) {
  const files = collected.facts.architecture.files.map((file) => file.path);
  const byGroup = new Map<string, string[]>();
  for (const file of files) {
    const key = groupOf(file);
    byGroup.set(key, [...(byGroup.get(key) ?? []), file]);
  }
  const sorted = [...byGroup.entries()].sort((a, b) => b[1].length - a[1].length);
  const kept = sorted.slice(0, MAX_MODULES);
  if (sorted.length > MAX_MODULES) {
    kept.splice(MAX_MODULES - 1);
    kept.push(['', sorted.slice(MAX_MODULES - 1).flatMap(([, list]) => list)]);
  }
  const modules = kept.map(([group, list], index) => ({
    id: 'g' + index,
    title: sorted.length > MAX_MODULES && index === MAX_MODULES - 1 ? '其他目录' : titleOf(group),
    description: (group || '项目根目录等') + ' 目录下的脚本，按目录自动分组',
    files: list,
  }));
  return {
    schema: 1,
    auto: true,
    factsRevision: collected.factsRevision,
    resultRevision: collected.resultRevision,
    summary:
      '自动检查：' +
      files.length +
      ' 个 Lua 脚本，' +
      collected.facts.assets.assets.length +
      ' 个素材文件。',
    insight:
      '这是自动检查结果：模块按目录划分，连线来自字面量 require，没有阅读源码语义。让 AI 更新可获得每个模块的职责说明。',
    modules,
    guide: [],
    flow: null,
    findings: [],
    limitations: [
      '自动检查只统计文件、静态引用和素材事实，模块按目录划分，没有阅读源码语义。',
      '“引用待核对”只是静态线索，动态加载、预加载和目录加载需要 AI 复核，不代表可以删除。',
      ...(files.length ? [] : ['未发现可分析的 Lua 脚本。']),
    ],
  };
}
/** Collect facts and publish the baseline report. Concurrent calls for one project share one run. */
export function runAutoProjectCheck(targetDir: string, resultRevision: string) {
  const current = running.get(targetDir);
  if (current) return current;
  const run = collectProjectCheck(targetDir)
    .then((collected) =>
      publishProjectCheck(targetDir, {
        ...buildAutoAnalysis(collected),
        resultRevision,
      })
    )
    .finally(() => running.delete(targetDir));
  running.set(targetDir, run);
  return run;
}
