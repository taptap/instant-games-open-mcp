declare const document: any;
import type { CanvasNode } from './model.js';
import { mergeIconNeedsGeneration } from './mergeIcons.js';
import type { ImageAtlasGrid } from './imageAtlasExport.js';
import { imageAtlasRegions, createImageAtlasExport } from './imageAtlasExport.js';
import { prepareImageAtlas } from './imageAtlasExport.js';
import type { PreparedImageAtlas } from './imageAtlasExport.js';
import { validateAtlasCrops } from './atlasContent.js';
import type { ImageAtlasCrop, ImageAtlasCutSettings } from './atlasContent.js';
import { uiCutoutRgb } from './uiCutout.js';

export function drawImageAtlasPreview(
  canvas: HTMLCanvasElement,
  bitmap: ImageBitmap | HTMLCanvasElement,
  grid: ImageAtlasGrid,
  crops?: ImageAtlasCrop[],
  labels?: string[]
) {
  const regions = crops || imageAtlasRegions(bitmap.width, bitmap.height, grid);
  const scale = Math.min(1, 900 / bitmap.width, 650 / bitmap.height);
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('无法显示网格预览。');
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  context.font = 'bold 14px sans-serif';
  for (const [index, region] of regions.entries()) {
    context.strokeStyle = '#00a883';
    context.lineWidth = 2;
    context.strokeRect(
      region.x * scale,
      region.y * scale,
      region.width * scale,
      region.height * scale
    );
    context.fillStyle = '#075e4c';
    context.fillRect(region.x * scale + 2, region.y * scale + 2, labels ? 160 : 36, 20);
    context.fillStyle = '#fff';
    context.fillText(
      region.name.slice(-3) + (labels ? ' ' + labels[index] : ''),
      region.x * scale + 6,
      region.y * scale + 17
    );
  }
  return regions;
}

