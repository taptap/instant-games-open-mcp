import type { CanvasWorkflowTemplate, CanvasNode } from '../contracts.js';
import type { CanvasTemplateStore } from './store.js';

export function mountTemplateReader(
  template: CanvasWorkflowTemplate,
  store: CanvasTemplateStore,
  dialog: HTMLDialogElement,
  toolbar: HTMLElement,
  viewport: HTMLElement,
  help: HTMLElement,
  signal: AbortSignal,
  fit: () => void
) {
  const labels = template.previewChapters;
  const notes = template.nodes.filter((node) => node.type === 'note').sort((a, b) => a.y - b.y);
  if (!labels?.length || labels.length !== notes.length || !store.getPreviewImage) return;
  const rows = notes.map((note, index) =>
    template.nodes
      .filter(
        (node) =>
          node.assetPath &&
          ['image', 'animation', 'sequence'].includes(node.type) &&
          node.y >= note.y &&
          (!notes[index + 1] || node.y < notes[index + 1].y)
      )
      .sort((a, b) => a.x - b.x)
  );
  if (rows.some((row) => !row.length)) return;
  function button(label: string, action: () => void) {
    const result = document.createElement('button');
    result.type = 'button';
    result.textContent = label;
    result.onclick = action;
    return result;
  }
  const reader = document.createElement('section');
  reader.className = 'template-reader';
  const nav = document.createElement('nav');
  nav.setAttribute('aria-label', '手记章节');
  const chapter = document.createElement('section');
  const grid = document.createElement('div');
  grid.className = 'template-reader-grid';
  const hero = document.createElement('div');
  hero.className = 'template-reader-hero';
  reader.append(hero, nav, chapter);
  viewport.before(reader);
  const cache = new Map<string, Promise<string>>();
  const urls = new Set<string>();
  let frame = 0;
  const stop = () => cancelAnimationFrame(frame);
  signal.addEventListener(
    'abort',
    () => {
      stop();
      for (const url of urls) URL.revokeObjectURL(url);
    },
    { once: true }
  );
  function figure(node: CanvasNode, host: HTMLElement) {
    const card = document.createElement('figure');
    const caption = document.createElement('figcaption');
    caption.textContent = node.title;
    const media = document.createElement('div');
    card.append(media, caption);
    host.append(card);
    async function load() {
      media.textContent = '图片加载中…';
      try {
        let pending = cache.get(node.id);
        if (!pending) {
          pending = store.getPreviewImage!(template.id, template.revision, node.id, signal)
            .then((blob) => {
              if (signal.aborted) throw new Error('已关闭');
              const url = URL.createObjectURL(blob);
              urls.add(url);
              return url;
            })
            .catch((error) => {
              cache.delete(node.id);
              throw error;
            });
          cache.set(node.id, pending);
        }
        const img = new Image();
        img.alt = node.title;
        const url = await pending;
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('图片不可用'));
          img.src = url;
        });
        if (signal.aborted || !card.isConnected) return;
        const info = node.frameSetInfo;
        if (info?.frames.length) {
          const surface = document.createElement('canvas');
          const ctx = surface.getContext('2d');
          if (!ctx) throw new Error('无法显示动画');
          surface.width = info.frames[0].width;
          surface.height = info.frames[0].height;
          const sx = img.naturalWidth / info.width,
            sy = img.naturalHeight / info.height;
          const draw = (index: number) => {
            const item = info!.frames[index];
            ctx.clearRect(0, 0, surface.width, surface.height);
            ctx.drawImage(
              img,
              item.x * sx,
              item.y * sy,
              item.width * sx,
              item.height * sy,
              0,
              0,
              surface.width,
              surface.height
            );
          };
          draw(Math.floor(info.frames.length / 2));
          const play = button('播放动作', () => {
            stop();
            const start = performance.now();
            let duration = 0;
            const ends = info.frames.map((item) => (duration += item.duration ?? 1000 / info.fps));
            const tick = (now: number) => {
              if (signal.aborted || !surface.isConnected || reader.hidden) return;
              const index = ends.findIndex((end) => end > now - start);
              draw(index < 0 ? ends.length - 1 : index);
              if (index >= 0) frame = requestAnimationFrame(tick);
            };
            tick(start);
          });
          if (
            grid.classList.contains('template-character-gallery') &&
            host.parentElement === grid
          ) {
            media.replaceChildren(surface);
            caption.append(play);
          } else media.replaceChildren(surface, play);
        } else {
          const enlarge = button('查看大图：' + node.title, () => {
            const lightbox = document.createElement('dialog');
            lightbox.className = 'template-reader-lightbox';
            lightbox.setAttribute('aria-label', node.title);
            const full = new Image();
            full.src = img.src;
            full.alt = node.title;
            const close = button('×', () => lightbox.close());
            close.className = 'template-close';
            close.setAttribute('aria-label', '返回手记');
            close.title = '关闭大图';
            lightbox.append(close, full);
            dialog.append(lightbox);
            lightbox.addEventListener('close', () => lightbox.remove(), { once: true });
            lightbox.showModal();
          });
          enlarge.setAttribute('aria-label', '查看大图：' + node.title);
          enlarge.replaceChildren(img);
          media.replaceChildren(enlarge);
        }
      } catch {
        if (!signal.aborted && card.isConnected) {
          cache.delete(node.id);
          media.replaceChildren(button('图片未能显示 · 重试', () => void load()));
        }
      }
    }
    void load();
  }
  function show(index: number) {
    stop();
    grid.replaceChildren();
    grid.classList.toggle(
      'template-reader-split-atlas',
      labels?.[index] === 'UI 拆分' &&
        rows[index].length === 4 &&
        rows[index][1].width > rows[index][0].width
    );
    const assets = rows[index];
    const characterGallery =
      labels?.[index] === '角色设计' &&
      assets.length === 7 &&
      assets.slice(0, 5).every((node) => node.type === 'image') &&
      assets.slice(5).every((node) => node.frameSetInfo?.frames.length);
    grid.classList.toggle('template-character-gallery', characterGallery);
    const references = document.createElement('div');
    const variations = document.createElement('div');
    if (characterGallery) {
      references.className = 'template-character-references';
      variations.className = 'template-character-variations';
      grid.append(references, variations);
    }
    const title = document.createElement('h3');
    title.textContent = notes[index].title;
    const guide = document.createElement('p');
    guide.textContent = notes[index].text || '';
    chapter.replaceChildren(title, guide, grid);
    Array.from(nav.children).forEach((item, at) =>
      item.setAttribute('aria-pressed', String(index === at))
    );
    for (const [at, node] of rows[index].entries()) {
      if (at === 2 && (node.title.includes('品级') || node.title.includes('标注'))) {
        const details = document.createElement('details');
        const summary = document.createElement('summary');
        summary.textContent = '延伸阅读 · ' + node.title;
        details.append(summary);
        chapter.append(details);
        details.addEventListener('toggle', () => {
          if (details.open && details.children.length === 1) figure(node, details);
        });
      } else if (characterGallery) figure(node, at < 2 ? references : variations);
      else figure(node, grid);
    }
  }
  labels.forEach((label, index) =>
    nav.append(
      button(String(index + 1).padStart(2, '0') + ' · ' + label, () => {
        show(index);
        chapter.scrollIntoView({ block: 'nearest' });
      })
    )
  );
  const finalChapter = rows[rows.length - 1];
  const cover = template.nodes.find(
    (node) => node.id === template.coverNodeId && node.type === 'image' && node.assetPath
  );
  figure(cover ?? finalChapter[finalChapter.length - 1], hero);
  show(0);
  const controls = Array.from(toolbar.children).slice(0, 4) as HTMLElement[];
  const workflowHelp = help.textContent;
  function mode(reading: boolean) {
    stop();
    reader.hidden = !reading;
    viewport.hidden = reading;
    for (const control of controls) control.hidden = reading;
    read.setAttribute('aria-pressed', String(reading));
    workflow.setAttribute('aria-pressed', String(!reading));
    help.textContent = reading
      ? template.description || '先看成品，再按章节查看制作过程。'
      : workflowHelp;
    if (!reading) fit();
  }
  const read = button('看示例', () => mode(true));
  const workflow = button('看完整流程', () => mode(false));
  toolbar.prepend(read, workflow);
  mode(true);
}
