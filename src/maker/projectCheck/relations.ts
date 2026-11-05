import path from 'node:path';
import type { AssetReference } from './assets.js';

const REGISTRY = '.maker/assets/generated-assets.json';
const CANVAS = /^\.maker\/canvases\/([a-f0-9-]{36})\.json$/i;
function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Read only explicit managed fields; prompts, task responses and historical snapshots are not uses. */
export function collectAssetRelations(
  root: string,
  texts: Array<{ path: string; text: string }>,
  assets: Set<string>,
  add: (asset: string, reference: AssetReference) => void,
  warn: (message: string) => void
) {
  const tasks = new Map<string, Set<string>>();
  const attempts = new Map<string, Record<string, unknown>>();
  for (const source of texts) {
    const match = /^\.maker\/canvases\/attempts\/([a-f0-9-]{36})\.json$/i.exec(source.path);
    if (!match) continue;
    try {
      const attempt = record(JSON.parse(source.text));
      if (attempt?.id === match[1] && attempt.status === 'succeeded')
        attempts.set(match[1], attempt);
    } catch {
      warn('部分画布任务记录无法读取，来源关联不完整');
    }
  }
  const target = (value: unknown): string | undefined => {
    if (typeof value !== 'string') return;
    const relative = path.isAbsolute(value) ? path.relative(root, value) : value;
    const normalized = relative.split(path.sep).join('/');
    return assets.has(normalized) ? normalized : undefined;
  };
  const registry = texts.find((source) => source.path === REGISTRY);
  if (registry) {
    try {
      const entries = record(JSON.parse(registry.text));
      if (!entries) throw new Error('Invalid registry');
      for (const [key, value] of Object.entries(entries)) {
        const entry = record(value);
        if (!entry) continue;
        const resolved = new Set([
          target(key),
          target(entry.localPath),
          target(entry.absolutePath),
        ]);
        resolved.delete(undefined);
        if (resolved.size > 1) {
          warn('生成素材注册表存在路径不一致的记录，未建立来源关联');
          continue;
        }
        for (const asset of resolved) {
          if (!asset) continue;
          add(asset, { path: REGISTRY, line: 1, kind: 'registry' });
          if (typeof entry.taskId === 'string' && entry.taskId) {
            const members = tasks.get(entry.taskId) ?? new Set<string>();
            members.add(asset);
            tasks.set(entry.taskId, members);
          }
        }
      }
    } catch {
      warn('生成素材注册表格式无效，来源关联未完成');
    }
  }
  for (const source of texts) {
    const match = CANVAS.exec(source.path);
    if (!match) continue;
    try {
      const document = record(JSON.parse(source.text));
      if (!document || document.id !== match[1] || !Array.isArray(document.nodes))
        throw new Error('Invalid canvas');
      for (const value of document.nodes) {
        const node = record(value);
        if (!node || typeof node.id !== 'string') continue;
        const reference = {
          path: source.path,
          line: 1,
          kind: 'canvas' as const,
          canvasId: match[1],
          nodeId: node.id,
          title: [document.title, node.title]
            .filter((v) => typeof v === 'string')
            .join(' / ')
            .slice(0, 240),
        };
        const asset = target(node.assetPath);
        if (asset) add(asset, { ...reference, relation: 'uses' });
        const generation = record(node.generation);
        const attempt =
          typeof generation?.attemptId === 'string'
            ? attempts.get(generation.attemptId)
            : undefined;
        if (attempt?.canvasId === match[1] && attempt.targetNodeId === node.id) {
          const delivered = target(attempt.deliveredAssetPath);
          if (delivered) {
            const cachePath =
              typeof node.assetPath === 'string' &&
              node.assetPath.startsWith('.maker/canvases/') &&
              node.assetPath === attempt.resultAssetPath
                ? node.assetPath
                : undefined;
            add(delivered, {
              ...reference,
              relation: 'origin',
              ...(cachePath ? { cachePath } : {}),
            });
          }
        }
        if (typeof generation?.taskId === 'string')
          for (const origin of tasks.get(generation.taskId) ?? [])
            add(origin, { ...reference, relation: 'origin' });
      }
    } catch {
      warn(source.path + '：画布关联无法完整读取');
    }
  }
}
