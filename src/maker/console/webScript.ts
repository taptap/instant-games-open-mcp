import { consoleIcons } from './webIcons.js';

export const consoleScript = String.raw`
(function(){
'use strict';
const iconNodes = ${JSON.stringify(consoleIcons)};
const initialQuery = new URLSearchParams(location.search);
let projectid = initialQuery.get('projectid') || '';
let selected = projectid ? '' : initialQuery.get('project') || '';
let page = selected ? 'overview' : 'projects';
let selectionEpoch = 0;
let viewEpoch = 0;
let state = {projects: [], tasks: []};
let loaded = false;
let fortuneTimer;
let fortuneReady = false;
let fortunePreloadTimer;
function fortuneMode() {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}
function fortuneUrl() {
  return 'https://liangdong-ttm.github.io/gdev-fortune/?embed=1&theme=dungeon&mode=' + fortuneMode();
}
function fortuneIsOpen() {
  return $('fortune-toggle')?.getAttribute('aria-expanded') === 'true';
}
function positionFortune() {
  const toggle = $('fortune-toggle');
  const panel = $('fortune-panel');
  if (!toggle || !panel || !fortuneIsOpen()) return;
  const anchor = toggle.getBoundingClientRect();
  const width = 320;
  const height = 820;
  const scale = Math.max(0.1, Math.min(0.78, (window.innerWidth - 24) / width, (anchor.top - 12) / height, 1));
  panel.style.width = width + 'px';
  panel.style.height = height + 'px';
  panel.style.transform = 'scale(' + scale + ')';
  panel.style.transformOrigin = 'left bottom';
  const visualWidth = width * scale;
  panel.style.left = Math.max(12, Math.min(anchor.left, window.innerWidth - visualWidth - 12)) + 'px';
  panel.style.bottom = Math.max(8, window.innerHeight - anchor.top - 4) + 'px';
}
function closeFortune() {
  clearTimeout(fortuneTimer);
  const panel = $('fortune-panel');
  if (panel) {
    panel.hidden = true;
  }
  $('fortune-toggle')?.setAttribute('aria-expanded','false');
}
function scheduleCloseFortune() {
  clearTimeout(fortuneTimer);
  fortuneTimer = setTimeout(closeFortune, 400);
}
function loadFortuneFrame(reload) {
  const frame = $('fortune-frame');
  const panel = $('fortune-panel');
  if (!frame || !panel) return;
  if (!reload && frame.dataset.mode === fortuneMode() && frame.getAttribute('src')) return;
  if (panel.parentElement !== document.body) document.body.append(panel);
  frame.dataset.mode = fortuneMode();
  frame.src = fortuneUrl();
}
function revealFortune() {
  clearTimeout(fortunePreloadTimer);
  fortuneReady = true;
  $('fortune-panel').hidden = true;
  $('fortune-panel').classList.remove('fortune-preload');
  $('fortune-corner').hidden = false;
}
function openFortune() {
  clearTimeout(fortuneTimer);
  if (!fortuneReady) return;
  const panel = $('fortune-panel');
  if (!panel) return;
  if (panel.parentElement !== document.body) document.body.append(panel);
  panel.hidden = false;
  loadFortuneFrame();
  $('fortune-toggle').setAttribute('aria-expanded','true');
  positionFortune();
}
function bindFortuneHover(element) {
  element.addEventListener('mouseenter',() => { clearTimeout(fortuneTimer); openFortune(); });
  element.addEventListener('mouseleave',scheduleCloseFortune);
}
let documentTab = 'docs', documentSearch = '', documentItems = [], documentSelected = '';
let documentRequest = 0, documentDirectoryRequest = 0;
function markdownText(value) {
  // Decode only entity-shaped fragments; all resulting content still uses textContent.
  return String(value || '').replace(/&(?:#[0-9]+|#x[0-9a-f]+|[a-z][a-z0-9]+);/gi, entity => {
    return new DOMParser().parseFromString('<body>' + entity + '</body>','text/html').body.textContent;
  });
}
function markdownNodes(tokens) {
  const fragment = document.createDocumentFragment();
  for (const token of tokens || []) {
    let element;
    const children = () => markdownNodes(token.tokens || []);
    if (token.type === 'space' || token.type === 'def') continue;
    if (token.type === 'heading') { element = node('h' + Math.min(6,Math.max(1,token.depth))); element.append(children()); }
    else if (token.type === 'paragraph' || token.type === 'text') {
      element = node(token.type === 'paragraph' ? 'p' : 'span');
      if (token.tokens) element.append(children()); else element.textContent = markdownText(token.text);
    } else if (['strong','em','del'].includes(token.type)) { element = node(token.type); element.append(children()); }
    else if (token.type === 'code') { element = node('pre'); element.append(node('code',token.text)); }
    else if (token.type === 'codespan') element = node('code',markdownText(token.text));
    else if (token.type === 'blockquote') { element = node('blockquote'); element.append(children()); }
    else if (token.type === 'br' || token.type === 'hr') element = node(token.type);
    else if (token.type === 'list') {
      element = node(token.ordered ? 'ol' : 'ul');
      if (token.ordered && Number.isInteger(token.start)) element.start = token.start;
      for (const item of token.items || []) {
        const li = node('li'); if (item.task) li.append(node('span',item.checked ? '[x] ' : '[ ] '));
        li.append(markdownNodes(item.tokens)); element.append(li);
      }
    } else if (token.type === 'table') {
      element = node('div',undefined,'doc-table');
      const table = node('table'), head = node('thead'), body = node('tbody'), row = node('tr');
      (token.header || []).forEach(cell => { const th = node('th'); th.append(markdownNodes(cell.tokens)); row.append(th); });
      head.append(row); table.append(head,body);
      (token.rows || []).forEach(cells => { const tr = node('tr'); cells.forEach(cell => {
        const td = node('td'); td.append(markdownNodes(cell.tokens)); tr.append(td);
      }); body.append(tr); }); element.append(table);
    } else if (token.type === 'link') {
      element = node('a'); element.append(children());
      const href = token.href || '';
      if (/^https?:\/\//i.test(href)) {
        element.href = href; element.target = '_blank'; element.rel = 'noopener noreferrer'; element.referrerPolicy = 'no-referrer';
      } else {
        element.href = '#';
        element.addEventListener('click',event => {
          event.preventDefault();
          const current = documentItems.find(item => item.id === documentSelected);
          if (!current) return;
          let relative;
          try { relative = decodeURIComponent(new URL(href,'https://local.invalid/' + current.relativePath).pathname.slice(1)); }
          catch (_) { return; }
          const next = documentItems.find(item => item.source === current.source && item.relativePath === relative);
          if (next) { documentTab = next.kind; documentSearch = ''; renderDocumentDirectory(); void openDocument(next); }
          else announce('该链接不在当前文档目录中');
        });
      }
    } else if (token.type === 'image') element = node('span','[图片：' + markdownText(token.text || token.href) + ']','muted');
    else element = node('span',token.type === 'escape' ? markdownText(token.text) : token.text || token.raw || '');
    fragment.append(element);
  }
  return fragment;
}
function documentApi(id) {
  const query = new URLSearchParams();
  if (currentProject()?.valid) query.set('project',selected);
  if (id) query.set('id',id);
  return '/api/documents?' + query;
}
async function openDocument(item) {
  const request = ++documentRequest, epoch = viewEpoch;
  documentSelected = item.id; renderDocumentDirectory();
  const reader = $('document-reader');
  if (!reader) return;
  replace(reader,[node('p','正在读取文档…','muted')]);
  try {
    const result = await api(documentApi(item.id));
    if (request !== documentRequest || epoch !== viewEpoch || page !== 'documents') return;
    const header = node('div',undefined,'document-reader-header');
    header.append(node('h2',item.title),button('复制文档链接',async () => {
      try {
        await navigator.clipboard.writeText(result.link);
        announce('文档链接已复制');
      } catch (_) {
        const fallback = node('input'); fallback.readOnly = true; fallback.value = result.link;
        fallback.setAttribute('aria-label','文档链接');
        header.append(fallback); fallback.focus(); fallback.select();
        notify('无法访问剪贴板，请复制已选中的文档链接');
      }
    },{icon:'link'}));
    replace(reader,[header,node('p',item.source + ' · ' + item.relativePath,'muted')]);
    if (item.purpose) {
      const intro = node('section',undefined,'document-intro');
      intro.append(node('p',item.purpose),node('p','适用范围：' + item.scope,'muted'));
      const related = documentItems.filter(entry => item.related?.includes(entry.id));
      if (related.length) {
        const links = node('div',undefined,'actions');
        links.append(node('span','相关资料','muted'));
        related.forEach(entry => links.append(button(entry.title,() => {
          documentTab = entry.kind; documentSearch = '';
          const search = $('document-search'); if (search) search.value = '';
          renderDocumentDirectory(); void openDocument(entry);
        },{className:'link'})));
        intro.append(links);
      }
      reader.append(intro);
    }
    const tokens = result.tokens || [];
    const content = node('div',undefined,'markdown-content');
    content.append(markdownNodes(tokens[0]?.type === 'heading' && tokens[0]?.depth === 1 ? tokens.slice(1) : tokens)); reader.append(content);
    reader.scrollTop = 0;
  } catch (error) {
    if (request === documentRequest && epoch === viewEpoch) replace(reader,[node('p',error.message,'bad')]);
  }
}
function renderDocumentDirectory() {
  const target = $('document-directory');
  if (!target) return;
  const items = documentItems.filter(item => item.kind === documentTab &&
    (item.title + ' ' + item.relativePath + ' ' + item.category + ' ' + (item.purpose || '')).toLowerCase().includes(documentSearch.toLowerCase()));
  replace(target,[]);
  const groups = [...new Set(items.map(item => item.category))];
  for (const category of groups) {
    target.append(node('h3',category));
    for (const item of items.filter(item => item.category === category)) {
      const entry = button(item.title,() => void openDocument(item),{className:'link document-entry' + (item.featured ? ' document-featured' : '')});
      if (item.id === documentSelected) entry.setAttribute('aria-current','true');
      entry.title = item.source + ' · ' + item.relativePath; target.append(entry);
    }
  }
  if (!items.length) target.append(node('p',documentSearch ? '没有匹配的内容' : '暂无此类资料','muted'));
  document.querySelectorAll('[data-document-kind]').forEach(tab => {
    tab.setAttribute('aria-selected',String(tab.dataset.documentKind === documentTab));
  });
}
async function renderDocuments() {
  const epoch = viewEpoch;
  const request = ++documentDirectoryRequest;
  const toolbar = node('div',undefined,'document-toolbar');
  const tabs = node('div',undefined,'actions document-tabs'); tabs.setAttribute('role','tablist');
  [['docs','开发文档'],['project','项目文档'],['skills','Skill']].forEach(([kind,label]) => {
    const tab = button(label,() => {
      documentTab = kind; renderDocumentDirectory();
      const first = documentItems.find(item => item.kind === kind);
      if (first) void openDocument(first);
      else { documentRequest++; documentSelected = ''; replace($('document-reader'),[node('p','暂无此类资料','muted')]); }
    });
    tab.dataset.documentKind = kind; tab.setAttribute('role','tab'); tabs.append(tab);
  });
  const search = node('input'); search.id = 'document-search'; search.type = 'search'; search.placeholder = '搜索标题、用途或目录';
  search.setAttribute('aria-label','搜索文档与 Skill'); search.value = documentSearch;
  search.addEventListener('input',() => { documentSearch = search.value; renderDocumentDirectory(); });
  toolbar.append(tabs,search,button('刷新目录',() => void renderDocuments(),{icon:'refresh',iconOnly:true,className:'icon-button'}));
  const layout = node('div',undefined,'document-layout');
  const directory = node('aside'); directory.id = 'document-directory'; directory.setAttribute('aria-label','文档目录');
  const reader = node('article'); reader.id = 'document-reader';
  layout.append(directory,reader);
  replace($('view'),[toolbar,layout]);
  directory.append(node('p','正在读取目录…','muted'));
  documentItems = []; documentRequest++;
  try {
    const items = await api(documentApi());
    if (epoch !== viewEpoch || page !== 'documents' || request !== documentDirectoryRequest) return;
    documentItems = items; renderDocumentDirectory();
    const first = items.find(item => item.id === documentSelected && item.kind === documentTab) || items.find(item => item.kind === documentTab);
    if (first) void openDocument(first);
    else reader.append(node('p','暂无此类资料','muted'));
  } catch (error) {
    if (epoch === viewEpoch && page === 'documents' && request === documentDirectoryRequest) replace(directory,[node('p',error.message,'bad')]);
  }
}
let versionCatalog = null;
let versionQuery = false;
let versionError = false;
let updateSubmitting = false;
let updateNotice = '';
function renderVersionPicker() {
  const picker = $('maker-version-picker');
  if (!picker || !state.version) return;
  const current = state.version;
  const managed = state.distribution && state.distribution !== 'standalone';
  const updating = updateSubmitting || state.update?.status === 'running';
  const newer = versionCatalog?.updateAvailable === true;
  const label = updating ? '更新中…' : versionQuery ? '检查版本中…' :
    current + (managed ? '（插件管理）' : newer ? '（有新版本）' : '');
  replace(picker,[]);
  const active = node('option',label); active.value = ''; picker.append(active);
  if (!managed) {
    (versionCatalog?.versions || []).filter(v => v !== current).forEach(v => {
      const option = node('option',v + (v.includes('-') ? ' · Beta' : ' · 正式版'));
      option.value = v; picker.append(option);
    });
    const retry = node('option',versionError ? '获取版本失败，重试' : '检查更新');
    retry.value = 'check'; picker.append(retry);
  }
  picker.disabled = offline || updating || versionQuery || Boolean(managed);
  picker.className = newer ? 'pending' : 'muted';
  picker.title = managed ? '请通过对应客户端插件市场更新' : '选择 Maker MCP 版本';
  const job = state.update;
  const notice = job && job.status + ':' + job.version;
  if (job?.message && notice !== updateNotice) {
    updateNotice = notice;
    notify(job.message,job.status === 'succeeded' ? 'success' : 'error');
  }
}
async function loadVersions() {
  versionQuery = true; renderVersionPicker();
  try { versionCatalog = await api('/api/versions'); versionError = false; }
  catch (_) { versionError = true; }
  finally { versionQuery = false; renderVersionPicker(); }
}
async function selectMakerVersion(event) {
  const version = event.target.value;
  event.target.value = '';
  if (version === 'check') return loadVersions();
  if (!version || updateSubmitting || state.update?.status === 'running') return;
  const downgrade = versionCatalog?.downgrades?.includes(version);
  const dialog = $('confirm');
  if (dialog.open) return;
  $('confirm-title').textContent = downgrade ? '降级 Maker MCP？' : '更新 Maker MCP？';
  $('confirm-message').textContent = state.version + ' → ' + version +
    (version.includes('-') ? '\n这是测试版本。' : '') +
    '\n将更新本机已支持的 AI 客户端 MCP 配置。完成后需重新连接 MCP；当前会话不会自动中断。';
  $('confirm-accept').textContent = downgrade ? '确认降级' : '确认更新';
  dialog.returnValue = 'cancel';
  const accepted = new Promise(resolve => dialog.addEventListener('close',() => resolve(dialog.returnValue === 'accept'),{once:true}));
  dialog.showModal();
  if (!await accepted) return;
  updateSubmitting = true; renderVersionPicker();
  try { state.update = await api('/api/update',{method:'POST',body:{version}}); }
  catch (error) { notify(error.message); }
  finally { updateSubmitting = false; renderVersionPicker(); }
}
let detail = null;
let preview = null;
let previewError = '';
let previewLoading = false;
const logViews = new Map();
function logView() {
  if (!logViews.has(selected)) logViews.set(selected,{tab:'build',runtime:'',loading:false,wrap:false,cleared:{}});
  return logViews.get(selected);
}
function selectLog(tab) {
  logView().tab = tab;
  renderConsoleLogs();
  $('console-logs')?.scrollIntoView({block:'nearest'});
}
function consoleLogSnapshot() {
  const view = logView();
  if (view.tab === 'runtime') return {id:view.runtimeId || 'runtime',output:view.runtime,details:''};
  const task = tasksFor(selected).find(t => t.action === (view.tab === 'lua' ? 'lua-lsp.check' : view.tab === 'qrcode' ? 'qrcode' : 'build'));
  if (!task) return {id:'',output:'',details:''};
  const result = nestedResult(task);
  return {id:task.id,output:task.output || '',details:[Array.isArray(result?.issues) ? result.issues.join('\n') : '',
    task.error, task.result ? text(task.result) : ''].filter(Boolean).join('\n\n')};
}
function clearConsoleLogs() {
  const view = logView();
  view.cleared[view.tab] = consoleLogSnapshot();
  renderConsoleLogs();
}
function consoleLogText() {
  const view = logView(), snapshot = consoleLogSnapshot(), cleared = view.cleared[view.tab];
  if (view.tab === 'runtime' && view.loading) return '正在读取运行时日志…';
  let {output,details} = snapshot;
  if (cleared && cleared.id === snapshot.id) {
    if (output.startsWith(cleared.output)) output = output.slice(cleared.output.length);
    if (details === cleared.details) details = '';
    return [output,details].filter(Boolean).join('\n\n') || '日志已清理';
  }
  return [output,details].filter(Boolean).join('\n\n') ||
    (view.tab === 'runtime' ? '点击刷新读取运行时日志' : snapshot.id ? '等待任务输出' : '暂无日志');
}
function logLineClass(line) {
  if (/(?:^|\b)(?:error|fatal|失败|错误|异常)(?:\b|$)/i.test(line)) return 'log-line log-error';
  if (/(?:^|\b)(?:warn(?:ing)?|警告|注意)(?:\b|$)/i.test(line)) return 'log-line log-warning';
  return 'log-line';
}
function renderLogLines(output) {
  const fragment = document.createDocumentFragment();
  const lines = String(output || '').split('\n');
  lines.forEach((line,index) => {
    fragment.append(node('span',line,logLineClass(line)));
    if (index < lines.length - 1) fragment.append(document.createTextNode('\n'));
  });
  return fragment;
}
function renderConsoleLogs() {
  const host = $('console-logs');
  if (!host) return;
  const view = logView();
  const toolbar = node('div',undefined,'console-log-toolbar');
  const tabs = node('div',undefined,'console-log-tabs');
  tabs.setAttribute('role','tablist');
  [['build','构建日志'],['lua','Lua 检查'],['runtime','Runtime 日志'],['qrcode','二维码']].forEach(([id,label]) => {
    const tab = button(label,() => { view.tab = id; renderConsoleLogs(); if (id === 'runtime' && !view.runtime && !view.loading) void loadLogs(); });
    tab.setAttribute('role','tab'); tab.setAttribute('aria-selected',String(view.tab === id));
    tab.setAttribute('aria-controls','console-log-output'); tabs.append(tab);
  });
  const actions = node('div',undefined,'actions');
  const wrap = node('label','自动换行','theme');
  const checkbox = node('input'); checkbox.type = 'checkbox'; checkbox.checked = view.wrap;
  checkbox.addEventListener('change',() => { view.wrap = checkbox.checked; renderConsoleLogs(); }); wrap.append(checkbox);
  actions.append(wrap,button(view.loading ? '读取中' : '刷新',() => { if(view.tab === 'runtime') void loadLogs(); else void pollState().then(renderConsoleLogs).catch(e=>notify(e.message)); },{icon:'refresh',iconOnly:true,className:'icon-button',loading:view.loading,disabled:offline || view.loading}),
    button('清理日志',clearConsoleLogs,{icon:'trash',iconOnly:true,className:'icon-button',disabled:view.loading}),
    button('复制',async () => { try { await navigator.clipboard.writeText(consoleLogText()); announce('日志已复制'); } catch (_) { notify('复制失败，请手动选择日志复制'); } },{icon:'copy',iconOnly:true,className:'icon-button'}));
  toolbar.append(node('h2','日志'),actions);
  const output = node('pre',undefined,'console-log-output' + (view.wrap ? ' wrap' : ''));
  output.append(renderLogLines(consoleLogText()));
  output.id = 'console-log-output'; output.setAttribute('role','tabpanel'); output.tabIndex = 0;
  const previous = $('console-log-output');
  const top = previous?.scrollTop || 0, left = previous?.scrollLeft || 0;
  replace(host,[toolbar,tabs,output]);
  output.scrollTop = top; output.scrollLeft = left;
}
let git = null;
let gitError = '';
let gitLoading = false;
let commitRequest = 0;
let pollTimer;
let activityTimer;
let polling = false;
let offline = false;
let shutdownPending = false;
let disposed = false;
let lastActivitySent = -Infinity;
const requests = new Set();
const offlineMessage = '控制台已关闭，请通过 Maker 重新打开控制台。未确认的任务结果需要核对，不要重复提交。';
let lastStateError = '';
let buildChecksLua = true;
try { buildChecksLua = localStorage.getItem('maker-console-build-lua-check') !== 'off'; } catch (_) {}
const pending = new Set();
const pendingActions = new Map();
const pluginSessions = new Map();
const acceptedTasks = new Map();
const windowDrafts = new Map();
function rememberTask(task) {
  const previous = acceptedTasks.get(task.id);
  acceptedTasks.set(task.id,task);
  const projectTasks = Array.from(acceptedTasks.values()).reverse()
    .filter(item => item.projectKey === task.projectKey)
    .sort((a,b) => String(b.startedAt).localeCompare(String(a.startedAt)));
  projectTasks.slice(10).forEach(item => { if (item.status !== 'running') acceptedTasks.delete(item.id); });
  if (task.projectKey === selected && task.status === 'failed' && previous?.status !== 'failed' &&
      (task.action === 'preview.start' || task.action === 'preview.refresh'))
    notify(text(nestedResult(task)?.error || task.error,'本地预览启动失败，请查看运行日志。'));
  while (acceptedTasks.size > 100) {
    const oldest = Array.from(acceptedTasks.values()).find(item => item.status !== 'running');
    if (!oldest) break;
    acceptedTasks.delete(oldest.id);
  }
}
const actionLabels = {
  build: '构建', qrcode: '生成测试二维码', 'lua-lsp.check': 'Lua 检查', 'preview.start': '启动预览',
  'preview.refresh': '刷新预览', 'preview.stop': '停止预览', 'preview.install': '安装 Runtime'
};
const statusLabels = {running: '运行中', succeeded: '已完成', failed: '失败', unknown: '结果未知'};
const $ = (id) => document.getElementById(id);
const text = (value, fallback = '未提供') => value === undefined || value === null || value === '' ? fallback :
  typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
const date = (value) => {
  if (!value) return '时间未提供';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? text(value) : new Intl.DateTimeFormat('zh-CN', {
    year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit',
    timeZoneName:'short'
  }).format(d);
};
function node(tag, content, className) {
  const element = document.createElement(tag);
  if (content !== undefined) element.textContent = text(content, '');
  if (className) element.className = className;
  return element;
}
function svgNode(tag, attributes) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
  return element;
}
function icon(name) {
  const svg = svgNode('svg', {viewBox:'0 0 24 24', fill:'none', stroke:'currentColor',
    'stroke-width':2, 'stroke-linecap':'round', 'stroke-linejoin':'round', 'aria-hidden':'true', class:'icon'});
  (iconNodes[name] || []).forEach(([tag, attrs]) => svg.append(svgNode(tag, attrs)));
  return svg;
}
function button(label, handler, options = {}) {
  const b = node('button', options.iconOnly ? undefined : label,
    [options.className, options.loading ? 'is-loading' : ''].filter(Boolean).join(' '));
  b.type = 'button';
  b.disabled = Boolean(options.disabled || options.loading);
  b.title = label;
  b.setAttribute('aria-label', label);
  if (options.loading) b.prepend(node('span',undefined,'loading-spinner'));
  else if (options.icon) b.prepend(icon(options.icon));
  if (options.focus) b.dataset.focus = options.focus;
  if (options.loading) b.setAttribute('aria-busy','true');
  b.addEventListener('click', handler);
  return b;
}
function replace(target, children) {
  if (!target) return;
  const opened = new Set(Array.from(target.querySelectorAll('details[open]')).map(d => d.dataset.key));
  const active = target.contains(document.activeElement) ? document.activeElement.dataset.focus : '';
  target.replaceChildren(...children);
  target.querySelectorAll('details').forEach(d => { if (opened.has(d.dataset.key)) d.open = true; });
  if (active) {
    Array.from(target.querySelectorAll('[data-focus]')).find(e => e.dataset.focus === active)?.focus();
  }
}
async function api(path, options = {}) {
  if (!path.startsWith('/api/') || path.includes('\\') || path.includes('#')) throw new Error('请求地址不受信任');
  if (offline || disposed) throw new Error(offlineMessage);
  const controller = new AbortController();
  requests.add(controller);
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 20000);
  let received = false;
  try {
    const response = await fetch(path, {
      method: options.method || 'GET',
      headers: {'Content-Type':'application/json'},
      ...(options.body === undefined ? {} : {body:JSON.stringify(options.body)}),
      credentials:'omit', cache:'no-store', redirect:'error', signal:controller.signal
    });
    const data = await response.json();
    received = true;
    if (!response.ok) throw new Error(text(data.error, '请求失败（HTTP ' + response.status + '）'));
    return data;
  } catch (error) {
    if (!received && !disposed) {
      if (offline) throw new Error(offlineMessage);
      throw new Error(options.method === 'POST'
        ? '操作结果尚未确认，请查看任务状态后再决定是否重试。'
        : '请求失败，请重试；控制台会继续检查连接。');
    }
    throw error;
  } finally { clearTimeout(timeout); requests.delete(controller); }
}
async function sendActivity(allowHidden = false) {
  if (offline || disposed || (!allowHidden && document.hidden) || Date.now() - lastActivitySent < 30000) return;
  lastActivitySent = Date.now();
  try { await api('/api/activity', {method:'POST', body:{}}); }
  catch (error) { if (!disposed) notify(error.message); }
}
function startActivityLease() {
  if (activityTimer || offline || disposed) return;
  activityTimer = setInterval(() => void sendActivity(true),60000);
}
function dispose() {
  offline = true;
  disposed = true;
  clearTimeout(pollTimer);
  clearInterval(activityTimer);
  activityTimer = undefined;
  requests.forEach(controller => controller.abort());
  requests.clear();
  pluginSessions.forEach(session => clearTimeout(session.timer));
}
function projectPath(key, suffix = '') { return '/api/projects/' + encodeURIComponent(key) + suffix; }
function currentProject() { return state.projects.find(p => p.key === selected); }
function tasksFor(key) {
  const tasks = new Map(state.tasks.filter(t => t.projectKey === key).map(t => [t.id, t]));
  acceptedTasks.forEach(t => { if (t.projectKey === key && !tasks.has(t.id)) tasks.set(t.id, t); });
  return Array.from(tasks.values()).sort((a,b) => String(b.startedAt).localeCompare(String(a.startedAt))).slice(0,10);
}
function busy(key = selected) { return pending.has(key) || tasksFor(key).some(t => t.status === 'running'); }
function actionBusy(action, key = selected) {
  return pendingActions.get(key) === action ||
    tasksFor(key).some(task => task.action === action && task.status === 'running');
}
function selectionMatches(key, epoch) { return key === selected && epoch === selectionEpoch; }
function notify(message, tone = 'error') {
  $('feedback-text').textContent = text(message);
  $('feedback').dataset.tone = tone;
  $('feedback').hidden = false;
}
function announce(message) {
  $('announcement').hidden = false;
  $('announcement').textContent = message;
}
function setProjectQuery() {
  const url = new URL(location.href);
  url.searchParams.delete('project');
  url.searchParams.delete('checkout');
  projectid = currentProject()?.projectid || '';
  if (projectid) {
    url.searchParams.set('projectid',projectid);
    if (state.projects.filter(p => p.projectid === projectid).length > 1)
      url.searchParams.set('checkout',selected);
  } else url.searchParams.delete('projectid');
  history.replaceState(null, '', url.pathname + url.search + url.hash);
}
function projectKeyFromQuery(query) {
  const projectid = query.get('projectid');
  if (!projectid) return query.get('project') || '';
  const matches = state.projects.filter(p => p.projectid === projectid);
  const checkout = query.get('checkout');
  if (checkout) return matches.find(p => p.key === checkout)?.key || '';
  return matches.length === 1 ? matches[0].key : '';
}
function chooseProject(key, updateUrl = true) {
  if ($('qrcode-result')?.open) $('qrcode-result').close();
  const project = state.projects.find(p => p.key === key);
  selected = key;
  selectionEpoch++;
  viewEpoch++;
  commitRequest++;
  detail = null; preview = null; previewError = ''; git = null; gitError = '';
  gitLoading = false;
  page = project?.valid ? 'overview' : 'projects';
  if (updateUrl) setProjectQuery();
  $('feedback').hidden = true;
  if (key && !project) notify('所选项目未登记，请从本地项目列表选择。');
  render();
  if (project?.valid) void loadProject();
}
function updateChrome() {
  updatePluginTabs();
  const picker = $('project-picker');
  const signature = JSON.stringify(state.projects.map(p => [p.key,p.name,p.valid])) + selected;
  if (picker.dataset.signature !== signature) {
    const placeholder = node('option', selected && !currentProject() ? '所选项目未登记' : '选择本地项目');
    placeholder.value = '';
    picker.replaceChildren(placeholder);
    state.projects.forEach(p => {
      const option = node('option', p.name + (p.valid ? '' : ' · 不可用'));
      option.value = p.key; option.disabled = !p.valid; picker.append(option);
    });
    picker.dataset.signature = signature;
  }
  picker.value = currentProject() ? selected : '';
  picker.disabled = !loaded || offline;
  $('context').textContent = currentProject() ? text(detail?.git?.branch, '分支未提供') : '本地项目';
  $('context').title = currentProject()?.name || '本地项目';
  $('footer-path').textContent = currentProject()?.path || '';
  document.querySelectorAll('nav [data-page]').forEach(b => {
    b.disabled = !loaded || (b.dataset.page !== 'documents' && !currentProject()?.valid);
    if (b.dataset.page === page) b.setAttribute('aria-current','page');
    else b.removeAttribute('aria-current');
  });
  if ($('heading-actions')) replace($('heading-actions'),headingActionButtons());
  if ($('overview-task')) {
    replace($('overview-task'),overviewTasks());
  }
}
function headingActionButtons() {
  const actions = previewActions(preview);
  const previewBusy = actionBusy('preview.start') || actionBusy('preview.refresh') ||
    actionBusy('preview.install') || actionBusy('preview.stop');
  const qrcodeBusy = actionBusy('qrcode');
  const local = button('本地预览',() => {
    const action = previewActions(preview)[0];
    if (action) void runProjectAction(action);
  },{className:'preview-button',icon:'monitor',loading:previewBusy,
    disabled:offline || busy() || !actions.length,focus:'heading-preview'});
  local.title = actions.length ? '本地预览 · ' + actionLabels[actions[0]] :
    '本地预览 · ' + (previewError || text(preview?.error,previewLabel()));
  const checking = pendingActions.get(selected) === 'lua-lsp.check' ||
    tasksFor(selected).some(item => item.action === 'lua-lsp.check' && item.status === 'running');
  const task = tasksFor(selected).find(t => t.action === 'build');
  const presentation = buildPresentation(task,pendingActions.get(selected) === 'build',offline);
  const build = button(checking ? 'Lua 检查中' : presentation.active ? presentation.label : '构建',
    () => void runProjectAction('build'),
    {className:'build-button' + (presentation.active || checking ? ' is-building' : ''),
      icon:presentation.active || checking ? 'refresh' : 'hammer',disabled:offline || busy(),focus:'heading-build'});
  build.setAttribute('aria-busy',String(presentation.active || checking));
  const primary = node('div',undefined,'actions heading-primary');
  primary.append(local,build,button('测试二维码',() => void runProjectAction('qrcode'),{
    icon:'qrcode',loading:qrcodeBusy,disabled:offline || busy(),focus:'heading-qrcode'
  }));
  return [primary];
}
function luaCheckOption() {
  const label = node('label',undefined,'lua-check-option');
  const input = node('input');
  input.type = 'checkbox';
  input.checked = buildChecksLua;
  input.disabled = offline || busy();
  input.dataset.focus = 'build-lua-check';
  input.setAttribute('aria-label','构建前检查 Lua');
  input.addEventListener('change',() => {
    buildChecksLua = input.checked;
    try { localStorage.setItem('maker-console-build-lua-check', buildChecksLua ? 'on' : 'off'); }
    catch (_) { notify('无法保存 Lua 检查设置'); }
  });
  label.append(input, document.createTextNode('构建前检查 Lua'));
  return label;
}

function pluginDescriptors(value = state.plugins) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.filter(plugin => {
    if (!plugin || typeof plugin.id !== 'string' || !/^[a-z][a-z0-9-]{0,47}$/.test(plugin.id) ||
        seen.has(plugin.id) || typeof plugin.title !== 'string' || !plugin.title.trim() ||
        plugin.title.length > 80 || plugin.protocolVersion !== 1 || plugin.requiresProject !== true) return false;
    seen.add(plugin.id);
    return true;
  }).slice(0,32).sort((a,b) => (a.order || 0) - (b.order || 0));
}
function pluginUrl(ready, project) {
  const url = new URL(ready.url);
  if (ready.projectPath !== project || url.protocol !== 'http:' || url.hostname !== '127.0.0.1' ||
      !url.port || url.username || url.password || url.pathname !== '/' || url.search || !url.hash)
    throw new Error('插件返回了无效的项目地址。');
  return url.href;
}
function pluginMessageMatches(event, session) {
  return Boolean(session.iframe && event.source === session.iframe.contentWindow &&
    event.origin === session.origin && event.data && event.data.protocolVersion === 1 &&
    ['maker-console:plugin-ready','maker-console:plugin-activity'].includes(event.data.type));
}
function sendPluginTheme(session, type = 'maker-console:theme') {
  if (!session.iframe || !session.origin) return;
  const theme = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
  session.iframe.contentWindow.postMessage({type,protocolVersion:1,theme},session.origin);
}
function updatePluginTabs() {
  const tabs = $('plugin-tabs');
  const plugins = pluginDescriptors();
  const signature = JSON.stringify(plugins);
  if (tabs.dataset.signature === signature) return;
  tabs.dataset.signature = signature;
  tabs.replaceChildren(...plugins.map(plugin => {
    const tab = button(plugin.title,() => navigate('plugin:' + plugin.id));
    tab.dataset.page = 'plugin:' + plugin.id;
    return tab;
  }));
}
function pluginStatus(session, message, retry = false) {
  session.status.hidden = !message;
  session.status.replaceChildren(node('p',message,'muted'));
  if (retry) session.status.append(button('重新连接',() => {
    if (offline || disposed || session.loading) return;
    if (session.iframe && !window.confirm('重新连接将清空此插件尚未保存的页面编辑，不会取消已提交的远端任务。确认继续？')) return;
    if (offline || disposed || session.loading) return;
    clearTimeout(session.timer);
    session.iframe?.remove();
    session.iframe = null;
    void startPlugin(session);
  },{icon:'refresh',disabled:offline || disposed || session.loading}));
}
async function startPlugin(session) {
  if (session.loading || offline || disposed) return;
  session.loading = true;
  pluginStatus(session,'正在加载 ' + session.plugin.title + '…');
  try {
    const ready = await api(projectPath(session.key,'/plugins/' + session.plugin.id + '/open'),
      {method:'POST',body:{},timeoutMs:80000});
    if (disposed) return;
    const url = pluginUrl(ready,session.projectPath);
    session.origin = new URL(url).origin;
    const frame = node('iframe',undefined,'plugin-frame');
    frame.title = session.plugin.title + ' · ' + session.projectName;
    frame.referrerPolicy = 'origin';
    frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-downloads allow-modals');
    session.iframe = frame;
    frame.addEventListener('load',() => {
      if (session.iframe !== frame) return;
      sendPluginTheme(session,'maker-console:connect');
    });
    session.timer = setTimeout(() => {
      pluginStatus(session,'插件未完成连接。可重新连接；已有页面编辑不会被自动清除。',true);
    },20000);
    frame.src = url;
    session.element.append(frame);
  } catch (error) {
    session.loading = false;
    pluginStatus(session,error.message,true);
  } finally { session.loading = false; }
}
function pruneFailedPluginSessions() {
  for (const [id, session] of pluginSessions) {
    if (session.loading || session.iframe) continue;
    clearTimeout(session.timer);
    session.element.remove();
    pluginSessions.delete(id);
  }
}
function renderPlugin(plugin) {
  const id = selected + ':' + plugin.id;
  let session = pluginSessions.get(id);
  if (!session) {
    if (pluginSessions.size >= 8) pruneFailedPluginSessions();
    if (pluginSessions.size >= 8) {
      $('view').hidden = false;
      $('plugin-views').hidden = true;
      replace($('view'),[heading('已达到插件工作区上限'),
        node('p','最多保留 8 个工作区。请保存已有编辑并重新打开控制台。','muted')]);
      return;
    }
    const project = currentProject();
    const element = node('div',undefined,'plugin-workspace');
    const status = node('div',undefined,'plugin-status');
    status.setAttribute('role','status');
    element.append(status);
    session = {plugin,key:selected,projectPath:project.path,projectName:project.name,element,status,iframe:null};
    pluginSessions.set(id,session);
    $('plugin-views').append(element);
    void startPlugin(session);
  }
  session.element.hidden = false;
}

function nestedResult(task) {
  return task?.result?.result && typeof task.result.result === 'object' ? task.result.result : task?.result;
}
function buildFailureTitle(task) {
  const error = text(task?.error,'');
  if (/BLACKLISTED|Account restricted|账号受到限制/i.test(error))
    return 'Maker 账号受到限制。请联系管理员核实账号状态，解除限制后再构建。';
  const result = nestedResult(task);
  const failure = result?.submitResult?.failure;
  if (failure?.classification === 'auth' || /returned error: (401|403)/i.test(error))
    return '项目同步被拒绝，远端构建未启动。请核对当前 Maker 账号、项目访问权限和登录凭证。';
  if (result?.mode === 'submit_failed_before_build') return '代码提交失败，远端构建未启动。';
  if (result?.mode === 'remote_build_failed' || result?.mode === 'build_failed_after_submit')
    return '远端构建失败。';
  if (result?.mode === 'settings_invalid_before_build' || result?.mode === 'project_invalid_before_build')
    return '项目检查未通过，构建未启动。';
  return error.split('\n').find(line => line.trim()) || '构建失败。';
}
function buildFailureMessage(task) {
  return buildFailureTitle(task);
}
function valueText(value, fallback = '') {
  if (value === undefined || value === null || value === '') return fallback;
  return typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
}
function buildFailureDetails(task) {
  const result = nestedResult(task);
  const lines = [];
  const error = text(task?.error,'');
  if (error) lines.push(error);
  const submit = result?.submitResult;
  const gitFailure = submit?.failure;
  const buildFailure = result?.buildFailure;
  const extras = [];
  if (result?.mode) extras.push(['失败阶段', result.mode]);
  extras.push(
    ['Git 状态', submit?.status],
    ['Git 分类', gitFailure?.classification],
    ['Git 命令', gitFailure?.command],
    ['Git 退出码', gitFailure?.exitCode],
    ['下一步', gitFailure?.nextAction || buildFailure?.nextAction],
    ['Git 错误', gitFailure?.message],
    ['Git stderr', gitFailure?.stderr],
    ['Git stdout', gitFailure?.stdout],
    ['服务端错误', buildFailure?.message || result?.resultText],
    ['构建错误名', buildFailure?.name]
  );
  extras.forEach(([label, value]) => {
    const textValue = valueText(value);
    if (textValue && !error.includes(textValue)) lines.push(label + '：' + textValue);
  });
  return lines.join('\n').trim();
}
function buildPresentation(task, submitting = false, disconnected = false) {
  if (disconnected) return {label:'连接已断开',stage:'任务结果待核对，请勿重复提交',active:false,tone:'pending'};
  if (submitting) return {label:'正在发起构建',stage:'等待本地服务接收',active:true,tone:'pending'};
  if (!task) return {label:'尚未构建',stage:'',active:false,tone:'muted'};
  if (task.status === 'running') {
    const stages = {sync:'同步项目',prepare:'准备项目',auth:'验证项目访问权限',
      remote_sync:'检查远端版本',commit:'提交本地变更',push:'推送项目',build:'远端构建',
      remote_build:'远端构建',preview:'准备预览'};
    const current = task.progress?.progress;
    const total = task.progress?.total;
    const percent = typeof current === 'number' && Number.isFinite(current) &&
      typeof total === 'number' && Number.isFinite(total) && total > 0 ?
      Math.max(0,Math.min(100,Math.round(current / total * 100))) : undefined;
    return {label:'构建中',stage:stages[task.progress?.phase] || task.progress?.message || '等待构建进度',
      active:true,tone:'pending',percent};
  }
  if (task.status === 'succeeded') return {label:'构建成功',stage:'',active:false,tone:'good'};
  if (task.status === 'failed') return {label:'构建失败',stage:buildFailureTitle(task),active:false,tone:'bad'};
  return {label:'结果待核对',stage:'请先核对远端结果，不要重复提交',active:false,tone:'pending'};
}
function failureBanner(title, detail, tone = 'bad') {
  const banner = node('div',undefined,'failure-banner ' + tone);
  banner.append(node('strong',title));
  if (detail) banner.append(node('pre',detail,'failure-detail'));
  return banner;
}
function buildStatusBlock(task, submitting = false) {
  const info = buildPresentation(task,submitting,offline);
  const block = node('div',undefined,'build-status ' + info.tone);
  const title = node('div',undefined,'build-status-title');
  if (info.active) { const spinner = icon('refresh'); spinner.classList.add('build-spinner'); title.append(spinner); }
  title.append(node('strong',info.label));
  block.append(title);
  if (task?.status === 'failed') {
    block.append(failureBanner(info.stage || '构建失败', buildFailureDetails(task)));
  } else if (info.stage) block.append(node('p',info.stage,'build-stage'));
  if (info.active) {
    const bar = node('div',undefined,'build-progress');
    bar.setAttribute('role','progressbar');
    bar.setAttribute('aria-label','构建进行中');
    bar.setAttribute('aria-valuemin','0');
    bar.setAttribute('aria-valuemax','100');
    const fill = node('span');
    if (info.percent === undefined) bar.classList.add('indeterminate');
    else {
      bar.classList.add('determinate');
      bar.setAttribute('aria-valuenow',String(info.percent));
      fill.style.width = info.percent + '%';
    }
    bar.append(fill);
    block.append(bar);
    if (info.percent !== undefined)
      block.append(node('p','当前阶段 ' + info.percent + '%','build-progress-label muted'));
  }
  return block;
}
function heading(title, subtitle, withActions = false) {
  const wrap = node('div', undefined, 'heading');
  const label = node('div');
  label.append(node('h1', title));
  if (subtitle) label.append(node('p', subtitle, 'path'));
  wrap.append(label);
  if (withActions) {
    const actions = node('div',undefined,'actions'); actions.id = 'heading-actions';
    actions.append(...headingActionButtons()); wrap.append(actions);
  }
  return wrap;
}
function row(label, value) {
  const r = node('div', undefined, 'row');
  r.append(node('dt', label), node('dd', value));
  return r;
}
function fields(entries) {
  const list = node('dl');
  entries.forEach(([label,value]) => list.append(row(label, text(value))));
  return list;
}
let selectingProjectFolder = false;
function renderProjects() {
  const view = $('view');
  const title = heading('本地项目', loaded ? state.projects.length + ' 个已登记项目' : '正在读取项目');
  const list = node('section');
  state.projects.forEach(p => {
    const r = node('div', undefined, 'project-row');
    const label = node('div');
    label.append(node('h2', p.name), node('div', p.path, 'path'));
    if (p.key === selected) label.append(node('span','当前项目','tag'));
    if (!p.valid) label.append(node('p', text(p.error,'项目不可用'), 'bad'));
    const actions = node('div', undefined, 'actions');
    actions.append(button('打开', () => chooseProject(p.key), {disabled:!p.valid}));
    actions.append(button('移除登记（保留项目文件）', () => void removeProject(p.key), {
      icon:'trash',iconOnly:true,className:'icon-button danger',disabled:busy() || busy(p.key),
      focus:'remove-' + p.key
    }));
    r.append(label,actions); list.append(r);
  });
  if (loaded && !state.projects.length) list.append(node('p','尚未登记本地项目','empty'));
  const controls = node('div', undefined, 'actions');
  const select = button(selectingProjectFolder ? '选择或扫描中…' : '打开本地文件夹', async () => {
    if (selectingProjectFolder) return;
    selectingProjectFolder = true;
    renderProjects();
    try {
      const result = await api('/api/projects/select-folder', {method:'POST',body:{},timeoutMs:140000});
      if (result.cancelled) return;
      await pollState();
      let message = result.added || result.existing
        ? '新增 ' + result.added + ' 个项目，' + result.existing + ' 个已在列表中'
        : '未找到可添加的 Maker 项目';
      if (result.skipped) message += '；' + result.skipped + ' 个目录读取或项目校验失败';
      if (result.limited) message += '；未扫描全部目录，请选择更具体的文件夹继续添加';
      notify(message, result.skipped || result.limited ? 'warning' : undefined);
    } catch (error) { notify(error.message); }
    finally {
      selectingProjectFolder = false;
      if (page === 'projects') renderProjects();
    }
  }, {icon:'folder',disabled:offline || busy() || !loaded || selectingProjectFolder});
  controls.append(select);
  replace(view,[title,list,controls]);
}
async function removeProject(key) {
  if (busy() || busy(key)) return;
  pending.add(key); updateChrome();
  const name = state.projects.find(p => p.key === key)?.name || key;
  try {
    await api(projectPath(key),{method:'DELETE',body:{}});
    state.projects = state.projects.filter(p => p.key !== key);
    pending.delete(key);
    if (selected === key) chooseProject('');
    else render();
    announce('已移除登记：' + name + '。项目文件保留。');
  } catch (error) { notify(error.message); }
  finally { pending.delete(key); updateChrome(); if (page === 'projects') renderProjects(); }
}
function overviewTasks() {
  const tasks = tasksFor(selected);
  const title = node('div',undefined,'section-heading');
  title.append(node('h2','最近任务'),node('span','保留最近 10 次','muted'));
  return [title,...(tasks.length ? tasks.map(task => taskBlock(task)) : [node('p','暂无控制台任务','muted')])];
}
function renderOverview() {
  const p = currentProject();
  const title = heading(p.name,p.path,true);
  if (!detail) { replace($('view'),[title,node('p','正在读取项目配置','empty')]); return; }
  const config = detail.config || {};
  const orientation = config.orientation === 'portrait' || config.orientation === 1 || config.orientation === '1' ? '竖屏' :
    config.orientation === 'landscape' || config.orientation === 2 || config.orientation === '2' ? '横屏' : text(config.orientation, '未设置');
  const metrics = node('div',undefined,'metrics');
  [['项目版本',config.version],['屏幕方向',orientation],['Git HEAD',detail.git?.head?.slice(0,10)],
    ['本地预览',previewLabel()]].forEach(([name,value]) => {
    const metric = node('div',undefined,'metric');
    metric.append(node('div',name,'muted'),node('div',text(value),'value' +
      (name === '本地预览' ? ' ' + previewPresentation(preview,previewError).tone : ''))); metrics.append(metric);
  });
  const runtime = runtimePresentation(preview,previewError);
  const runtimeMetric = node('div',undefined,'metric runtime-metric');
  runtimeMetric.append(node('div','本地 Runtime','muted'),node('div',runtime.label,'value ' + runtime.tone));
  if (runtime.detail) runtimeMetric.append(node('div',runtime.detail,'runtime-detail muted'));
  if (runtime.action) runtimeMetric.append(button('安装 Runtime',() => void runProjectAction(runtime.action),{
    disabled:offline || busy(),focus:'overview-runtime-install'
  }));
  metrics.append(runtimeMetric);
  const lua = luaLspPresentation(state.luaLsp);
  const luaMetric = node('div',undefined,'metric runtime-metric');
  luaMetric.append(node('div','Lua LSP','muted'),node('div',lua.label,'value ' + lua.tone));
  if (lua.detail) luaMetric.append(node('div',lua.detail,'runtime-detail muted'));
  metrics.append(luaMetric);
  const columns = node('div',undefined,'columns');
  const configSection = node('section'); configSection.append(node('h2','项目配置'),fields([
    ['入口脚本',config.entry],['引擎通道',config.engineTag],
    ['多人模式',typeof config.multiplayer === 'boolean' ? (config.multiplayer ? '开启' : '关闭') : config.multiplayer],
    ['应用 ID',config.appId],['Git 分支',detail.git?.branch],['工作区变更',detail.git?.changeCount]
  ]));
  const health = node('section'); health.append(node('h2','项目检查'));
  const healthStatus = detail.health;
  health.append(node('p',healthLabel(healthStatus),
    healthStatus?.status === 'ready' ? 'good' : healthStatus?.status === 'error' || healthStatus?.status === 'misplaced_config' ? 'bad' : 'muted'));
  if (typeof healthStatus?.canBuild === 'boolean') {
    health.append(fields([['构建条件',healthStatus.canBuild ? '满足' : '存在阻塞问题']]));
  }
  if (Array.isArray(healthStatus?.issues)) {
    healthStatus.issues.forEach(issue => {
      const item = node('div',undefined,'health-issue');
      item.append(node('p',text(issue.message),'error' === issue.severity ? 'bad' : 'pending'));
      if (issue.path) item.append(node('div',issue.path,'path'));
      if (issue.expectedPath) item.append(node('div','应位于：' + issue.expectedPath,'path'));
      health.append(item);
    });
  }
  if (healthStatus !== undefined) {
    const raw = node('details'); raw.dataset.key = 'health-raw';
    raw.append(node('summary','完整检查结果'),node('pre',text(healthStatus))); health.append(raw);
  }
  if (previewError) health.append(node('p',previewError,'bad'));
  const latestBuild = tasksFor(selected).find(t => t.action === 'build');
  if (latestBuild?.status === 'failed') {
    health.append(failureBanner('最近构建失败', buildFailureDetails(latestBuild) || buildFailureTitle(latestBuild)));
  }
  columns.append(configSection,health);
  const recent = node('section',undefined,'task-history'); recent.id = 'overview-task';
  recent.append(...overviewTasks());
  const serviceActions = node('div',undefined,'console-service-actions');
  serviceActions.append(button('关闭Maker控制台',() => void shutdownConsole(),{
    className:'console-shutdown',disabled:offline || shutdownPending,focus:'console-shutdown'
  }));
  replace($('view'),[title,metrics,columns,recent,serviceActions]);
}
async function shutdownConsole() {
  if (shutdownPending || offline || disposed) return;
  shutdownPending = true;
  try {
    if (!await confirmAction('console.shutdown')) return;
    if (pending.size || state.tasks.some(task => task.status === 'running')) {
      notify('仍有任务正在执行，请等待完成后再关闭控制台。','warning');
      return;
    }
    await api('/api/shutdown',{method:'POST',body:{}});
    dispose();
    updateChrome();
    $('connection').textContent = '正在关闭';
    $('connection').className = 'muted';
    $('plugin-views').hidden = true;
    $('view').replaceChildren(
      node('h1','Maker 控制台正在关闭'),
      node('p','可以关闭此页面。再次使用时，请通过 Maker 重新打开控制台。','muted')
    );
  } catch (error) {
    notify(error.message === 'Wait for active tasks before stopping the console.'
      ? '仍有任务、更新或文件夹选择正在进行，请完成后再关闭控制台。'
      : error.message);
  } finally {
    shutdownPending = false;
    if (!disposed) render();
  }
}
function luaLspPresentation(status) {
  if (!status) return {label:'待检测',status:'未提供',detail:'打开控制台后读取本机安装状态',tone:'muted'};
  if (status.ready) return {
    label: '已安装',
    status: '已安装',
    detail: status.version ? text(status.version) : '版本未提供',
    nextAction: text(status.nextAction,'本地 Lua 诊断可用。'),
    tone: 'good'
  };
  const labels = {missing:'未安装',python_missing:'需要 Python',setup_failed:'安装失败'};
  return {
    label: labels[status.status] || '不可用',
    status: labels[status.status] || text(status.status,'不可用'),
    detail: text(status.error, status.status === 'python_missing' ? '需要先准备 Python' : '未检测到 maker-lua-lsp'),
    nextAction: text(status.nextAction,'请运行 taptap-maker lua-lsp setup。'),
    tone: status.status === 'setup_failed' ? 'bad' : 'pending'
  };
}
function luaCheckSummary(task, checking = false) {
  const result = nestedResult(task);
  if (task?.status === 'running' || checking) return '正在检查当前项目 Lua 脚本';
  if (task?.status === 'succeeded') return text(result?.summary,'Lua 检查通过');
  return text(result?.summary || result?.error || task?.error,'Lua 检查未通过');
}
function healthLabel(health) {
  const labels = {ready:'检查通过',warning:'有待处理的问题',error:'检查未通过',
    not_initialized:'项目尚未初始化完整',misplaced_config:'配置文件位置不正确'};
  return labels[health?.status] || '未提供检查结果';
}
function safePreviewUrl(value) {
  if (typeof value !== 'string' || !/^https?:\/\//i.test(value)) return null;
  try {
    const url = new URL(value);
    return ['http:','https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch (_) { return null; }
}
function qrcodeImageSource(task) {
  if (task?.action !== 'qrcode' || task.status !== 'succeeded' || task.result?.ok === false) return null;
  const content = task.result?.result?.content;
  for (const item of Array.isArray(content) ? content : []) {
    if (item.type === 'image' && ['image/png','image/jpeg','image/webp'].includes(item.mimeType) &&
        typeof item.data === 'string' && item.data.length < 2 * 1024 * 1024 && /^[A-Za-z0-9+/=\r\n]+$/.test(item.data))
      return 'data:' + item.mimeType + ';base64,' + item.data;
    if (item.type !== 'text' || typeof item.text !== 'string') continue;
    // The QR tool returns a Markdown image, not an MCP image content block.
    for (const match of item.text.matchAll(/!\[[^\]]*\]\(\s*(https:\/\/[^\s<>"')]+)(?:\s+"[^"]*")?\s*\)/g)) {
      const safe = safePreviewUrl(match[1]);
      if (!safe) continue;
      const url = new URL(safe);
      if (url.origin === 'https://tapcode-sce.spark.xd.com' && /^\/qrcode\/[^/]+\.(?:png|jpe?g|webp)$/i.test(url.pathname))
        return url.href;
    }
  }
  return null;
}
function consoleDialogOpen() {
  return ['confirm','qrcode-confirm','selection-dialog','qrcode-result'].some(id => $(id)?.open);
}
function explainQrcode(title, message) {
  if (consoleDialogOpen()) return;
  $('confirm-title').textContent = title;
  $('confirm-message').textContent = message;
  $('confirm-accept').textContent = '知道了';
  $('confirm').showModal();
}
function showQrcode(task) {
  const source = qrcodeImageSource(task);
  const dialog = $('qrcode-result');
  if (!source || task.projectKey !== selected || (consoleDialogOpen() && !dialog?.open)) return;
  const image = $('qrcode-result-image'), status = $('qrcode-result-status');
  const retry = $('qrcode-result-reload'), original = $('qrcode-result-original');
  $('qrcode-result-project').textContent = '项目：' + task.projectName;
  original.hidden = source.startsWith('data:');
  if (!original.hidden) original.href = source;
  else original.removeAttribute('href');
  const loadImage = () => {
    status.hidden = false; status.textContent = '正在加载二维码…'; status.className = 'muted';
    retry.hidden = true; image.hidden = true;
    image.onload = () => { image.hidden = false; status.hidden = true; };
    image.onerror = () => {
      status.hidden = false; status.textContent = '二维码图片加载失败，可重载图片或打开原图。';
      status.className = 'pending'; retry.hidden = false;
    };
    image.src = source;
  };
  retry.onclick = loadImage;
  if (dialog.removeAttribute) dialog.removeAttribute('aria-busy');
  loadImage();
  if (!dialog.open) dialog.showModal();
}
function showQrcodeLoading(project) {
  const dialog = $('qrcode-result');
  if (!dialog || consoleDialogOpen()) return;
  $('qrcode-result-project').textContent = '项目：' + text(project?.name, '当前项目');
  $('qrcode-result-status').hidden = false;
  $('qrcode-result-status').textContent = '正在生成测试二维码，请稍候…';
  $('qrcode-result-status').className = 'pending';
  $('qrcode-result-image').hidden = true;
  $('qrcode-result-reload').hidden = true;
  $('qrcode-result-original').hidden = true;
  dialog.setAttribute('aria-busy','true');
  dialog.showModal();
}
const handledQrcodeTasks = new Set();
function handleQrcodeCompletion(task) {
  if (task.action !== 'qrcode' || task.status === 'running' || task.projectKey !== selected ||
      handledQrcodeTasks.has(task.id)) return;
  handledQrcodeTasks.add(task.id);
  while (handledQrcodeTasks.size > 100) handledQrcodeTasks.delete(handledQrcodeTasks.values().next().value);
  if (consoleDialogOpen() && !$('qrcode-result')?.open) return;
  if (task.status === 'succeeded') {
    if (qrcodeImageSource(task)) showQrcode(task);
    else {
      if ($('qrcode-result')?.open) {
        if ($('qrcode-result').removeAttribute) $('qrcode-result').removeAttribute('aria-busy');
        $('qrcode-result-status').hidden = false;
        $('qrcode-result-status').textContent = '二维码任务已完成，但未返回可显示的二维码图片，请查看任务结果。';
        $('qrcode-result-status').className = 'pending';
      }
      notify('二维码工具已返回，请在任务结果中查看链接。','warning');
    }
  } else if ($('qrcode-result')?.open) {
    $('qrcode-result').close();
    if ($('qrcode-result').removeAttribute) $('qrcode-result').removeAttribute('aria-busy');
  } else if (task.interaction?.kind === 'select_developer' && !busy(task.projectKey)) {
    void runAction('qrcode',{sourceTaskId:task.id});
  }
}
function taskPreviewUrl(task) {
  if (task.status !== 'succeeded' || task.result?.ok === false) return null;
  const result = task.result?.result || task.result;
  // previewRefresh.url is a POST API endpoint, not a user-facing preview.
  for (const candidate of [result?.previewUrl,result?.preview_url,result?.makerUrl]) {
    const url = safePreviewUrl(candidate);
    if (url) return url;
  }
  return null;
}
function previewActions(status) {
  if (!status || status.supported === false) return [];
  if (status.process_alive === true) return ['preview.refresh','preview.stop'];
  if (status.process_alive !== false) return [];
  if (status.install_state === 'missing') return ['preview.install'];
  if (status.install_state === 'ready') return ['preview.start'];
  return [];
}
function previewStateLabel(value) {
  const labels = {starting:'启动中',running:'运行中',reloading:'刷新中',stopped:'已停止',failed:'启动失败'};
  return labels[value] || '';
}
function previewPresentation(status, requestError = '') {
  if (requestError) return {label:'检测失败',stateLabel:'待检测',tone:'bad',error:requestError,errors:[],errorCount:0};
  if (!status) return {label:'待检测',stateLabel:'待检测',tone:'muted',error:'',errors:[],errorCount:0};
  const errors = Array.isArray(status.errors) ? status.errors
    .filter(value => typeof value === 'string' && value.trim()).map(value => value.trim()) : [];
  const stateLabel = previewStateLabel(status.state) || (status.process_alive === true ? '运行中' :
    status.process_alive === false ? '已停止' : '进程身份未知');
  const error = text(status.error,'');
  const label = status.process_alive === true && errors.length ? stateLabel + ' · 有日志错误' : stateLabel;
  const tone = error || status.state === 'failed' ? 'bad' :
    status.state === 'starting' || status.state === 'reloading' ? 'pending' :
    status.process_alive === true ? 'good' : 'muted';
  return {label,stateLabel,tone,error,errors,errorCount:errors.length};
}
function previewLabel() {
  return previewPresentation(preview,previewError).label;
}
function runtimePresentation(status, error = '') {
  if (error) return {label:'检测失败',detail:error,tone:'bad'};
  if (!status) return {label:'待检测',detail:'',tone:'muted'};
  if (status.install_state === 'missing')
    return {label:'未安装',detail:'',tone:'pending',action:'preview.install'};
  if (status.install_state === 'ready') {
    const version = status.runtime?.runtime_version || status.runtime_version;
    const detail = version && version !== 'unknown' ? text(version) :
      status.installed_at ? date(status.installed_at) : '版本信息未提供';
    return {label:'已安装',detail,tone:'good'};
  }
  return {label:'待检测',detail:'',tone:'muted'};
}
function taskStartsOpen(task, open = false, latest = true) {
  return Boolean(open || task?.status === 'running' || (latest &&
    (task?.status === 'unknown' || (task?.status === 'failed' && task?.action !== 'lua-lsp.check'))));
}
function taskOutputText(task) {
  const output = text(task?.output,'').trim();
  if (!output || task?.action !== 'lua-lsp.check') return output;
  const result = nestedResult(task);
  const structured = [task.error,result?.error,result?.summary,
    ...(Array.isArray(result?.issues) ? result.issues : [])]
    .filter(value => typeof value === 'string')
    .flatMap(value => value.split('\n').map(line => line.trim()).filter(Boolean));
  const known = new Set(structured);
  const outputLines = output.split('\n').map(line => line.trim()).filter(Boolean);
  return outputLines.length && outputLines.every(line => known.has(line)) ? '' : output;
}
function taskBlock(task, open = false) {
  const failed = task.status === 'failed';
  const item = node('article',undefined,'task-item');
  const shortcuts = node('div',undefined,'actions task-shortcuts');
  const d = node('details',undefined,'task' + (failed ? ' is-failed' : '')); d.dataset.key = task.id;
  d.open = taskStartsOpen(task,open,tasksFor(task.projectKey)[0]?.id === task.id);
  const summary = node('summary');
  summary.dataset.focus = 'task-' + task.id;
  summary.append(node('strong', actionLabels[task.action] || task.action),
    node('span', task.interaction?.kind === 'select_developer' ? '待选择开发者' : statusLabels[task.status] || '结果未知',
      failed ? 'bad' : task.status === 'succeeded' ? 'good' : 'pending'),
    node('time',date(task.startedAt)));
  const meta = node('p','项目：' + text(task.projectName) + ' · 任务：' + text(task.id),'task-meta muted');
  d.append(summary,meta);
  if (task.interaction?.kind === 'select_developer' && task.projectKey === selected &&
      tasksFor(task.projectKey).find(item => item.action === 'qrcode')?.id === task.id) {
    shortcuts.append(button('选择开发者并继续',() => void runAction('qrcode',{sourceTaskId:task.id}),{
      disabled:offline || busy(task.projectKey)
    }));
  }
  if (task.finishedAt) d.append(node('p','结束：' + date(task.finishedAt),'task-meta muted'));
  if (task.action === 'qrcode' && task.recovery?.kind === 'developer_unavailable')
    d.append(node('p',task.recovery.message,'pending'));
  if (task.action === 'qrcode' && task.status === 'unknown' && !task.interaction)
    d.append(node('p','远端可能已完成上传。请先核实结果；再次生成可能上传新版本。','pending'));
  if (failed) {
    if (task.action === 'build') d.append(failureBanner(buildFailureTitle(task), buildFailureDetails(task)));
    else if (task.action !== 'lua-lsp.check') d.append(failureBanner(text(task.error,'操作失败'), ''));
  }
  const previewUrl = taskPreviewUrl(task);
  if (previewUrl) {
    const link = node('a','打开 Web 预览','preview-link');
    link.href = previewUrl; link.target = '_blank'; link.rel = 'noopener noreferrer';
    link.referrerPolicy = 'no-referrer';
    shortcuts.append(link);
  }
  if (task.action === 'qrcode' && task.status === 'succeeded') {
    const source = qrcodeImageSource(task);
    if (source) shortcuts.append(button('查看二维码',() => showQrcode(task),{icon:'qrcode',disabled:task.projectKey !== selected}));
    const content = task.result?.result?.content;
    for (const item of Array.isArray(content) ? content : []) {
      if (item.type === 'image' && ['image/png','image/jpeg','image/webp'].includes(item.mimeType) &&
          typeof item.data === 'string' && /^[A-Za-z0-9+/=\r\n]+$/.test(item.data)) {
        const image = node('img',undefined,'qrcode-image');
        image.src = 'data:' + item.mimeType + ';base64,' + item.data;
        image.alt = '手机测试二维码'; d.append(image);
      } else if (item.type === 'text' && typeof item.text === 'string') {
        d.append(node('pre',item.text,'qrcode-text'));
        const urls = [...new Set(item.text.match(/https?:\/\/[^\s<>"')\]]+/g) || [])].slice(0,8);
        for (const value of urls) {
          const url = safePreviewUrl(value);
          if (!url) continue;
          const link = node('a','打开二维码结果链接','preview-link');
          link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.referrerPolicy = 'no-referrer';
          d.append(link);
        }
      }
    }
  }
  const output = taskOutputText(task);
  if (output || task.status === 'running')
    d.append(node('pre', output || '等待任务输出'));
  if (task.result !== undefined) {
    const result = node('details'); result.dataset.key = 'result-' + task.id;
    result.append(node('summary','完整结果'),node('pre',text(task.result))); d.append(result);
  }
  item.append(d,shortcuts);
  return item;
}
function windowDimensions(settings, info) {
  const orientation = settings.orientation === 'project' ? info.projectOrientation || 'landscape' : settings.orientation;
  const size = settings.preset === 'custom' ? settings.custom : info.presets[settings.preset];
  return orientation === 'portrait' ? {width:size.shortEdge,height:size.longEdge} : {width:size.longEdge,height:size.shortEdge};
}
function renderWindowSettings() {
  const info = preview?.window_settings;
  if (!info) return node('span');
  const key = selected;
  let draft = windowDrafts.get(key);
  if (!draft || (!draft.dirty && !draft.saving)) {
    draft = {settings:JSON.parse(JSON.stringify(info.settings)),dirty:false,saving:false};
    windowDrafts.set(key,draft);
  }
  const disclosure = node('details',undefined,'preview-window-disclosure');
  disclosure.dataset.key = 'preview-window-' + key;
  const summary = node('summary',undefined,'preview-window-summary');
  const effective = preview?.process_alive === true && preview?.preflight?.window || info.effective;
  summary.append(node('span',(effective.height > effective.width ? '竖屏' : '横屏') + ' · ' +
    effective.width + ' × ' + effective.height,'muted'),node('span','窗口设置'));
  if (draft.dirty) summary.append(node('span','未保存','pending'));
  else if (effective.width !== info.effective.width || effective.height !== info.effective.height)
    summary.append(node('span','已保存，刷新后生效','pending'));
  const form = node('form',undefined,'preview-window-settings');
  const disabled = offline || busy(key) || draft.saving;
  const selectField = (label, name, options, value, change) => {
    const wrap = node('label',label);
    const select = node('select'); select.setAttribute('aria-label',label);
    select.dataset.focus = 'preview-window-' + name;
    options.forEach(([value,label]) => { const option = node('option',label); option.value = value; select.append(option); });
    select.value = value; select.disabled = disabled;
    select.addEventListener('change',() => { change(select.value); draft.dirty = true; updateBuild(); });
    wrap.append(select); form.append(wrap);
  };
  selectField('方向','orientation',[
    ['project','跟随项目（' + (info.projectOrientation === 'portrait' ? '竖屏' : info.projectOrientation === 'landscape' ? '横屏' : '未配置，默认横屏') + '）'],
    ['landscape','横屏'],['portrait','竖屏']
  ],draft.settings.orientation,value => { draft.settings.orientation = value; });
  const presetNames = {'16:9':'标准','21:9':'超宽屏','4:3':'平板'};
  selectField('比例','preset',[
    ...Object.keys(info.presets).map(preset => {
      const size = windowDimensions({...draft.settings,preset},info);
      return [preset,preset + ' · ' + presetNames[preset] + ' · ' + size.width + ' × ' + size.height];
    }),['custom','自定义']
  ],draft.settings.preset,value => { draft.settings.preset = value; });
  const size = windowDimensions(draft.settings,info);
  const inputs = {};
  if (draft.settings.preset === 'custom') {
    ['width','height'].forEach(name => {
      const label = name === 'width' ? '宽度' : '高度';
      const wrap = node('label',label);
      const input = node('input'); input.type = 'number'; input.min = '100'; input.max = '4096'; input.step = '1';
      input.required = true; input.value = String(size[name]); input.disabled = disabled;
      input.setAttribute('aria-label',label); input.dataset.focus = 'preview-window-' + name;
      inputs[name] = input; wrap.append(input); form.append(wrap);
      input.addEventListener('input',() => {
        const width = Number(inputs.width.value), height = Number(inputs.height.value);
        draft.settings.custom = {longEdge:Math.max(width,height),shortEdge:Math.min(width,height)};
        draft.dirty = true; save.disabled = disabled;
      });
    });
  }
  const footer = node('div',undefined,'preview-window-footer');
  const active = preview?.process_alive === true ? preview?.preflight?.window : null;
  footer.append(node('span',active ? '运行中：' + active.width + ' × ' + active.height :
    size.width + ' × ' + size.height,'muted'));
  const save = button(draft.saving ? '保存中' : '保存设置',() => {},{disabled:disabled || !draft.dirty});
  save.type = 'submit'; footer.append(save); form.append(footer);
  if (draft.dirty) form.append(node('p','未保存','pending'));
  else if (active && (active.width !== info.effective.width || active.height !== info.effective.height))
    form.append(node('p','已保存，刷新预览后生效（当前游戏状态将重置）','pending'));
  form.addEventListener('submit',async event => {
    event.preventDefault();
    if (disabled || !draft.dirty || draft.saving) return;
    const epoch = selectionEpoch;
    draft.saving = true; updateBuild();
    try {
      const saved = await api(projectPath(key,'/preview/window'),{method:'POST',body:draft.settings});
      draft.settings = saved.settings; draft.dirty = false;
      if (selectionMatches(key,epoch)) {
        if (preview) preview.window_settings = saved;
        announce('预览尺寸已保存：' + saved.effective.width + ' × ' + saved.effective.height);
      }
    } catch (error) { if (selectionMatches(key,epoch)) notify(error.message); }
    finally { draft.saving = false; if (selectionMatches(key,epoch)) updateBuild(); }
  });
  disclosure.append(summary,form);
  return disclosure;
}
function renderBuild() {
  const title = heading('构建与测试',currentProject().name,true);
  const columns = node('div',undefined,'columns build-columns');
  const build = node('section'); build.id = 'build-panel';
  const local = node('section'); local.id = 'preview-panel';
  columns.append(build,local);
  const logs = node('section',undefined,'console-logs'); logs.id = 'console-logs';
  const history = node('section',undefined,'task-history'); history.id = 'task-history';
  replace($('view'),[title,columns,logs,history]);
  updateBuild();
}
function updateBuild() {
  if (page !== 'build' || !$('build-panel')) return;
  const tasks = tasksFor(selected);
  const buildTasks = tasks.filter(t => t.action === 'build');
  const checking = pendingActions.get(selected) === 'lua-lsp.check';
  const buildStatus = buildStatusBlock(buildTasks[0],pendingActions.get(selected) === 'build');
  const checkTask = tasks.find(t => t.action === 'lua-lsp.check');
  const lua = luaLspPresentation(state.luaLsp);
  const checkBlock = node('div',undefined,'lua-check-panel');
  const checkActions = node('div',undefined,'actions lua-check-actions');
  checkActions.append(luaCheckOption());
  if (checkTask) {
    const summary = luaCheckSummary(checkTask,checking);
    checkActions.append(button(summary,() => selectLog('lua'),{className:'link ' + (checkTask.status === 'failed' ? 'bad' : checkTask.status === 'succeeded' ? 'good' : 'pending')}));
  }
  checkActions.append(button(checking ? '检查中' : 'Lua 检查',() => void runAction('lua-lsp.check'),{
    className:'link',icon:'refresh',disabled:offline || busy(),focus:'lua-lsp.check'
  }));
  checkBlock.append(checkActions);
  const lspStatus = node('div',undefined,'lsp-status');
  lspStatus.append(node('span','Lua LSP · ' + lua.label + (lua.detail ? ' · ' + lua.detail : ''), lua.tone),
    button('检查日志',() => selectLog('lua'),{className:'link'}));
  checkBlock.append(lspStatus);
  const buildChildren = [node('h2','远端构建'),buildStatus,checkBlock];
  replace($('build-panel'),buildChildren);
  const previewInfo = previewPresentation(preview,previewError);
  const summary = node('div',undefined,'preview-status-summary');
  summary.append(node('span','Runtime · ' + (preview?.install_state === 'ready' ? '已安装' :
    preview?.install_state === 'missing' ? '未安装' : '待检测'),
    preview?.install_state === 'ready' ? 'good' : preview?.install_state === 'missing' ? 'pending' : 'muted'));
  summary.append(node('span',previewLoading ? '检测中…' : previewError ? '检测失败' : previewInfo.stateLabel,
    previewLoading ? 'pending' : previewInfo.tone));
  if (previewInfo.errorCount) summary.append(button(previewInfo.errorCount + ' 条日志错误',
    () => void loadLogs(),{className:'link bad'}));
  const localChildren = [node('h2','本地预览'),summary];
  if (previewInfo.error) localChildren.push(node('p',previewInfo.error,'bad'));
  if (preview?.session_id) {
    const diagnostics = node('details'); diagnostics.dataset.key = 'preview-diagnostics';
    diagnostics.append(node('summary','诊断信息'),fields([['会话 ID',preview.session_id],
      ['Runtime PID',preview.runtime_pid],['刷新编号',preview.reload_id]]));
    localChildren.push(diagnostics);
  }
  if (preview?.supported === false) localChildren.push(node('p','当前平台不支持本地预览','bad'));
  const actions = node('div',undefined,'actions preview-controls');
  if (!previewActions(preview).includes('preview.stop'))
    actions.append(button('停止预览',() => {},{disabled:true}));
  previewActions(preview).filter(action => action !== 'preview.start').reverse().forEach(action => actions.append(button(
    actionBusy(action) ? actionLabels[action] + '中' : actionLabels[action],() => void runAction(action),{
    loading:actionBusy(action),disabled:offline || busy(),focus:action,
    ...(action === 'preview.refresh' ? {icon:'refresh',iconOnly:true,className:'icon-button'} : {})
  })));
  actions.append(button(previewLoading ? '检测中' : '检测预览状态',() => void refreshPreview(),{
    className:'link',loading:previewLoading,focus:'preview-status'}));
  actions.append(button('查看运行日志',() => void loadLogs(),{className:'link',focus:'preview-logs'}));
  localChildren.push(actions);
  localChildren.push(renderWindowSettings());
  replace($('preview-panel'),localChildren);
  renderConsoleLogs();
  const history = [node('h2','任务历史')];
  if (!tasks.length) history.push(node('p','暂无控制台任务','muted'));
  tasks.forEach(task => history.push(taskBlock(task)));
  replace($('task-history'),history);
}
async function refreshPreview() {
  const key = selected, epoch = selectionEpoch;
  if (!key || !currentProject()?.valid) return;
  previewLoading = true;
  if (page === 'build') updateBuild();
  try {
    const result = await api(projectPath(key,'/preview'));
    if (!selectionMatches(key,epoch)) return;
    const changed = JSON.stringify(preview) !== JSON.stringify(result) || previewError;
    preview = result; previewError = '';
    if (changed && page === 'overview') renderOverview();
    if (changed && page === 'build') updateBuild();
  } catch (error) {
    if (!selectionMatches(key,epoch)) return;
    preview = null; previewError = error.message;
    if (page === 'build') updateBuild();
    if (page === 'overview') renderOverview();
  } finally {
    if (selectionMatches(key,epoch)) {
      previewLoading = false;
      if (page === 'build') updateBuild();
    }
  }
}
async function loadLogs() {
  const key = selected, epoch = selectionEpoch, view = viewEpoch;
  const entry = logView();
  if (entry.loading) return;
  entry.tab = 'runtime'; entry.loading = true; selectLog('runtime');
  try {
    const logs = await api(projectPath(key,'/preview/logs'));
    entry.runtimeId = String(logs.session_id || '') + ':' + String(logs.reload_id || 0);
    entry.runtime = Array.isArray(logs.logs) ? logs.logs.map(row => text(row.text,'')).join('\n') : text(logs);
  } catch (error) {
    entry.runtime = '日志读取失败：' + error.message;
  } finally {
    entry.loading = false;
    if (selectionMatches(key,epoch) && view === viewEpoch) renderConsoleLogs();
  }
}
function confirmAction(action, name, startAfterInstall = false) {
  return new Promise(resolve => {
    const dialog = $('confirm');
    $('confirm-title').textContent = action === 'preview.install' ? '安装本地 Runtime？' : '刷新预览？';
    $('confirm-message').textContent = action === 'preview.install' ?
      '项目：' + name + '\n将下载并安装 Runtime。' + (startAfterInstall ? '完成后继续启动此项目预览。' : '完成后不会自动启动预览。') :
      '项目：' + name + '\n刷新会重启预览并丢失当前内存状态。';
    $('confirm-accept').textContent = actionLabels[action];
    if (action === 'console.shutdown') {
      $('confirm-title').textContent = '关闭Maker控制台？';
      $('confirm-message').textContent = '将关闭本机 Maker 控制台服务，所有已打开的控制台页面都会断开连接。不会删除项目文件；已启动的独立本地预览不受影响。';
      $('confirm-accept').textContent = '确认关闭';
    }
    dialog.returnValue = 'cancel';
    dialog.addEventListener('close',() => resolve(dialog.returnValue === 'accept'),{once:true});
    dialog.showModal();
  });
}
function selectDialog(title, message, options) {
  return new Promise(resolve => {
    const dialog = $('selection-dialog'), picker = $('selection-options'), accept = $('selection-accept');
    if (dialog.open) { resolve(null); return; }
    $('selection-title').textContent = title;
    $('selection-message').textContent = message;
    const placeholder = node('option','请选择'); placeholder.value = '';
    picker.replaceChildren(placeholder);
    for (const option of options) {
      const element = node('option',option.label);
      element.value = String(option.value); picker.append(element);
    }
    picker.value = ''; accept.disabled = true;
    const choice = () => options.find(option => String(option.value) === picker.value);
    picker.onchange = () => { accept.disabled = !choice(); };
    dialog.returnValue = 'cancel';
    dialog.addEventListener('close',() => {
      resolve(dialog.returnValue === 'accept' ? choice()?.value ?? null : null);
    },{once:true});
    dialog.showModal();
  });
}
function confirmQrcode(project, config = {}) {
  return new Promise(resolve => {
    const dialog = $('qrcode-confirm'), picker = $('qrcode-orientation');
    const orientation = config.orientation;
    const title = $('qrcode-name'), category = $('qrcode-category');
    const needsTitle = config.qrcodeNeedsTitle === true, needsCategory = config.qrcodeNeedsCategory === true;
    $('qrcode-name-field').hidden = !needsTitle;
    $('qrcode-category-field').hidden = !needsCategory;
    title.value = ''; category.value = '';
    const configured = ['landscape','portrait'].includes(orientation);
    const needsSync = needsTitle || needsCategory || !configured || config.qrcodeNeedsSync === true;
    $('qrcode-effects').textContent = needsSync ?
      '将保存配置，并提交、推送当前项目的所有本地改动。二维码工具随后构建并上传测试版本，必要时创建 TapTap 应用。' :
      '将使用服务端项目生成二维码。远端会构建并上传测试版本，必要时创建 TapTap 应用；不会提交或推送当前本地改动。';
    if (config.qrcodeResultUnknown)
      $('qrcode-effects').textContent = '上次执行结果未知，可能已上传测试版本。请先核实；继续操作可能再次上传。\n\n' + $('qrcode-effects').textContent;
    if (config.qrcodeRecovery)
      $('qrcode-effects').textContent = config.qrcodeRecovery.message + '\n请确认已处理账号或权限问题后再试。\n\n' + $('qrcode-effects').textContent;
    $('qrcode-accept').textContent = needsSync ? '保存并同步后生成' : '生成二维码';
    $('qrcode-project').textContent = '项目：' + project.name;
    $('qrcode-developer').hidden = !config.developerLabel;
    $('qrcode-developer').textContent = config.developerLabel ? '开发者：' + config.developerLabel : '';
    $('qrcode-orientation-field').hidden = configured;
    $('qrcode-fixed-orientation').textContent = configured ?
      '游戏方向：' + (orientation === 'portrait' ? '竖屏' : '横屏') : '此设置用于手机测试，与本地预览窗口方向无关。';
    picker.value = '';
    const validate = () => { $('qrcode-accept').disabled =
      (!configured && !['landscape','portrait'].includes(picker.value)) ||
      (needsTitle && (!title.value.trim() || /^[<{].*[>}]$/.test(title.value.trim()))) ||
      (needsCategory && !category.value); };
    picker.onchange = validate; title.oninput = validate; category.onchange = validate;
    validate();
    dialog.returnValue = 'cancel';
    dialog.addEventListener('close',() => resolve(dialog.returnValue === 'accept' ?
      {confirmedOrientation:configured ? undefined : picker.value, confirmedBuild:needsSync,
        ...(needsTitle || needsCategory ? {publication:{
          ...(needsTitle ? {title:title.value.trim()} : {}),
          ...(needsCategory ? {category:category.value} : {})}} : {})} : null),{once:true});
    dialog.showModal();
  });
}
async function startTask(action, key, epoch, project) {
  const task = await api('/api/tasks',{method:'POST',body:{projectKey:key,action}});
  if (task.projectKey !== key) throw new Error('任务项目与请求不一致，已停止更新。请检查任务状态。');
  rememberTask(task);
  if (selectionMatches(key,epoch))
    announce(actionLabels[action] + ' · ' + project.name + ' · ' + (statusLabels[task.status] || '结果未知'));
  if (task.status === 'running') return await waitForTask(task.id,key,epoch) || task;
  return tasksFor(key).find(item => item.id === task.id) || task;
}
function luaCheckBlocksBuild(task) {
  if (!task || task.status === 'running' || task.status === 'unknown') return true;
  if (task.status === 'succeeded') return false;
  const result = nestedResult(task);
  if (result?.ready === false) return false;
  return task.status === 'failed' || (result?.errorCount || 0) > 0;
}
async function runAction(action, options = {}) {
  const key = selected, epoch = selectionEpoch;
  const project = currentProject();
  if (!project?.valid || busy(key) || !Object.hasOwn(actionLabels,action)) return;
  if (action === 'build' || action === 'lua-lsp.check') logView().tab = action === 'build' ? 'build' : 'lua';
  pending.add(key); pendingActions.set(key,action); updateChrome(); updateBuild();
  try {
    if (action === 'qrcode') {
      const info = await api(projectPath(key,''));
      if (!selectionMatches(key,epoch)) return;
      if (info.config?.qrcodePreparation && info.config.qrcodePreparation.status !== 'ready') {
        explainQrcode(info.config.qrcodeNeedsInitialization ? '请先构建初始化' : '项目配置需要处理',
          info.config.qrcodePreparation.message);
        return;
      }
      const previous = tasksFor(key).find(task => task.action === 'qrcode');
      if (options.sourceTaskId && previous?.id !== options.sourceTaskId) return;
      const interaction = previous?.interaction;
      let developerId;
      if (interaction?.kind === 'select_developer') {
        developerId = await selectDialog(interaction.title,
          '项目：' + project.name + ' · 任务：' + previous.id +
          '\n上次远端执行结果待确认，可能已上传测试版本。确认将保存所选开发者，并提交、推送此项目的所有当前本地改动。二维码工具随后构建并上传测试版本，必要时创建 TapTap 应用。',
          interaction.options);
        if (developerId === null || !selectionMatches(key,epoch)) return;
      }
      const needsFields = info.config?.qrcodeNeedsTitle === true || info.config?.qrcodeNeedsCategory === true ||
        !['landscape','portrait'].includes(info.config?.orientation);
      const choice = developerId !== undefined && !needsFields ? {confirmedBuild:true} : await confirmQrcode(project,{
        ...info.config, qrcodeNeedsSync:developerId !== undefined || previous?.result?.requiresSync === true,
        qrcodeResultUnknown:previous?.status === 'unknown' && !interaction,
        qrcodeRecovery:previous?.recovery,
        developerLabel:interaction?.options.find(option => option.value === developerId)?.label
      });
      if (!choice || !selectionMatches(key,epoch)) return;
      if (developerId !== undefined) {
        choice.publication = {...choice.publication,developer_id:developerId};
        choice.confirmedBuild = true;
        choice.sourceTaskId = previous.id;
      }
      if (selectionMatches(key,epoch)) logView().tab = 'qrcode';
      const task = await api('/api/tasks',{method:'POST',body:{projectKey:key,action,...choice}});
      if (task.projectKey !== key) throw new Error('任务项目与请求不一致，请检查任务状态。');
      rememberTask(task);
      if (selectionMatches(key,epoch)) {
        if (task.status === 'running') showQrcodeLoading(project);
        else if (task.status === 'succeeded') handleQrcodeCompletion(task);
      }
      void pollTask(task.id,key,epoch);
      return;
    }
    if (action !== 'build' && action !== 'lua-lsp.check') {
      const checkServerChanges = action === 'preview.start' || action === 'preview.refresh';
      const status = await api(projectPath(key,checkServerChanges ? '/preview?check_server_changes=1' : '/preview'));
      if (selectionMatches(key,epoch)) preview = status;
      if (!previewActions(status).includes(action)) throw new Error(text(status.error,'预览状态已改变，请重新检测后操作。'));
      if (action === 'preview.install' || action === 'preview.refresh') {
        if (!await confirmAction(action,project.name,options.startAfterInstall === true)) return;
      }
      if (selectionMatches(key,epoch) && checkServerChanges && status.server_changes?.changed) {
        notify('检测到本地有服务端代码修改，建议提交构建后再预览。本次本地预览仍会继续，但不会运行这些服务端改动。','warning');
      }
    }
    if (action === 'build' && buildChecksLua) {
      pendingActions.set(key,'lua-lsp.check');
      updateChrome(); updateBuild();
      const check = await startTask('lua-lsp.check',key,epoch,project);
      if (luaCheckBlocksBuild(check)) {
        if (selectionMatches(key,epoch)) {
          selectLog('lua');
          announce('Lua 检查未通过，已停止构建，请查看下方 Lua 检查日志。');
        }
        return;
      }
      if (selectionMatches(key,epoch) && check?.status === 'failed') {
        selectLog('lua');
        announce('Lua 检查不可用，已继续构建，请查看下方 Lua 检查日志。');
      }
      pendingActions.set(key,'build');
      updateChrome(); updateBuild();
    }
    if (action === 'preview.install' && options.startAfterInstall) {
      const installed = await startTask(action,key,epoch,project);
      if (installed?.status !== 'succeeded') return;
      const status = await api(projectPath(key,'/preview?check_server_changes=1'));
      if (selectionMatches(key,epoch)) preview = status;
      if (!previewActions(status).includes('preview.start')) {
        if (selectionMatches(key,epoch)) notify('Runtime 安装完成，请检查预览状态后启动。');
        return;
      }
      if (selectionMatches(key,epoch) && status.server_changes?.changed)
        notify('检测到本地有服务端代码修改，建议提交构建后再预览。','warning');
      pendingActions.set(key,'preview.start');
      await startTask('preview.start',key,epoch,project);
    } else if (action === 'lua-lsp.check') await startTask(action,key,epoch,project);
    else {
      const task = await api('/api/tasks',{method:'POST',body:{projectKey:key,action}});
      if (task.projectKey !== key) throw new Error('任务项目与请求不一致，已停止更新。请检查任务状态。');
      rememberTask(task);
      if (!selectionMatches(key,epoch)) return;
      announce(actionLabels[action] + ' · ' + project.name + ' · ' + (statusLabels[task.status] || '结果未知'));
      void pollTask(task.id,key,epoch);
    }
  } catch (error) {
    if (selectionMatches(key,epoch)) notify(error.message);
  } finally {
    pending.delete(key);
    pendingActions.delete(key);
    if (selectionMatches(key,epoch)) { updateChrome(); updateBuild(); }
  }
}
function runProjectAction(action) {
  navigate('build');
  return runAction(action, {startAfterInstall:action === 'preview.install'});
}
async function pollTask(id,key,epoch) {
  try {
    const prior = tasksFor(key).find(t => t.id === id);
    const task = await api('/api/tasks/' + encodeURIComponent(id));
    if (task.projectKey !== key || task.id !== id) throw new Error('任务身份不一致');
    rememberTask(task);
    const index = state.tasks.findIndex(t => t.id === id);
    if (index >= 0) state.tasks[index] = task; else state.tasks.push(task);
    if (!selectionMatches(key,epoch)) return task;
    updateChrome(); updateBuild();
    if (task.status !== 'running' && prior?.status === 'running') {
      announce((actionLabels[task.action] || task.action) + ' · ' + text(task.projectName) + ' · ' + (statusLabels[task.status] || '结果未知'));
      await refreshPreview();
      if (selectionMatches(key,epoch)) handleQrcodeCompletion(task);
    }
    return task;
  } catch (error) { if (selectionMatches(key,epoch)) notify(error.message); }
}
async function waitForTask(id,key,epoch) {
  while (!offline && !disposed) {
    const task = await pollTask(id,key,epoch);
    if (!task || task.status !== 'running') return task;
    await new Promise(resolve => setTimeout(resolve,1000));
  }
}
function graphLayout(commits) {
  const lanes = [];
  const nodes = [];
  const edges = [];
  commits.forEach((commit,index) => {
    let lane = lanes.indexOf(commit.hash);
    if (lane < 0) { lane = lanes.indexOf(null); if (lane < 0) lane = lanes.length; }
    lanes[lane] = null;
    nodes.push({hash:commit.hash,lane,index,date:commit.date});
    const parents = Array.isArray(commit.parents) ? commit.parents : [];
    parents.forEach((parent,parentIndex) => {
      let nextLane = lanes.indexOf(parent);
      if (nextLane < 0) {
        nextLane = parentIndex === 0 && lanes[lane] === null ? lane : lanes.indexOf(null);
        if (nextLane < 0) nextLane = lanes.length;
        lanes[nextLane] = parent;
      }
      edges.push({from:commit.hash,to:parent,fromLane:lane,toLane:nextLane,fromIndex:index});
    });
  });
  return {nodes,edges};
}
function renderGit() {
  const title = heading('Git 历史',currentProject().path);
  title.append(button('刷新历史',() => void loadGit(false),{icon:'refresh',disabled:gitLoading}));
  const elements = [title];
  if (gitError) elements.push(node('p',gitError,'bad'));
  if (!git) {
    elements.push(node('p',gitLoading ? '正在读取 Git 历史' : '暂无历史数据','empty'));
    replace($('view'),elements); return;
  }
  const meta = node('div',undefined,'git-meta');
  meta.append(node('span','分支：' + text(git.branch)),node('span',git.shallow ? '浅克隆 · 历史不完整' : '本地提交历史','muted'));
  elements.push(meta);
  const changes = node('details'); changes.dataset.key = 'git-changes';
  changes.append(node('summary','工作区变更'),node('pre',text(git.changes,'无变更数据'))); elements.push(changes);
  const commits = git.commits || [];
  const graph = graphLayout(commits);
  const width = Math.max(32,...graph.nodes.map(n => n.lane * 18 + 32),...graph.edges.map(e => e.toLane * 18 + 32));
  const scroll = node('div',undefined,'git-scroll');
  const history = node('div',undefined,'git-history');
  const svg = svgNode('svg',{width,height:commits.length * 76,class:'git-graph','aria-label':'Git 父提交关系图',role:'img'});
  const byHash = new Map(graph.nodes.map(n => [n.hash,n]));
  graph.edges.forEach(edge => {
    const target = byHash.get(edge.to);
    const x1 = 12 + edge.fromLane * 18, y1 = edge.fromIndex * 76 + 29;
    const x2 = 12 + (target?.lane ?? edge.toLane) * 18;
    const y2 = target ? target.index * 76 + 29 : commits.length * 76;
    const line = svgNode('path',{d:'M ' + x1 + ' ' + y1 + ' C ' + x2 + ' ' + (y1 + 38) + ', ' +
      x2 + ' ' + (y2 - 38) + ', ' + x2 + ' ' + y2,fill:'none',stroke:'var(--green)','stroke-width':1.5});
    if (!target) line.setAttribute('stroke-dasharray','3 4');
    svg.append(line);
  });
  graph.nodes.forEach(n => svg.append(svgNode('circle',{cx:12 + n.lane * 18,cy:n.index * 76 + 29,r:4,
    fill:'var(--bg)',stroke:'var(--accent)','stroke-width':2})));
  const rows = node('div',undefined,'git-rows'); rows.style.paddingLeft = width + 'px';
  commits.forEach(commit => {
    const r = node('div',undefined,'git-row');
    const hash = button(text(commit.hash).slice(0,9),() => void loadCommit(commit.hash),{className:'link'});
    hash.replaceChildren(node('code',text(commit.hash).slice(0,9)));
    const subject = button(text(commit.subject),() => void loadCommit(commit.hash),{className:'link'});
    subject.classList.add('subject');
    const time = node('time',date(commit.date));
    r.append(hash,subject,time); rows.append(r);
  });
  history.append(svg,rows); scroll.append(history); elements.push(scroll);
  if (!commits.length) elements.push(node('p','暂无提交记录','empty'));
  if (git.hasMore) elements.push(button(gitLoading ? '正在读取' : '加载更多提交',() => void loadGit(true),{disabled:gitLoading}));
  const commitDetail = node('section',undefined,'git-detail'); commitDetail.id = 'commit-detail';
  elements.push(commitDetail); replace($('view'),elements);
}
async function loadGit(more) {
  if (gitLoading || !currentProject()?.valid) return;
  const key = selected, epoch = selectionEpoch, view = viewEpoch;
  gitLoading = true; gitError = '';
  if (page === 'git') renderGit();
  try {
    const result = await api(projectPath(key,'/git?skip=' + (more ? git?.commits.length || 0 : 0)));
    if (!selectionMatches(key,epoch) || view !== viewEpoch) return;
    const commits = more ? [...(git?.commits || []),...(result.commits || [])] : result.commits || [];
    git = {...result,commits:Array.from(new Map(commits.map(c => [c.hash,c])).values())};
  } catch (error) {
    if (selectionMatches(key,epoch) && view === viewEpoch) gitError = error.message;
  } finally {
    if (selectionMatches(key,epoch) && view === viewEpoch) {
      gitLoading = false;
      if (page === 'git') renderGit();
    }
  }
}
async function loadCommit(hash) {
  const key = selected, epoch = selectionEpoch, view = viewEpoch, request = ++commitRequest;
  replace($('commit-detail'),[node('p','正在读取提交详情','muted')]);
  try {
    const commit = await api(projectPath(key,'/git/' + encodeURIComponent(hash)));
    if (!selectionMatches(key,epoch) || view !== viewEpoch || request !== commitRequest) return;
    const children = [node('h2',commit.subject),fields([['提交',commit.hash],['作者',commit.author],['时间',date(commit.date)]])];
    if (commit.body) children.push(node('pre',commit.body));
    children.push(node('h3','文件变更'),node('pre',text(commit.files,'无文件变更')));
    children.push(node('h3','补丁'),node('pre',text(commit.patch,'无文本补丁')));
    const target = $('commit-detail'); replace(target,children);
    target.tabIndex = -1; target.focus({preventScroll:true}); target.scrollIntoView({block:'nearest'});
  } catch (error) {
    if (selectionMatches(key,epoch) && view === viewEpoch && request === commitRequest) replace($('commit-detail'),[node('p',error.message,'bad')]);
  }
}
function navigate(next) {
  if (!currentProject()?.valid && next !== 'projects' && next !== 'documents') return;
  viewEpoch++; commitRequest++; gitLoading = false; page = next;
  render();
  if (next === 'git' && !git) void loadGit(false);
  if (next === 'build') void refreshPreview();
}
function render() {
  updateChrome();
  $('view').setAttribute('aria-busy','false');
  const plugin = currentProject()?.valid && pluginDescriptors().find(item => page === 'plugin:' + item.id);
  $('view').hidden = Boolean(plugin);
  $('plugin-views').hidden = !plugin;
  pluginSessions.forEach(session => { session.element.hidden = true; });
  if (plugin) { renderPlugin(plugin); return; }
  if (page === 'documents') { void renderDocuments(); return; }
  if (page === 'projects' || !currentProject()?.valid) renderProjects();
  else if (page === 'build') renderBuild();
  else if (page === 'git') renderGit();
  else renderOverview();
}
async function loadProject() {
  const key = selected, epoch = selectionEpoch;
  try {
    const result = await api(projectPath(key));
    if (!selectionMatches(key,epoch)) return;
    if (result.project?.key !== key) throw new Error('项目详情与当前项目不一致');
    const changed = JSON.stringify(detail) !== JSON.stringify(result);
    detail = result;
    updateChrome();
    if (changed && page === 'overview') renderOverview();
  } catch (error) {
    if (selectionMatches(key,epoch)) {
      notify(error.message);
      if (page === 'overview') replace($('view'),[heading('项目读取失败',currentProject()?.path),
        button('重试',() => void loadProject())]);
    }
  }
  if (selectionMatches(key,epoch)) await refreshPreview();
}
async function pollState() {
  const result = await api('/api/state');
  if (offline || disposed) return;
  if (!Array.isArray(result.projects) || !Array.isArray(result.tasks)) throw new Error('本地服务返回了无效状态');
  const first = !loaded;
  const previousTasks = new Map(tasksFor(selected).map(task => [task.id,task.status]));
  const priorTasks = JSON.stringify(tasksFor(selected));
  const priorProjects = JSON.stringify(state.projects);
  const priorLua = JSON.stringify(state.luaLsp);
  state = result; loaded = true;
  if (first && projectid) {
    selected = projectKeyFromQuery(initialQuery);
    page = currentProject()?.valid ? 'overview' : 'projects';
    if (!selected) notify('请从项目列表选择对应的本地目录：项目未登记或有多个本地副本。','warning');
  }
  state.tasks.forEach(task => {
    const prior = acceptedTasks.get(task.id);
    if (prior?.status !== 'running' && task.status === 'running' && prior?.finishedAt) {
      Object.assign(task,prior);
    } else if (prior) rememberTask(task);
    if (task.projectKey === selected && previousTasks.get(task.id) === 'running' && task.status !== 'running') {
      announce((actionLabels[task.action] || task.action) + ' · ' + text(task.projectName) + ' · ' + (statusLabels[task.status] || '结果未知'));
      handleQrcodeCompletion(task);
    }
  });
  $('version').textContent = 'Maker ' + text(state.version) + ' · ' + text(state.distribution,'独立发行') + ' · ' + text(state.platform);
  renderVersionPicker();
  $('connection').textContent = '已连接';
  $('connection').title = '最近连接：' + new Date().toLocaleTimeString('zh-CN');
  $('connection').className = 'good';
  lastStateError = '';
  if (selected && !currentProject()?.valid && (page !== 'projects' || first || priorProjects !== JSON.stringify(state.projects))) {
    selectionEpoch++; viewEpoch++; detail = null; preview = null;
    page = 'projects';
    render();
  } else {
    updateChrome();
    if (page === 'projects' && (first || priorProjects !== JSON.stringify(state.projects))) renderProjects();
    if (page === 'build' && priorTasks !== JSON.stringify(tasksFor(selected))) updateBuild();
    if (page === 'overview' && detail && priorLua !== JSON.stringify(state.luaLsp)) renderOverview();
  }
}
async function poll() {
  if (polling || document.hidden || offline || disposed) return;
  clearTimeout(pollTimer); polling = true;
  try {
    await pollState();
    if (offline || disposed) return;
    if (currentProject()?.valid) await loadProject();
    for (const task of tasksFor(selected).filter(t => t.status === 'running')) {
      if (document.hidden) break;
      await pollTask(task.id,selected,selectionEpoch);
    }
  } catch (error) {
    $('connection').textContent = offline ? '已离线' : '连接失败'; $('connection').className = 'bad';
    if (lastStateError !== error.message) { notify(error.message); lastStateError = error.message; }
  } finally {
    polling = false;
    if (!document.hidden && !offline && !disposed) pollTimer = setTimeout(() => void poll(),5000);
  }
}
document.addEventListener('DOMContentLoaded',async () => {
  window.addEventListener('message',event => {
    for (const session of pluginSessions.values()) {
      if (!pluginMessageMatches(event,session)) continue;
      if (event.data.type === 'maker-console:plugin-ready') {
        clearTimeout(session.timer);
        pluginStatus(session,session.projectName,true);
      } else if (!session.element.hidden && !document.hidden) void sendActivity();
      break;
    }
  });
  const activity = event => { if (event.isTrusted) void sendActivity(); };
  document.addEventListener('pointerdown',activity,{passive:true});
  document.addEventListener('keydown',activity,{passive:true});
  document.addEventListener('wheel',activity,{passive:true});
  window.addEventListener('focus',() => { void sendActivity(); void poll(); });
  window.addEventListener('pagehide',dispose,{once:true});
  const theme = $('theme');
  try { theme.checked = localStorage.getItem('maker-console-theme') !== 'light'; } catch (_) {}
  document.documentElement.dataset.theme = theme.checked ? 'dark' : 'light';
  theme.addEventListener('change',() => {
    const value = theme.checked ? 'dark' : 'light';
    document.documentElement.dataset.theme = value;
    pluginSessions.forEach(session => sendPluginTheme(session));
    if ($('fortune-frame').getAttribute('src')) {
      fortuneReady = false;
      $('fortune-corner').hidden = true;
      $('fortune-panel').hidden = false;
      $('fortune-panel').classList.add('fortune-preload');
      loadFortuneFrame(true);
      fortunePreloadTimer = setTimeout(revealFortune,3000);
    }
    try { localStorage.setItem('maker-console-theme',value); } catch (_) { notify('无法保存主题设置'); }
  });
  $('projects-button').append(icon('folder'));
  const fortunePanel = $('fortune-panel');
  const fortuneFrame = $('fortune-frame');
  fortunePanel.classList.add('fortune-preload');
  fortunePanel.hidden = false;
  fortuneFrame.addEventListener('load',revealFortune);
  fortuneFrame.addEventListener('error',() => {
    clearTimeout(fortunePreloadTimer);
    fortuneReady = false;
    $('fortune-corner').hidden = true;
  });
  loadFortuneFrame();
  fortunePreloadTimer = setTimeout(revealFortune,3000);
  bindFortuneHover($('fortune-toggle'));
  bindFortuneHover($('fortune-panel'));
  $('fortune-toggle').addEventListener('click',event => {
    event.stopPropagation();
    openFortune();
  });
  window.addEventListener('resize',() => { if (!$('fortune-panel').hidden) positionFortune(); });
  document.addEventListener('keydown',event => { if (event.key === 'Escape') closeFortune(); });
  $('projects-button').addEventListener('click',() => navigate('projects'));
  $('project-picker').addEventListener('change',event => chooseProject(event.target.value));
  $('maker-version-picker').addEventListener('change',selectMakerVersion);
  $('dismiss').addEventListener('click',() => { $('feedback').hidden = true; });
  document.querySelectorAll('nav [data-page]').forEach(b => b.addEventListener('click',() => navigate(b.dataset.page)));
  window.addEventListener('popstate',() => {
    chooseProject(projectKeyFromQuery(new URLSearchParams(location.search)),false);
  });
  document.addEventListener('visibilitychange',() => {
    clearTimeout(pollTimer);
    if (!document.hidden) { void sendActivity(); void poll(); }
  });
  render();
  startActivityLease();
  await sendActivity();
  await poll();
  void loadVersions();
  if (selected && !currentProject()) notify('所选项目未登记，请从本地项目列表选择。');
});
})();
`;