export function openImageAtlasDialog(
  node: CanvasNode,
  mediaUrl: (path: string) => string,
  actions?: {
    grid?: ImageAtlasGrid;
    cut?: ImageAtlasCutSettings;
    backgroundColor?: [number, number, number];
    backgroundMode?: 'all' | 'connected';
    create(source: Blob, grid: ImageAtlasGrid, prepared?: PreparedImageAtlas): Promise<boolean>;
    closed?(): void;
  }
) {
  if (
    node.type !== 'image' ||
    !node.assetPath ||
    node.templatePending ||
    mergeIconNeedsGeneration(node)
  )
    throw new Error('请先完成并保存图片，再解析图集。');
  if (document.querySelector('[data-image-atlas-dialog]')) return;
  const dialog = document.createElement('dialog');
  dialog.dataset.imageAtlasDialog = 'true';
  dialog.addEventListener('keydown', (event: any) => event.stopPropagation());
  dialog.addEventListener('keyup', (event: any) => event.stopPropagation());
  dialog.style.cssText =
    'width:min(1000px,94vw);max-height:92vh;box-sizing:border-box;padding:24px;border-radius:14px;border:1px solid #3c414c;background:#17191f;color:#f1ece3;overflow:auto';
  dialog.innerHTML =
    '<h2 style="margin:0 0 12px">图集解析 / 导出单图</h2><p>规则网格适合等距图集；按内容切图允许长条、大小不同或每行数量不同。不识别物品语义，不调用 AI。</p><div data-atlas-fields style="display:flex;gap:12px;flex-wrap:wrap"></div><details style="margin:12px 0"><summary>边距与格间距（像素）</summary><div data-atlas-spacing style="display:flex;gap:12px;flex-wrap:wrap;margin-top:10px"></div></details><div data-atlas-content hidden style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><button type="button" data-atlas-detect>重新检测内容</button><select multiple aria-label="裁切区域" size="4" style="min-width:150px"></select><div data-atlas-box style="display:flex;gap:8px;flex-wrap:wrap"></div><button type="button" data-atlas-merge>合并选框</button><button type="button" data-atlas-split>拆分选框</button><button type="button" data-atlas-delete>删除选框</button><small>点击选择；拖动移动，右下角拖动缩放；空白处拖动添加框。多选后可合并。</small></div><p data-atlas-status role="status">正在读取已保存的图片…</p><div style="overflow:auto;border:1px solid #cad3df;border-radius:8px;background:repeating-conic-gradient(#e0e5eb 0% 25%,#fff 0% 50%) 0 0/20px 20px"><canvas data-atlas-preview style="display:block;max-width:100%;height:auto;margin:auto;touch-action:none"></canvas></div><p style="font-size:12px">预览框就是实际裁切区域。内容模式保留框内像素，不缩放；粘连、碎片、遗漏及原图截断需人工核对。</p><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" data-atlas-confirm>我已核对数量，每框包含完整素材且没有误切</label><div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px"><button type="button" data-atlas-mode="images">导出单图包（PNG ZIP）</button><button type="button" data-atlas-mode="atlas">导出 Maker 静态图集包</button><button type="button" data-atlas-close>关闭</button></div>';
  const grid: ImageAtlasGrid = {
    columns: 4,
    rows: 3,
    marginX: 0,
    marginY: 0,
    gapX: 0,
    gapY: 0,
    ...actions?.grid,
  };
  const fields: Record<string, any> = {};
  const toolbar = dialog.querySelector('[data-atlas-fields]');
  function selectField(label: string, values: Array<[string, string]>) {
    const wrapper = document.createElement('label');
    wrapper.textContent = label + ' ';
    const input = document.createElement('select');
    input.setAttribute('aria-label', label);
    for (const [value, text] of values) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = text;
      input.append(option);
    }
    wrapper.append(input);
    toolbar.append(wrapper);
    return input;
  }
  const mode = selectField('切图方式', [
    ['grid', '规则网格'],
    ...(node.generation?.uiAtlasPlan ? [['slots', '按槽位调整裁切框'] as [string, string]] : []),
    ['content', '按内容切图'],
  ]);
  mode.value =
    node.generation?.uiAtlasPlan && actions?.cut?.mode === 'grid' && actions.cut.regions
      ? 'slots'
      : actions?.cut?.mode || 'grid';
  const background = selectField('背景处理', [
    ['keep', '保留原图透明度'],
    ['magenta', '去洋红底'],
    ['green', '去绿底'],
  ]);
  const color = actions
    ? actions.backgroundColor
    : node.generation?.cutoutColor
      ? uiCutoutRgb(node.generation.cutoutColor)
      : undefined;
  background.value = color ? (color[1] > 128 ? 'green' : 'magenta') : 'keep';
  const expectedLabel = document.createElement('label');
  expectedLabel.textContent = '预期数量（0不限） ';
  const expected = document.createElement('input');
  expected.type = 'number';
  expected.min = '0';
  expected.max = '120';
  expected.style.width = '65px';
  expected.setAttribute('aria-label', '预期数量');
  expected.value = String(
    actions?.cut?.expectedCount ?? (actions?.grid ? grid.columns * grid.rows : 0)
  );
  expectedLabel.append(expected);
  toolbar.append(expectedLabel);
  const confirm = dialog.querySelector('[data-atlas-confirm]');
  const bindingPlan = node.generation?.uiAtlasPlan;
  const bindingLabels = bindingPlan?.slots.map(
    (slot) =>
      slot.elementIds
        .map(
          (id) =>
            id + ' ' + (bindingPlan.bbox.elements.find((element) => element.id === id)?.name || '')
        )
        .join('/') +
      ' ' +
      slot.state
  );
  if (bindingPlan)
    confirm.parentElement.lastChild.textContent =
      '我已核对各格编号、名称及状态与素材一致，没有遗漏或误切';
  const status = dialog.querySelector('[data-atlas-status]');
  const preview = dialog.querySelector('[data-atlas-preview]');
  const editor = dialog.querySelector('[data-atlas-content]');
  const list = editor.querySelector('select');
  const boxFields: Record<string, any> = {};
  const buttons = Array.from(dialog.querySelectorAll('[data-atlas-mode]')) as any[];
  const create = actions && document.createElement('button');
  if (create) {
    create.type = 'button';
    create.textContent = '生成游戏资产卡';
    create.dataset.createImageAssets = 'true';
    dialog.querySelector('[data-atlas-close]').before(create);
    buttons.push(create);
  }
  let source: Blob | undefined;
  let prepared: PreparedImageAtlas | undefined;
  let regions: ImageAtlasCrop[] | undefined = actions?.cut?.regions;
  let selected = 0;
  let busy = false;
  let valid = false;
  let closed = false;
  let revision = 0;
  const enable = () =>
    buttons.forEach((button) => {
      button.disabled = busy || !valid || !confirm.checked;
    });
  function draw() {
    confirm.checked = false;
    valid = false;
    if (!prepared) {
      enable();
      return;
    }
    try {
      drawImageAtlasPreview(preview, prepared.canvas, grid, prepared.regions, bindingLabels);
      const region = prepared.regions[selected];
      if (region && mode.value !== 'grid') {
        const context = preview.getContext('2d');
        context.strokeStyle = '#ffba49';
        context.lineWidth = 3;
        context.strokeRect(
          (region.x * preview.width) / prepared.width,
          (region.y * preview.height) / prepared.height,
          (region.width * preview.width) / prepared.width,
          (region.height * preview.height) / prepared.height
        );
      }
      list.replaceChildren();
      for (const [index, item] of prepared.regions.entries()) {
        const option = document.createElement('option');
        option.value = String(index);
        const slot = node.generation?.uiAtlasPlan?.slots[index];
        option.textContent =
          item.name +
          (slot ? ' · ' + (slot.elementIds.join('/') || slot.role) + ' · ' + slot.state : '') +
          ' · ' +
          item.width +
          '×' +
          item.height;
        option.selected = index === selected;
        list.append(option);
      }
      for (const [key, input] of Object.entries(boxFields)) {
        input.value = region?.[key as keyof ImageAtlasCrop] ?? '';
        input.disabled = !region;
      }
      prepared.regions = validateAtlasCrops(prepared.width, prepared.height, prepared.regions);
      const count = Number(expected.value);
      if (!Number.isInteger(count) || count < 0 || count > 120)
        throw new Error('预期数量必须为0～120。');
      status.textContent =
        prepared.width +
        ' × ' +
        prepared.height +
        ' 像素 · ' +
        prepared.regions.length +
        ' 件 · ' +
        (mode.value === 'content' ? '按实际区域切图，各图尺寸可能不同' : '保留规则单格尺寸');
      if (mode.value === 'content' && count && count !== prepared.regions.length)
        throw new Error(
          '预期 ' +
            count +
            ' 件，当前 ' +
            prepared.regions.length +
            ' 框；请调整框或确认修改预期数量。'
        );
      valid = true;
    } catch (error) {
      status.textContent = (error as Error).message;
    }
    enable();
  }
  async function render(reset = false) {
    const token = ++revision;
    confirm.checked = false;
    valid = false;
    prepared = undefined;
    enable();
    editor.hidden = mode.value === 'grid';
    editor.style.display = mode.value !== 'grid' ? 'flex' : 'none';
    for (const action of ['delete', 'merge', 'split'])
      editor.querySelector('[data-atlas-' + action + ']').disabled = mode.value === 'slots';
    expectedLabel.hidden = mode.value !== 'content';
    if (!source || busy || closed) return;
    try {
      for (const key of Object.keys(grid) as Array<keyof ImageAtlasGrid>) {
        grid[key] = fields[key].value === '' ? NaN : Number(fields[key].value);
        fields[key].disabled = mode.value !== 'grid';
      }
      if (reset) regions = undefined;
      if (mode.value === 'slots' && !regions) {
        const bitmap = await createImageBitmap(source);
        try {
          if (token !== revision || closed) return;
          regions = imageAtlasRegions(bitmap.width, bitmap.height, grid).map((region, index) =>
            bindingPlan?.slots[index].role === 'reserve'
              ? { name: region.name, x: 0, y: 0, width: 1, height: 1, blank: true }
              : region
          );
        } finally {
          bitmap.close();
        }
      }
      status.textContent = '正在计算实际裁切区域…';
      const result = await prepareImageAtlas(
        source,
        grid,
        background.value === 'keep'
          ? undefined
          : background.value === 'green'
            ? [0, 255, 0]
            : [255, 0, 255],
        actions?.backgroundMode || 'all',
        {
          mode: mode.value === 'slots' ? 'grid' : mode.value,
          ...(mode.value !== 'grid' && regions ? { regions } : {}),
        }
      );
      if (token !== revision || closed) return;
      prepared = result;
      if (mode.value !== 'grid') regions = result.regions;
      selected = Math.min(selected, result.regions.length - 1);
      draw();
    } catch (error) {
      if (token === revision && !closed)
        status.textContent =
          (error as Error).message +
          (bindingPlan
            ? ' 可切换「按槽位调整裁切框」，按编号核对；原图未改变。'
            : ' 可切换「按内容切图」；原图未改变。');
    }
  }
  for (const [key, labelText] of Object.entries({
    columns: '列数',
    rows: '行数',
    marginX: '左右边距',
    marginY: '上下边距',
    gapX: '列间距',
    gapY: '行间距',
  })) {
    const label = document.createElement('label');
    label.textContent = labelText + ' ';
    const input = document.createElement('input');
    input.type = 'number';
    input.min = key === 'columns' || key === 'rows' ? '1' : '0';
    input.step = '1';
    input.value = String(grid[key as keyof ImageAtlasGrid]);
    input.setAttribute('aria-label', labelText);
    input.style.width = '65px';
    input.addEventListener('input', () => void render());
    fields[key] = input;
    label.append(input);
    (key === 'columns' || key === 'rows'
      ? toolbar
      : dialog.querySelector('[data-atlas-spacing]')
    ).append(label);
  }
  function commit(next: ImageAtlasCrop[]) {
    if (!prepared || busy) return;
    if (mode.value === 'slots' && next.length !== bindingPlan?.slots.length) return;
    regions = next.map((region, index) => ({
      ...region,
      name: 'item_' + String(index + 1).padStart(3, '0'),
    }));
    prepared.regions = regions;
    draw();
  }
  for (const [key, labelText] of Object.entries({ x: 'X', y: 'Y', width: '宽', height: '高' })) {
    const label = document.createElement('label');
    label.textContent = labelText + ' ';
    const input = document.createElement('input');
    input.type = 'number';
    input.step = '1';
    input.style.width = '65px';
    input.setAttribute('aria-label', '裁切框' + labelText);
    input.addEventListener('change', () => {
      if (prepared)
        commit(
          prepared.regions.map((region, index) =>
            index === selected ? { ...region, [key]: Number(input.value) } : region
          )
        );
    });
    boxFields[key] = input;
    label.append(input);
    editor.querySelector('[data-atlas-box]').append(label);
  }
  list.addEventListener('change', () => {
    selected = Number(list.value);
    const region = prepared?.regions[selected];
    for (const [key, input] of Object.entries(boxFields))
      input.value = region?.[key as keyof ImageAtlasCrop] ?? '';
    confirm.checked = false;
    enable();
  });
  editor.querySelector('[data-atlas-delete]').addEventListener('click', () => {
    const indices = Array.from(list.selectedOptions).map((option: any) => Number(option.value));
    if (prepared) {
      selected = 0;
      commit(prepared.regions.filter((_, index) => !indices.includes(index)));
    }
  });
  editor.querySelector('[data-atlas-merge]').addEventListener('click', () => {
    if (!prepared) return;
    const indices = Array.from(list.selectedOptions).map((option: any) => Number(option.value));
    if (indices.length < 2) {
      status.textContent = '请在区域列表中多选至少两个框。';
      return;
    }
    const picked = prepared.regions.filter((_, index) => indices.includes(index));
    const left = Math.min(...picked.map((region) => region.x)),
      top = Math.min(...picked.map((region) => region.y));
    const merged = {
      name: 'item_001',
      x: left,
      y: top,
      width: Math.max(...picked.map((region) => region.x + region.width)) - left,
      height: Math.max(...picked.map((region) => region.y + region.height)) - top,
    };
    const next = prepared.regions.filter((_, index) => !indices.includes(index));
    next.splice(Math.min(...indices), 0, merged);
    selected = Math.min(...indices);
    commit(next);
  });
  editor.querySelector('[data-atlas-split]').addEventListener('click', () => {
    const region = prepared?.regions[selected];
    if (!prepared || !region || region.width < 2) return;
    const width = Math.floor(region.width / 2),
      next = [...prepared.regions];
    next.splice(
      selected,
      1,
      { ...region, width },
      { ...region, x: region.x + width, width: region.width - width }
    );
    commit(next);
  });
  let drag:
    | { x: number; y: number; index: number; kind: string; region?: ImageAtlasCrop }
    | undefined;
  const point = (event: PointerEvent) => {
    const bounds = preview.getBoundingClientRect();
    return {
      x: Math.max(
        0,
        Math.min(
          prepared!.width - 1,
          Math.round(((event.clientX - bounds.left) * prepared!.width) / bounds.width)
        )
      ),
      y: Math.max(
        0,
        Math.min(
          prepared!.height - 1,
          Math.round(((event.clientY - bounds.top) * prepared!.height) / bounds.height)
        )
      ),
    };
  };
  preview.addEventListener('pointerdown', (event: PointerEvent) => {
    if (!prepared || mode.value === 'grid' || busy) return;
    const position = point(event),
      index = prepared.regions.findIndex(
        (region) =>
          position.x >= region.x &&
          position.x < region.x + region.width &&
          position.y >= region.y &&
          position.y < region.y + region.height
      );
    if (mode.value === 'slots' && index < 0) return;
    const region = prepared.regions[index];
    selected = index < 0 ? prepared.regions.length : index;
    drag = {
      ...position,
      index,
      kind: region
        ? (Math.abs(position.x - region.x - region.width) * preview.width) / prepared.width < 14 &&
          (Math.abs(position.y - region.y - region.height) * preview.height) / prepared.height < 14
          ? 'resize'
          : 'move'
        : 'new',
      region: region && { ...region },
    };
    preview.setPointerCapture(event.pointerId);
    confirm.checked = false;
    valid = false;
    enable();
  });
  function draggedRegions(event: PointerEvent) {
    if (!drag || !prepared) return;
    const position = point(event),
      next = [...prepared.regions],
      original = drag.region;
    if (original)
      next[drag.index] =
        drag.kind === 'resize'
          ? {
              ...original,
              width: Math.max(1, position.x - original.x + 1),
              height: Math.max(1, position.y - original.y + 1),
            }
          : {
              ...original,
              x: Math.max(
                0,
                Math.min(prepared.width - original.width, original.x + position.x - drag.x)
              ),
              y: Math.max(
                0,
                Math.min(prepared.height - original.height, original.y + position.y - drag.y)
              ),
            };
    else
      next.push({
        name: 'item_001',
        x: Math.min(drag.x, position.x),
        y: Math.min(drag.y, position.y),
        width: Math.abs(position.x - drag.x) + 1,
        height: Math.abs(position.y - drag.y) + 1,
      });
    return next;
  }
  preview.addEventListener('pointermove', (event: PointerEvent) => {
    const next = draggedRegions(event);
    if (next && prepared) drawImageAtlasPreview(preview, prepared.canvas, grid, next);
  });
  preview.addEventListener('pointerup', (event: PointerEvent) => {
    const next = draggedRegions(event);
    drag = undefined;
    if (next) commit(next);
  });
  preview.addEventListener('pointercancel', () => {
    drag = undefined;
    draw();
  });
  mode.addEventListener('change', () => void render(true));
  background.addEventListener('change', () => void render(true));
  expected.addEventListener('input', draw);
  editor.querySelector('[data-atlas-detect]').addEventListener('click', () => void render(true));
  const close = () => {
    if (busy) return;
    closed = true;
    revision++;
    prepared = undefined;
    source = undefined;
    dialog.remove();
    actions?.closed?.();
  };
  dialog.querySelector('[data-atlas-close]').addEventListener('click', close);
  dialog.addEventListener('cancel', (event: any) => {
    event.preventDefault();
    close();
  });
  confirm.addEventListener('change', enable);
  for (const button of buttons)
    button.addEventListener('click', async () => {
      if (busy || !valid || !confirm.checked || !source || !prepared) return;
      busy = true;
      enable();
      dialog.querySelectorAll('input,select,button').forEach((element: any) => {
        element.disabled = true;
      });
      try {
        if (button === create && actions) {
          status.textContent = '正在拆分并保存独立 PNG 素材…';
          if (!(await actions.create(source, { ...grid }, prepared)))
            throw new Error('保存未完成，原有资产已保留。');
          busy = false;
          close();
          return;
        }
        const blob = await createImageAtlasExport(
          source,
          { ...grid },
          button.dataset.atlasMode,
          (message) => {
            status.textContent = message;
          },
          {},
          prepared
        );
        const url = URL.createObjectURL(blob),
          link = document.createElement('a');
        link.href = url;
        link.download =
          button.dataset.atlasMode === 'atlas' ? 'items-atlas.zip' : 'items-images.zip';
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        status.textContent = '已发起下载，请查看浏览器下载记录。原图和画布未改变。';
      } catch (error) {
        status.textContent = '处理失败：' + (error as Error).message;
      } finally {
        busy = false;
        dialog.querySelectorAll('input,select,button').forEach((element: any) => {
          element.disabled = false;
        });
        Object.values(fields).forEach((input: any) => {
          input.disabled = mode.value !== 'grid';
        });
        for (const action of ['delete', 'merge', 'split'])
          editor.querySelector('[data-atlas-' + action + ']').disabled = mode.value === 'slots';
        enable();
      }
    });
  document.body.append(dialog);
  dialog.showModal();
  enable();
  void fetch(mediaUrl(node.assetPath))
    .then(async (response) => {
      if (!response.ok) throw new Error('图片读取失败，请重新打开。');
      source = await response.blob();
      if (!closed) await render();
    })
    .catch((error) => {
      if (!closed) status.textContent = error.message;
    });
}
