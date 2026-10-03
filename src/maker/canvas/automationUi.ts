import type { CanvasDocument, CanvasNode } from './model.js';
import {
  canvasAutomationSnapshot,
  prepareCanvasNodeUpdates,
  validateCanvasCommand,
  type CanvasCommand,
} from './automation.js';
import { invalidateCanvasDependents } from './templateWorkflow.js';
import { selectCanvasSnapshot } from './automationInfo.js';
import {
  applyCanvasReferences,
  prepareCanvasReferences,
  type CanvasReferencesInput,
} from './automationReferences.js';
import type { createCanvasGroupQueue } from './groupQueue.js';

export function createCanvasAutomationUi(options: {
  current(): CanvasDocument | null;
  blocked(): string | undefined;
  nodeStatus(id: string): unknown;
  nodeBlocked(id: string): boolean;
  remember(): void;
  changed(): void;
  render(): void;
  save(): Promise<boolean>;
  select(ids: string[]): void;
  selected(): string[];
  open(id: string): Promise<void>;
  create(title: string): Promise<void>;
  add(type: string): void;
  addDerived(type: 'sequence' | 'animation', sourceId: string): void;
  importAsset(input: Record<string, unknown>): Promise<void>;
  exportAsset(command: CanvasCommand, node: CanvasNode): Promise<unknown>;
  addTemplate(id: string): Promise<void>;
  deleteSelected(): void;
  duplicate(): void;
  group(): void;
  connect(from: string, to: string): void;
  resetDraft(id: string): void;
  run(id: string): Promise<boolean>;
  stop(id: string): void;
  canStop(id: string): boolean;
  query(id: string): Promise<void>;
  error(): string;
  clearError(): void;
  busyChanged(busy: boolean): void;
  queue: ReturnType<typeof createCanvasGroupQueue>;
}) {
  let editing = false;
  let running = false;
  document.addEventListener(
    'keydown',
    (event) => {
      if (!editing) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    true
  );
  function snapshot() {
    const current = options.current();
    return current
      ? JSON.parse(
          JSON.stringify({
            source: 'live',
            capturedAt: new Date().toISOString(),
            ...canvasAutomationSnapshot(current),
            blocked: options.blocked() || null,
            nodes: current.nodes.map((node) => ({ ...node, state: options.nodeStatus(node.id) })),
            queues: current.nodes
              .filter((node) => node.type === 'section')
              .map((node) => options.queue.view(node.id))
              .filter(Boolean),
          })
        )
      : null;
  }
  function ids(input: Record<string, unknown>, current: CanvasDocument): string[] {
    if (
      !Array.isArray(input.ids) ||
      !input.ids.length ||
      input.ids.length > 400 ||
      input.ids.some(
        (id) => typeof id !== 'string' || !current.nodes.some((node) => node.id === id)
      )
    )
      throw new Error('ids 必须是当前画布中存在的卡片 ID。');
    return [...new Set(input.ids)] as string[];
  }
  function node(id: unknown, current: CanvasDocument): CanvasNode {
    const result = current.nodes.find((node) => node.id === id);
    if (!result) throw new Error('卡片或分组不存在。');
    return result;
  }
  async function execute(value: CanvasCommand): Promise<unknown> {
    const command = validateCanvasCommand(value);
    const current = options.current();
    if (!current || command.canvasId !== current.id)
      throw new Error('当前画布已变化，请重新 inspect。');
    const input = command.input;
    const fields: Record<string, string[]> = {
      inspect: ['id'],
      create: ['title'],
      open: ['id'],
      rename: ['title'],
      'add-template': ['id'],
      'add-node': ['type', 'sourceId'],
      'update-nodes': ['nodes'],
      'delete-nodes': ['ids'],
      duplicate: ['ids'],
      group: ['ids'],
      connect: ['from', 'to'],
      disconnect: ['edgeId'],
      run: ['id'],
      stop: ['id'],
      query: ['id'],
      import: ['assetPath', 'kind', 'title'],
      export: ['id', 'format', 'loop'],
      'set-references': ['id', 'sourceIds', 'includeSelf'],
    };
    for (const key of Object.keys(input))
      if (!fields[command.action].includes(key)) throw new Error('不支持的 input 字段：' + key);
    if (command.action === 'inspect') {
      if (input.id !== undefined && typeof input.id !== 'string')
        throw new Error('id 必须是卡片或分组标识。');
      return selectCanvasSnapshot(snapshot(), input.id as string | undefined);
    }
    if (command.action === 'stop') {
      const target = node(input.id, current);
      if (target.type === 'section') options.queue.stop(target.id);
      else if (options.canStop(target.id)) options.stop(target.id);
      else throw new Error('此卡片当前没有可停止的本地视频等待。');
      return { requested: true, remoteCanceled: false, snapshot: snapshot() };
    }
    if (editing || running) throw new Error('AI 操作执行中，请等待原操作完成。');
    const blocked = options.blocked();
    if (blocked) throw new Error(blocked);
    if (command.action !== 'query' && command.revision !== current.revision)
      throw new Error('revision 已过期，请重新 inspect，不会覆盖人工修改。');
    options.clearError();
    if (command.action === 'run' || command.action === 'query') {
      const target = node(input.id, current);
      if (
        command.action === 'run' &&
        command.allowPaid !== true &&
        (target.type === 'section' || ['image', 'video', 'video-source'].includes(target.type))
      )
        throw new Error('生成可能消耗积分。取得用户授权后显式传入 --allow-paid。');
      running = true;
      options.busyChanged(true);
      try {
        if (command.action === 'query') await options.query(target.id);
        else if (target.type === 'section') {
          options.queue.start(target.id, true);
          if (options.error()) throw new Error(options.error());
          if (!options.queue.view(target.id)) throw new Error(options.error() || '队列未启动。');
          for (;;) {
            if (options.current() !== current) throw new Error('画布已切换，原队列状态待确认。');
            const state = options.queue.view(target.id);
            if (!state) throw new Error('队列已离开，状态待确认。');
            if (state.phase === 'complete') break;
            if (state.phase === 'paused') throw new Error(state.message);
            await new Promise((resolve) => setTimeout(resolve, 250));
          }
        } else if (!(await options.run(target.id)))
          throw new Error(options.error() || '卡片未执行；请检查上游、待处理状态和原任务。');
        if (!(await options.save()))
          throw new Error('结果已留在页面，但保存失败。请手动保存，不要重复生成。');
        return snapshot();
      } finally {
        running = false;
        options.busyChanged(false);
      }
    }
    editing = true;
    options.busyChanged(true);
    const wasInert = document.body.inert;
    document.body.inert = true;
    try {
      if (command.action === 'export') {
        const target = node(input.id, current);
        if (options.nodeBlocked(target.id))
          throw new Error('此卡片存在待确认任务或草稿，请先处理。');
        if (
          typeof input.format !== 'string' ||
          (input.loop !== undefined && typeof input.loop !== 'boolean')
        )
          throw new Error('请选择导出 format，loop 必须为布尔值。');
        return await options.exportAsset(command, target);
      } else if (command.action === 'import') {
        if (current.nodes.length >= 400) throw new Error('画布卡片已达到容量限制。');
        await options.importAsset(input);
      } else if (command.action === 'set-references') {
        const plan = prepareCanvasReferences(current, input as unknown as CanvasReferencesInput);
        const sources = input.sourceIds as string[];
        if ([plan.node.id, ...sources].some(options.nodeBlocked))
          throw new Error('参考图片或目标卡片存在未确认任务或编辑草稿。');
        options.remember();
        options.resetDraft(plan.node.id);
        applyCanvasReferences(current, plan, () => crypto.randomUUID());
        invalidateCanvasDependents(current, plan.node.id);
        options.changed();
      } else if (command.action === 'create' || command.action === 'rename') {
        if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 80)
          throw new Error('画布标题必须为 1～80 字符。');
        if (command.action === 'create') await options.create(input.title);
        else {
          options.remember();
          current.title = input.title;
          options.changed();
        }
      } else if (command.action === 'open') {
        if (typeof input.id !== 'string') throw new Error('缺少目标画布 id。');
        await options.open(input.id);
      } else if (command.action === 'add-template') {
        if (typeof input.id !== 'string') throw new Error('缺少模板 id。');
        await options.addTemplate(input.id);
      } else if (command.action === 'add-node') {
        if (!['image', 'video', 'note', 'sequence', 'animation'].includes(String(input.type)))
          throw new Error('不支持的卡片类型，请查询 capabilities。');
        if (current.nodes.length >= 400) throw new Error('画布卡片已达到容量限制。');
        if (input.type === 'sequence' || input.type === 'animation') {
          const source = node(input.sourceId, current);
          if (
            options.nodeBlocked(source.id) ||
            source.templatePending ||
            !source.assetPath ||
            source.type !== (input.type === 'sequence' ? 'video-source' : 'sequence')
          )
            throw new Error('派生卡片需要已就绪且类型匹配的来源。');
          options.addDerived(input.type, source.id);
          if (options.error()) throw new Error(options.error());
        } else {
          if (input.sourceId !== undefined) throw new Error('此卡片不接受 sourceId。');
          options.add(String(input.type));
        }
      } else if (command.action === 'update-nodes') {
        const updates = prepareCanvasNodeUpdates(current, input);
        if (updates.some(({ node }) => options.nodeBlocked(node.id)))
          throw new Error('卡片任务尚未确认或存在未保存草稿，请先处理原任务。');
        options.remember();
        for (const update of updates) {
          const target = node(update.node.id, current);
          Object.assign(target, update.node);
          if (update.contentChanged) {
            options.resetDraft(target.id);
            invalidateCanvasDependents(current, target.id);
          }
        }
        options.changed();
      } else if (['delete-nodes', 'duplicate', 'group'].includes(command.action)) {
        const selected = ids(input, current);
        if (selected.some(options.nodeBlocked)) throw new Error('选中卡片存在未确认任务或草稿。');
        options.select(selected);
        if (command.action === 'delete-nodes') options.deleteSelected();
        else if (command.action === 'duplicate') options.duplicate();
        else options.group();
        if (options.error()) throw new Error(options.error());
      } else if (command.action === 'connect') {
        const from = node(input.from, current);
        const to = node(input.to, current);
        if (options.nodeBlocked(from.id) || options.nodeBlocked(to.id))
          throw new Error('引用卡片尚未就绪。');
        options.connect(from.id, to.id);
        if (options.error()) throw new Error(options.error());
      } else if (command.action === 'disconnect') {
        const edge = current.edges.find((edge) => edge.id === input.edgeId);
        if (!edge) throw new Error('引用连线不存在。');
        if (options.nodeBlocked(edge.from) || options.nodeBlocked(edge.to))
          throw new Error('引用卡片尚未就绪。');
        if (!['first-frame', 'image-variant'].includes(edge.kind))
          throw new Error('首版仅支持移除图片参考连线，派生产物来源请保留。');
        options.remember();
        current.edges = current.edges.filter((item) => item !== edge);
        const target = node(edge.to, current);
        if (target.sectionId) target.templatePending = true;
        invalidateCanvasDependents(current, edge.to);
        options.changed();
      }
      options.render();
      if (!(await options.save()))
        throw new Error('修改已留在页面但保存失败，请手动保存；不要重新提交此命令。');
      return { ...snapshot(), selectedIds: options.selected() };
    } finally {
      document.body.inert = wasInert;
      editing = false;
      options.busyChanged(false);
    }
  }
  return {
    execute,
    get isEditing() {
      return editing;
    },
  };
}
