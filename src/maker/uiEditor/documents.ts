import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { ConsoleError } from '../console/types.js';
import { readUiEditorAsset } from './assets.js';
import {
  createUiFile,
  MAX_UI_JSON,
  readUiFile,
  resolveUiFile,
  saveUiFile,
  validateNewUiFile,
} from './projectFiles.js';

export type UiNode = { type: string; id?: string; children?: UiNode[]; [key: string]: unknown };
export type UiSelector = { id?: string; pointer?: string };
export type UiDiagnostic = {
  code: string;
  severity: 'error' | 'warning';
  file: string;
  pointer: string;
  message: string;
};
export type UiCheck = {
  version: number;
  nodes: number;
  errors: number;
  warnings: number;
  diagnostics: UiDiagnostic[];
  skipped: string[];
};
type Checker = {
  nanoOps: Record<string, string>;
  checkDocument(input: {
    file: string;
    tree: unknown;
    resourceExists: (ref: string) => boolean;
  }): UiCheck;
};
let checker: Checker | undefined;

export function nanoVGOperations(): Record<string, string> {
  return sharedChecker().nanoOps;
}

function sharedChecker(): Checker {
  if (!checker) {
    const source = readUiEditorAsset('skills/lua-ui-to-json/scripts/ui-json-check.js');
    if (!source)
      throw new ConsoleError('当前分发缺少 UI 共享检查器，请重新构建或安装完整 Maker 包。', 500);
    const module = { exports: {} as Checker };
    // Only the bundled checker is evaluated; document content remains plain JSON data.
    runInNewContext(source.toString('utf8'), { module }, { timeout: 1000 });
    checker = module.exports;
  }
  return checker;
}

export function uiRevision(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ConsoleError(label + ' 必须是 JSON 对象。');
  return value as Record<string, unknown>;
}

function nodeIndex(tree: UiNode) {
  const nodes: { node: UiNode; parent?: UiNode; pointer: string }[] = [];
  function visit(value: unknown, parent: UiNode | undefined, pointer: string, depth: number) {
    const node = object(value, pointer || '根节点') as UiNode;
    if (nodes.length >= 10000 || depth > 128) throw new ConsoleError('UI 节点数量或层级超限。');
    if (node.children !== undefined && !Array.isArray(node.children))
      throw new ConsoleError('children 必须是数组。');
    nodes.push({ node, parent, pointer });
    (node.children || []).forEach((child, i) =>
      visit(child, node, pointer + '/children/' + i, depth + 1)
    );
  }
  visit(tree, undefined, '', 0);
  return nodes;
}

export function selectUiNode(tree: UiNode, selector: UiSelector) {
  if (selector.id !== undefined && selector.pointer !== undefined)
    throw new ConsoleError('id 与 pointer 不能同时指定。');
  if (selector.id !== undefined && (typeof selector.id !== 'string' || !selector.id.trim()))
    throw new ConsoleError('id 必须是非空字符串。');
  if (
    selector.pointer !== undefined &&
    (typeof selector.pointer !== 'string' ||
      !/^(?:\/children\/(?:0|[1-9][0-9]*))*$/.test(selector.pointer))
  )
    throw new ConsoleError('pointer 仅支持根节点空字符串或 /children/N 路径。');
  const matches = nodeIndex(tree).filter((entry) =>
    selector.id !== undefined
      ? entry.node.id === selector.id
      : entry.pointer === (selector.pointer ?? '')
  );
  if (matches.length !== 1)
    throw new ConsoleError(
      matches.length ? '节点 id 不唯一，请使用 pointer。' : '找不到目标节点。',
      409
    );
  return matches[0];
}

export async function inspectUiDocument(root: string, file: string, selector: UiSelector = {}) {
  if (!file.endsWith('.ui.json')) throw new ConsoleError('请指定 assets 内的 .ui.json 文档。');
  const text = (await readUiFile(root, file)).toString('utf8');
  const tree = object(JSON.parse(text), 'UI 文档') as UiNode;
  const selected = selectUiNode(tree, selector);
  return {
    file,
    source: 'saved' as const,
    revision: uiRevision(text),
    text,
    tree,
    selected: { pointer: selected.pointer, node: selected.node },
  };
}

export async function checkUiDocument(root: string, file: string, tree: unknown): Promise<UiCheck> {
  const api = sharedChecker(),
    refs = new Set<string>();
  api.checkDocument({
    file,
    tree,
    resourceExists: (ref) => {
      refs.add(ref);
      return true;
    },
  });
  const existing = new Set<string>();
  for (const ref of refs) {
    try {
      await resolveUiFile(root, ref.startsWith('assets/') ? ref : 'assets/' + ref);
      existing.add(ref);
    } catch {
      /* The shared checker emits diagnostics for unreadable references. */
    }
  }
  return api.checkDocument({ file, tree, resourceExists: (ref) => existing.has(ref) });
}

function allowedKeys(value: Record<string, unknown>, keys: string[]) {
  const extra = Object.keys(value).filter((key) => !keys.includes(key));
  if (extra.length) throw new ConsoleError('不支持的操作字段：' + extra.join(', '));
}

function property(key: string) {
  if (['children', '__proto__', 'constructor', 'prototype'].includes(key) || key.startsWith('_'))
    throw new ConsoleError('不能直接修改内部字段或 children；层级修改请使用 add/remove/move。');
}

