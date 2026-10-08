import type { CanvasDocument, CanvasNode } from './model.js';
import { builtinPresetDescriptions } from './presetDescriptions.js';
import { isBuiltinCanvasTemplate } from './templates.js';
import { createTemplateCovers } from './templateCovers.js';
import { openCanvasTemplatePreview } from './templatePreview.js';
import { templateCategories, templatePresentation } from './templatePresentation.js';
import type {
  CanvasTemplateStore,
  CanvasWorkflowTemplate,
  CanvasTemplateSummary,
  createCanvasTemplateModel,
} from './templates.js';

export function createCanvasTemplateUi(options: {
  store?: CanvasTemplateStore;
  model: ReturnType<typeof createCanvasTemplateModel>;
  getDocument(): CanvasDocument | null;
  selected: Set<string>;
  remember(): void;
  changed(): void;
  render(): void;
  save(): Promise<boolean>;
  error(message: string): void;
  busy(id: string): boolean;
  placement(): { x: number; y: number };
  reveal(group: CanvasNode): void;
  deleteSelected(): void;
  loadMedia(path: string): Promise<unknown>;
}) {
  const model = options.model;
  const dialog = document.createElement('dialog');
  dialog.className = 'workflow-template-dialog';
  dialog.setAttribute('aria-label', '工作流模板');
  document.body.append(dialog);
  let busy = false;
  let requestVersion = 0;
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  let covers: ReturnType<typeof createTemplateCovers> | undefined;
  function releaseLibrary(): void {
    requestVersion++;
    clearTimeout(searchTimer);
    covers?.dispose();
    covers = undefined;
  }
  dialog.addEventListener('close', releaseLibrary);
  dialog.addEventListener('cancel', (event) => {
    if (busy) event.preventDefault();
  });
  function button(label: string, action: () => void | Promise<void>): HTMLButtonElement {
    const element = document.createElement('button');
    element.type = 'button';
    element.textContent = label;
    element.onclick = () => {
      if (busy) return;
      busy = true;
      element.disabled = true;
      const originalLabel = element.textContent;
      if (label === '＋ 添加') element.textContent = '正在下载并添加…';
      void Promise.resolve()
        .then(action)
        .catch((error) => {
          const message = error instanceof Error ? error.message : '模板操作失败，请重试。';
          const status = dialog.querySelector('[role=status]');
          if (status) status.textContent = message;
          options.error(message);
        })
        .finally(() => {
          busy = false;
          element.disabled = false;
          element.textContent = originalLabel;
        });
    };
    return element;
  }
  function open(title: string, description: string): HTMLElement {
    releaseLibrary();
    dialog.classList.remove('template-library');
    dialog.replaceChildren();
    const close = button('×', () => dialog.close());
    close.className = 'template-close';
    close.setAttribute('aria-label', '关闭');
    const heading = document.createElement('h2');
    heading.textContent = title;
    const help = document.createElement('p');
    help.textContent = description;
    const body = document.createElement('div');
    body.className = 'workflow-template-body';
    const status = document.createElement('p');
    status.setAttribute('role', 'status');
    dialog.append(close, heading, help, body, status);
    if (!dialog.open) dialog.showModal();
    return body;
  }
  function selectedGroup(): CanvasNode | undefined {
    if (options.selected.size !== 1) return;
    return options
      .getDocument()
      ?.nodes.find((node) => options.selected.has(node.id) && node.type === 'section');
  }
  function guard(documentState: CanvasDocument, nodes: CanvasNode[]): void {
    if (options.getDocument() !== documentState) throw new Error('画布已切换，请重新操作。');
    if (nodes.some((node) => options.busy(node.id)))
      throw new Error('选中卡片正在处理或结果尚未确认，请完成原任务后再保存模板。');
  }
  async function persistGroup(): Promise<void> {
    options.changed();
    options.render();
    if (!(await options.save()))
      throw new Error('模板操作已完成，但画布分组尚未保存；请保留当前页面并重试保存画布。');
  }
  function saveSelection(replace = false): void {
    const documentState = options.getDocument();
    if (!documentState || !options.store) return;
    const section = selectedGroup();
    const nodes = model.members(documentState, [...options.selected]);
    try {
      guard(documentState, nodes);
      model.snapshot(
        documentState,
        nodes.map((node) => node.id),
        '模板'
      );
    } catch (error) {
      options.error((error as Error).message);
      return;
    }
    const selectedIds = new Set(nodes.map((node) => node.id));
    const external = documentState.edges.some(
      (edge) => selectedIds.has(edge.from) !== selectedIds.has(edge.to)
    );
    const body = open(
      replace ? '替换模板' : '保存为模板',
      (replace ? '仅更新模板库，不改变其它画布副本。' : '保存后把选中卡片组成一个分组。') +
        (external ? '选区外的连线不会保存到模板。' : '')
    );
    const name = document.createElement('input');
    name.maxLength = 80;
    name.value = section?.title || '我的工作流';
    name.setAttribute('aria-label', '模板名称');
    body.append(
      name,
      button(replace ? '确认替换' : '保存模板', async () => {
        if (!name.value.trim()) throw new Error('请输入模板名称。');
        guard(documentState, nodes);
        const draft = model.snapshot(
          documentState,
          nodes.map((node) => node.id),
          name.value
        );
        if (replace) {
          if (!section?.templateId || !section.templateRevision)
            throw new Error('原模板不存在，请另存为新模板。');
          draft.id = section.templateId;
          draft.revision = section.templateRevision;
        }
        const saved = await options.store!.saveTemplate(draft);
        const preview = createTemplateCovers(options.store!);
        await preview.warm(saved).catch(() => undefined);
        preview.dispose();
        guard(documentState, nodes);
        options.remember();
        const group = section || model.group(nodes, saved.name);
        if (!section) documentState.nodes.push(group);
        group.title = saved.name;
        group.templateId = saved.id;
        group.templateRevision = saved.revision;
        if (saved.skills?.length) group.templateSkills = [...saved.skills];
        else delete group.templateSkills;
        nodes.forEach((node) => {
          node.sectionId = group.id;
        });
        options.selected.clear();
        options.selected.add(group.id);
        dialog.close();
        await persistGroup();
      })
    );
    name.focus();
    name.select();
  }
  async function add(template: CanvasWorkflowTemplate, editing: boolean): Promise<void> {
    const documentState = options.getDocument();
    if (!documentState) return;
    if (
      documentState.nodes.length + template.nodes.length + 1 > 400 ||
      documentState.edges.length + template.edges.length > 800
    )
      throw new Error('画布已达到容量限制，请换一个空白画布添加模板。');
    if (template.builtin) {
      if (!options.store?.prepareTemplate)
        throw new Error('当前环境不支持添加预设模板，请更新控制台。');
      template = await options.store.prepareTemplate(template.id, documentState.id);
      if (options.getDocument() !== documentState) throw new Error('画布已切换，请重新添加。');
    }
    const copy = model.instantiate(template, options.placement());
    await Promise.all(
      [
        ...new Set(
          copy.nodes.flatMap((node) => [
            ...(node.assetPath && node.type !== 'video-source' ? [node.assetPath] : []),
            ...(node.imageAssetsInfo?.items.map((item) => item.assetPath) || []),
          ])
        ),
      ].map((path) => options.loadMedia(path))
    );
    if (options.getDocument() !== documentState) throw new Error('画布已切换，请重新添加。');
    options.remember();
    documentState.nodes.push(...copy.nodes);
    documentState.edges.push(...copy.edges);
    options.selected.clear();
    options.selected.add(copy.section.id);
    options.reveal(copy.section);
    dialog.close();
    await persistGroup();
    if (editing) options.error('已添加编辑副本：直接调整卡片和连线，完成后右键分组 → 替换模板。');
  }
  async function library(
    initialPage = 1,
    initialQuery = '',
    initialCategory: string = '全部'
  ): Promise<void> {
    const store = options.store;
    if (!store) {
      options.error('当前画布环境不支持模板库。');
      return;
    }
    const body = open('添加模板', '选择一个模板，开始你的下一套工作流。');
    dialog.classList.add('template-library');
    const search = document.createElement('input');
    search.type = 'search';
    search.placeholder = '搜索模板名称或用途…';
    search.setAttribute('aria-label', '搜索模板');
    search.maxLength = 80;
    search.value = initialQuery;
    search.className = 'template-search';
    const toolbar = document.createElement('div');
    toolbar.className = 'template-library-toolbar';
    const total = document.createElement('span');
    total.className = 'template-library-total';
    total.setAttribute('aria-live', 'polite');
    toolbar.append(search, total);
    if (store!.importTemplate)
      toolbar.append(
        button('导入 ZIP', () => {
          const form = open(
            '导入模板',
            '选择 Maker 导出的 ZIP，素材一起导入当前项目，保存为新模板，不覆盖已有内容。'
          );
          const file = document.createElement('input');
          file.type = 'file';
          file.accept = '.zip,application/zip';
          file.setAttribute('aria-label', '模板 ZIP 文件');
          form.append(
            file,
            button('导入', async () => {
              const zip = file.files?.[0];
              if (!zip) throw new Error('请选择模板 ZIP 文件。');
              if (zip.size > 128 * 1024 * 1024) throw new Error('模板 ZIP 不能超过 128 MiB。');
              const saved = await store!.importTemplate!(zip);
              await library(1, saved.name, '我的模板');
            })
          );
        })
      );
    const categories = document.createElement('nav');
    categories.className = 'template-categories';
    categories.setAttribute('aria-label', '模板分类');
    let category = initialCategory;
    for (const label of templateCategories) {
      const filter = button(label, async () => {
        category = label;
        await refresh(1);
      });
      categories.append(filter);
    }
    body.before(toolbar, categories);
    const footer = document.createElement('footer');
    footer.className = 'template-library-footer';
    const hint = document.createElement('small');
    hint.textContent = '添加为独立副本，不会自动执行生成';
    const pager = document.createElement('nav');
    pager.setAttribute('aria-label', '模板分页');
    footer.append(hint, pager);
    body.after(footer);
    let currentPage = initialPage;
    const isCurrent = (version: number) =>
      version === requestVersion && body.isConnected && dialog.open;
    function showRename(summary: CanvasTemplateSummary): void {
      const form = open('重命名模板', '只修改模板库名称，不改变已有分组。');
      const input = document.createElement('input');
      input.value = summary.name;
      input.maxLength = 80;
      input.setAttribute('aria-label', '模板名称');
      form.append(
        input,
        button('保存名称', async () => {
          if (!input.value.trim()) throw new Error('请输入模板名称。');
          const template = await store!.getTemplate(summary.id);
          if (template.revision !== summary.revision)
            throw new Error('模板已更新，请重新打开列表。');
          await store!.saveTemplate({ ...template, name: input.value.trim() });
          await library(currentPage, search.value, category);
        })
      );
      input.focus();
    }
    function showDelete(summary: CanvasTemplateSummary): void {
      const form = open('删除模板', '删除“' + summary.name + '”？画布中的副本和素材不会删除。');
      form.append(
        button('确认删除模板', async () => {
          await store!.deleteTemplate(summary.id, summary.revision);
          await library(currentPage, search.value, category);
        })
      );
    }
    function row(summary: CanvasTemplateSummary): HTMLElement {
      const card = document.createElement('article');
      card.className = 'workflow-template-row';
      card.dataset.templateId = summary.id;
      const previews = summary.builtin ? templatePresentation(summary.id).previews : undefined;
      const media = document.createElement('div');
      media.className = 'template-previews';
      for (const [slot, preview] of (previews || [{ label: '效果预览' }]).entries()) {
        const figure = document.createElement('figure');
        const cover = document.createElement('div');
        cover.className = 'template-cover';
        cover.textContent = summary.hasCover ? '正在加载…' : '暂无预览';
        const caption = document.createElement('figcaption');
        caption.textContent = preview.label;
        figure.append(cover, caption);
        media.append(figure);
        if (summary.builtin && templatePresentation(summary.id).modelPreview)
          covers!.observeModel(cover, summary);
        else covers!.observe(cover, summary, slot, card);
      }
      const content = document.createElement('div');
      content.className = 'template-card-content';
      const heading = document.createElement('div');
      heading.className = 'template-card-heading';
      const name = document.createElement('strong');
      name.textContent = summary.builtin ? summary.name.split(' · ')[0] : summary.name;
      name.title = summary.name;
      heading.append(name);
      const description = document.createElement('small');
      description.className = 'template-description';
      description.textContent = summary.builtin
        ? builtinPresetDescriptions[summary.id] || '内置工作流'
        : '自定义工作流';
      const actions = document.createElement('div');
      actions.className = 'template-card-actions';
      const count = document.createElement('small');
      count.textContent = summary.nodeCount + ' 张卡片';
      const metadata = document.createElement('div');
      metadata.className = 'template-card-metadata';
      metadata.append(count);
      for (const name of summary.skills || []) {
        const link = document.createElement('a');
        link.textContent = 'Skill · ' + name;
        link.title = '阅读 ' + name + ' Skill';
        if (store!.skillUrl) {
          link.href = store!.skillUrl(name);
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
        }
        metadata.append(link);
      }
      const addButton = button('＋ 添加', async () =>
        add(await store!.getTemplate(summary.id), false)
      );
      addButton.setAttribute('aria-label', '添加');
      addButton.className = 'template-add';
      const previewButton = button('预览', () => {
        openCanvasTemplatePreview(store!, summary.id, summary.name);
      });
      previewButton.className = 'template-preview';
      actions.append(metadata, previewButton, addButton);
      if (!summary.builtin) {
        const more = document.createElement('details');
        more.className = 'template-more';
        const toggle = document.createElement('summary');
        toggle.textContent = '⋯';
        toggle.setAttribute('aria-label', summary.name + '的管理操作');
        const menu = document.createElement('div');
        menu.className = 'template-actions-menu';
        const remove = button('删除', () => showDelete(summary));
        remove.className = 'template-delete';
        menu.append(
          button('编辑副本', async () => add(await store!.getTemplate(summary.id), true)),
          button('重命名', () => showRename(summary)),
          remove
        );
        if (store!.exportTemplate)
          menu.prepend(
            button('导出 ZIP', async () => {
              const blob = await store!.exportTemplate!(summary.id, summary.revision);
              const url = URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = url;
              link.download =
                summary.name.replaceAll(String.fromCharCode(92), '_').replace(/[/:*?"<>|]/g, '_') +
                '.maker-template.zip';
              document.body.append(link);
              link.click();
              link.remove();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            })
          );
        more.append(toggle, menu);
        more.addEventListener('toggle', () => {
          if (more.open)
            body.querySelectorAll<HTMLDetailsElement>('details[open]').forEach((other) => {
              if (other !== more) other.open = false;
            });
        });
        heading.append(more);
      }
      content.append(media, description);
      card.append(heading, content, actions);
      return card;
    }
    function section(title: string, summaries: CanvasTemplateSummary[]): void {
      const heading = document.createElement('h3');
      heading.textContent = title;
      const grid = document.createElement('div');
      grid.className = 'template-grid';
      for (const summary of summaries) grid.append(row(summary));
      body.append(heading, grid);
    }
    async function refresh(page: number): Promise<void> {
      const version = ++requestVersion;
      covers?.dispose();
      covers = undefined;
      body.textContent = '正在读取模板…';
      body.setAttribute('aria-busy', 'true');
      pager.replaceChildren();
      total.textContent = '读取中…';
      categories
        .querySelectorAll('button')
        .forEach((filter) =>
          filter.setAttribute('aria-pressed', String(filter.textContent === category))
        );
      try {
        const result = await store!.listTemplatePage(page, search.value);
        if (!isCurrent(version)) return;
        currentPage = result.page;
        covers = createTemplateCovers(store!);
        body.replaceChildren();
        body.scrollTop = 0;
        const showCustom = category === '全部' || category === '我的模板';
        const presets = result.presets.filter(
          (item) => category === '全部' || templatePresentation(item.id).category === category
        );
        const count = presets.length + (showCustom ? result.total : 0);
        total.textContent = '共 ' + count + ' 个模板';
        if (presets.length) section('预设模板', presets);
        if (showCustom && result.items.length) section('我的模板 · ' + result.total, result.items);
        if (!count) {
          const empty = document.createElement('p');
          empty.className = 'template-empty';
          empty.textContent = search.value.trim()
            ? '没有匹配的模板，试试其他关键词或分类。'
            : '框选相连卡片，右键「保存为模板」，就能在这里复用。';
          body.append(empty);
        }
        const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
        const previous = button('‹', () => refresh(currentPage - 1));
        previous.setAttribute('aria-label', '上一页');
        previous.disabled = result.page <= 1;
        const next = button('›', () => refresh(currentPage + 1));
        next.setAttribute('aria-label', '下一页');
        next.disabled = result.page >= pages;
        const label = document.createElement('span');
        label.textContent = result.page + ' / ' + pages;
        if (showCustom && result.total > result.pageSize) pager.append(previous, label, next);
        const status = dialog.querySelector('[role=status]')!;
        status.textContent = result.skipped ? result.skipped + ' 个模板文件无法读取，已跳过。' : '';
      } catch (error) {
        if (!isCurrent(version)) return;
        body.textContent = error instanceof Error ? error.message : '读取模板失败，请重试。';
        body.append(button('重试', () => refresh(page)));
      } finally {
        if (isCurrent(version)) body.removeAttribute('aria-busy');
      }
    }
    search.addEventListener('input', () => {
      requestVersion++;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        void refresh(1);
      }, 200);
    });
    await refresh(initialPage);
  }
  function context(menu: HTMLElement): void {
    menu.querySelectorAll('[data-template-menu]').forEach((element) => element.remove());
    const documentState = options.getDocument();
    if (!documentState) return;
    const section = selectedGroup();
    if (section)
      menu.querySelectorAll<HTMLElement>('[data-menu-scope=card]').forEach((element) => {
        element.hidden = true;
      });
    const nodes = model.members(documentState, [...options.selected]);
    function item(label: string, action: () => void) {
      const element = button(label, () => {
        menu.hidden = true;
        action();
      });
      element.dataset.templateMenu = 'true';
      menu.append(element);
    }
    if (nodes.length >= 2)
      item(section?.templateId ? '保存为新模板' : '保存为模板', () => saveSelection());
    if (section?.templateId && !isBuiltinCanvasTemplate(section.templateId))
      item('替换模板', () => saveSelection(true));
    if (section) {
      item('重命名分组', () => {
        const body = open('重命名分组', '不会修改模板库名称。');
        const input = document.createElement('input');
        input.value = section.title;
        input.maxLength = 80;
        input.setAttribute('aria-label', '分组名称');
        body.append(
          input,
          button('保存名称', async () => {
            guard(documentState, nodes);
            if (!input.value.trim()) throw new Error('请输入分组名称。');
            options.remember();
            section.title = input.value.trim();
            dialog.close();
            await persistGroup();
          })
        );
      });
      item('取消分组', () => {
        guard(documentState, nodes);
        options.remember();
        nodes.forEach((node) => {
          delete node.sectionId;
          delete node.templatePending;
        });
        documentState.nodes = documentState.nodes.filter((node) => node.id !== section.id);
        options.selected.clear();
        options.changed();
        options.render();
      });
      item('删除分组及卡片', () => {
        const body = open(
          '删除分组及卡片',
          '删除当前分组及其中的 ' + nodes.length + ' 张卡片？模板库不受影响。'
        );
        body.append(
          button('确认删除分组', () => {
            guard(documentState, nodes);
            options.selected.clear();
            [section, ...nodes].forEach((node) => options.selected.add(node.id));
            options.deleteSelected();
            dialog.close();
          })
        );
      });
    }
  }
  return {
    library,
    context,
    saveSelection,
    async addById(id: string): Promise<void> {
      if (busy || !options.store) throw new Error('模板库未就绪或正在操作。');
      busy = true;
      try {
        await add(await options.store.getTemplate(id), false);
      } finally {
        busy = false;
      }
    },
  };
}
