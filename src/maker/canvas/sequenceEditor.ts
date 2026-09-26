import type { CanvasNode } from './model.js';
import type { SequenceRunView, SequenceSettings, SequenceCardSource } from './sequence.js';
import type { createSequenceUiController } from './sequenceUi.js';
import type { openFrameEditor } from './frameEditor.js';

export function renderSequenceResult(
  card: HTMLElement,
  node: { frameSetInfo?: CanvasNode['frameSetInfo'] },
  source: SequenceCardSource | undefined,
  run: SequenceRunView | undefined,
  atlasUrl: string | undefined,
  _onSetting: (key: keyof SequenceSettings, value: unknown) => void,
  onAction: (action: string) => void
): void {
  const label = document.createElement('div');
  label.className = 'sequence-source-label';
  label.textContent = source ? '视频源：' + source.title : '视频来源缺失';
  const grid = document.createElement('div');
  grid.className = 'sequence-result-grid';
  grid.addEventListener('wheel', (event) => {
    if (!event.ctrlKey && !event.metaKey) event.stopPropagation();
  });
  if (node.frameSetInfo && atlasUrl) {
    const atlas = new Image();
    const info = node.frameSetInfo;
    const canvases = info.frames.map((frame, index) => {
      const tile = document.createElement('figure');
      const canvas = document.createElement('canvas');
      canvas.width = 160;
      canvas.height = 120;
      const caption = document.createElement('figcaption');
      caption.textContent = String(index + 1);
      tile.append(canvas, caption);
      grid.append(tile);
      return { canvas, frame };
    });
    atlas.onload = () => {
      for (const { canvas, frame } of canvases) {
        const scale = Math.min(canvas.width / frame.width, canvas.height / frame.height);
        canvas
          .getContext('2d')
          ?.drawImage(
            atlas,
            frame.x,
            frame.y,
            frame.width,
            frame.height,
            (canvas.width - frame.width * scale) / 2,
            (canvas.height - frame.height * scale) / 2,
            frame.width * scale,
            frame.height * scale
          );
      }
    };
    atlas.onerror = () => {
      grid.textContent = '帧集图片读取失败，请点击编辑检查。';
    };
    atlas.src = atlasUrl;
  } else {
    grid.classList.add('sequence-result-empty');
    grid.textContent =
      run?.status === 'failed' ? '处理未完成，点击编辑重试' : '尚无帧集，点击编辑开始';
  }
  const edit = document.createElement('button');
  edit.className = 'sequence-edit-button';
  edit.type = 'button';
  edit.textContent = '编辑';
  edit.addEventListener('pointerdown', (event) => event.stopPropagation());
  edit.addEventListener('click', (event) => {
    event.stopPropagation();
    onAction('edit');
  });
  card.append(label, grid, edit);
  if (node.frameSetInfo) {
    const animate = document.createElement('button');
    animate.type = 'button';
    animate.className = 'sequence-animation-button';
    animate.textContent = '创建动画卡';
    animate.addEventListener('click', (event) => {
      event.stopPropagation();
      onAction('animation');
    });
    card.append(animate);
  }
}