function insert(parent: UiNode, node: UiNode, index: unknown) {
  const children = parent.children ?? [];
  const at = index === undefined ? children.length : index;
  if (typeof at !== 'number' || !Number.isInteger(at) || at < 0 || at > children.length)
    throw new ConsoleError('index 必须在目标 children 数组范围内；移动时按移除后的顺序计数。');
  children.splice(at, 0, node);
  parent.children = children;
}

/** Apply a batch to a copy. Nothing is written until all operations and checks succeed. */
export function applyUiOperations(tree: UiNode, input: unknown): UiNode {
  const request = object(input, 'patch');
  allowedKeys(request, ['operations']);
  if (
    !Array.isArray(request.operations) ||
    !request.operations.length ||
    request.operations.length > 100
  )
    throw new ConsoleError('operations 必须包含 1～100 个操作。');
  const result = JSON.parse(JSON.stringify(tree)) as UiNode;
  for (const raw of request.operations) {
    const operation = object(raw, 'operation');
    const selector = { id: operation.id, pointer: operation.pointer } as UiSelector;
    const parentSelector = {
      id: operation.parentId,
      pointer: operation.parentPointer,
    } as UiSelector;
    if (operation.op === 'set') {
      allowedKeys(operation, ['op', 'id', 'pointer', 'props', 'unset']);
      const { node } = selectUiNode(result, selector);
      if (operation.props === undefined && operation.unset === undefined)
        throw new ConsoleError('set 需要 props 或 unset。');
      const props = operation.props === undefined ? {} : object(operation.props, 'props');
      for (const [key, value] of Object.entries(props)) {
        property(key);
        node[key] = value;
      }
      if (operation.unset !== undefined) {
        if (
          !Array.isArray(operation.unset) ||
          operation.unset.some((key) => typeof key !== 'string')
        )
          throw new ConsoleError('unset 必须是属性名数组。');
        for (const key of operation.unset as string[]) {
          property(key);
          delete node[key];
        }
      }
    } else if (operation.op === 'add') {
      allowedKeys(operation, ['op', 'parentId', 'parentPointer', 'index', 'node']);
      const parent = selectUiNode(result, parentSelector).node;
      const node = JSON.parse(JSON.stringify(object(operation.node, 'node'))) as UiNode;
      insert(parent, node, operation.index);
    } else if (operation.op === 'remove' || operation.op === 'move') {
      allowedKeys(
        operation,
        operation.op === 'remove'
          ? ['op', 'id', 'pointer']
          : ['op', 'id', 'pointer', 'parentId', 'parentPointer', 'index']
      );
      const entry = selectUiNode(result, selector);
      if (!entry.parent) throw new ConsoleError('不能删除或移动根节点。');
      const parent =
        operation.op === 'move' ? selectUiNode(result, parentSelector).node : undefined;
      if (parent && nodeIndex(entry.node).some((item) => item.node === parent))
        throw new ConsoleError('不能将节点移动到自身或其后代。');
      entry.parent.children!.splice(entry.parent.children!.indexOf(entry.node), 1);
      if (parent) insert(parent, entry.node, operation.index);
    } else throw new ConsoleError('未知节点操作；使用 set/add/remove/move。');
    nodeIndex(result);
  }
  return result;
}

function serialize(tree: unknown): string {
  const content = JSON.stringify(tree, null, 2) + '\n';
  if (Buffer.byteLength(content) > MAX_UI_JSON) throw new ConsoleError('UI 文档超过 8 MiB。', 413);
  return content;
}

export async function patchUiDocument(
  root: string,
  file: string,
  revision: string,
  input: unknown,
  dryRun = false
) {
  if (!/^[a-f0-9]{64}$/.test(revision))
    throw new ConsoleError('patch 需要 inspect 返回的 --revision。');
  const original = await inspectUiDocument(root, file);
  if (original.revision !== revision)
    throw new ConsoleError('UI 文档版本已变化，未修改。请重新 inspect 后合并操作。', 409);
  const tree = applyUiOperations(original.tree, input);
  const content = serialize(tree);
  const check = await checkUiDocument(root, file, tree);
  const changed = JSON.stringify(tree) !== JSON.stringify(original.tree);
  if (check.errors)
    return { ok: false, file, source: 'saved', revision, dryRun, written: false, check };
  if (!dryRun && changed)
    await saveUiFile(root, { path: file, content, expectedText: original.text });
  return {
    ok: true,
    file,
    source: 'saved',
    revision: !dryRun && changed ? uiRevision(content) : revision,
    dryRun,
    changed,
    written: !dryRun && changed,
    check,
    ...(dryRun ? { tree } : {}),
  };
}

export async function createUiDocument(root: string, file: string, input: unknown, dryRun = false) {
  await validateNewUiFile(root, file);
  const tree = object(input, 'UI 文档') as UiNode;
  nodeIndex(tree);
  const content = serialize(tree);
  const check = await checkUiDocument(root, file, tree);
  if (check.errors) return { ok: false, file, dryRun, written: false, check };
  if (!dryRun) await createUiFile(root, file, content);
  return {
    ok: true,
    file,
    source: 'saved',
    dryRun,
    written: !dryRun,
    revision: dryRun ? null : uiRevision(content),
    check,
  };
}
