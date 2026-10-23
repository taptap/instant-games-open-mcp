import type { CanvasHostCapabilities } from './capabilities.js';
import type { CanvasPlatform } from '../contracts/platform.js';
import type { CanvasCommand } from '../contracts.js';
import type { prepareCanvasNodeUpdatesWithValidation } from '../features/automation.js';
import type { CanvasDocument, CanvasNode } from '../contracts.js';
import {
  canvasAutomationSnapshot,
  validateCanvasCommandStructure,
} from '../features/automation.js';
import { invalidateCanvasDependents } from '../features/templateWorkflow.js';
import {
  setUiRecognitionMode,
  uiRecognitionSource,
  selectedUiRecognition,
} from '../features/uiRecognition.js';
import { selectCanvasSnapshot } from '../features/automationInfo.js';
import {
  applyCanvasReferences,
  prepareCanvasReferences,
  type CanvasReferencesInput,
} from '../features/automationReferences.js';
import type { createCanvasGroupQueue } from './groupQueue.js';
import { canvasModelGroup } from '../features/model3d.js';
import { syncUiBboxWorkflow } from './uiBboxWorkflow.js';
import { canvasMarkFromInput } from '../core/marks.js';

export function createCanvasAutomationUiWithHost(options: {
  capabilities?: CanvasHostCapabilities;
  platform?: CanvasPlatform;
  prepareNodeUpdates: (
    document: CanvasDocument,
    input: Record<string, unknown>
  ) => ReturnType<typeof prepareCanvasNodeUpdatesWithValidation>;
  current(): CanvasDocument | null;
  blocked(allowUnsaved?: boolean): string | undefined;
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
  placeMark?(shape: string): { x: number; y: number; width: number; height: number };
  addDerived(type: 'sequence' | 'animation' | 'model-views' | 'model', sourceId: string): void;
  confirmModel?(id: string, reviewId: string): Promise<unknown>;
  previewModel?(id: string): unknown;
  previewImageAssets?(id: string, grid?: unknown, cut?: unknown): Promise<unknown>;
  confirmImageAssets?(id: string, reviewId: string): Promise<unknown>;
  importAsset(input: Record<string, unknown>): Promise<void>;
  exportAsset(command: CanvasCommand, node: CanvasNode): Promise<unknown>;
  addTemplate(id: string): Promise<void>;
  deleteSelected(): void;
  duplicate(): void;
  group(): void;
  connect(from: string, to: string): void;
  resetDraft(id: string): void;
  checkRecognition?(node: CanvasNode): Promise<void>;
  ensureRecognitionNote?(node: CanvasNode): void;
  recognizeUi?(node: CanvasNode, recover: boolean, attemptId?: string): Promise<boolean>;
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
    const saved = current && canvasAutomationSnapshot(current);
    return current && saved
      ? JSON.parse(
          JSON.stringify({
            source: 'live',
            capturedAt: new Date().toISOString(),
            ...saved,
            blocked: options.blocked() || null,
            capabilities: options.capabilities,
            platform: options.platform,
            nodes: saved.nodes.map((node) => ({
              ...node,
              state: options.nodeStatus(node.id),
            })),
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
    const command = validateCanvasCommandStructure(value);
    const current = options.current();
    if (!current || command.canvasId !== current.id)
      throw new Error('当前画布已变化，请重新 inspect。');
    const input = command.input;
    const fields: Record<string, string[]> = {
      inspect: ['id'],
      save: [],
      'recognize-ui': ['id', 'recover', 'attemptId'],
      create: ['title'],
      open: ['id'],
      rename: ['title'],
      'add-template': ['id'],
      'add-node': [
        'type',
        'sourceId',
        'shape',
        'x',
        'y',
        'width',
        'height',
        'color',
        'stroke',
        'point',
        'direction',
        'from',
        'to',
      ],
      'sync-ui-batches': ['id', 'artText', 'background'],
      'update-nodes': ['nodes'],
      'delete-nodes': ['ids'],
      duplicate: ['ids'],
      group: ['ids'],
      connect: ['from', 'to'],
      disconnect: ['edgeId'],
      run: ['id', 'recognition'],
      'confirm-model': ['id', 'reviewId'],
      'preview-model': ['id'],
      'preview-image-assets': ['id', 'grid', 'cut'],
      'confirm-image-assets': ['id', 'reviewId'],
      stop: ['id'],
      query: ['id'],
      import: ['assetPath', 'kind', 'title'],
      export: ['id', 'format', 'loop'],
      'set-references': ['id', 'sourceIds', 'includeSelf'],
    };
    for (const key of Object.keys(input))
      if (!fields[command.action].includes(key)) throw new Error('不支持的 input 字段：' + key);
    if (input.recognition !== undefined && typeof input.recognition !== 'boolean')
      throw new Error('recognition 必须是布尔值；无识图对比请显式传 false。');
    if (input.recover !== undefined && typeof input.recover !== 'boolean')
      throw new Error('recover 必须是布尔值。');
    if (
      input.attemptId !== undefined &&
      (input.recover !== true ||
        typeof input.attemptId !== 'string' ||
        !/^[a-f0-9-]{36}$/i.test(input.attemptId))
    )
      throw new Error('attemptId 必须为原识图请求编号，并同时传入 recover: true。');
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
    const blocked = options.blocked(command.action === 'save');
    if (blocked) throw new Error(blocked);
    if (command.action !== 'query' && command.revision !== current.revision)
      throw new Error('revision 已过期，请重新 inspect，不会覆盖人工修改。');
    options.clearError();
    if (command.action === 'save' || command.action === 'recognize-ui') {
      const target = command.action === 'recognize-ui' ? node(input.id, current) : undefined;
      if (target && (!target.uiRecognition || !options.recognizeUi))
        throw new Error('请选择配置了识图的设计稿或去文字卡片。');
      if (target && command.allowPaid !== true)
        throw new Error('执行识图需传入 --allow-paid；仅查询原请求请用 query。');
      running = true;
      options.busyChanged(true);
      try {
        if (
          target &&
          !(await options.recognizeUi!(
            target,
            input.recover === true,
            input.attemptId as string | undefined
          ))
        )
          throw new Error(options.error() || 'Bbox 尚未完成，请检查识图卡片。');
        if (!(await options.save())) throw new Error('保存失败，页面结果已保留，请重试 save。');
        return snapshot();
      } finally {
        running = false;
        options.busyChanged(false);
        options.render();
      }
    }
    if (
      ['preview-image-assets', 'confirm-image-assets'].includes(command.action) ||
      (command.action === 'run' && node(input.id, current).type === 'image-assets')
    ) {
      const target = node(input.id, current);
      if (
        target.type !== 'image-assets' ||
        !options.previewImageAssets ||
        !options.confirmImageAssets
      )
        throw new Error('请选择图集对应的游戏资产卡。');
      if (
        command.action === 'confirm-image-assets' &&
        (typeof input.reviewId !== 'string' || !input.reviewId)
      )
        throw new Error('请先查看网格预览，再携带当前 reviewId 确认。');
      running = true;
      options.busyChanged(true);
      try {
        return command.action === 'confirm-image-assets'
          ? await options.confirmImageAssets(target.id, input.reviewId as string)
          : await options.previewImageAssets(target.id, input.grid, input.cut);
      } finally {
        running = false;
        options.busyChanged(false);
      }
    }
    if (command.action === 'preview-model') {
      const target = node(input.id, current);
      if (target.type !== 'model' || !options.previewModel)
        throw new Error('请选择已交付的模型卡。');
      return options.previewModel(target.id);
    }
    if (
      command.action === 'run' ||
      command.action === 'query' ||
      command.action === 'confirm-model'
    ) {
      const target = node(input.id, current);
      if (
        command.action !== 'query' &&
        command.allowPaid !== true &&
        !(target.type === 'image' && target.uiAtlasPrelayout) &&
        (target.type === 'section' ||
          ['image', 'video', 'video-source', 'model', 'model-views'].includes(target.type))
      )
        throw new Error('执行生成需传入 --allow-paid。');
      running = true;
      options.busyChanged(true);
      try {
        if (command.action === 'run' && target.type === 'mark')
          throw new Error('标注不能执行生成。');
        if (command.action === 'run') {
          if (
            target.type === 'section' &&
            (target.templateId === '7e1cb6ad-732f-4dc3-a951-000000000015' ||
              (target.templateCliOnly && target.templateSkills?.includes('maker-ui-bbox-workflow')))
          ) {
            if (input.recognition === false)
              throw new Error('实验模板需要当前识图结果，不能关闭识图。');
            if (syncUiBboxWorkflow(structuredClone(current), target.id, false).length)
              throw new Error('请先按 Skill 执行 sync-ui-batches，再运行分组。');
          }
          const prelayoutRecognition =
            target.uiAtlasPrelayout && uiRecognitionSource(current, target);
          if (
            target.uiAtlasPrelayout &&
            (!prelayoutRecognition || !selectedUiRecognition(prelayoutRecognition))
          )
            throw new Error('请先完成当前去文字图的识图，再执行本地预排。');
          const source =
            target.type === 'image' && !target.uiAtlasPrelayout
              ? uiRecognitionSource(current, target)
              : undefined;
          const sources =
            target.type === 'section'
              ? current.nodes.filter(
                  (item) =>
                    item.sectionId === target.id &&
                    item.uiRecognition &&
                    item.uiRecognition.inputRole !== 'design'
                )
              : source && source.uiRecognition?.inputRole !== 'design'
                ? [source]
                : [];
          const enabled = input.recognition !== false;
          if (sources.some((item) => item.uiRecognition!.enabled !== enabled)) {
            options.remember();
            for (const item of sources) setUiRecognitionMode(current, item, enabled);
            options.changed();
            options.render();
            if (!(await options.save())) throw new Error('识图开关尚未保存，未启动工作流。');
          }
          if (enabled && target.type !== 'section')
            for (const item of sources) {
              if (item.uiRecognition?.optional) continue;
              // The recognition card is the text-free output; produce it before asking AI.
              if (item.templatePending || !item.assetPath) {
                if (item.id === target.id) continue;
                if (!(await options.run(item.id)))
                  throw new Error(options.error() || '去文字尚未完成，不能识图。');
                if (!(await options.save())) throw new Error('去文字结果尚未保存，不能识图。');
                if (item.templatePending || !item.assetPath)
                  throw new Error('去文字尚未完成，不能识图。');
              }
              if (!selectedUiRecognition(item) && !(await options.run(item.id)))
                throw new Error(
                  options.error() || '两次识图未完成，请按当前识图设置完成；已有请求先查询原请求。'
                );
              if (!selectedUiRecognition(item))
                throw new Error(
                  '两次识图尚未保存 Bbox JSON（去文字卡 ' +
                    item.id +
                    '）：' +
                    item.assetPath +
                    '。请按当前识图设置完成两轮识图：本地或 ChatGPT 网页由 AI 按当前分组 templateSkills 关联的 Skill 校验回填，自定义 API 查询原请求；保存后继续，不关闭识图跳过。'
                );
            }
        }
        if (command.action === 'query') await options.query(target.id);
        else if (command.action === 'confirm-model') {
          if (
            target.type !== 'model' ||
            typeof input.reviewId !== 'string' ||
            !input.reviewId ||
            !options.confirmModel
          )
            throw new Error(
              '确认模型必须指定模型卡片及当前 reviewId，且先取得用户对全部视图的明确批准。'
            );
          await options.confirmModel(target.id, input.reviewId);
        } else if (target.type === 'section') {
          if (canvasModelGroup(current, target.id))
            throw new Error('模型流程需要人工确认角色和多视图，请分步执行卡片，不能自动批准。');
          if (options.queue.start(target.id, true) === false)
            throw new Error(options.error() || '队列未启动。');
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
        options.render();
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
      } else if (command.action === 'sync-ui-batches') {
        const target = node(input.id, current);
        if (
          target.type !== 'section' ||
          !(
            typeof input.artText === 'boolean' ||
            (Array.isArray(input.artText) &&
              input.artText.length <= 120 &&
              input.artText.every((id) => typeof id === 'string'))
          ) ||
          typeof input.background !== 'boolean'
        )
          throw new Error(
            '请指定实验模板分组、artText 文字 ID 数组（或布尔值）及 background 布尔值。'
          );
        const members = current.nodes.filter((item) => item.sectionId === target.id);
        if (members.some((item) => options.nodeBlocked(item.id)))
          throw new Error('分组存在未确认任务或草稿，请先处理原任务。');
        const source = members.find((item) => item.uiRecognition?.inputRole === 'text-free');
        if (!source || !options.checkRecognition) throw new Error('缺少当前识图结果。');
        await options.checkRecognition(source);
        const next = structuredClone(current);
        const created = syncUiBboxWorkflow(
          next,
          target.id,
          input.artText as boolean | string[],
          input.background
        );
        options.remember();
        current.nodes = next.nodes;
        current.edges = next.edges;
        options.select(created.length ? created : [target.id]);
        options.changed();
      } else if (command.action === 'add-node') {
        if (
          ![
            'image',
            'video',
            'note',
            'mark',
            'sequence',
            'animation',
            'model-views',
            'model',
          ].includes(String(input.type))
        )
          throw new Error('不支持的卡片类型，请查询 capabilities。');
        if (current.nodes.length >= 400) throw new Error('画布卡片已达到容量限制。');
        if (input.type === 'mark') {
          if (input.sourceId !== undefined) throw new Error('标注不接受 sourceId。');
          const placed =
            input.x === undefined && input.y === undefined
              ? options.placeMark?.(String(input.shape))
              : undefined;
          const node = canvasMarkFromInput(
            {
              ...input,
              ...(placed
                ? {
                    x: placed.x,
                    y: placed.y,
                    width: input.width === undefined ? placed.width : input.width,
                    height: input.height === undefined ? placed.height : input.height,
                  }
                : {}),
            },
            crypto.randomUUID()
          );
          options.remember();
          current.nodes.push(node);
          options.select([node.id]);
          options.changed();
        } else if (input.type === 'model' || input.type === 'model-views') {
          const source = node(input.sourceId, current);
          if (options.nodeBlocked(source.id)) throw new Error('来源卡片正在执行，请稍后创建。');
          options.addDerived(input.type, source.id);
        } else if (input.type === 'sequence' || input.type === 'animation') {
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
        const updates = options.prepareNodeUpdates(current, input);
        if (updates.some(({ node }) => options.nodeBlocked(node.id)))
          throw new Error('卡片任务尚未确认或存在未保存草稿，请先处理原任务。');
        const recognized = updates.filter(
          ({ node: next }) =>
            next.uiRecognition?.selectedId !== node(next.id, current).uiRecognition?.selectedId
        );
        for (const { node: next } of recognized) {
          if (!options.checkRecognition || !options.ensureRecognitionNote)
            throw new Error('请刷新画布后写入识图清单。');
          await options.checkRecognition(next);
        }
        options.remember();
        for (const update of updates) {
          const target = node(update.node.id, current);
          const previousRecognitionIds = new Set(
            target.uiRecognition?.results.map((item) => item.id)
          );
          const previousDuration = target.workDurationMs || 0;
          if (update.node.uiRecognition)
            setUiRecognitionMode(current, target, update.node.uiRecognition.enabled);
          Object.assign(target, update.node);
          if (recognized.includes(update)) {
            delete target.templatePending;
            options.ensureRecognitionNote!(target);
            const result = target.uiRecognition?.results.find(
              (item) => item.id === target.uiRecognition?.selectedId
            );
            if (result && result.durationMs > 0 && !previousRecognitionIds.has(result.id)) {
              target.workDurationMs = previousDuration + result.durationMs;
              const group = current.nodes.find((item) => item.id === target.sectionId);
              if (group?.workTimingOpen)
                group.workDurationMs = (group.workDurationMs || 0) + result.durationMs;
            }
          }
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