export function createSequenceEditor(options: {
  openFrameEditor: typeof openFrameEditor;
  controller: ReturnType<typeof createSequenceUiController>;
  mediaUrl: (path: string) => string;
  actions: (
    run: SequenceRunView | undefined,
    saved: boolean,
    cutout: boolean
  ) => Array<{ label: string; action: string; disabled?: boolean }>;
}) {
  let activeId: string | undefined;
  let selectedFrame = 0;
  let playback: ReturnType<typeof setInterval> | undefined;
  let renderVersion = 0;
  let pendingClose = false;
  let restoreFocus: HTMLElement | null = null;
  let lockRatio = true;
  let tab: 'edit' | 'organize' = 'edit';
  const dialog = document.createElement('dialog');
  dialog.className = 'sequence-editor';
  dialog.setAttribute('aria-label', '序列帧编辑');
  document.body.append(dialog);

  function stopPlayback() {
    if (playback) clearInterval(playback);
    playback = undefined;
  }

  function finishClose() {
    if (options.controller.isBusy) return;
    const closingId = activeId;
    activeId = undefined;
    if (closingId) options.controller.discardEdit(closingId);
    pendingClose = false;
    stopPlayback();
    disposePreview();
    renderVersion += 1;
    dialog.close();
    dialog.replaceChildren();
    if (restoreFocus?.isConnected) restoreFocus.focus();
  }

  function button(label: string, action: () => void, className = '') {
    const element = document.createElement('button');
    element.type = 'button';
    element.textContent = label;
    element.className = className;
    element.addEventListener('click', action);
    return element;
  }

  function confirmAction(message: string, action: () => void) {
    if (dialog.querySelector('.sequence-confirm')) return;
    const panel = document.createElement('div');
    panel.className = 'sequence-confirm';
    panel.setAttribute('role', 'alertdialog');
    panel.setAttribute('aria-label', message);
    const text = document.createElement('p');
    text.textContent = message;
    const cancel = button('继续编辑', () => {
      panel.remove();
    });
    const confirm = button(
      '确认',
      () => {
        panel.remove();
        action();
      },
      'primary'
    );
    panel.append(text, cancel, confirm);
    dialog.append(panel);
    cancel.focus();
  }

  function requestClose() {
    if (!activeId) return;
    const view = options.controller.view(activeId);
    if (view.run?.uploading) return;
    if (!options.controller.hasDraft(activeId) && !options.controller.isBusy) {
      finishClose();
      return;
    }
    confirmAction('放弃本次未保存的编辑？已保存的帧集不会改变。', () => {
      if (options.controller.isBusy) {
        pendingClose = true;
        void options.controller.action(activeId!, 'cancel');
      } else finishClose();
    });
  }

  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    requestClose();
  });
  dialog.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Escape' && dialog.querySelector('.sequence-confirm')) {
      event.preventDefault();
      dialog.querySelector('.sequence-confirm')?.remove();
    }
  });
  dialog.addEventListener('keyup', (event) => event.stopPropagation());

  function render() {
    if (!activeId) return;
    if (pendingClose && !options.controller.isBusy) {
      finishClose();
      return;
    }
    const { node, source, run } = options.controller.view(activeId);
    if (!node?.sequenceSettings) {
      finishClose();
      return;
    }
    stopPlayback();
    const version = ++renderVersion;
    const settings = node.sequenceSettings;
    const saved = Boolean(node.frameSetInfo && !run?.frames.length);
    const stage = saved ? 'complete' : run?.stage || 'extract';
    const busy = run?.status === 'running';
    const stageIndex =
      stage === 'complete'
        ? 4
        : stage === 'extract'
          ? 0
          : stage === 'cutout'
            ? 1
            : stage.startsWith('dedupe')
              ? 2
              : 3;
    const root = document.createElement('div');
    root.className = 'sequence-editor-shell';
    const header = document.createElement('header');
    header.className = 'sequence-editor-header';
    const heading = document.createElement('div');
    const eyebrow = document.createElement('small');
    eyebrow.textContent = 'SEQUENCE STUDIO / 本地处理';
    const title = document.createElement('h2');
    title.textContent = '序列帧编辑';
    const subtitle = document.createElement('span');
    subtitle.textContent = '视频源：' + (source?.title || '已缺失');
    heading.append(eyebrow, title, subtitle);
    const close = button('关闭', requestClose);
    close.disabled = Boolean(run?.uploading);
    header.append(heading, close);

    const tabs = document.createElement('nav');
    tabs.className = 'sequence-editor-tabs';
    tabs.append(
      button(
        '帧编辑',
        () => {
          tab = 'edit';
          render();
        },
        tab === 'edit' ? 'primary' : ''
      ),
      button(
        '整理与输出',
        () => {
          tab = 'organize';
          render();
        },
        tab === 'organize' ? 'primary' : ''
      )
    );
    heading.append(tabs);

    const steps = document.createElement('nav');
    steps.className = 'sequence-editor-steps';
    steps.setAttribute('aria-label', '处理步骤');
    ['抽帧', '统一抠图', '去重复帧', '尺寸与保存'].forEach((label, index) => {
      const step = document.createElement('span');
      step.textContent =
        (index < stageIndex ? '✓ ' : String(index + 1).padStart(2, '0') + ' ') + label;
      step.className = index < stageIndex ? 'complete' : index === stageIndex ? 'active' : '';
      steps.append(step);
    });
    const body = document.createElement('div');
    body.className = 'sequence-editor-body';
    const previewArea = document.createElement('section');
    previewArea.className = 'sequence-editor-preview';
    const stageArea = document.createElement('div');
    stageArea.className = 'sequence-editor-stage checkerboard';
    const canvas = document.createElement('canvas');
    canvas.className = 'sequence-editor-canvas';
    canvas.setAttribute('aria-label', '当前帧预览，抠图步骤可点击背景取色');
    stageArea.append(canvas);
    const controls = document.createElement('div');
    controls.className = 'sequence-preview-controls';
    const strip = document.createElement('div');
    strip.className = 'sequence-editor-strip';
    const panel = document.createElement('aside');
    panel.className = 'sequence-editor-panel';
    const panelTitle = document.createElement('h3');
    panelTitle.textContent = [
      '抽取视频帧',
      '去除统一背景',
      '检查重复帧',
      '输出尺寸',
      '已保存的结果',
    ][stageIndex];
    panel.append(panelTitle);
    let frames = saved
      ? node.frameSetInfo!.frames.map(() => undefined)
      : (run?.frames || []).map((frame) => frame.blob);
    if (!frames.length && run?.previewFrame) frames = [run.previewFrame.blob];
    selectedFrame = Math.min(selectedFrame, Math.max(0, frames.length - 1));
    let comparing = false;
    let drawSequence = 0;
    const frameLabel = document.createElement('span');
    const atlas = saved && node.assetPath ? new Image() : undefined;
    if (atlas) atlas.src = options.mediaUrl(node.assetPath!);
    const atlasReady = atlas?.decode().then(
      () => true,
      () => false
    );
    const bitmaps = new Map<number, ImageBitmap>();
    const previousDispose = disposePreview;
    previousDispose();
    disposePreview = () => {
      for (const bitmap of bitmaps.values()) bitmap.close();
      bitmaps.clear();
    };
    async function bitmapAt(index: number): Promise<CanvasImageSource | undefined> {
      if (atlas) {
        if (!(await atlasReady)) throw new Error('图集读取失败');
        return atlas;
      }
      const blob = frames[index];
      if (!blob) return undefined;
      let bitmap = bitmaps.get(index);
      if (!bitmap) {
        bitmap = await createImageBitmap(blob);
        if (version !== renderVersion) {
          bitmap.close();
          return undefined;
        }
        const cached = bitmaps.get(index);
        if (cached) {
          bitmap.close();
          return cached;
        }
        bitmaps.set(index, bitmap);
      }
      return bitmap;
    }
    async function draw(index: number, target: HTMLCanvasElement, thumbnail = false) {
      const ticket = thumbnail ? 0 : ++drawSequence;
      try {
        const image = await bitmapAt(index);
        if (!image || version !== renderVersion || (!thumbnail && ticket !== drawSequence)) return;
        const crop = atlas ? node!.frameSetInfo!.frames[index] : undefined;
        const width = crop?.width || (image as ImageBitmap).width;
        const height = crop?.height || (image as ImageBitmap).height;
        target.width = thumbnail ? 112 : width;
        target.height = thumbnail ? 84 : height;
        const context = target.getContext('2d')!;
        const scale = Math.min(target.width / width, target.height / height);
        context.drawImage(
          image,
          crop?.x || 0,
          crop?.y || 0,
          width,
          height,
          (target.width - width * scale) / 2,
          (target.height - height * scale) / 2,
          width * scale,
          height * scale
        );
      } catch {
        frameLabel.textContent = '图片读取失败，请重新打开检查素材。';
      }
    }
    function selectFrame(index: number) {
      selectedFrame = index;
      void draw(index, canvas);
      frameLabel.textContent = index + 1 + ' / ' + frames.length + ' 帧';
      for (const tile of Array.from(strip.children))
        tile.classList.toggle('active', Number((tile as HTMLElement).dataset.index) === index);
    }
    const play = button('播放', () => {
      if (playback) {
        stopPlayback();
        play.textContent = '播放';
        return;
      }
      play.textContent = '暂停';
      playback = setInterval(
        () => selectFrame((selectedFrame + 1) % frames.length),
        1000 / settings.fps
      );
    });
    play.disabled = frames.length < 2 || busy;
    controls.append(play, frameLabel);
    if (frames.length && !busy) {
      controls.append(
        button('编辑当前帧', () => {
          stopPlayback();
          const nodeId = activeId!;
          const index = selectedFrame;
          void options.controller.editableFrames(nodeId).then((editable) => {
            if (!editable.length || activeId !== nodeId) return;
            return options.openFrameEditor({
              frames: editable,
              index,
              apply: (result) => options.controller.replaceFrames(nodeId, result),
            });
          });
        })
      );
    }
    const gridArea = document.createElement('section');
    gridArea.className = 'sequence-grid-area';
    const gridTools = document.createElement('div');
    gridTools.className = 'sequence-grid-tools';
    const count = document.createElement('strong');
    count.textContent = '全部帧 / ' + frames.length;
    gridTools.append(count);
    if (run?.frames.length && !busy) {
      gridTools.append(
        button('撤销帧编辑', () => options.controller.undoFrames(activeId!)),
        button('重做', () => options.controller.undoFrames(activeId!, true))
      );
      if (tab === 'organize') {
        gridTools.append(
          button('去除背景', () => {
            void options.controller.action(activeId!, 'organize-cutout');
          }),
          button('检查重复帧', () => {
            void options.controller.action(activeId!, 'organize-dedupe');
          })
        );
        gridTools.append(
          button('倒序', () =>
            options.controller.replaceFrames(activeId!, [...run.frames].reverse())
          ),
          button('隔帧精简', () =>
            options.controller.replaceFrames(
              activeId!,
              run.frames.filter((_frame, index) => index % 2 === 0)
            )
          )
        );
      }
    }
    gridArea.append(gridTools, strip);
    if (saved && !busy && tab === 'organize')
      gridTools.append(
        button('整理已保存帧', () => {
          void options.controller.editableFrames(activeId!);
        })
      );
    if (
      !saved &&
      !busy &&
      run?.frames.length &&
      ['cutout', 'dedupe', 'dedupe-review', 'resize'].includes(stage)
    ) {
      const remove = button('移除当前帧', () => {
        void options.controller.action(activeId!, 'remove-frame', selectedFrame);
      });
      remove.disabled = run.frames.length < 2;
      controls.append(remove);
    }
    if (frames.length) {
      frames.forEach((_frame, index) => {
        const tile = document.createElement('div');
        tile.className = 'sequence-editor-tile';
        tile.dataset.index = String(index);
        const thumb = document.createElement('canvas');
        const select = button(String(index + 1), () => selectFrame(index));
        select.setAttribute('aria-label', '查看第 ' + (index + 1) + ' 帧');
        select.prepend(thumb);
        tile.append(select);
        tile.draggable = !saved && !busy;
        tile.addEventListener('dragstart', (event) => {
          event.dataTransfer?.setData('text/plain', String(index));
        });
        tile.addEventListener('dragover', (event) => event.preventDefault());
        tile.addEventListener('drop', (event) => {
          event.preventDefault();
          if (!run?.frames.length || busy) return;
          const value = event.dataTransfer?.getData('text/plain');
          if (!value) return;
          const from = Number(value);
          if (!Number.isInteger(from) || from < 0 || from >= run.frames.length || from === index)
            return;
          const reordered = [...run.frames];
          const [frame] = reordered.splice(from, 1);
          reordered.splice(index, 0, frame);
          options.controller.replaceFrames(activeId!, reordered);
        });
        const candidate = run?.candidates.find((item) => item.index === index);
        if (candidate) {
          const label = document.createElement('label');
          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.checked = run!.removed.includes(index);
          checkbox.disabled = busy;
          checkbox.setAttribute('aria-label', '移除第 ' + (index + 1) + ' 帧');
          checkbox.addEventListener('change', () => {
            void options.controller.action(activeId!, 'toggle-duplicate', index);
          });
          label.append(checkbox, '重复 ' + Math.round(candidate.similarity * 100) + '%');
          tile.append(label);
        }
        strip.append(tile);
        void draw(index, thumb, true);
      });
      selectFrame(selectedFrame);
    } else {
      canvas.hidden = true;
      const player = document.createElement('video');
      player.className = 'sequence-editor-video';
      player.controls = true;
      player.preload = 'metadata';
      if (source?.assetPath) player.src = options.mediaUrl(source.assetPath);
      stageArea.append(player);
      frameLabel.textContent = busy ? '正在抽取视频帧…' : '先预览视频，再选择抽帧范围';
    }

    function field(
      labelText: string,
      key: keyof SequenceSettings,
      type: string,
      min?: number,
      max?: number,
      step = '1'
    ) {
      const label = document.createElement('label');
      label.className = 'sequence-editor-field';
      label.append(labelText);
      const input = document.createElement('input');
      input.type = type;
      input.setAttribute('aria-label', labelText);
      if (min !== undefined) input.min = String(min);
      if (max !== undefined) input.max = String(max);
      input.step = step;
      input.value = String(settings[key]);
      input.disabled = busy || saved;
      input.addEventListener('change', () => {
        const value = type === 'color' ? input.value : Number(input.value);
        if (!input.checkValidity() || (typeof value === 'number' && !Number.isFinite(value))) {
          input.reportValidity();
          return;
        }
        if (lockRatio && (key === 'width' || key === 'height')) {
          const ratio = settings.width / settings.height;
          options.controller.updateSetting(
            activeId!,
            key === 'width' ? 'height' : 'width',
            Math.max(
              1,
              Math.min(
                2048,
                Math.round(key === 'width' ? Number(value) / ratio : Number(value) * ratio)
              )
            )
          );
        }
        options.controller.updateSetting(activeId!, key, value);
      });
      label.append(input);
      panel.append(label);
    }
    function check(labelText: string, checked: boolean, change: (checked: boolean) => void) {
      const label = document.createElement('label');
      label.className = 'sequence-editor-check';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = checked;
      input.disabled = busy;
      input.addEventListener('change', () => change(input.checked));
      label.append(input, labelText);
      panel.append(label);
    }
    if (stage === 'extract') {
      field('起始时间（秒）', 'start', 'number', 0, source?.videoInfo?.duration, '0.1');
      field('结束时间（0 = 全片）', 'end', 'number', 0, source?.videoInfo?.duration, '0.1');
      field('抽帧 FPS', 'fps', 'number', 1, 30);
    } else if (stage === 'cutout') {
      const hint = document.createElement('p');
      hint.textContent =
        '点击右侧背景取色。色差抠图处理封闭区域及半透明溢色；背景必须与角色/特效不同色，否则会误删同色内容。';
      panel.append(hint);
      const modeLabel = document.createElement('label');
      modeLabel.className = 'sequence-editor-field';
      modeLabel.append('抠图方式');
      const mode = document.createElement('select');
      mode.setAttribute('aria-label', '抠图方式');
      mode.disabled = busy;
      for (const [value, label] of [
        ['chroma', '色差抠图与去溢色'],
        ['connected', '仅边缘连通背景'],
      ]) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        mode.append(option);
      }
      mode.value = settings.cutoutMode || 'connected';
      mode.addEventListener('change', () =>
        options.controller.updateSetting(activeId!, 'cutoutMode', mode.value)
      );
      modeLabel.append(mode);
      panel.append(modeLabel);
      field('背景色', 'backgroundColor', 'color');
      field('颜色容差', 'tolerance', 'range', 0, 255);
      check('统一去除背景', settings.cutout, (checked) =>
        options.controller.updateSetting(activeId!, 'cutout', checked)
      );
      canvas.addEventListener('pointerdown', (event) => {
        if (busy) return;
        const rect = canvas.getBoundingClientRect();
        const pixel = canvas
          .getContext('2d')!
          .getImageData(
            Math.max(
              0,
              Math.min(
                canvas.width - 1,
                Math.floor(((event.clientX - rect.left) / rect.width) * canvas.width)
              )
            ),
            Math.max(
              0,
              Math.min(
                canvas.height - 1,
                Math.floor(((event.clientY - rect.top) / rect.height) * canvas.height)
              )
            ),
            1,
            1
          ).data;
        if (pixel[3] < 16) return;
        options.controller.updateSetting(
          activeId!,
          'backgroundColor',
          '#' +
            Array.from(pixel.slice(0, 3))
              .map((channel) => channel.toString(16).padStart(2, '0'))
              .join('')
        );
        options.controller.updateSetting(activeId!, 'cutout', true);
      });
    } else if (stage.startsWith('dedupe')) {
      const hint = document.createElement('p');
      hint.textContent = run?.candidates.length
        ? '发现 ' + run.candidates.length + ' 张疑似重复帧。底部勾选项会在确认后移除。'
        : '只比较相邻帧；分析后由你确认，不自动删除。';
      panel.append(hint);
      const advanced = document.createElement('details');
      const summary = document.createElement('summary');
      summary.textContent = '调整识别阈值';
      advanced.append(summary);
      field('重复阈值', 'duplicateThreshold', 'number', 0.8, 0.999, '0.001');
      advanced.append(panel.lastElementChild!);
      panel.append(advanced);
    } else if (stage === 'resize') {
      field('输出宽', 'width', 'number', 1, 2048);
      field('输出高', 'height', 'number', 1, 2048);
      check('保持当前比例', lockRatio, (checked) => {
        lockRatio = checked;
      });
      check('像素清晰缩放', settings.pixel, (checked) =>
        options.controller.updateSetting(activeId!, 'pixel', checked)
      );
      const label = document.createElement('label');
      label.className = 'sequence-editor-field';
      label.append('尺寸适配');
      const fit = document.createElement('select');
      fit.setAttribute('aria-label', '尺寸适配');
      fit.disabled = busy;
      for (const [value, title] of [
        ['contain', '完整显示'],
        ['cover', '铺满裁切'],
        ['stretch', '拉伸'],
      ]) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = title;
        fit.append(option);
      }
      fit.value = settings.fit;
      fit.addEventListener('change', () =>
        options.controller.updateSetting(activeId!, 'fit', fit.value)
      );
      label.append(fit);
      panel.append(label);
    } else {
      const info = document.createElement('p');
      info.textContent =
        frames.length +
        ' 帧 · ' +
        settings.width +
        ' × ' +
        settings.height +
        ' · ' +
        settings.fps +
        ' FPS';
      panel.append(info);
      const hint = document.createElement('p');
      hint.textContent = saved
        ? '结果已保存在项目中。重新编辑不会覆盖原结果，直到再次保存成功。'
        : '确认预览后保存回画布，结果会更新到原卡片。';
      panel.append(hint);
    }
    if (stage !== 'extract' && !saved) {
      const restart = button('重新设置抽帧', () =>
        confirmAction('重新抽帧会清除本次后续处理草稿，已保存结果不受影响。', () => {
          void options.controller.action(activeId!, 'reset');
        })
      );
      restart.disabled = busy;
      panel.append(restart);
    }
    if (run?.originalFrames?.length && stage !== 'cutout' && !saved && !busy) {
      const compare = button('查看原帧', () => {
        comparing = !comparing;
        compare.textContent = comparing ? '查看处理结果' : '查看原帧';
        if (!comparing) {
          selectFrame(selectedFrame);
          return;
        }
        stopPlayback();
        const time = run.frames[selectedFrame]?.time;
        const original = run.originalFrames!.find((frame) => frame.time === time);
        if (original)
          void createImageBitmap(original.blob)
            .then((bitmap) => {
              if (version === renderVersion) {
                canvas.width = bitmap.width;
                canvas.height = bitmap.height;
                canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
              }
              bitmap.close();
            })
            .catch(() => {
              frameLabel.textContent = '原帧读取失败。';
            });
      });
      compare.disabled = busy;
      controls.append(compare);
    }
    if (run?.boundaryFrames?.length) {
      const warning = document.createElement('p');
      warning.className = 'sequence-boundary-warning';
      warning.setAttribute('role', 'status');
      warning.textContent =
        '贴边风险：处理帧 ' +
        run.boundaryFrames.map((index) => index + 1).join('、') +
        ' 的可见内容接触边界。可能是源视频裁断或背景残留，请逐帧检查；缩放无法补回缺失内容。';
      previewArea.append(warning);
    }
    previewArea.append(stageArea, controls, panel);
    body.append(gridArea, previewArea);
    const footer = document.createElement('footer');
    footer.className = 'sequence-editor-footer';
    const status = document.createElement('div');
    status.className = run?.error ? 'sequence-editor-error' : 'sequence-editor-status';
    status.textContent =
      run?.error ||
      (saved
        ? '已保存到画布'
        : busy
          ? run.uploading
            ? '正在保存，请稍候…'
            : '处理中 · ' + run.progress + ' / ' + run.total + ' 帧'
          : '修改仅在保存成功后应用到卡片');
    status.setAttribute('aria-live', 'polite');
    if (busy) {
      const progress = document.createElement('progress');
      progress.max = Math.max(1, run.total);
      progress.value = run.progress;
      status.append(progress);
    }
    const actions = document.createElement('div');
    actions.className = 'sequence-editor-actions';
    const choices = options
      .actions(run, saved, settings.cutout)
      .filter((item) => item.action !== 'discard');
    choices.forEach((choice, index) => {
      const action = button(
        choice.label,
        () => {
          void options.controller.action(activeId!, choice.action);
        },
        index === 0 ? 'primary' : ''
      );
      action.disabled = Boolean(choice.disabled) || !source;
      actions.append(action);
    });
    if (saved) actions.append(button('完成并返回画布', finishClose, 'primary'));
    footer.append(status, actions);
    root.append(header, steps, body, footer);
    const confirm = dialog.querySelector('.sequence-confirm');
    dialog.replaceChildren(root);
    if (confirm) dialog.append(confirm);
  }
  let disposePreview = () => {};
  return {
    open(nodeId: string) {
      if (activeId) return;
      restoreFocus = document.activeElement as HTMLElement;
      options.controller.beginEdit(nodeId);
      activeId = nodeId;
      selectedFrame = 0;
      lockRatio = true;
      render();
      dialog.showModal();
    },
    refresh(nodeId: string) {
      if (activeId === nodeId) render();
    },
    get isOpen() {
      return Boolean(activeId);
    },
  };
}
