import type {
  CanvasDocument,
  CanvasNode,
  CanvasUiDelivery,
  CanvasUiDeliveryStatus,
} from '../contracts.js';
import { selectedUiRecognition } from '../features/uiRecognition.js';
import { canvasReferences } from '../core/dependencies.js';

export interface Ui015Choice {
  artText: string[];
  background: boolean;
}

export interface Ui015Result {
  status: 'started' | 'waiting' | 'ready' | 'failed' | 'busy';
  stage: string;
  message: string;
  /** Present while waiting for the art text/background choice. */
  texts?: Array<{ id: string; text: string }>;
  choice?: Ui015Choice;
  /** Image-assets cards still awaiting a preview confirmation. */
  pendingReview?: string[];
}

/**
 * Stage coordinator for the 015 Bbox template. It derives every stage from the real cards,
 * queue checkpoint and delivery record, and only calls existing actions. It never opens
 * native browser prompts, so the canvas button and the CLI `run` share the same path.
 */
export function createUi015Workflow(options: {
  current(): CanvasDocument | null;
  needs(id: string): boolean;
  /** Existing per-card block reason, e.g. an unknown paid result that must be queried. */
  problem?(id: string): string | undefined;
  runImage(id: string): Promise<boolean>;
  /** Query or resume the card's original recognition request. */
  recognize(id: string, recover: boolean): Promise<boolean>;
  chooseDesign(id: string): void;
  sync(document: CanvasDocument, groupId: string, artText: string[], background: boolean): string[];
  queue: {
    start(groupId: string, confirmed: boolean, scope?: 'prelayout'): boolean;
    hold(groupId: string, reason: 'prelayout-review', message: string): boolean;
    view(
      groupId: string
    ): { phase: string; pauseReason?: string; failures?: Record<string, string> } | undefined;
    remaining(groupId: string): number;
  };
  openAssets(id: string): unknown;
  focus(id: string): void;
  remember(): void;
  save(): Promise<boolean>;
  changed(): void;
  render(): void;
  error(message: string): void;
  log(message: string, level?: 'info' | 'warning' | 'error'): void;
  failure?(): string | undefined;
  store: {
    uiDelivery?(canvasId: string, nodeId: string): Promise<CanvasUiDeliveryStatus>;
    assembleUi?(
      canvasId: string,
      nodeId: string,
      newVersion?: boolean
    ): Promise<CanvasUiDeliveryStatus>;
    setupPython?(): Promise<{ ready: boolean; message?: string }>;
    uiEditorUrl?(file: string): string;
  };
}) {
  const templateId = '7e1cb6ad-732f-4dc3-a951-000000000015';
  const executingPhases = ['queued', 'running', 'waiting'];
  let running = '';
  const deliveries = new Map<string, { key: string; value?: CanvasUiDeliveryStatus }>();

  function isWorkflowGroup(group: CanvasNode | undefined): boolean {
    return Boolean(
      group &&
        group.type === 'section' &&
        (group.templateId === templateId ||
          (group.templateCliOnly && group.templateSkills?.includes('maker-ui-bbox-workflow')))
    );
  }
  function group(document: CanvasDocument, groupId: string): CanvasNode | undefined {
    const node = document.nodes.find((item) => item.id === groupId);
    return isWorkflowGroup(node) ? node : undefined;
  }
  function members(document: CanvasDocument, groupId: string): CanvasNode[] {
    return document.nodes.filter((node) => node.sectionId === groupId);
  }
  /** Locate cards by relations: card titles change when users import a design. */
  function cards(document: CanvasDocument, groupId: string) {
    const list = members(document, groupId);
    const cuts = list.filter((node) => node.uiRecognition?.inputRole === 'text-free');
    const inputs = list.filter((node) => node.uiRecognition?.inputRole === 'design');
    if (cuts.length !== 1 || inputs.length !== 1) return undefined;
    const sources = canvasReferences(document, inputs[0].id).filter(
      (node) => node.type === 'image'
    );
    if (sources.length !== 1) return undefined;
    return { design: sources[0], input: inputs[0], cut: cuts[0], members: list };
  }
  function isPresetDesign(node: CanvasNode): boolean {
    return Boolean(node.assetPath && node.assetPath.includes('preset-ui-bbox-'));
  }
  function bundleOf(list: CanvasNode[]): CanvasNode | undefined {
    return list.find((node) => node.type === 'resource-bundle');
  }
  function separations(list: CanvasNode[]): CanvasNode[] {
    return list.filter(
      (node) =>
        node.type === 'image' &&
        !node.uiAtlasPrelayout &&
        !node.uiEmpty &&
        (node.uiAtlasGroup || node.uiArtTextId)
    );
  }
  function texts(document: CanvasDocument, cut: CanvasNode) {
    return (selectedUiRecognition(cut)?.bbox?.texts || []).map((item) => ({
      id: item.id,
      text: item.text,
    }));
  }
  /** The choice is derived from active branches; nothing duplicates it on the group. */
  function currentChoice(document: CanvasDocument, list: CanvasNode[], cut: CanvasNode) {
    const bbox = selectedUiRecognition(cut)?.bbox;
    const known = new Set((bbox?.texts || []).map((item) => item.id));
    return {
      artText: [
        ...new Set(
          list
            .filter(
              (node) =>
                node.type === 'image' &&
                !node.uiAtlasPrelayout &&
                !node.uiEmpty &&
                node.uiArtTextId &&
                known.has(node.uiArtTextId)
            )
            .map((node) => node.uiArtTextId!)
        ),
      ],
      background: list.some(
        (node) =>
          node.type === 'image' &&
          !node.uiAtlasPrelayout &&
          !node.uiEmpty &&
          node.uiAtlasGroup === 'background'
      ),
    };
  }
  function assetsAwaitingReview(document: CanvasDocument, list: CanvasNode[]): CanvasNode[] {
    return list.filter((node) => {
      if (node.type !== 'image-assets' || node.uiEmpty || !node.imageAssetsInfo?.items.length)
        return false;
      const source = canvasReferences(document, node.id).find((item) => item.type === 'image');
      if (!source?.generation?.uiAtlasPlan) return false;
      return !['confirmed', 'recorded'].includes(node.imageAssetsInfo.uiBindingReview || '');
    });
  }
  function deliveryKey(list: CanvasNode[]): string {
    return JSON.stringify(
      list
        .filter((node) => node.type === 'image-assets' && !node.uiEmpty)
        .map((node) => [
          node.id,
          node.imageAssetsInfo?.uiBindingReview,
          (node.imageAssetsInfo?.items || []).map((item) => item.assetPath),
        ])
    );
  }
  function delivery(document: CanvasDocument, groupId: string, list: CanvasNode[]) {
    const bundle = bundleOf(list);
    if (!bundle || !options.store.uiDelivery) return undefined;
    const key = deliveryKey(list);
    const cached = deliveries.get(groupId);
    if (cached?.key === key) return cached.value;
    deliveries.set(groupId, { key });
    void options.store
      .uiDelivery(document.id, bundle.id)
      .then((value) => {
        if (deliveries.get(groupId)?.key !== key) return;
        deliveries.set(groupId, { key, value });
        options.render();
      })
      .catch(() => deliveries.delete(groupId));
    return undefined;
  }

  /** Read-only stage projection used by the group header and by the CLI result. */
  function inspect(groupId: string) {
    const document = options.current();
    const target = document && group(document, groupId);
    if (!document || !target) return undefined;
    const found = cards(document, groupId);
    if (!found)
      return {
        stage: 'invalid' as const,
        message: '015 分组缺少唯一的原稿、识图输入或去文字卡，请检查连线。',
      };
    const { design, input, cut, members: list } = found;
    if (!design.assetPath || isPresetDesign(design))
      return { stage: 'design' as const, message: '请先选择或替换原始设计稿', design };
    if (options.needs(input.id) || options.needs(cut.id) || !selectedUiRecognition(cut)) {
      const blocked = options.problem?.(input.id) || options.problem?.(cut.id);
      return {
        stage: 'prepare' as const,
        message: blocked
          ? blocked + '（请在对应卡片上查询原任务后再继续）'
          : cut.uiRecognition?.pendingId
            ? '识图请求待确认：继续将先查询原请求，不会重复提交'
            : '下一步：准备识图输入、去文字并完成两轮识图',
        input,
        cut,
      };
    }
    const bundle = bundleOf(list);
    if (!bundle)
      return {
        stage: 'choice' as const,
        message: '识图完成：选择需要图片化的美术字与是否额外还原环境背景',
        cut,
      };
    const queue = options.queue.view(groupId);
    if (queue && executingPhases.includes(queue.phase))
      return { stage: 'running' as const, message: '正在执行' };
    const prelayouts = list.filter((node) => node.uiAtlasPrelayout && !node.uiEmpty);
    if (prelayouts.some((node) => options.needs(node.id)))
      return { stage: 'prelayout' as const, message: '下一步：执行本地预排（不消耗生图）' };
    const saved = target.workflowState;
    const reviewPaused =
      queue?.phase === 'paused' &&
      (queue.pauseReason === 'prelayout-review' || saved?.pauseReason === 'prelayout-review');
    const work = separations(list);
    const started = work.some(
      (node) =>
        !options.needs(node.id) ||
        saved?.completed.includes(node.id) ||
        saved?.failures[node.id] !== undefined ||
        saved?.retries[node.id] !== undefined
    );
    if (reviewPaused || (!started && work.length))
      return {
        stage: 'prelayout-review' as const,
        message: '检查点 A：查看各批预排图与识图标注，确认无漏项后继续分离生图',
        hold: !reviewPaused,
      };
    if (options.queue.remaining(groupId) > 0) {
      // A failed cut keeps its image; the fix is a crop review, not regeneration.
      const failedCut = Object.keys(queue?.failures || {})
        .map((id) => list.find((node) => node.id === id && node.type === 'image-assets'))
        .find((node): node is CanvasNode => Boolean(node));
      return {
        stage: 'generation' as const,
        message: failedCut
          ? '「' +
            failedCut.title +
            '」切图未通过：打开预览调整裁框后确认；确实漏画时修改对应分离卡提示词并单独重做'
          : queue?.phase === 'paused'
            ? '已暂停：继续将先核对原任务，只补缺失或失败的步骤'
            : '下一步：分离生图并切图',
        failedCut,
      };
    }
    const assets = list.filter(
      (node) => node.type === 'image-assets' && !node.uiEmpty && node.imageAssetsInfo
    );
    const pending = assetsAwaitingReview(document, list);
    if (pending.length)
      return {
        stage: 'binding-review' as const,
        message:
          '检查点 B：逐批预览并确认切图（已确认 ' +
          (assets.length - pending.length) +
          '/' +
          assets.length +
          '）',
        pending,
        total: assets.length,
      };
    const status = delivery(document, groupId, list);
    return {
      stage: 'assemble' as const,
      message: status?.delivery?.steps.assembled
        ? status.delivery.steps.meta === 'done' && status.delivery.steps.check === 'passed'
          ? 'UI 已生成，可打开编辑器查看与修改'
          : 'UI 已生成，资源元数据或引用检查未完成'
        : status && !status.ready
          ? status.reason || '资源包尚未完整'
          : '素材已确认：下一步组装可编辑 UI',
      bundle,
      status,
    };
  }

  async function prepare(found: NonNullable<ReturnType<typeof cards>>) {
    if (options.needs(found.input.id)) {
      options.log('015 · 准备识图输入');
      if (!(await options.runImage(found.input.id)))
        throw new Error(options.failure?.() || '原稿与识图输入尚未准备完成。');
    }
    const cut = found.cut;
    if (cut.uiRecognition?.pendingId && cut.assetPath && !cut.templatePending) {
      // Continue the original request with its idempotency key; never a new submission.
      options.log('015 · 继续原识图请求（复用原请求编号）');
      if (!(await options.recognize(cut.id, true)))
        throw new Error(options.failure?.() || '原识图请求仍未完成，请稍后再继续。');
    }
    if (options.needs(cut.id) || !selectedUiRecognition(cut)) {
      options.log('015 · 去文字与两轮识图（Server API）');
      if (!(await options.runImage(cut.id)))
        throw new Error(
          options.failure?.() ||
            '去文字或 Bbox 识图尚未完成；请检查识图 API 设置，恢复后点继续会先查询原请求。'
        );
    }
    if (!selectedUiRecognition(cut)) throw new Error('Bbox 结果尚未生成，请检查识图服务后重试。');
  }

  /** Apply the choice through the existing batch planner; no-op when nothing changes. */
  async function applyChoice(document: CanvasDocument, groupId: string, choice: Ui015Choice) {
    const next = structuredClone(document);
    const created = options.sync(next, groupId, choice.artText, choice.background);
    if (
      JSON.stringify(next.nodes) === JSON.stringify(document.nodes) &&
      JSON.stringify(next.edges) === JSON.stringify(document.edges)
    )
      return created;
    options.remember();
    document.nodes = next.nodes;
    document.edges = next.edges;
    options.changed();
    options.log(
      '015 · 已同步批次：美术字 ' +
        (choice.artText.join('、') || '无') +
        '，额外背景 ' +
        (choice.background ? '开启' : '关闭') +
        (created.length ? '，新增 ' + created.length + ' 张卡片' : '')
    );
    if (!(await options.save())) throw new Error('批次已生成，但画布保存失败，请保存后继续。');
    return created;
  }

  /**
   * Advance to the next checkpoint. Paid steps run under the click (or CLI --allow-paid)
   * that invoked this; each one is written to the run log instead of a confirmation dialog.
   */
  async function advance(
    groupId: string,
    input: Partial<Ui015Choice> & { interactive?: boolean } = {}
  ): Promise<Ui015Result> {
    if (running) return { status: 'busy', stage: 'running', message: '015 流程正在处理中' };
    const document = options.current();
    if (!document || !group(document, groupId))
      return { status: 'failed', stage: 'invalid', message: '请选择 015 Bbox 模板分组。' };
    running = groupId;
    options.render();
    try {
      let view = inspect(groupId)!;
      if (view.stage === 'invalid') throw new Error(view.message);
      if (view.stage === 'design') {
        if (input.interactive && 'design' in view && view.design)
          options.chooseDesign(view.design.id);
        return { status: 'waiting', stage: 'design', message: view.message };
      }
      if (view.stage === 'running')
        return { status: 'busy', stage: 'running', message: view.message };
      const found = cards(document, groupId)!;
      if (view.stage === 'prepare') {
        await prepare(found);
        view = inspect(groupId)!;
      }
      const synced = Boolean(bundleOf(members(document, groupId)));
      const explicit = input.artText !== undefined || input.background !== undefined;
      if (!synced && !explicit)
        return {
          status: 'waiting',
          stage: 'choice',
          message: '请选择需要图片化的美术字（可不选）及是否额外还原环境背景。',
          texts: texts(document, found.cut),
          choice: { artText: [], background: false },
        };
      const derived = currentChoice(document, members(document, groupId), found.cut);
      const choice: Ui015Choice = {
        artText: input.artText ?? derived.artText,
        background: input.background ?? derived.background,
      };
      // Re-planning also picks up batches added by a new recognition result.
      await applyChoice(document, groupId, choice);
      view = inspect(groupId)!;
      if (view.stage === 'prelayout') {
        options.log('015 · 执行本地预排；完成后停在检查点 A');
        if (!options.queue.start(groupId, true, 'prelayout'))
          throw new Error(options.failure?.() || '预排队列未启动。');
        return { status: 'started', stage: 'prelayout', message: '正在执行本地预排' };
      }
      if (view.stage === 'prelayout-review' && 'hold' in view && view.hold) {
        options.queue.hold(groupId, 'prelayout-review', view.message);
        return { status: 'waiting', stage: 'prelayout-review', message: view.message };
      }
      if (view.stage === 'prelayout-review' || view.stage === 'generation') {
        options.log('015 · 继续分离生图与切图（付费步骤记录在运行日志，不逐步弹窗）');
        if (!options.queue.start(groupId, true))
          throw new Error(options.failure?.() || '此分组没有可执行的剩余步骤。');
        return { status: 'started', stage: 'generation', message: '正在分离生图与切图' };
      }
      if (view.stage === 'binding-review')
        return {
          status: 'waiting',
          stage: 'binding-review',
          message: view.message,
          pendingReview: ('pending' in view ? view.pending : []).map((node) => node.id),
        };
      return { status: 'ready', stage: view.stage, message: view.message };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      options.error(message);
      options.log('015 · ' + message, 'error');
      return { status: 'failed', stage: inspect(groupId)?.stage || 'invalid', message };
    } finally {
      running = '';
      options.render();
    }
  }

  function element<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    text?: string,
    className?: string
  ): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function dialogShell(title: string): HTMLDialogElement {
    const dialog = element('dialog', undefined, 'workflow-template-dialog');
    dialog.style.cssText =
      'width:min(640px,calc(100vw - 32px));max-height:85vh;overflow:auto;line-height:1.5';
    dialog.setAttribute('aria-label', title);
    dialog.append(element('h2', title));
    dialog.addEventListener('keydown', (event) => event.stopPropagation());
    dialog.addEventListener('keyup', (event) => event.stopPropagation());
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
    return dialog;
  }

  /** Inline choice panel replacing window.prompt/confirm. */
  function openChoice(groupId: string) {
    const document_ = options.current();
    const found = document_ && cards(document_, groupId);
    if (!document_ || !found) return;
    const list = texts(document_, found.cut);
    const current = bundleOf(found.members)
      ? currentChoice(document_, found.members, found.cut)
      : { artText: [], background: false };
    const dialog = dialogShell('选择美术字与背景');
    dialog.dataset.ui015Choice = 'true';
    dialog.append(
      element(
        'p',
        '勾选需要按原稿字效单独提取为图片的文字；未勾选的文字保留为可编辑 Label。不勾选任何项也可以继续。'
      )
    );
    const box = element('div');
    box.style.cssText =
      'display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:6px;max-height:40vh;overflow:auto;margin:8px 0';
    const checks: HTMLInputElement[] = [];
    for (const item of list) {
      const label = element('label');
      label.style.cssText = 'display:flex;gap:6px;align-items:center';
      const check = element('input');
      check.type = 'checkbox';
      check.value = item.id;
      check.checked = current.artText.includes(item.id);
      checks.push(check);
      label.append(check, element('span', item.id + ' · ' + item.text));
      box.append(label);
    }
    if (!list.length) box.append(element('span', '本次识图没有文字。'));
    const backgroundLabel = element('label');
    backgroundLabel.style.cssText = 'display:flex;gap:6px;align-items:center;margin:8px 0';
    const background = element('input');
    background.type = 'checkbox';
    background.checked = current.background;
    backgroundLabel.append(
      background,
      element('span', '额外还原环境背景（识图已包含背景元素时会自动保留）')
    );
    const actions = element('div');
    actions.style.cssText = 'display:flex;gap:8px;justify-content:flex-end';
    const confirm = element('button', '确认并继续');
    confirm.type = 'button';
    confirm.onclick = () => {
      const choice = {
        artText: checks.filter((check) => check.checked).map((check) => check.value),
        background: background.checked,
      };
      dialog.close();
      void advance(groupId, { ...choice, interactive: true });
    };
    const cancel = element('button', '取消');
    cancel.type = 'button';
    cancel.onclick = () => dialog.close();
    actions.append(cancel, confirm);
    dialog.append(box, backgroundLabel, actions);
    window.document.body.append(dialog);
    dialog.showModal();
    confirm.focus();
  }

  function reviewPrompt(document_: CanvasDocument, groupId: string, value: CanvasUiDelivery) {
    const found = cards(document_, groupId);
    const bbox = found && selectedUiRecognition(found.cut)?.bbox;
    return [
      '请使用 Maker 内置 maker-ui-bbox-workflow Skill 的「复核已有交付」路径检查这次 015 结果，不从头生成，不重放付费任务，不覆盖用户已做的修改。',
      '画布 ID：' + document_.id + '；分组 ID：' + groupId + '；UI 编号：' + value.uiId + '。',
      '资源归档版本：' + value.archiveRevision + '。',
      '设计稿：' +
        (bbox?.design.path || found?.design.assetPath || '未知') +
        '；去文字稿：' +
        (bbox?.cutSource.path || found?.cut.assetPath || '未知') +
        '。',
      '交付目录：' +
        value.directory +
        '；UI 文件：' +
        value.uiFile +
        '；参考图：' +
        value.referenceFile +
        '。',
      '已完成：组装 ' +
        (value.steps.assembled ? '是' : '否') +
        '，资源 meta ' +
        value.steps.meta +
        '，引用检查 ' +
        value.steps.check +
        (value.check
          ? '（错误 ' + value.check.errors + '，警告 ' + value.check.warnings + '）'
          : '') +
        '。' +
        (value.issue ? '未解决：' + value.issue : ''),
      '检查点：A 识图/预排是否漏项、错误复用或文字与 UI 未分离；B 切图素材是否完整、透明、无粘连，按钮按下态与绑定是否正确；C 在 UI 编辑器对照参考图检查字体、层级、位置、尺寸、美术字、背景与可编辑性。',
      '先确认 UI 文件是否已被用户手工修改；问题请定位到具体卡片或 UI 节点。默认只报告检查结果，修复范围遵循用户另外给你的授权。',
    ].join('\n');
  }

  function openDelivery(groupId: string, status: CanvasUiDeliveryStatus) {
    const document_ = options.current();
    const value = status.delivery;
    if (!document_ || !value) return;
    const dialog = dialogShell('UI 已生成');
    dialog.dataset.ui015Delivery = 'true';
    const rows: Array<[string, string]> = [
      ['UI 文件', value.uiFile],
      ['参考图', value.referenceFile],
      ['素材目录', value.directory],
      ['节点数', String(value.elements ?? value.check?.nodes ?? '-')],
      [
        '资源元数据',
        value.steps.meta === 'done'
          ? '已生成' +
            (value.meta
              ? '（新建 ' + value.meta.generated + '，保留 ' + value.meta.preserved + '）'
              : '')
          : value.steps.meta === 'blocked'
            ? '未完成：' + (value.issue || '环境未就绪')
            : value.steps.meta,
      ],
      [
        '引用检查',
        value.check
          ? (value.check.errors ? '未通过' : '通过') +
            '（错误 ' +
            value.check.errors +
            '，警告 ' +
            value.check.warnings +
            '）'
          : value.steps.check,
      ],
    ];
    const table = element('dl');
    table.style.cssText = 'display:grid;grid-template-columns:max-content 1fr;gap:4px 12px';
    for (const [label, text] of rows) {
      table.append(element('dt', label));
      const cell = element('dd', text);
      cell.style.cssText = 'margin:0;word-break:break-all';
      table.append(cell);
    }
    dialog.append(
      table,
      element(
        'p',
        '生成成功不代表视觉验收通过。请在 UI 编辑器对照参考图检查并保存；也可以复制下面的提示词交给你的 AI 复核（可选）。'
      )
    );
    const prompt = element('textarea');
    prompt.readOnly = true;
    prompt.rows = 8;
    prompt.style.cssText = 'width:100%;box-sizing:border-box';
    prompt.setAttribute('aria-label', 'AI 复核提示词');
    prompt.value = reviewPrompt(document_, groupId, value);
    const actions = element('div');
    actions.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap';
    const open = element('button', '打开 UI 编辑器');
    open.type = 'button';
    open.onclick = () => openEditor(value.uiFile);
    const copy = element('button', '复制复核提示词');
    copy.type = 'button';
    copy.onclick = async () => {
      try {
        await navigator.clipboard.writeText(prompt.value);
        copy.textContent = '已复制';
      } catch {
        prompt.focus();
        prompt.select();
        copy.textContent = '请手动复制选中文字';
      }
    };
    const close = element('button', '关闭');
    close.type = 'button';
    close.onclick = () => dialog.close();
    actions.append(open, copy, close);
    dialog.append(prompt, actions);
    window.document.body.append(dialog);
    dialog.showModal();
  }

  function openEditor(file: string) {
    const url = options.store.uiEditorUrl?.(file);
    if (!url) {
      options.error('当前宿主不支持打开 UI 编辑器。');
      return;
    }
    window.open(url, '_blank');
  }

  /** Explicit user action. Meta generation happens only here, never on import. */
  async function assemble(
    groupId: string,
    newVersion = false
  ): Promise<CanvasUiDeliveryStatus | undefined> {
    const document_ = options.current();
    const found = document_ && cards(document_, groupId);
    const bundle = found && bundleOf(found.members);
    if (!document_ || !bundle) return undefined;
    if (!options.store.assembleUi) {
      options.error('当前宿主不支持组装 UI。');
      return undefined;
    }
    if (running) return undefined;
    running = groupId;
    options.render();
    try {
      if (!(await options.save())) throw new Error('画布尚未保存，请保存后再组装。');
      options.log('015 · 组装 UI：导入素材、组装、生成资源 meta 并检查引用');
      const status = await options.store.assembleUi(document_.id, bundle.id, newVersion);
      deliveries.set(groupId, { key: deliveryKey(found.members), value: status });
      if (!status.ready || !status.delivery) throw new Error(status.reason || '资源包尚未完整。');
      const issue = status.delivery.issue;
      options.log(
        '015 · UI 已生成：' + status.delivery.uiFile + (issue ? '；未完成：' + issue : ''),
        issue ? 'warning' : 'info'
      );
      openDelivery(groupId, status);
      return status;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      options.error(message);
      options.log('015 · 组装未完成：' + message, 'error');
      deliveries.delete(groupId);
      return undefined;
    } finally {
      running = '';
      options.render();
    }
  }

  async function setupPython(groupId: string) {
    if (!options.store.setupPython || running) return;
    running = groupId;
    options.render();
    try {
      options.log('015 · 正在准备 Python 环境（会下载运行时，请稍候）');
      const result = await options.store.setupPython();
      if (!result.ready) throw new Error(result.message || 'Python 环境仍未就绪。');
      options.log('015 · Python 环境已就绪，继续补齐资源 meta');
    } catch (error) {
      options.error(error instanceof Error ? error.message : String(error));
      return;
    } finally {
      running = '';
      options.render();
    }
    await assemble(groupId);
  }

  /** Header projection for the group queue UI; undefined for other groups. */
  function view(groupId: string) {
    const document_ = options.current();
    if (!document_ || !group(document_, groupId)) return undefined;
    const state = inspect(groupId);
    if (!state) return undefined;
    const busy = Boolean(running);
    const run = (label: string, action: () => unknown, title?: string) => ({
      label: busy && running === groupId ? '处理中…' : label,
      run: action,
      disabled: busy,
      ...(title ? { title } : {}),
    });
    const go = () => advance(groupId, { interactive: true });
    const extra: Array<{ label: string; run(): unknown }> = [];
    const found = cards(document_, groupId);
    if (found && bundleOf(found.members) && !busy && state.stage !== 'running')
      extra.push({ label: '调整美术字/背景', run: () => openChoice(groupId) });
    const labels: Record<string, string> = {
      invalid: '流程结构异常',
      design: '1 设计稿',
      prepare: '2 去文字与识图',
      choice: '3 拆分选择',
      prelayout: '4 预排',
      'prelayout-review': '4 预排检查',
      generation: '5 分离与切图',
      'binding-review': '6 素材确认',
      assemble: '7 组装 UI',
      running: '执行中',
    };
    const stage = labels[state.stage] || state.stage;
    switch (state.stage) {
      case 'invalid':
        return { stage, extra, hint: state.message };
      case 'design':
        return { stage, primary: run('选择/替换原始设计稿', go), extra, hint: state.message };
      case 'prepare':
        return { stage, primary: run('开始：去文字与识图', go), extra, hint: state.message };
      case 'choice':
        return {
          stage,
          primary: run('选择美术字/背景', () => openChoice(groupId)),
          extra,
          hint: state.message,
        };
      case 'prelayout':
        return { stage, primary: run('执行预排', go), extra, hint: state.message };
      case 'prelayout-review':
        return {
          stage,
          primary: run('预排已检查，继续分离生图', go, '确认后提交分离生图，结果写入运行日志'),
          extra,
          hint: state.message,
        };
      case 'generation': {
        const failed = 'failedCut' in state ? state.failedCut : undefined;
        if (failed)
          return {
            stage,
            primary: run('打开失败的切图预览', () => {
              options.focus(failed.id);
              options.openAssets(failed.id);
            }),
            extra: [{ label: '继续剩余流程', run: go }, ...extra],
            hint: state.message,
          };
        return { stage, primary: run('继续剩余流程', go), extra, hint: state.message };
      }
      case 'binding-review': {
        const next = 'pending' in state && state.pending?.[0];
        return {
          stage,
          primary: run('预览并确认下一批', () => {
            if (!next) return;
            options.focus(next.id);
            options.openAssets(next.id);
          }),
          extra,
          hint: state.message + '。未查看的素材不能批量确认。',
        };
      }
      case 'assemble': {
        const status = 'status' in state ? state.status : undefined;
        const value = status?.delivery;
        if (value?.steps.assembled) {
          const actions = [
            { label: '复核提示词', run: () => openDelivery(groupId, status!) },
            ...extra,
            { label: '重新组装新版本', run: () => assemble(groupId, true) },
          ];
          if (value.steps.meta !== 'done' || value.steps.check !== 'passed')
            actions.unshift(
              status?.python && !status.python.ready
                ? { label: '准备 Python 环境', run: () => setupPython(groupId) }
                : { label: '补齐 meta 与检查', run: () => assemble(groupId) }
            );
          return {
            stage: '8 UI 已生成',
            primary: run('打开 UI 编辑器', () => openEditor(value.uiFile)),
            extra: actions,
            hint:
              state.message + '：' + value.uiFile + (value.issue ? '（' + value.issue + '）' : ''),
          };
        }
        return {
          stage,
          primary: run('组装 UI', () => assemble(groupId)),
          extra,
          hint: state.message,
        };
      }
      default:
        return { stage, extra, hint: state.message };
    }
  }

  return {
    isWorkflowGroup(groupId: string) {
      const document_ = options.current();
      return Boolean(document_ && group(document_, groupId));
    },
    inspect,
    view,
    advance,
    assemble,
    openChoice,
    get isBusy() {
      return Boolean(running);
    },
  };
}
