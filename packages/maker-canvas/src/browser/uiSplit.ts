/** Conversation-owned UI slicing; the editor only mirrors the published manifest. */
export function createCanvasUiSplitController(options: {
  current(): any;
  blocked?(): boolean;
  store: any;
  host: any;
  save(): Promise<boolean>;
  changed(): void;
  render(): void;
  remember(): void;
  createId(): string;
  error(message: string): void;
}) {
  let running: Promise<void> | undefined;
  let retryDocument: unknown;
  const readyByGroup = new WeakMap<object, { revision: unknown; paths: Set<string> }>();
  const needsSync = () => Boolean(retryDocument && retryDocument === options.current());
  function waitFor<T>(operation: Promise<T>, ms: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Reading UI split results timed out.')), ms);
    });
    return Promise.race([operation, timeout]).finally(() => clearTimeout(timer));
  }
  const validName = (value: unknown): value is string =>
    typeof value === 'string' && /^[\p{L}\p{N}_-]{1,40}$/u.test(value);
  const labels: Record<string, string> = {
    remove_text: '去文字',
    recognize_elements: '识别 UI 元素',
    recognize_text: '识别文字',
    separate: '分离与切图',
    review: '待对话确认',
    done: '已完成',
  };
  async function start(nodeId: string, name: string) {
    if (!validName(name)) throw new Error('UI 切分名称无效。');
    const doc = options.current();
    const node = doc?.nodes.find(
      (item: any) => item.id === nodeId && item.type === 'image' && item.assetPath
    );
    if (!doc || !node || !options.host.startUiSplit) throw new Error('请重新选择一张画布图片。');
    const previous = doc.nodes.find((item: any) => item.uiSplit?.name === name);
    if (previous?.uiSplit.chatId) {
      await options.host.openSpriteChat(previous.uiSplit.chatId);
      return;
    }
    if (previous) {
      const result = await options.host.startUiSplit({
        canvasId: doc.id,
        nodeId: node.id,
        name,
        sourcePath: previous.uiSplit.sourcePath,
      });
      if (result?.chatId && options.current() === doc) {
        previous.uiSplit.chatId = result.chatId;
        options.changed();
        options.render();
        await options.save();
      }
      return;
    }
    options.remember();
    const group = {
      id: options.createId(),
      type: 'section',
      title: 'UI 切分：' + name,
      x: node.x + node.width + 64,
      y: node.y,
      width: 360,
      height: 420,
      uiSplit: { name, sourcePath: node.assetPath, sourceId: node.id, dismissed: [] as string[] },
    };
    doc.nodes.push(group);
    options.changed();
    options.render();
    if (!(await options.save())) throw new Error('请先保存画布再开始。');
    const result = await options.host.startUiSplit({
      canvasId: doc.id,
      nodeId: node.id,
      name,
      sourcePath: node.assetPath,
    });
    if (options.current() !== doc) return;
    if (result?.chatId) {
      (group.uiSplit as any).chatId = result.chatId;
      options.changed();
      options.render();
      await options.save();
    }
  }
  function sync(tidyId?: string): Promise<void> {
    if (running) return tidyId ? running.catch(() => undefined).then(() => sync(tidyId)) : running;
    const doc = options.current();
    if (!doc || !options.store.readUiSplitProgress) return Promise.resolve();
    if (options.blocked?.()) {
      retryDocument = doc;
      return Promise.resolve();
    }
    if (!tidyId) retryDocument = undefined;
    running = apply(doc, tidyId, Date.now() + 45000).finally(() => {
      running = undefined;
    });
    return running;
  }
  async function apply(doc: any, tidyId: string | undefined, deadline: number) {
    let edited = false;
    try {
      for (const group of doc.nodes.filter(
        (item: any) =>
          item.type === 'section' &&
          item.uiSplit &&
          validName(item.uiSplit.name) &&
          (!tidyId || item.id === tidyId)
      )) {
        const remaining = deadline - Date.now();
        if (remaining <= 0 || options.blocked?.()) {
          retryDocument = doc;
          break;
        }
        const run = group.uiSplit;
        const live = () =>
          options.current() === doc && doc.nodes.includes(group) && group.uiSplit === run;
        const layoutKey = () =>
          JSON.stringify(
            doc.nodes
              .filter(
                (node: any) =>
                  node === group || node.sectionId === group.id || node.id === run.sourceId
              )
              .map((node: any) => [node.id, node.x, node.y, node.width, node.height])
          );
        const layoutBefore = tidyId ? layoutKey() : '';
        let progress: any;
        try {
          progress = await waitFor(
            options.store.readUiSplitProgress(run.name),
            Math.min(20000, remaining)
          );
        } catch (error: any) {
          if (!tidyId) {
            if (error?.status !== 404) retryDocument = doc;
            continue;
          }
          if (error?.status === 404) throw new Error('No UI split results to arrange yet.');
          throw error;
        }
        if (options.current() !== doc) return;
        if (!live()) continue;
        if (
          !progress ||
          progress.version !== 1 ||
          progress.name !== group.uiSplit.name ||
          progress.design?.path !== group.uiSplit.sourcePath ||
          !Array.isArray(progress.artifacts)
        )
          throw new Error('UI 切分进度格式或原稿不匹配。');
        const artifacts = progress.artifacts.slice(0, 500);
        const batches = Array.isArray(progress.batches) ? progress.batches.slice(0, 100) : [];
        const partBatch = new Map<string, number>();
        batches.forEach((batch: any, index: number) => {
          if (!batch || typeof batch !== 'object') return;
          if (batch.result?.path) {
            artifacts.push({
              key: 'separated-' + index,
              path: batch.result.path,
              title: '分离图 · 批次 ' + (index + 1),
            });
          }
          if (Array.isArray(batch.slots)) {
            for (const slot of batch.slots) {
              if (
                slot &&
                !slot.reserve &&
                typeof slot.elementId === 'string' &&
                typeof slot.state === 'string'
              )
                partBatch.set(slot.elementId + '-' + slot.state, index);
            }
          }
        });
        const partDimensions = new Map<string, { width: number; height: number }>();
        if (Array.isArray(progress.bindings)) {
          for (const binding of progress.bindings.slice(0, 1000)) {
            if (
              binding &&
              typeof binding.path === 'string' &&
              Number.isInteger(binding.width) &&
              Number.isInteger(binding.height) &&
              binding.width > 0 &&
              binding.height > 0
            )
              partDimensions.set(binding.path, { width: binding.width, height: binding.height });
          }
        }
        const prefix = 'assets/image/ui-split/' + group.uiSplit.name + '/';
        for (const artifact of artifacts) {
          if (
            typeof artifact.key !== 'string' ||
            typeof artifact.path !== 'string' ||
            !/\.(png|jpe?g|webp)$/i.test(artifact.path) ||
            artifact.path
              .split('/')
              .some((part: string) => !part || part === '.' || part === '..') ||
            /[\\?#%:]/.test(artifact.path) ||
            (artifact.path !== group.uiSplit.sourcePath && !artifact.path.startsWith(prefix))
          )
            throw new Error('UI 切分产物路径无效。');
        }
        const sourceCandidate = () => {
          const sources = doc.nodes.filter(
            (node: any) =>
              node.type === 'image' &&
              !node.mirror &&
              (!node.sectionId || node.sectionId === group.id) &&
              node.assetPath === run.sourcePath
          );
          return sources.find((node: any) => node.id === run.sourceId) || sources[0];
        };
        const findCard = (key: string) =>
          doc.nodes.find(
            (node: any) =>
              node.sectionId === group.id &&
              node.mirror?.source === 'ui-split' &&
              node.mirror.key === key
          );
        const sourceBefore = sourceCandidate();
        const previous = readyByGroup.get(group);
        const ready =
          previous && previous.revision === progress.revision ? previous.paths : new Set<string>();
        readyByGroup.set(group, { revision: progress.revision, paths: ready });
        const paths = new Map<string, boolean>();
        for (const { key, path } of artifacts) {
          if (
            run.dismissed.includes(key) ||
            (key === 'original' && sourceBefore?.assetPath === path)
          )
            continue;
          const card = findCard(key);
          if (ready.has(path) || (card?.assetPath === path && run.revision === progress.revision))
            continue;
          paths.set(path, Boolean(paths.get(path) || card?.assetPath === path));
        }
        const queue = [...paths];
        const failed = new Set<string>();
        let cursor = 0;
        await Promise.all(
          Array.from({ length: Math.min(4, queue.length) }, async () => {
            while (cursor < queue.length && live() && !options.blocked?.()) {
              const [path, refresh] = queue[cursor++];
              const budget = Math.min(12000, deadline - Date.now());
              if (budget <= 0) break;
              try {
                await waitFor(
                  options.store.prepareMedia(path, refresh, Math.max(1, budget - 100)),
                  budget
                );
                ready.add(path);
              } catch {
                failed.add(path);
              }
            }
          })
        );
        if (options.current() !== doc) return;
        if (!live()) continue;
        if (options.blocked?.() || (tidyId && layoutBefore !== layoutKey())) {
          retryDocument = doc;
          if (tidyId)
            throw new Error('The canvas changed while arranging. Finish editing and try again.');
          continue;
        }
        const before = JSON.stringify(doc);
        const source = sourceCandidate();
        const adoptSource = source && !source.sectionId;
        const original = doc.nodes.find(
          (node: any) =>
            node.sectionId === group.id &&
            node.mirror?.source === 'ui-split' &&
            node.mirror.key === 'original' &&
            node.assetPath === group.uiSplit.sourcePath
        );
        const keep = new Set<string>();
        const cards = new Map<string, any>();
        const auto = new Set<string>();
        const additions: any[] = [];
        let missing = failed.size > 0 || cursor < queue.length;
        const updates = new Map<any, string>();
        for (const artifact of artifacts) {
          const key = artifact.key;
          if (key === 'original' && source && artifact.path === source.assetPath) continue;
          keep.add(key);
          if (group.uiSplit.dismissed.includes(key)) continue;
          let card = findCard(key);
          const available =
            ready.has(artifact.path) ||
            (card?.assetPath === artifact.path && run.revision === progress.revision);
          if (!available) missing = true;
          if (!card) {
            if (!available) continue;
            auto.add(key);
            card = {
              id: options.createId(),
              type: 'image',
              title: artifact.title || key,
              x: group.x + 24,
              y: group.y + 64,
              width: 260,
              height: 240,
              assetPath: artifact.path,
              sectionId: group.id,
              mirror: { source: 'ui-split', name: group.uiSplit.name, key },
            };
            additions.push(card);
          } else if (available && card.assetPath !== artifact.path) {
            updates.set(card, artifact.path);
          }
          const placed = card.mirror.placed;
          const legacyCol = (card.x - group.x - 24) / 284;
          const legacyRow = (card.y - group.y - 64) / 280;
          if (
            placed
              ? card.x === placed.x && card.y === placed.y
              : Number.isInteger(legacyCol) &&
                legacyCol >= 0 &&
                legacyCol < 3 &&
                Number.isInteger(legacyRow) &&
                legacyRow >= 0
          )
            auto.add(key);
          cards.set(key, card);
        }
        if (tidyId) options.remember();
        for (const [card, path] of updates) {
          card.assetPath = path;
          delete card.imageInfo;
        }
        if (source) source.sectionId = group.id;
        doc.nodes.push(...additions);
        const nodes = doc.nodes.filter(
          (item: any) =>
            !(
              item.sectionId === group.id &&
              item.mirror?.source === 'ui-split' &&
              !keep.has(item.mirror.key)
            )
        );
        doc.nodes = nodes;
        const ids = new Set(nodes.map((item: any) => item.id));
        if (source && original) {
          for (const edge of doc.edges) {
            if (
              edge.from === original.id &&
              edge.kind === 'image-variant' &&
              ['text-free', 'cut'].some((key) => cards.get(key)?.id === edge.to)
            )
              edge.from = source.id;
          }
        }
        doc.edges = doc.edges.filter((edge: any) => ids.has(edge.from) && ids.has(edge.to));
        if (tidyId) {
          const cardIds = new Set([...cards.values()].map((card) => card.id));
          doc.edges = doc.edges.filter(
            (edge: any) =>
              edge.kind !== 'image-variant' ||
              (!cardIds.has(edge.from) && edge.from !== source?.id) ||
              !cardIds.has(edge.to)
          );
          for (const card of cards.values()) delete card.mirror.linked;
        }
        function layout(
          key: string,
          x: number,
          y: number,
          width: number,
          height: number,
          title?: string
        ) {
          const card = cards.get(key);
          if (!card) return;
          if (title) card.title = title;
          if (!tidyId && !auto.has(key)) return;
          Object.assign(card, { x: group.x + x, y: group.y + y, width, height });
          card.mirror.placed = { x: card.x, y: card.y };
        }
        function link(fromKey: string, toKey: string) {
          const from = fromKey === 'original' && source ? source : cards.get(fromKey);
          const to = cards.get(toKey);
          if (!from || !to || to.mirror.linked) return;
          if (!doc.edges.some((edge: any) => edge.to === to.id))
            doc.edges.push({
              id: options.createId(),
              from: from.id,
              to: to.id,
              kind: 'image-variant',
            });
          to.mirror.linked = true;
        }
        const cutKey = cards.has('text-free') ? 'text-free' : 'cut';
        link('original', cutKey);
        const rows = new Map<number, string[]>();
        const rowFor = (index: number) => {
          if (!rows.has(index)) rows.set(index, []);
          return rows.get(index)!;
        };
        for (const key of cards.keys()) {
          const batchKey = /^(?:prelayout|separated)-(\d+)$/.exec(key);
          if (batchKey) rowFor(Number(batchKey[1]));
          else if (key !== 'original' && key !== cutKey) rowFor(partBatch.get(key) ?? -1).push(key);
        }
        const cut = cards.get(cutKey);
        const sourceWasAligned = source && cut && source.x === group.x + 24 && source.y === cut.y;
        let firstReference: number | undefined;
        let lastReference: number | undefined;
        const cutX = 336;
        const cutWidth = 260;
        const referenceX = cutX + cutWidth + 224;
        const sheetWidth = 224;
        const sheetHeight = 264;
        const separatedX = referenceX + sheetWidth + 64;
        const partsX = separatedX + sheetWidth + 64;
        const partFrameLimit = 118;
        const partMaxHeight = partFrameLimit + 42;
        const partRowStep = partMaxHeight + 44;
        let top = 68;
        for (const [index, parts] of [...rows].sort(
          ([left], [right]) => (left < 0 ? Infinity : left) - (right < 0 ? Infinity : right)
        )) {
          const reference = 'prelayout-' + index;
          const separated = 'separated-' + index;
          const suffix = ' · 批次 ' + (index + 1);
          layout(reference, referenceX, top, sheetWidth, sheetHeight, '预排参考图' + suffix);
          layout(separated, separatedX, top, sheetWidth, sheetHeight);
          const ref = cards.get(reference);
          if (ref) {
            const center = ref.y - group.y + ref.height / 2;
            firstReference =
              firstReference === undefined ? center : Math.min(firstReference, center);
            lastReference = lastReference === undefined ? center : Math.max(lastReference, center);
          }
          link(cutKey, reference);
          link(reference, separated);
          const partCenter = cards.has(separated) ? sheetHeight / 2 : partMaxHeight / 2;
          parts.forEach((key, position) => {
            const card = cards.get(key);
            const dimensions = partDimensions.get(card.assetPath) || card.imageInfo;
            let width = 120;
            let height = 120;
            if (dimensions?.width > 0 && dimensions?.height > 0) {
              const scale = partFrameLimit / Math.max(dimensions.width, dimensions.height);
              width = Math.max(48, Math.round(dimensions.width * scale) + 2);
              height = Math.max(2, 2 * Math.round((dimensions.height * scale) / 2)) + 42;
            }
            layout(
              key,
              (index < 0 ? referenceX : partsX) + (position % 5) * 144,
              top + partCenter + Math.floor(position / 5) * partRowStep - height / 2,
              width,
              height
            );
            if (position === 0) link(separated, key);
          });
          const partHeight = parts.length
            ? partCenter + (Math.ceil(parts.length / 5) - 1) * partRowStep + partMaxHeight / 2
            : 0;
          top += Math.max(sheetHeight, partHeight) + 64;
        }
        const sourceTop =
          firstReference === undefined || lastReference === undefined
            ? 68
            : Math.max(68, Math.round((firstReference + lastReference) / 2 - 150));
        layout(cutKey, cutX, sourceTop, cutWidth, 300);
        layout('original', 24, sourceTop, 260, 300);
        if (source && (adoptSource || tidyId || sourceWasAligned)) {
          Object.assign(source, {
            x: group.x + 24,
            y: group.y + sourceTop,
            width: 260,
            height: 300,
          });
        }
        const members = doc.nodes.filter((item: any) => item.sectionId === group.id);
        if (members.length && (tidyId || auto.size || adoptSource)) {
          group.width = Math.max(
            360,
            ...members.map((item: any) => item.x + item.width - group.x + 24)
          );
          group.height = Math.max(
            420,
            ...members.map((item: any) => item.y + item.height - group.y + 24)
          );
        }
        group.uiSplit.phase = progress.error
          ? '待对话处理：' +
            (typeof progress.error === 'string' ? progress.error : '原请求尚未完成')
          : labels[progress.phase] || '等待对话开始';
        if (missing) retryDocument = doc;
        else run.revision = progress.revision;
        if (JSON.stringify(doc) !== before) edited = true;
      }
    } finally {
      if (edited && options.current() === doc) {
        options.changed();
        if (!options.blocked?.()) options.render();
        if (!(await options.save()) && tidyId)
          throw new Error('Could not save the layout. Save the canvas and try again.');
      }
    }
  }
  function decorate(world: HTMLElement) {
    const doc = options.current();
    if (!doc) return;
    for (const group of doc.nodes.filter((item: any) => item.uiSplit)) {
      const header = world.querySelector(
        '.card[data-id="' + CSS.escape(group.id) + '"] .canvas-group-state'
      );
      if (!header) continue;
      header.textContent = group.uiSplit.phase || '等待对话开始';
      const tidy = document.createElement('button');
      tidy.type = 'button';
      tidy.className = 'canvas-sprite-chat canvas-ui-split-tidy';
      tidy.textContent = '重新整理';
      tidy.onclick = (event) => {
        event.stopPropagation();
        const target = doc;
        tidy.disabled = true;
        void (async () => {
          if (running) await running.catch(() => undefined);
          if (options.current() === target) await sync(group.id);
        })()
          .catch((error) => options.error(error.message))
          .finally(() => {
            tidy.disabled = false;
          });
      };
      const open = document.createElement('button');
      open.className = 'canvas-sprite-chat';
      open.textContent = '打开切分对话';
      open.disabled = !group.uiSplit.chatId;
      open.onclick = (event) => {
        event.stopPropagation();
        void Promise.resolve(options.host.openSpriteChat?.(group.uiSplit.chatId)).catch((error) =>
          options.error(error.message)
        );
      };
      for (const button of header.parentElement?.querySelectorAll('.canvas-sprite-chat') || [])
        button.remove();
      tidy.addEventListener('pointerdown', (event) => event.stopPropagation());
      open.addEventListener('pointerdown', (event) => event.stopPropagation());
      header.after(tidy, open);
      if (options.host.downloadUiSplit && group.uiSplit.phase === labels.done) {
        const download = document.createElement('button');
        download.type = 'button';
        download.className = 'canvas-sprite-chat';
        download.textContent = '下载 UI 资源包';
        download.addEventListener('pointerdown', (event) => event.stopPropagation());
        download.onclick = (event) => {
          event.stopPropagation();
          download.disabled = true;
          void options.host
            .downloadUiSplit(group.uiSplit.name, group.uiSplit.sourcePath, {
              canvasId: doc.id,
              groupId: group.id,
              title: doc.title,
            })
            .catch((error: Error) => options.error(error.message))
            .finally(() => {
              download.disabled = false;
            });
        };
        open.after(download);
      }
      if (options.host.openUiSplitEditor && group.uiSplit.phase === labels.done) {
        const editor = document.createElement('button');
        editor.type = 'button';
        editor.className = 'canvas-sprite-chat';
        editor.textContent = '在 UI 编辑器打开';
        editor.addEventListener('pointerdown', (event) => event.stopPropagation());
        editor.onclick = (event) => {
          event.stopPropagation();
          editor.disabled = true;
          void options.host
            .openUiSplitEditor(group.uiSplit.name, group.uiSplit.sourcePath)
            .catch((error: Error) => options.error(error.message))
            .finally(() => {
              editor.disabled = false;
            });
        };
        open.after(editor);
      }
    }
  }
  function dismiss(nodeIds: string[]) {
    const doc = options.current();
    if (!doc) return;
    for (const node of doc.nodes) {
      if (!nodeIds.includes(node.id) || node.mirror?.source !== 'ui-split') continue;
      const group = doc.nodes.find((item: any) => item.id === node.sectionId && item.uiSplit);
      if (group && !group.uiSplit.dismissed.includes(node.mirror.key))
        group.uiSplit.dismissed.push(node.mirror.key);
    }
  }
  return { start, sync, needsSync, decorate, dismiss };
}
