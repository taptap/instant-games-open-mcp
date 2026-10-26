import type {
  CanvasDocument,
  CanvasNode,
  CanvasUiDelivery,
  CanvasUiDeliveryStatus,
} from '../contracts.js';
import { selectedUiRecognition } from '../features/uiRecognition.js';
import { canvasReferences } from '../core/dependencies.js';
import { designPngData } from './designPng.js';
import { uiAtlasElementGroup } from '../features/uiAssetBindings.js';

export interface Ui015Choice {
  artText: string[];
  background: boolean;
}

export interface Ui015Result {
  status: 'started' | 'waiting' | 'ready' | 'failed' | 'busy';
  stage: string;
  message: string;
  /** The art text/background choice applied by this run (default or explicit). */
  choice?: Ui015Choice;
  /** Image-assets cards not previewed yet; listed for the final review, never blocking. */
  pendingReview?: string[];
}

/**
 * Stage coordinator for the 015 Bbox template. One "开始" (or CLI `run`) drives the whole
 * group to an assembled UI: recognition, batches, prelayout, separation, cutting, assembly and
 * meta. Errors are retried (at most twice per step) and quality problems are recorded instead
 * of stopping; the final review prompt hands them to an AI with the Skill. It derives every
 * stage from the real cards, queue state and delivery record, and only calls existing actions.
 */
