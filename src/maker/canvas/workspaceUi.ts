export function createCanvasWorkspace(options: {
  current(): { id: string; title: string; viewport: { scale: number } } | null;
  activate(id: string): Promise<boolean>;
  create(): Promise<boolean>;
  zoom(factor: number): void;
  error(message: string): void;
}) {
  const select = document.getElementById('canvases') as HTMLSelectElement;
  const header = document.querySelector('header')!;
  const board = document.getElementById('board')!;
  const videoHistory = document.getElementById('video-history')!;
  header.classList.add('workspace-toolbar');
  const opened: string[] = [];
  let switching = false;
  let activeId: string | undefined;
  let signature = '';
  const tabsRow = document.createElement('div');
  tabsRow.className = 'workspace-tabs-row';
  const tabs = document.createElement('div');
  tabs.className = 'workspace-tabs';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', '已打开画布');
  const create = button('+', '新建空白画布', () => transition(options.create));
  create.id = 'workspace-new';
  const library = menu('全部画布', 'workspace-library');
  const search = document.createElement('input');
  search.type = 'search';
  search.placeholder = '搜索画布名称';
  search.setAttribute('aria-label', '搜索画布');
  const results = document.createElement('div');
  results.className = 'workspace-library-list';
  library.panel.append(search, results);
  search.addEventListener('input', renderLibrary);
  library.root.addEventListener('toggle', () => {
    if (library.root.open) {
      renderLibrary();
      search.focus();
    }
  });
  tabsRow.append(tabs, create, library.root);
  header.before(tabsRow);
  select.hidden = true;
  document.getElementById('new-canvas')!.hidden = true;
  const add = menu('+ 添加节点', 'workspace-add');
  for (const id of [
    'add-generation',
    'add-image',
    'add-video-source',
    'add-video',
    'add-note',
    'create-section',
  ]) {
    add.panel.append(document.getElementById(id)!);
  }
  const more = menu('···', 'workspace-more');
  more.root.querySelector('summary')!.setAttribute('aria-label', '更多画布操作');
  for (const id of ['undo', 'redo', 'duplicate-selected', 'delete-selected', 'export-canvas']) {
    more.panel.append(document.getElementById(id)!);
  }
  const actions = document.createElement('div');
  actions.className = 'workspace-actions';
  actions.append(
    add.root,
    document.getElementById('add-template')!,
    document.getElementById('status')!,
    document.getElementById('save')!,
    more.root
  );
  header.append(actions);
  const bottom = document.createElement('footer');
  bottom.className = 'workspace-bottom';
  const controls = document.createElement('div');
  controls.className = 'workspace-view-controls';
  const percentage = document.createElement('output');
  percentage.id = 'workspace-zoom';
  percentage.setAttribute('aria-label', '画布缩放比例');
  const fit = document.getElementById('fit-canvas')!;
  fit.textContent = '适配画布';
  controls.append(
    button('−', '缩小画布', () => options.zoom(1 / 1.1)),
    percentage,
    button('+', '放大画布', () => options.zoom(1.1)),
    fit
  );
  bottom.append(document.getElementById('canvas-log')!, controls);
  document.getElementById('board')!.after(bottom);
  const menus = [library, add, more];
  for (const item of menus) {
    item.root.addEventListener('toggle', () => {
      if (item.root.open) for (const other of menus) if (other !== item) other.root.open = false;
    });
    item.panel.addEventListener('click', (event) => {
      if ((event.target as HTMLElement).closest('button')) item.root.open = false;
    });
  }
  document.addEventListener('pointerdown', (event) => {
    for (const item of menus) if (!item.root.contains(event.target as Node)) item.root.open = false;
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') for (const item of menus) item.root.open = false;
  });
  window.addEventListener(
    'keydown',
    (event) => {
      if (switching) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true
  );
  function button(label: string, name: string, action: () => unknown) {
    const element = document.createElement('button');
    element.type = 'button';
    element.textContent = label;
    element.title = name;
    element.setAttribute('aria-label', name);
    element.addEventListener('click', () => {
      void action();
    });
    return element;
  }
  function menu(label: string, className: string) {
    const root = document.createElement('details');
    root.className = 'workspace-menu ' + className;
    const summary = document.createElement('summary');
    summary.textContent = label;
    const panel = document.createElement('div');
    panel.className = 'workspace-menu-panel';
    root.append(summary, panel);
    return { root, panel };
  }
  async function transition(action: () => Promise<boolean>) {
    if (switching) return;
    switching = true;
    board.inert = header.inert = controls.inert = true;
    videoHistory.inert = true;
    sync();
    try {
      await action();
    } catch (error) {
      options.error(error instanceof Error ? error.message : '画布切换失败，请重试。');
    } finally {
      switching = false;
      board.inert = header.inert = controls.inert = false;
      videoHistory.inert = false;
      select.value = options.current()?.id || '';
      sync();
    }
  }
  async function close(id: string) {
    if (opened.length < 2) return;
    await transition(async () => {
      if (options.current()?.id === id) {
        const index = opened.indexOf(id);
        const next = opened[index + 1] || opened[index - 1];
        if (!(await options.activate(next))) return false;
      }
      opened.splice(opened.indexOf(id), 1);
      return true;
    });
  }
  function renderLibrary() {
    const query = search.value.trim().toLocaleLowerCase();
    const matches = Array.from(select.options).filter((item) =>
      item.textContent?.toLocaleLowerCase().includes(query)
    );
    results.replaceChildren();
    for (const item of matches) {
      const choice = button(
        item.textContent || '未命名画布',
        item.textContent || '未命名画布',
        () => transition(() => options.activate(item.value))
      );
      choice.disabled = switching;
      choice.setAttribute('aria-current', String(item.value === options.current()?.id));
      results.append(choice);
    }
    if (!matches.length) results.textContent = '没有匹配的画布';
  }
  function sync() {
    const current = options.current();
    header.inert = board.inert = controls.inert = switching || !current;
    tabsRow.setAttribute('aria-busy', String(switching));
    if (current) {
      const option = Array.from(select.options).find((item) => item.value === current.id);
      if (option) option.textContent = current.title;
      document.getElementById('canvas-title')!.textContent = current.title;
    }
    if (current && !opened.includes(current.id)) opened.push(current.id);
    percentage.value = Math.round((current?.viewport.scale || 1) * 100) + '%';
    create.disabled = switching || !current;
    const nextSignature = JSON.stringify([opened, current?.id, current?.title, switching]);
    if (signature === nextSignature) return;
    signature = nextSignature;
    tabs.replaceChildren();
    for (const id of opened) {
      const name =
        id === current?.id
          ? current.title
          : Array.from(select.options).find((item) => item.value === id)?.textContent || '画布';
      const tab = document.createElement('div');
      tab.className = 'workspace-tab';
      tab.dataset.active = String(id === current?.id);
      const choice = button(name, name, () => transition(() => options.activate(id)));
      choice.setAttribute('role', 'tab');
      choice.setAttribute('aria-selected', String(id === current?.id));
      choice.disabled = switching;
      tab.append(choice);
      if (opened.length > 1) {
        const remove = button('×', '关闭页签：' + name, () => close(id));
        remove.disabled = switching;
        tab.append(remove);
      }
      tabs.append(tab);
    }
    if (activeId !== current?.id) {
      tabs
        .querySelector('[data-active="true"]')
        ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      activeId = current?.id;
    }
    if (library.root.open) renderLibrary();
  }
  return { sync, activate: (id: string) => transition(() => options.activate(id)) };
}

export const CANVAS_WORKSPACE_STYLES = `
body {
  height: 100dvh;
  min-height: 0;
  overflow: hidden;
}
#board {
  min-height: 0;
  overflow: clip;
}
#board #selection-toolbar {
  z-index: 26;
}
#board #selection-menu {
  z-index: 27;
}
.workspace-tabs-row,
.workspace-toolbar,
.workspace-bottom {
  box-sizing: border-box;
  flex: none;
  color: #e8edeb;
  background: #191e21;
}
.workspace-tabs-row {
  display: flex;
  gap: 6px;
  align-items: center;
  height: 42px;
  padding: 0 16px;
  border-bottom: 1px solid #343b3d;
}
.workspace-tabs {
  display: flex;
  gap: 4px;
  flex: 1;
  min-width: 0;
  height: 100%;
  overflow-x: auto;
  scrollbar-width: thin;
  align-items: end;
}
.workspace-tab {
  display: flex;
  flex: none;
  max-width: 230px;
  height: 36px;
  border: 1px solid #343b3d;
  border-bottom: 0;
  border-radius: 6px 6px 0 0;
  background: #1c2125;
}
.workspace-tab[data-active="true"] {
  background: #272c2d;
  border-top: 2px solid #f5dc56;
}
.workspace-tabs-row button,
.workspace-toolbar button,
.workspace-menu summary,
.workspace-bottom button {
  font: inherit;
  font-size: 12px;
  color: inherit;
  background: #242a2d;
  border: 1px solid #3b4446;
  border-radius: 5px;
  min-height: 30px;
  padding: 5px 10px;
  cursor: pointer;
  white-space: nowrap;
}
.workspace-tab button {
  border: 0;
  background: none;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.workspace-tab button[role="tab"] {
  font-weight: 600;
  flex: 1;
}
.workspace-tab button:last-child:not([role="tab"]) {
  color: #a7b1b4;
  padding: 5px 8px;
}
.workspace-tabs-row button:disabled,
.workspace-toolbar button:disabled {
  opacity: 0.45;
  cursor: wait;
}
.workspace-toolbar {
  display: flex;
  flex-wrap: nowrap;
  height: 58px;
  padding: 8px 18px;
  gap: 12px;
  border-bottom: 1px solid #343b3d;
}
.workspace-toolbar .canvas-heading {
  flex: 1;
  min-width: 0;
  max-width: none;
  font-size: 17px;
}
.workspace-toolbar #canvas-title {
  max-width: 100%;
}
.workspace-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: none;
}
.workspace-toolbar #status {
  margin: 0 2px 0 10px;
  font-size: 12px;
  color: #a7b1b4;
}
.workspace-toolbar #status[data-state="saved"] {
  color: #78d4ad;
}
.workspace-toolbar #status[data-state="error"] {
  color: #f08b85;
}
.workspace-menu {
  position: relative;
  font-size: 12px;
}
.workspace-menu summary {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 32px;
  line-height: 20px;
  list-style: none;
  user-select: none;
}
.workspace-actions > button {
  box-sizing: border-box;
  height: 32px;
  line-height: 20px;
}
.workspace-menu summary:hover {
  background: #30383a;
}
.workspace-menu summary:focus-visible {
  outline: 2px solid #f5dc56;
  outline-offset: 3px;
}
.workspace-menu summary::-webkit-details-marker {
  display: none;
}
.workspace-add summary {
  background: #f5dc56;
  color: #252820;
  border-color: #f5dc56;
  font-weight: 700;
}
.workspace-add summary:hover {
  background: #ffe978;
}
.workspace-add[open] > summary,
.workspace-add summary:active {
  background: #dfc644;
  border-color: #cdb431;
}
.workspace-menu-panel {
  position: absolute;
  right: 0;
  top: calc(100% + 7px);
  z-index: 60;
  width: 190px;
  padding: 7px;
  border: 1px solid #434b4d;
  background: #202628;
  border-radius: 8px;
  box-shadow: 0 12px 36px #0007;
}
.workspace-menu-panel button {
  display: block;
  text-align: left;
  width: 100%;
  border: 0;
  background: none;
  margin: 0;
  padding: 9px 10px;
}
.workspace-menu-panel button:hover {
  background: #323b3c;
}
.workspace-library .workspace-menu-panel {
  width: min(300px, calc(100vw - 40px));
}
.workspace-library input {
  box-sizing: border-box;
  width: 100%;
  padding: 8px;
  background: #151b1e;
  color: #e8edeb;
  border: 1px solid #434b4d;
  border-radius: 4px;
}
.workspace-library-list {
  max-height: min(320px, 50vh);
  overflow: auto;
  margin-top: 6px;
}
.workspace-library-list button {
  overflow: hidden;
  text-overflow: ellipsis;
}
.workspace-library-list [aria-current="true"] {
  color: #f5dc56;
}
.workspace-bottom {
  display: flex;
  align-items: flex-end;
  border-top: 1px solid #343b3d;
  min-height: 42px;
  padding: 0 14px;
  gap: 16px;
}
.workspace-bottom #canvas-log {
  flex: 1;
  min-width: 0;
  border: 0;
  padding: 8px 0;
  background: transparent;
}
.workspace-bottom .canvas-log summary {
  display: inline-block;
  padding: 4px 0;
}
.workspace-bottom .canvas-log-preview {
  max-height: 20px;
}
.workspace-bottom #canvas-log:has(details:not([open])) {
  display: flex;
  align-items: center;
  gap: 16px;
}
.workspace-bottom .canvas-log-preview {
  flex: 1;
  min-width: 0;
  color: #a7b1b4;
}
.workspace-bottom .canvas-log-list {
  max-height: min(240px, 30vh);
}
.workspace-bottom .canvas-log-filters {
  flex-wrap: wrap;
  gap: 10px;
}
.workspace-view-controls {
  display: flex;
  align-items: center;
  flex: none;
  gap: 5px;
  height: 42px;
}
.workspace-view-controls output {
  min-width: 42px;
  text-align: center;
  font-size: 12px;
}
.workspace-view-controls button {
  min-width: 30px;
}
.workspace-tabs-row [hidden],
.workspace-toolbar [hidden] {
  display: none !important;
}
@media (max-width: 850px) {
  .workspace-toolbar {
    padding-inline: 10px;
    gap: 6px;
  }
  .workspace-actions {
    gap: 5px;
  }
  .workspace-toolbar .canvas-heading {
    font-size: 14px;
  }
  .workspace-toolbar #status {
    max-width: 75px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin-left: 2px;
  }
  .workspace-bottom {
    gap: 8px;
    padding-inline: 10px;
  }
}
@media (max-width: 600px) {
  .workspace-tabs-row {
    padding-inline: 8px;
  }
  .workspace-toolbar {
    height: auto;
    min-height: 58px;
    flex-wrap: wrap;
  }
  .workspace-toolbar .canvas-heading {
    flex-basis: 100%;
  }
  .workspace-actions {
    width: 100%;
    justify-content: flex-end;
  }
  .workspace-bottom .canvas-log-preview {
    display: none;
  }
}
`;
