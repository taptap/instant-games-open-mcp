declare const document: any;
declare const createImageBitmap: any;
import type { CanvasNode } from './model.js';
import { mergeIconNeedsGeneration } from './mergeIcons.js';
import type { ImageAtlasGrid } from './imageAtlasExport.js';
import { imageAtlasRegions, createImageAtlasExport } from './imageAtlasExport.js';

export function drawImageAtlasPreview(
  canvas: HTMLCanvasElement,
  bitmap: ImageBitmap,
  grid: ImageAtlasGrid
) {
  const regions = imageAtlasRegions(bitmap.width, bitmap.height, grid);
  const scale = Math.min(1, 900 / bitmap.width, 650 / bitmap.height);
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('无法显示网格预览。');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  context.font = 'bold 14px sans-serif';
  for (const region of regions) {
    context.strokeStyle = '#00a883';
    context.lineWidth = 2;
    context.strokeRect(
      region.x * scale,
      region.y * scale,
      region.width * scale,
      region.height * scale
    );
    context.fillStyle = '#075e4c';
    context.fillRect(region.x * scale + 2, region.y * scale + 2, 36, 20);
    context.fillStyle = '#fff';
    context.fillText(region.name.slice(-3), region.x * scale + 6, region.y * scale + 17);
  }
  return regions;
}

export function openImageAtlasDialog(
  node: CanvasNode,
  mediaUrl: (path: string) => string,
  actions?: {
    grid?: ImageAtlasGrid;
    create(source: Blob, grid: ImageAtlasGrid): Promise<boolean>;
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
    '<h2 style="margin:0 0 12px">图集解析 / 导出单图</h2><p>只处理规则网格，不识别物品语义。先用已有的「抠背景」处理，再核对每格是否包含完整物品。</p><div data-atlas-fields style="display:flex;gap:12px;flex-wrap:wrap"></div><details style="margin:12px 0"><summary>边距与格间距（像素）</summary><div data-atlas-spacing style="display:flex;gap:12px;flex-wrap:wrap;margin-top:10px"></div></details><p data-atlas-status role="status">正在读取已保存的图片…</p><div style="overflow:auto;border:1px solid #cad3df;border-radius:8px;background:repeating-conic-gradient(#e0e5eb 0% 25%,#fff 0% 50%) 0 0/20px 20px"><canvas data-atlas-preview style="display:block;max-width:100%;height:auto;margin:auto"></canvas></div><p style="font-size:12px">编号按从左到右、从上到下。边界穿过物品时不要导出；调整行列、边距或原图。导出保留原图像素与透明度，不自动裁透明边。</p><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" data-atlas-confirm>我已核对网格，每格的物品完整且不跨格</label><div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px"><button type="button" data-atlas-mode="images">导出单图包（PNG ZIP）</button><button type="button" data-atlas-mode="atlas">导出 Maker 静态图集包</button><button type="button" data-atlas-close>关闭</button></div>';
  const fields: Record<string, any> = {};
  const grid: ImageAtlasGrid = {
    columns: 4,
    rows: 3,
    marginX: 0,
    marginY: 0,
    gapX: 0,
    gapY: 0,
    ...actions?.grid,
  };
  const confirm = dialog.querySelector('[data-atlas-confirm]');
  const status = dialog.querySelector('[data-atlas-status]');
  const preview = dialog.querySelector('[data-atlas-preview]');
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
  let bitmap: any;
  let busy = false;
  let valid = false;
  let closed = false;
  const enable = () =>
    buttons.forEach((button) => {
      button.disabled = busy || !valid || !confirm.checked;
    });
  const render = () => {
    confirm.checked = false;
    valid = false;
    if (!bitmap) {
      enable();
      return;
    }
    try {
      for (const key of Object.keys(grid) as Array<keyof ImageAtlasGrid>)
        grid[key] = fields[key].value === '' ? NaN : Number(fields[key].value);
      const regions = drawImageAtlasPreview(preview, bitmap, grid);
      status.textContent =
        bitmap.width +
        ' × ' +
        bitmap.height +
        ' 像素 · ' +
        regions.length +
        ' 件 · 每格约 ' +
        regions[0].width +
        ' × ' +
        regions[0].height +
        ' 像素';
      valid = true;
    } catch (error) {
      status.textContent = (error as Error).message;
    }
    enable();
  };
  for (const [key, labelText] of Object.entries({
    columns: '列数',
    rows: '行数',
    marginX: '左右边距',
    marginY: '上下边距',
    gapX: '列间距',
    gapY: '行间距',
  })) {
    const label = document.createElement('label');
    label.style.cssText = 'display:flex;align-items:center;gap:6px';
    const input = document.createElement('input');
    input.type = 'number';
    input.min = key === 'columns' || key === 'rows' ? '1' : '0';
    input.step = '1';
    input.value = String(grid[key as keyof ImageAtlasGrid]);
    input.setAttribute('aria-label', labelText);
    input.style.width = '75px';
    input.addEventListener('input', render);
    fields[key] = input;
    label.append(labelText, input);
    dialog
      .querySelector(
        key === 'columns' || key === 'rows' ? '[data-atlas-fields]' : '[data-atlas-spacing]'
      )
      .append(label);
  }
  const close = () => {
    if (busy) return;
    closed = true;
    bitmap?.close();
    bitmap = undefined;
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
      if (busy || !valid || !confirm.checked || !source) return;
      busy = true;
      enable();
      Object.values(fields).forEach((input) => {
        input.disabled = true;
      });
      confirm.disabled = true;
      try {
        if (button === create && actions) {
          status.textContent = '正在拆分并保存独立 PNG 素材…';
          if (!(await actions.create(source, { ...grid })))
            throw new Error('保存未完成，原有资产已保留，请检查后重试。');
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
          }
        );
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download =
          button.dataset.atlasMode === 'atlas' ? 'items-atlas.zip' : 'items-images.zip';
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        status.textContent = '已发起下载，请查看浏览器下载记录。原图和画布未改变。';
      } catch (error) {
        status.textContent =
          (button === create ? '游戏资产生成失败：' : '导出失败：') + (error as Error).message;
      } finally {
        busy = false;
        Object.values(fields).forEach((input) => {
          input.disabled = false;
        });
        confirm.disabled = false;
        enable();
      }
    });
  document.body.append(dialog);
  dialog.showModal();
  enable();
  void (async () => {
    try {
      const response = await fetch(mediaUrl(node.assetPath!));
      if (!response.ok) throw new Error('图片读取失败，请关闭后重试。');
      const blob = await response.blob();
      if (closed) return;
      if (!blob.size || blob.size > 128 * 1024 * 1024) throw new Error('图片为空或超过 128 MiB。');
      const decoded = await createImageBitmap(blob);
      if (closed) {
        decoded.close();
        return;
      }
      source = blob;
      bitmap = decoded;
      render();
    } catch (error) {
      if (!closed) status.textContent = (error as Error).message || '图片无法解码，请关闭后重试。';
    }
  })();
}