export function createUi015Workflow(options: {
  current(): CanvasDocument | null;
  needs(id: string): boolean;
  /** Existing per-card block reason, e.g. an unknown paid result that must be queried. */
  problem?(id: string): string | undefined;
  runImage(id: string): Promise<boolean>;
  /** Query or resume the card's original recognition request. */
  recognize(id: string, recover: boolean): Promise<boolean>;
  /** Query an unknown/failed image result; keep it if it arrived, else allow a resubmission. */
  recoverImage(id: string, force?: boolean): Promise<'recovered' | 'released' | 'waiting'>;
  chooseDesign(id: string): void;
  sync(document: CanvasDocument, groupId: string, artText: string[], background: boolean): string[];
  queue: {
    start(groupId: string, confirmed: boolean): boolean;
    /** Count one coordinator retry in the queue's own per-card retry counter. */
    spendRetry(groupId: string, nodeId: string): number;
    view(groupId: string):
      | {
          phase: string;
          pauseReason?: string;
          failures?: Record<string, string>;
          /** Retries spent on a card in this run (queue and coordinator; one counter). */
          retries?: Record<string, number>;
        }
      | undefined;
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
      newVersion?: boolean,
      designPng?: string
    ): Promise<CanvasUiDeliveryStatus>;
    setupPython?(): Promise<{ ready: boolean; message?: string }>;
    uiEditorUrl?(file: string): string;
    mediaUrl?(path: string): string;
  };
}) {
  const templateId = '7e1cb6ad-732f-4dc3-a951-000000000015';
  const executingPhases = ['queued', 'running', 'waiting'];
  /** Automatic retries per failing step and per run. */
  const RETRIES = 2;
  let running = '';
  const deliveries = new Map<string, { key: string; value?: CanvasUiDeliveryStatus }>();
  /** Groups being driven to the end by one start; the queue settlement continues them. */
  const autoRuns = new Map<string, { waits: number }>();
  /** Final outcome of the last automatic run per group, read by the CLI after waiting. */
  const outcomes = new Map<string, Ui015Result>();
  /** Server-side running tasks are re-checked every 30 s for at most this many checks. */
  const MAX_WAITS = 20;
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
  /**
   * Unattended default, applied without waiting: recognised titles become art text images and
   * the environment background is restored unless the recognition already found one (that
   * branch is kept automatically). "调整美术字/背景" changes it afterwards.
   */
  function defaultChoice(cut: CanvasNode): Ui015Choice {
    const bbox = selectedUiRecognition(cut)?.bbox;
    return {
      artText: (bbox?.texts || []).filter((item) => item.role === 'title').map((item) => item.id),
      background: Boolean(
        bbox && !bbox.elements.some((item) => uiAtlasElementGroup(item, bbox) === 'background')
      ),
    };
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
    // Prelayout, separation and cutting run as one queue; nothing pauses for a review.
    if (options.queue.remaining(groupId) > 0)
      return {
        stage: 'generation' as const,
        message: autoRuns.has(groupId)
          ? '自动处理中：失败或结果未知的步骤会自动重试，完成后组装 UI'
          : queue?.phase === 'paused'
            ? '已暂停：点击继续，先核对原任务，再自动完成剩余步骤并组装 UI'
            : '下一步：预排、分离生图与切图，完成后自动组装 UI',
      };
    const pending = assetsAwaitingReview(document, list);
    const status = delivery(document, groupId, list);
    return {
      stage: 'assemble' as const,
      message: status?.delivery?.steps.assembled
        ? status.delivery.steps.meta === 'done' && status.delivery.steps.check === 'passed'
          ? 'UI 已生成，可打开编辑器查看与修改'
          : 'UI 已生成，资源元数据或引用检查未完成'
        : status && !status.ready
          ? status.reason || '资源包尚未完整'
          : '素材已切好：下一步组装可编辑 UI',
      bundle,
      status,
      pending,
    };
  }

  /**
   * Input, text removal and two-pass recognition with automatic retries. An unknown
   * recognition is resumed with its original request ID (no double charge); an unknown or
   * failed image is queried first and only resubmitted when no result arrived.
   */
  async function prepare(groupId: string) {
    let waits = 0;
    for (let round = 0; ; round++) {
      const found = cards(options.current()!, groupId);
      if (!found) throw new Error('015 分组结构已变化，请检查连线。');
      try {
        await prepareOnce(found);
        return;
      } catch (error) {
        if (round >= RETRIES) throw error;
        const message = error instanceof Error ? error.message : String(error);
        options.log(
          '015 · 识图准备未完成，第 ' + (round + 1) + ' 次自动重试：' + message.slice(0, 160),
          'warning'
        );
        // Every unfinished card, not only those with a block reason: a task the server still
        // reports as pending/running has no block reason but must be waited for.
        let pending = false;
        for (const id of [found.input.id, found.cut.id])
          if (options.needs(id) || options.problem?.(id))
            pending ||= (await options.recoverImage(id, waits >= MAX_WAITS)) === 'waiting';
        if (pending) {
          // The original task is still running on the server: wait without spending a retry.
          waits++;
          round--;
          await wait(30000);
        } else await wait(3000);
      }
    }
  }
  async function prepareOnce(found: NonNullable<ReturnType<typeof cards>>) {
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

  /**
   * Apply the choice through the existing batch planner. Returns whether batches were added,
   * restored or retired; nothing is saved when the choice leaves the group unchanged.
   */
  async function applyChoice(
    document: CanvasDocument,
    groupId: string,
    choice: Ui015Choice
  ): Promise<boolean> {
    const next = structuredClone(document);
    const created = options.sync(next, groupId, choice.artText, choice.background);
    if (
      JSON.stringify(next.nodes) === JSON.stringify(document.nodes) &&
      JSON.stringify(next.edges) === JSON.stringify(document.edges)
    )
      return false;
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
    return true;
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
      if (view.stage === 'prepare') {
        await prepare(groupId);
        view = inspect(groupId)!;
      }
      const found = cards(document, groupId)!;
      const synced = Boolean(bundleOf(members(document, groupId)));
      const derived = synced
        ? currentChoice(document, members(document, groupId), found.cut)
        : defaultChoice(found.cut);
      const choice: Ui015Choice = {
        artText: input.artText ?? derived.artText,
        background: input.background ?? derived.background,
      };
      // Re-planning also picks up batches added by a new recognition result.
      await applyChoice(document, groupId, choice);
      view = inspect(groupId)!;
      outcomes.delete(groupId);
      if (view.stage === 'generation') {
        autoRuns.set(groupId, autoRuns.get(groupId) || { waits: 0 });
        options.log('015 · 自动执行预排、分离生图与切图（付费步骤记录在运行日志）');
        if (!options.queue.start(groupId, true)) {
          autoRuns.delete(groupId);
          throw new Error(options.failure?.() || '此分组没有可执行的剩余步骤。');
        }
        return { status: 'started', stage: 'generation', message: '正在自动生成', choice };
      }
      if (view.stage === 'assemble') {
        running = '';
        return finalResult(groupId, await assemble(groupId, false, true), choice);
      }
      return { status: 'ready', stage: view.stage, message: view.message, choice };
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

  /** Queue settlement hook: continue groups that advance() is driving to the end. */
  function settled(groupId: string) {
    if (autoRuns.has(groupId)) setTimeout(() => void finishRun(groupId), 0);
  }
  /**
   * After the queue: retry failed or unknown steps (an image result is queried first and only
   * resubmitted when none arrived; at most RETRIES times per card), then assemble whatever
   * exists. Anything still missing is recorded in the delivery and the review prompt.
   */
  function finalResult(
    groupId: string,
    status: CanvasUiDeliveryStatus | undefined,
    choice?: Ui015Choice
  ): Ui015Result {
    const result: Ui015Result = status?.delivery
      ? {
          status: 'ready',
          stage: 'assemble',
          message: 'UI 已生成：' + status.delivery.uiFile,
          ...(choice ? { choice } : {}),
        }
      : {
          status: 'failed',
          stage: 'assemble',
          message: options.failure?.() || status?.reason || '组装未完成',
          ...(choice ? { choice } : {}),
        };
    outcomes.set(groupId, result);
    return result;
  }
  async function finishRun(groupId: string) {
    const run = autoRuns.get(groupId);
    const document_ = options.current();
    if (!run || !document_ || !group(document_, groupId)) {
      autoRuns.delete(groupId);
      return;
    }
    if (running) {
      setTimeout(() => void finishRun(groupId), 2000);
      return;
    }
    const queue = options.queue.view(groupId);
    if (queue && executingPhases.includes(queue.phase)) return;
    // One budget per card: the queue's counter holds both its own and these retries.
    const spent = (id: string) => queue?.retries?.[id] || 0;
    const failed = Object.keys(queue?.failures || {}).filter(
      (id) => spent(id) < RETRIES && document_.nodes.some((node) => node.id === id)
    );
    if (failed.length) {
      for (const id of failed) {
        const node = document_.nodes.find((item) => item.id === id)!;
        const result =
          node.type === 'image'
            ? await options.recoverImage(id, run.waits >= MAX_WAITS)
            : 'released';
        if (result === 'waiting') {
          // The original task is still running on the server: wait, never submit twice.
          run.waits++;
          options.log('015 · 「' + node.title + '」原任务仍在执行，30 秒后再查询', 'info');
          setTimeout(() => void finishRun(groupId), 30000);
          return;
        }
        const count = options.queue.spendRetry(groupId, id);
        options.log(
          '015 · 「' +
            node.title +
            '」' +
            (result === 'recovered'
              ? '已取回原任务结果'
              : '未完成，第 ' + count + ' 次自动重试（生图可能多计一次费用）'),
          'warning'
        );
      }
      if (options.queue.start(groupId, true)) return;
    }
    autoRuns.delete(groupId);
    if (options.queue.remaining(groupId) > 0)
      options.log(
        '015 · 部分步骤重试后仍未完成，按已有素材组装 UI，缺失项写入复核提示词',
        'warning'
      );
    finalResult(groupId, await assemble(groupId, false, true));
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
      : defaultChoice(found.cut);
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
      element(
        'span',
        '额外还原环境背景（识图未找到背景元素时默认勾选；已找到时自动保留）。不勾选则 UI 没有整屏背景图。'
      )
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

  /**
   * Hand-off for the final step: everything the unattended run accepted or could not finish,
   * and the Skill path an AI follows to bring this delivery to a reviewed, complete result.
   */
  function reviewPrompt(document_: CanvasDocument, groupId: string, value: CanvasUiDelivery) {
    const found = cards(document_, groupId);
    const bbox = found && selectedUiRecognition(found.cut)?.bbox;
    const review = value.review;
    const batches = found
      ? found.members.filter(
          (node) => node.type === 'image-assets' && !node.uiEmpty && node.imageAssetsInfo
        )
      : [];
    const pending = found ? assetsAwaitingReview(document_, found.members) : [];
    const todo = [
      review?.missing.length ? '缺少素材、本版 UI 未包含的元素：' + review.missing.join('、') : '',
      review?.unbound.length ? '未绑定的分类：' + review.unbound.join('、') : '',
      pending.length
        ? '未人工复核的切图批次（' +
          pending.length +
          '/' +
          batches.length +
          '）：' +
          pending.map((node) => node.title + '（' + node.id + '）').join('；')
        : '',
      value.steps.meta !== 'done' || value.steps.check !== 'passed'
        ? '资源 meta ' + value.steps.meta + '，引用检查 ' + value.steps.check
        : '',
      value.issue ? '未解决：' + value.issue : '',
    ].filter(Boolean);
    return [
      '请使用 Maker 内置 maker-ui-bbox-workflow Skill 的「复核修复」路径，把这次 015 自动生成的 UI 修到与设计稿一致。只修有问题的部分，不从头生成，不覆盖用户已做的修改。',
      '画布 ID：' + document_.id + '；分组 ID：' + groupId + '；UI 编号：' + value.uiId + '。',
      '设计稿：' +
        (bbox?.design.path || found?.design.assetPath || '未知') +
        '；去文字稿：' +
        (bbox?.cutSource.path || found?.cut.assetPath || '未知') +
        '。',
      '当前版本：' +
        value.directory +
        '；UI 文件：' +
        value.uiFile +
        '；参考图：' +
        value.referenceFile +
        '。',
      todo.length
        ? '自动运行留下的待处理项：\n- ' + todo.join('\n- ')
        : '自动运行没有留下待处理项，仍需看图验收。',
      '运行中自动重试、按原槽位裁切的批次记录在画布运行日志（「自动校正未通过」「组件格为空」）。',
      '修复步骤：',
      '1. 逐批 preview-image-assets 看图：素材完整、透明、无粘连、无多余碎片，按钮按下态正确。只是移位时提交 cut.regions（只改 x/y）后重新预览；真正漏画或粘连时用 update-nodes 改对应分离卡 prompt（写明缺失元素 ID、位置和保留要求），run 这张卡（--allow-paid），再预览。每批看过后带 reviewId confirm-image-assets。',
      '2. 缺少素材的元素：在 inspect 中找到其所在分离卡，按第 1 步补画并确认。识图本身漏项或分类错误时才 recognize-ui 重新识图（会让下游批次失效）。',
      '3. 所有批次确认后 canvas assemble-ui --new-version 生成新版本；新版本的 review 三个列表都应为空，meta done，引用检查 0 错误。',
      '4. ui open 打开新 UI，对照同名参考图检查位置、尺寸、层级、字号、颜色、美术字、背景和按钮状态；偏差用 ui inspect / patch（先 dry-run 再带 revision）修正。',
      '5. 完成标准：全部批次已确认、review 列表为空、引用检查 0 错误、编辑器对照无明显偏差。达不到时报告具体剩余项，不要把部分结果报为完成。',
      '分离卡：' +
        (found
          ? separations(found.members)
              .map((node) => node.title + '（' + node.id + '）')
              .join('；')
          : '请 inspect 分组获取'),
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
        'UI 已自动生成。待复核和缺失项列在下面的提示词里：复制给 AI（按 Skill 复核修复），或打开编辑器自行检查。'
      )
    );
    const prompt = element('textarea');
    prompt.readOnly = true;
    prompt.rows = 8;
    prompt.style.cssText = 'width:100%;box-sizing:border-box';
    prompt.setAttribute('aria-label', 'AI 复核修复提示词');
    prompt.value = reviewPrompt(document_, groupId, value);
    const actions = element('div');
    actions.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap';
    const open = element('button', '打开 UI 编辑器');
    open.type = 'button';
    open.onclick = () => openEditor(value.uiFile);
    const copy = element('button', '复制 AI 复核修复提示词');
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

  /**
   * Assemble the UI, generate resource meta and check references. Runs at the end of every
   * automatic run (auto=true also prepares Python once when meta is blocked) or on a click.
   */
  async function assemble(
    groupId: string,
    newVersion = false,
    auto = false
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
      // JPEG/WebP designs stay unchanged upstream; the editor reference gets a PNG copy.
      const designPath = selectedUiRecognition(found.cut)?.bbox?.design.path;
      const designPng = designPath ? await designPngData(options.store, designPath) : undefined;
      options.log('015 · 组装 UI：导入素材、组装、生成资源 meta 并检查引用');
      let status = await options.store.assembleUi(document_.id, bundle.id, newVersion, designPng);
      if (
        auto &&
        status.delivery?.steps.meta === 'blocked' &&
        options.store.setupPython &&
        !status.python?.ready
      ) {
        options.log('015 · 资源 meta 需要 Python，正在自动准备环境（首次会下载运行时）');
        const python = await options.store.setupPython();
        if (python.ready)
          status = await options.store.assembleUi(document_.id, bundle.id, false, designPng);
        else options.log('015 · Python 环境未就绪：' + (python.message || ''), 'warning');
      }
      deliveries.set(groupId, { key: deliveryKey(found.members), value: status });
      if (!status.ready || !status.delivery) throw new Error(status.reason || '资源包尚未完整。');
      const issue = status.delivery.issue;
      options.log(
        '015 · UI 已生成：' + status.delivery.uiFile + (issue ? '；未完成：' + issue : ''),
        issue ? 'warning' : 'info'
      );
      // An unattended run ends on the header buttons; a modal would block CLI automation
      // (the AI review that follows) until someone closes it.
      if (!auto) openDelivery(groupId, status);
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
      generation: '3 预排、分离与切图',
      assemble: '4 组装 UI',
      running: '执行中',
    };
    const stage = labels[state.stage] || state.stage;
    switch (state.stage) {
      case 'invalid':
        return { stage, extra, hint: state.message };
      case 'design':
        return { stage, primary: run('选择/替换原始设计稿', go), extra, hint: state.message };
      case 'prepare':
        return {
          stage,
          primary: run('开始：自动生成 UI', go, '识图、拆分、预排、分离、切图、组装一次完成'),
          extra,
          hint: state.message,
        };
      case 'generation':
        return { stage, primary: run('继续自动生成', go), extra, hint: state.message };
      case 'assemble': {
        const status = 'status' in state ? state.status : undefined;
        const value = status?.delivery;
        const pending = 'pending' in state ? state.pending || [] : [];
        // Optional manual review of each cut batch; never required to finish.
        if (pending.length)
          extra.push({
            label: '逐批复核切图（' + pending.length + '）',
            run: () => {
              options.focus(pending[0].id);
              options.openAssets(pending[0].id);
            },
          });
        if (value?.steps.assembled) {
          const actions = [
            { label: 'AI 复核修复提示词', run: () => openDelivery(groupId, status!) },
            ...extra,
            { label: '重新组装新版本', run: () => assemble(groupId, true) },
          ];
          if (value.steps.meta !== 'done' || value.steps.check !== 'passed')
            actions.unshift(
              status?.python && !status.python.ready
                ? { label: '准备 Python 环境', run: () => setupPython(groupId) }
                : { label: '补齐 meta 与检查', run: () => assemble(groupId) }
            );
          const review = value.review;
          const todo = review
            ? [
                review.missing.length ? review.missing.length + ' 个元素缺素材' : '',
                review.unbound.length ? review.unbound.length + ' 个分类未绑定' : '',
                review.unreviewed.length ? review.unreviewed.length + ' 个元素未复核切图' : '',
              ].filter(Boolean)
            : [];
          return {
            stage: '5 UI 已生成',
            primary: run('打开 UI 编辑器', () => openEditor(value.uiFile)),
            extra: actions,
            hint:
              state.message +
              '：' +
              value.uiFile +
              (value.issue ? '（' + value.issue + '）' : '') +
              (todo.length ? '；待 AI 复核：' + todo.join('、') + '，点「AI 复核修复提示词」' : ''),
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
    settled,
    isActive(groupId: string) {
      return autoRuns.has(groupId) || running === groupId;
    },
    /** Outcome of the last automatic run, once it has finished (ready or failed). */
    outcome(groupId: string): Ui015Result | undefined {
      return outcomes.get(groupId);
    },
    openChoice,
    get isBusy() {
      return Boolean(running);
    },
  };
}
