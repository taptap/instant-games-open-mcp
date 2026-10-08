import { consoleIcons } from './webIcons.js';
import { consoleThemeScript } from '../webTheme.js';

export const consoleScript = String.raw`
${consoleThemeScript}
(function(){
'use strict';
const iconNodes = ${JSON.stringify(consoleIcons)};
const initialQuery = new URLSearchParams(location.search);
let projectid = initialQuery.get('projectid') || '';
let selected = initialQuery.get('project') || '';
const hasExplicitProject = initialQuery.has('projectid') || initialQuery.has('project');
let page = selected ? 'overview' : 'projects';
let selectionEpoch = 0;
let viewEpoch = 0;
let projectNotice = '';
let state = {projects: [], tasks: []};
let loaded = false;
let fortuneTimer;
let fortuneReady = false;
function fortuneMode() {
  return window.MakerConsole.getTheme();
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
  fortuneReady = true;
  $('fortune-panel').hidden = true;
  $('fortune-panel').classList.remove('fortune-preload');
  $('fortune-corner').hidden = false;
}
function beginFortuneLoad(reload) {
  fortuneReady = false;
  $('fortune-corner').hidden = true;
  $('fortune-panel').hidden = true;
  $('fortune-panel').classList.add('fortune-preload');
  loadFortuneFrame(reload);
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
let requestedSkill = initialQuery.get('skill') || '';
if (requestedSkill) documentTab = 'skills';
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
    let linkedSkill;
    if (requestedSkill) {
      const matches = items.filter(item => item.kind === 'skills' && item.relativePath.endsWith('/' + requestedSkill + '/SKILL.md'));
      linkedSkill = matches.find(item => item.source === 'Maker 内置') || matches[0];
      if (!linkedSkill) {
        replace(reader,[node('p','未找到关联 Skill：' + requestedSkill + '。请检查 Maker 版本或当前项目的 Skill 文件。','bad')]);
        return;
      }
      requestedSkill = '';
    }
    const first = linkedSkill || items.find(item => item.id === documentSelected && item.kind === documentTab) || items.find(item => item.kind === documentTab);
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
let previewProbeFailures = 0;
const PREVIEW_PROBE_RETRY_LIMIT = 3;
const settledTaskRefresh = new Set();
const settledTaskPending = new Map();
const logViews = new Map();
const validationViews = new Map();
let validationTimer;
const validationImages = [];
let validationImageLoading = null;
const validationImageObserver = typeof IntersectionObserver === 'function' ?
  new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      validationImageObserver.unobserve(entry.target);
      if (entry.target.dataset.discarded || entry.target.src || entry.target.dataset.queued) return;
      entry.target.dataset.queued = 'true';
      validationImages.push(entry.target);
    });
    loadValidationImages();
  },{rootMargin:'300px'}) : null;
function loadValidationImages() {
  if (validationImageLoading || !validationActive()) return;
  while (validationImages.length) {
    const image = validationImages.shift();
    delete image.dataset.queued;
    if (image.dataset.discarded) continue;
    if (!image.isConnected || image.dataset.project !== selected) {
      validationImageObserver?.observe(image);
      continue;
    }
    validationImageLoading = image;
    image.loading = 'eager';
    image.src = image.dataset.source;
    return;
  }
}
function finishValidationImage(image) {
  if (validationImageLoading === image) validationImageLoading = null;
  loadValidationImages();
}
const validationRunId = value => typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
function validationView() {
  if (!validationViews.has(selected)) validationViews.set(selected,{
    runs:[],entries:new Map(),nextCursor:'',paged:false,scrollTop:0,
    initialized:false,listRequest:0,request:0,loading:false,detailLoading:false,warnings:[],error:''
  });
  return validationViews.get(selected);
}
function validationEntry(id, view = validationView()) {
  if (!validationRunId(id)) return null;
  if (!view.entries.has(id)) view.entries.set(id,{
    cursor:0,runtime:'',prepare:'',json:'',truncated:false,errors:[],clearedPrepare:'',clearedJson:''
  });
  return view.entries.get(id);
}
function validationChronology(view = validationView()) {
  return [...view.runs].sort((a,b) => String(b.started_at).localeCompare(String(a.started_at)) ||
    b.run_id.localeCompare(a.run_id));
}
function validationActive() {
  return !disposed && !offline && !document.hidden && page === 'build' &&
    currentProject()?.valid && logView().tab === 'validate';
}
function syncValidationPolling() {
  if (!validationActive()) {
    clearTimeout(validationTimer); validationTimer = undefined;
    return;
  }
  loadValidationImages();
  if (validationTimer !== undefined) return;
  validationTimer = setTimeout(() => {
    validationTimer = undefined;
    if (!validationActive()) return;
    void refreshValidation();
    syncValidationPolling();
  },5000);
}
function boundedValidationText(value) {
  const original = String(value || '');
  const tail = original.slice(-65536).split('\n').slice(-1000).join('\n');
  return {text:tail,truncated:tail.length < original.length};
}
function validationStatus(run) {
  return ({running:'采集中',finished:'已结束',incomplete:'不完整'})[run?.status] || '未知';
}
function validationVisibleText(entry) {
  if (!entry) return '';
  const logs = validationLogContent(entry);
  const prepare = filteredLogText(logs.prepare), runtime = filteredLogText(logs.runtime);
  const json = entry.json === entry.clearedJson ? '' : entry.json;
  return [
    entry.truncated ? '日志已截断，仅显示有界片段。' : '',
    ...entry.errors,
    prepare ? '准备日志\n' + prepare : '',
    runtime ? 'Runtime / Lua 日志\n' + runtime : '',
    json ? 'JSON\n' + json : ''
  ].filter(Boolean).join('\n\n');
}
function validationLogContent(entry) {
  if (!entry) return {prepare:'',runtime:''};
  return {
    prepare:entry.clearedPrepare && entry.prepare.startsWith(entry.clearedPrepare)
      ? entry.prepare.slice(entry.clearedPrepare.length) : entry.prepare,
    runtime:entry.runtime
  };
}
async function refreshValidation(options = {}) {
  if (!validationActive()) return;
  const key = selected, epoch = selectionEpoch, viewEpochAtStart = viewEpoch;
  const view = validationView();
  if (view.loading && view.listEpoch === epoch) return;
  if (options.more && !view.nextCursor) return;
  const request = ++view.listRequest;
  const matches = () => selectionMatches(key,epoch) && viewEpoch === viewEpochAtStart &&
    validationActive() && request === view.listRequest;
  view.loading = true; view.listEpoch = epoch; view.error = '';
  renderConsoleLogs();
  try {
    const result = await api(projectPath(key,'/validation') +
      (options.more ? '?before=' + encodeURIComponent(view.nextCursor) : ''));
    if (!matches()) return;
    if (!Array.isArray(result.runs)) throw new Error('Validate 历史格式无效');
    const incoming = result.runs.filter(run => validationRunId(run.run_id));
    const merged = new Map((options.more ? [...view.runs,...incoming] : [...incoming,...view.runs])
      .map(run => [run.run_id,run]));
    // Keep older loaded pages while refreshing the newest summaries.
    incoming.forEach(run => merged.set(run.run_id,run));
    view.runs = Array.from(merged.values());
    if (options.more || !view.paged) view.nextCursor = validationRunId(result.next_cursor) ? result.next_cursor : '';
    if (options.more) view.paged = true;
    view.warnings = Array.isArray(result.warnings) ? result.warnings : [];
    view.initialized = true;
    // Summary pagination is independent of the bounded evidence reader.
    view.loading = false;
    await loadValidationEvidence();
  } catch (error) {
    if (matches()) {
      view.error = error.message;
      if (options.more) view.paged = false;
    }
  } finally {
    if (request === view.listRequest) view.loading = false;
    if (matches()) renderConsoleLogs();
  }
}
async function loadValidationEvidence() {
  if (!validationActive()) return;
  const key = selected, epoch = selectionEpoch, viewAtStart = viewEpoch;
  const view = validationView();
  if (view.detailLoading && view.detailEpoch === epoch) return;
  const request = ++view.request;
  const matches = () => selectionMatches(key,epoch) && viewEpoch === viewAtStart &&
    validationActive() && view.request === request;
  const visited = new Set();
  const needsEvidence = run => {
    const entry = validationEntry(run.run_id,view);
    return !visited.has(run.run_id) && (run.status === 'running' || entry.errors.length || entry.pendingLogs ||
      entry.signature !== JSON.stringify(run));
  };
  view.detailLoading = true; view.detailEpoch = epoch;
  renderConsoleLogs();
  try {
    // Two evidence reads leave slots for a thumbnail and independent summary pagination.
    while (matches()) {
      const run = validationChronology(view).find(needsEvidence);
      if (!run) break;
      visited.add(run.run_id);
      await loadValidationRound(key,view,run,matches);
      if (matches()) renderConsoleLogs();
    }
  } finally {
    if (request === view.request) view.detailLoading = false;
    if (matches()) renderConsoleLogs();
  }
}
async function loadValidationRound(key,view,run,matches) {
  const id = run.run_id, entry = validationEntry(id,view);
  const base = projectPath(key,'/validation/' + encodeURIComponent(id));
    const results = await Promise.allSettled([api(base), api(base + '/prepare')]);
    if (!matches()) return;
    results.push(...await Promise.allSettled([api(base + '/logs?cursor=' + entry.cursor)]));
    if (!matches()) return;
    entry.revision = (entry.revision || 0) + 1;
    entry.errors = [];
    const [detail,prepare,logs] = results;
    results.forEach((result,index) => {
      if (result.status === 'rejected') entry.errors.push(
        ['详情','准备日志','Runtime / Lua 日志'][index] + '读取失败：' + result.reason.message);
    });
    if (detail.status === 'fulfilled') {
      const data = detail.value;
      if (data.run?.run_id !== id || data.run.project_realpath !== currentProject()?.path) {
        entry.errors.push('Validate 详情与当前调用或项目不一致');
      } else {
        entry.data = data;
        const bounded = boundedValidationText(JSON.stringify({
          invocation:data.invocation,result:data.result,report:data.report
        },null,2));
        entry.json = (bounded.truncated ? 'JSON 已截断\n' : '') + bounded.text;
        view.runs = view.runs.map(run => run.run_id === id ? data.run : run);
      }
    }
    if (prepare.status === 'fulfilled') {
      const bounded = boundedValidationText(prepare.value.text);
      entry.prepare = bounded.text;
      entry.truncated ||= bounded.truncated || Boolean(prepare.value.truncated);
    }
    if (logs.status === 'fulfilled') {
      const data = logs.value;
      if (Array.isArray(data.logs) && Number.isSafeInteger(data.next_cursor) && data.next_cursor >= entry.cursor) {
        const added = data.logs.filter(row => Number.isSafeInteger(row.cursor) && row.cursor > entry.cursor)
          .map(row => String(row.text || '')).join('\n');
        const bounded = boundedValidationText([entry.runtime,added].filter(Boolean).join('\n'));
        entry.runtime = bounded.text;
        entry.truncated ||= bounded.truncated || Boolean(data.truncated);
        entry.cursor = data.next_cursor;
        entry.pendingLogs = Boolean(data.truncated) && added.length > 0;
      } else entry.errors.push('Runtime / Lua 日志游标无效');
    }
    if (!entry.errors.length) entry.signature = JSON.stringify(view.runs.find(run => run.run_id === id));
}
function clearValidationDisplay() {
  const view = validationView();
  view.listRequest++; view.loading = false;
  view.request++; view.detailLoading = false;
  view.entries.forEach(entry => {
    entry.revision = (entry.revision || 0) + 1;
    entry.runtime = ''; entry.clearedPrepare = entry.prepare; entry.clearedJson = entry.json;
    entry.imageCleared = Boolean(entry.data?.artifacts?.some(artifact =>
      artifact.kind === 'screenshot' && artifact.id === 'screenshot.png'));
    if (entry.image) {
      entry.image.dataset.discarded = 'true';
      validationImageObserver?.unobserve(entry.image);
    }
    entry.truncated = false; entry.errors = []; entry.image = null; entry.imageError = false;
  });
  for (let i = validationImages.length - 1; i >= 0; i--) {
    if (!validationImages[i].dataset.discarded) continue;
    delete validationImages[i].dataset.queued;
    validationImages.splice(i,1);
  }
}
function validationSection(entry, runId, id, title) {
  entry.sections ||= new Map();
  if (!entry.sections.has(id)) {
    const section = node(id === 'screenshot' ? 'section' : 'details',undefined,'validation-evidence');
    section.dataset.key = selected + ':' + runId + ':' + id;
    section.dataset.evidence = id;
    if (id !== 'screenshot') section.open = false;
    const heading = node(id === 'screenshot' ? 'h3' : 'summary');
    heading.append(node('span',title,'validation-evidence-title'));
    const preview = node('span',undefined,'validation-preview');
    if (id !== 'screenshot') heading.append(preview);
    section.append(heading);
    const body = node('div',undefined,'validation-evidence-body');
    section.append(body);
    entry.sections.set(id,{section,body,preview});
  }
  return entry.sections.get(id);
}
function renderValidationEvidence(entry, run) {
  const feed = node('div',undefined,'validation-feed');
  if (!entry) return feed;
  if (entry.truncated) feed.append(node('p','日志已截断，仅显示有界片段。','pending'));
  entry.errors.forEach(error => feed.append(node('p',error,'bad')));
  const log = (id,title,value) => {
    if (!value) return;
    const visible = id === 'json' ? value : filteredLogText(value);
    const display = visible || '当前筛选无匹配日志';
    const block = validationSection(entry,run.run_id,id,title);
    block.preview.textContent = display.trimEnd().split('\n').slice(-3).join('\n');
    if (!block.output) {
      block.output = node('pre');
      block.output.addEventListener('scroll',() => {
        if (!block.output.isConnected || !block.section.open) return;
        block.scrollTop = block.output.scrollTop; block.scrollLeft = block.output.scrollLeft;
      });
      block.body.append(block.output);
    }
    if (block.value !== display) {
      const top = block.output.scrollTop, left = block.output.scrollLeft;
      block.output.replaceChildren(renderLogLines(display));
      block.output.scrollTop = top; block.output.scrollLeft = left;
      block.value = display;
    }
    block.output.className = 'validation-log' + (logView().wrap ? ' wrap' : '');
    feed.append(block.section);
  };
  const {prepare} = validationLogContent(entry);
  log('prepare','准备日志',prepare);
  log('runtime','Runtime / Lua 日志',entry.runtime);
  const screenshot = validationSection(entry,run.run_id,'screenshot','截图');
  const data = entry.data;
  const available = data?.run.status !== 'running' &&
    data?.artifacts?.some(artifact => artifact.kind === 'screenshot' && artifact.id === 'screenshot.png');
  const key = selected, id = run.run_id;
  const visible = () => selected === key && validationActive();
  if (available && !entry.image && !entry.imageError && !entry.imageCleared) {
    const image = node('img');
    image.alt = 'Validate 截图'; image.className = 'validation-screenshot'; image.loading = 'lazy';
    image.dataset.project = key;
    image.dataset.source = projectPath(key,'/validation/' + encodeURIComponent(id) + '/screenshot.png');
    image.addEventListener('load',() => finishValidationImage(image));
    image.addEventListener('error',() => {
      finishValidationImage(image);
      if (entry.image !== image) return;
      entry.image = null; entry.imageError = true;
      if (visible()) renderConsoleLogs();
    });
    entry.image = image;
    if (validationImageObserver) validationImageObserver.observe(image);
    else image.src = image.dataset.source;
  }
  const content = [];
  if (available && entry.image) {
    const link = node('a');
    link.href = entry.image.dataset.source; link.target = '_blank'; link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label','查看截图原图'); link.append(entry.image);
    content.push(link);
  } else {
    const message = entry.imageCleared ? '截图已清理显示' : entry.imageError ? '截图读取失败' :
      data?.result?.mode === 'validate' ? '本轮未请求截图' :
      run.status === 'running' ? '等待截图采集完成' :
      !data ? '截图记录尚未读取' : '本轮未收集到截图';
    content.push(node('p',message,entry.imageError ? 'bad' : 'muted'));
    if (available && (entry.imageError || entry.imageCleared)) {
      content.push(button('重载截图',() => {
        if (!visible()) return;
        entry.imageError = false; entry.imageCleared = false; renderConsoleLogs();
      },{icon:'refresh'}));
    }
  }
  screenshot.body.replaceChildren(...content);
  feed.append(screenshot.section);
  log('json','调用参数与原始 JSON',entry.json === entry.clearedJson ? '' : entry.json);
  return feed;
}
function renderValidationPanel() {
  const view = validationView();
  const panel = node('div',undefined,'validation-panel');
  panel.dataset.project = selected;
  const history = node('div',undefined,'validation-history');
  history.append(node('span',view.runs.length ? view.runs.length + ' 轮 Validate' :
    view.loading ? '读取中…' : '暂无 Validate 调用','muted'));
  panel.append(history);
  if (view.error) panel.append(node('p',view.error,'bad'));
  if (view.warnings.length) panel.append(node('p',boundedValidationText(view.warnings.join('\n')).text,'pending'));
  const runs = validationChronology(view);
  panel.dataset.firstRun = runs[0]?.run_id || '';
  runs.forEach(run => {
    const entry = validationEntry(run.run_id,view);
    const renderKey = JSON.stringify([run,entry.revision,entry.imageError,entry.imageCleared,
      logView().wrap,logFilters()]);
    if (entry.round && entry.renderKey === renderKey) {
      panel.append(entry.round);
      return;
    }
    const round = node('article',undefined,'validation-round');
    round.dataset.validationRun = run.run_id;
    const time = node('time',new Date(run.started_at).toLocaleString(),'validation-time');
    time.dateTime = run.started_at; time.title = run.run_id;
    round.append(time);
    const status = node('div',undefined,'validation-status');
    status.append(node('span','采集状态：' + validationStatus(run),run.status === 'incomplete' ? 'pending' : 'muted'),
      node('span','阶段：' + text(run.phase)),
      node('span','游戏结果：' + text(run.game_result,'未提供')));
    round.append(status);
    if (run.result) round.append(node('span','采集结果：' + run.result,'muted'));
    const warnings = [entry.data?.warnings,entry.data?.result?.warnings]
      .flatMap(items => Array.isArray(items) ? items : []);
    if (warnings.length) round.append(node('p',boundedValidationText(warnings.join('\n')).text,'pending'));
    round.append(renderValidationEvidence(entry,run));
    entry.round = round; entry.renderKey = renderKey;
    panel.append(round);
  });
  if (view.nextCursor) panel.append(button('加载更早记录',
    () => void refreshValidation({more:true}),{disabled:view.loading,loading:view.loading}));
  const key = selected;
  panel.addEventListener('scroll',() => {
    if (selected !== key || !panel.isConnected) return;
    view.scrollTop = panel.scrollTop;
    if (panel.scrollHeight - panel.scrollTop - panel.clientHeight < 80 &&
      view.nextCursor && !view.loading)
      void refreshValidation({more:true});
  });
  return panel;
}
function logView() {
  if (!logViews.has(selected)) logViews.set(selected,{tab:'build',runtime:'',loading:false,wrap:false,cleared:{},filters:{}});
  return logViews.get(selected);
}
function logFilters() {
  const view = logView();
  return view.filters[view.tab] ||= {info:true,warning:true,error:true};
}
function selectLog(tab) {
  logView().tab = tab;
  renderConsoleLogs();
  syncValidationPolling();
  if (tab === 'validate') void refreshValidation();
  $('console-logs')?.scrollIntoView({block:'nearest'});
}
function consoleLogSnapshot() {
  const view = logView();
  if (view.tab === 'runtime') return {id:view.runtimeId || 'runtime',output:view.runtime,details:'',notice:view.runtimeNotice || ''};
  const task = tasksFor(selected).find(t => t.action === (view.tab === 'lua' ? 'lua-lsp.check' : view.tab === 'qrcode' ? 'qrcode' : 'build'));
  if (!task) return {id:'',output:'',details:''};
  const result = nestedResult(task);
  return {id:task.id,output:task.output || '',details:[Array.isArray(result?.issues) ? result.issues.join('\n') : '',
    task.error, task.result ? text(task.result) : ''].filter(Boolean).join('\n\n')};
}
function clearConsoleLogs() {
  const view = logView();
  if (view.tab === 'validate') {
    clearValidationDisplay(); renderConsoleLogs(); return;
  }
  view.cleared[view.tab] = consoleLogSnapshot();
  renderConsoleLogs();
}
function consoleLogContent() {
  const view = logView(), snapshot = consoleLogSnapshot(), cleared = view.cleared[view.tab];
  let {output,details} = snapshot;
  if (cleared && cleared.id === snapshot.id) {
    if (output.startsWith(cleared.output)) output = output.slice(cleared.output.length);
    if (details === cleared.details) details = '';
  }
  return [output,details].filter(Boolean).join('\n\n');
}
function consoleLogText() {
  const view = logView();
  if (view.tab === 'validate') return validationChronology().map(run => {
    const output = validationVisibleText(validationEntry(run.run_id));
    return output ? run.started_at + ' · ' + run.run_id + '\n' + output : '';
  }).filter(Boolean).join('\n\n') || (validationView().runs.length ? '暂无显示内容' : '暂无 Validate 调用');
  if (view.tab === 'runtime' && view.loading) return '正在读取运行时日志…';
  const snapshot = consoleLogSnapshot(), cleared = view.cleared[view.tab];
  const notice = cleared?.id === snapshot.id && cleared.notice === snapshot.notice ? '' : snapshot.notice;
  const content = consoleLogContent();
  if (content) return [notice,filteredLogText(content) || '当前筛选无匹配日志'].filter(Boolean).join('\n');
  if (notice) return notice;
  if (view.cleared[view.tab]?.id === snapshot.id) return '日志已清理';
  return view.tab === 'runtime' ? '点击刷新读取运行时日志' : snapshot.id ? '等待任务输出' : '暂无日志';
}
function explicitLogLevel(line) {
  const level = value => {
    if (typeof value !== 'string') return null;
    if (/^(?:error|fatal|critical|panic)$/i.test(value)) return 'error';
    if (/^warn(?:ing)?$/i.test(value)) return 'warning';
    if (/^(?:info|debug|trace|notice|log)$/i.test(value)) return 'info';
    return null;
  };
  const prefix = /^\s*(?:\[(?!(?:ERROR|FATAL|CRITICAL|PANIC|WARN|WARNING|INFO|DEBUG|TRACE|NOTICE|LOG)\])[^\]\r\n]+\]\s*)*/i;
  const message = line.replace(prefix,'');
  if (message.startsWith('{')) {
    try {
      const entry = JSON.parse(message);
      const structured = level(entry?.l ?? entry?.level ?? entry?.severity);
      if (structured) return structured;
    } catch (_) {}
  }
  const marker = /^(?:\[(ERROR|FATAL|CRITICAL|PANIC|WARN|WARNING|INFO|DEBUG|TRACE|NOTICE|LOG)\]|(ERROR|FATAL|CRITICAL|PANIC|WARN|WARNING|INFO|DEBUG|TRACE|NOTICE|LOG)(?=\s|:|\||$))/i.exec(message);
  return level(marker?.[1] || marker?.[2]);
}
function logLineSeverity(line) {
  const explicit = explicitLogLevel(line);
  if (explicit) return explicit;
  if (/\b(?:error|fatal)\b|失败|错误|异常/i.test(line)) return 'error';
  if (/\bwarn(?:ing)?\b|警告|注意/i.test(line)) return 'warning';
  return 'info';
}
function logLineClass(line) {
  const severity = logLineSeverity(line);
  return 'log-line' + (severity === 'info' ? '' : ' log-' + severity);
}
function logRows(output) {
  if (!output) return [];
  let previous = 'info';
  return String(output).split('\n').map(text => {
    // Keep traceback continuations with their preceding severity when filtering.
    const severity = explicitLogLevel(text) ||
      (/^\s*$|^\s+|^stack traceback:|^at \S/.test(text) ? previous : logLineSeverity(text));
    previous = severity;
    return {text,severity};
  });
}
function filteredLogText(output) {
  const filters = logFilters();
  const rows = logRows(output).filter(row => filters[row.severity]);
  return rows.some(row => row.text.trim()) ? rows.map(row => row.text).join('\n') : '';
}
function renderLogFilters() {
  const group = node('div',undefined,'console-log-filters');
  group.setAttribute('role','group'); group.setAttribute('aria-label','日志类型筛选');
  const filters = logFilters(), counts = {info:0,warning:0,error:0};
  const content = logView().tab === 'validate' ? validationView().runs.flatMap(run =>
    Object.values(validationLogContent(validationEntry(run.run_id)))) :
    [consoleLogContent()];
  content.forEach(output => logRows(output).forEach(row => {
    if (row.text.trim()) counts[row.severity]++;
  }));
  [['info','普通'],['warning','警告'],['error','错误']].forEach(([level,label]) => {
    const control = button(label,() => {
      filters[level] = !filters[level]; renderConsoleLogs();
    },{icon:level,className:'log-filter log-filter-' + level,focus:'log-filter-' + level});
    control.dataset.level = level;
    control.setAttribute('aria-label',label + '日志');
    control.setAttribute('aria-pressed',String(filters[level]));
    control.setAttribute('aria-controls','console-log-output');
    control.title = (filters[level] ? '隐藏' : '显示') + label + '日志（' + counts[level] + ' 行）';
    control.append(node('span',String(counts[level]),'log-count'));
    group.append(control);
  });
  return group;
}
function renderLogLines(output) {
  const fragment = document.createDocumentFragment();
  const rows = logRows(output);
  rows.forEach((row,index) => {
    fragment.append(node('span',row.text,'log-line' + (row.severity === 'info' ? '' : ' log-' + row.severity)));
    if (index < rows.length - 1) fragment.append(document.createTextNode('\n'));
  });
  return fragment;
}
function renderConsoleLogs() {
  const host = $('console-logs');
  if (!host) return;
  const view = logView();
  const previous = $('console-log-output');
  const sameProject = previous?.dataset.project === selected;
  const top = previous?.scrollTop || 0, left = previous?.scrollLeft || 0;
  // Keep the visible round stable even when earlier evidence is filled over several redraws.
  const anchor = sameProject && top > 0 &&
    Array.from(previous.querySelectorAll('[data-validation-run]'))
      .find(round => round.getBoundingClientRect().bottom > previous.getBoundingClientRect().top);
  const anchorOffset = anchor ?
    anchor.getBoundingClientRect().top - previous.getBoundingClientRect().top : 0;
  const toolbar = node('div',undefined,'console-log-toolbar');
  const tabs = node('div',undefined,'console-log-tabs');
  tabs.setAttribute('role','tablist');
  [['build','构建日志'],['lua','Lua 检查'],['runtime','Runtime 日志'],['qrcode','二维码'],['validate','Validate']].forEach(([id,label]) => {
    const tab = button(label,() => { selectLog(id); if (id === 'runtime' && !view.runtime && !view.loading) void loadLogs(); });
    tab.setAttribute('role','tab'); tab.setAttribute('aria-selected',String(view.tab === id));
    tab.setAttribute('aria-controls','console-log-output'); tabs.append(tab);
  });
  const actions = node('div',undefined,'actions');
  const wrap = node('label','自动换行','theme');
  const checkbox = node('input'); checkbox.type = 'checkbox'; checkbox.checked = view.wrap;
  checkbox.addEventListener('change',() => { view.wrap = checkbox.checked; renderConsoleLogs(); }); wrap.append(checkbox);
  const loading = view.tab === 'validate' ? validationView().loading || validationView().detailLoading : view.loading;
  actions.append(wrap,button(loading ? '读取中' : '刷新',() => { if(view.tab === 'validate') void refreshValidation(); else if(view.tab === 'runtime') void loadLogs(); else void pollState().then(renderConsoleLogs).catch(e=>notify(e.message)); },{icon:'refresh',iconOnly:true,className:'icon-button',loading,disabled:offline || loading}),
    button('清理日志',clearConsoleLogs,{icon:'trash',iconOnly:true,className:'icon-button',disabled:loading}),
    button('复制',async () => { try { await navigator.clipboard.writeText(consoleLogText()); announce('日志已复制'); } catch (_) { notify('复制失败，请手动选择日志复制'); } },{icon:'copy',iconOnly:true,className:'icon-button'}));
  toolbar.append(node('h2','日志'),actions);
  const output = view.tab === 'validate' ? renderValidationPanel() :
    node('pre',undefined,'console-log-output' + (view.wrap ? ' wrap' : ''));
  if (view.tab !== 'validate') output.append(renderLogLines(consoleLogText()));
  output.id = 'console-log-output'; output.setAttribute('role','tabpanel'); output.tabIndex = 0;
  replace(host,[toolbar,tabs,renderLogFilters(),output]);
  if (view.tab === 'validate') {
    output.scrollTop = sameProject ? top : validationView().scrollTop;
    if (anchor) {
      const restored = Array.from(output.querySelectorAll('[data-validation-run]'))
        .find(round => round.dataset.validationRun === anchor.dataset.validationRun);
      if (restored)
        output.scrollTop += restored.getBoundingClientRect().top -
          output.getBoundingClientRect().top - anchorOffset;
    }
    validationView().entries.forEach(entry => entry.sections?.forEach(block => {
      if (!block.output?.isConnected || !block.section.open) return;
      block.output.scrollTop = block.scrollTop || 0; block.output.scrollLeft = block.scrollLeft || 0;
    }));
  } else output.scrollTop = top;
  output.scrollLeft = left;
  syncValidationPolling();
}
let git = null;
let gitError = '';
let gitLoading = false;
let gitPull = null;
let gitPulling = false;
let gitPullRequest = 0;
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
const pendingReports = new Map();
const offeredReports = new Set();
function offerIssueReport(task) {
  if (!task.reportOffer || task.report || offeredReports.has(task.reportOffer.fingerprint)) return;
  pendingReports.set(task.id,task);
  if (pendingReports.size > 100) pendingReports.delete(pendingReports.keys().next().value);
}
function showPendingIssueReport() {
  if (offline || disposed || consoleDialogOpen()) return;
  const task = Array.from(pendingReports.values()).find(item => item.projectKey === selected);
  if (!task) return;
  pendingReports.delete(task.id);
  if (offeredReports.has(task.reportOffer.fingerprint)) return;
  offeredReports.add(task.reportOffer.fingerprint);
  const dialog = $('confirm');
  $('confirm-title').textContent = '提交问题反馈？';
  $('confirm-message').textContent = (task.action.startsWith('preview.') ? '本地预览遇到异常。' : '操作遇到异常。') +
    '是否提交问题反馈，帮助我们定位修复？将附带脱敏后的错误、日志和环境信息。';
  $('confirm-accept').textContent = '确认提交';
  dialog.returnValue = 'cancel';
  dialog.addEventListener('close',async () => {
    if (dialog.returnValue !== 'accept') return;
    try {
      const updated = await api('/api/tasks/' + encodeURIComponent(task.id) + '/report',{
        method:'POST',body:{consent:true}
      });
      rememberTask(updated);
      const index = state.tasks.findIndex(item => item.id === updated.id);
      if (index >= 0) state.tasks[index] = updated;
      if (updated.projectKey === selected) { updateChrome(); updateBuild(); notify('正在提交问题反馈…','info'); }
    } catch (error) { notify('问题反馈未提交：' + error.message); }
  },{once:true});
  dialog.showModal();
}
const windowDrafts = new Map();
function rememberTask(task) {
  const previous = acceptedTasks.get(task.id);
  acceptedTasks.set(task.id,task);
  if (previous?.report?.status === 'running' && task.report?.status !== 'running' && task.projectKey === selected)
    notify(task.report?.status === 'created' ? '问题反馈已提交，谢谢。' :
      task.report?.status === 'unknown' ? '反馈提交结果未知，请勿重复提交。' :
      '反馈未能自动提交，请检查 GitHub CLI 登录状态及网络。',task.report?.status === 'created' ? 'success' : 'error');
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
  clearTimeout(validationTimer); validationTimer = undefined;
  validationImageObserver?.disconnect(); validationImages.length = 0;
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
function busy(key = selected) { return pending.has(key) || tasksFor(key).some(t => t.status === 'running' || t.report?.status === 'running'); }
function actionBusy(action, key = selected) {
  return pendingActions.get(key) === action ||
    tasksFor(key).some(task => task.action === action && task.status === 'running');
}
function selectionMatches(key, epoch) { return key === selected && epoch === selectionEpoch; }
function getCurrentProject() {
  const project = currentProject();
  if (!project) return null;
  return {
    key: project.key,
    projectid: project.projectid || '',
    name: project.name,
    path: project.path,
    valid: project.valid === true,
    epoch: selectionEpoch
  };
}
const projectListeners = [];
function onProjectChange(listener) { projectListeners.push(listener); }
function currentProjectNotice() {
  const project = currentProject();
  if (!selected) return '';
  if (!project) return 'missing:' + selected;
  return [project.key, project.projectid || '', project.path || '', project.valid ? '1' : '0'].join('\0');
}
function publishProjectChange() {
  const notice = currentProjectNotice();
  if (notice === projectNotice) return false;
  projectNotice = notice;
  selectionEpoch++;
  viewEpoch++;
  commitRequest++;
  $('feedback').hidden = true;
  for (const id of ['confirm','qrcode-confirm','selection-dialog','qrcode-result','git-pull-conflict']) {
    const dialog = $(id);
    if (dialog?.open) dialog.close();
  }
  const project = getCurrentProject();
  for (const listener of projectListeners) {
    try { listener(project); }
    catch (error) { notify(error.message); }
  }
  return true;
}
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
function clearGitPullState() {
  gitPull = null;
  gitPulling = false;
  gitPullRequest++;
  const dialog = $('git-pull-conflict');
  if (dialog?.open) dialog.close();
}
function chooseProject(key, updateUrl = true) {
  if (key !== selected && !leaveUiEditor()) {
    $('project-picker').value = selected;
    return;
  }
  const project = state.projects.find(p => p.key === key);
  selected = key;
  if (!project?.valid && page !== 'projects' && page !== 'documents') page = 'projects';
  if (updateUrl) setProjectQuery();
  if (updateUrl) void api('/api/console-preferences', {
    method:'PUT',body:{selectedProjectKey:key || null}
  }).catch(() => {});
  publishProjectChange();
  if (key && !project) notify('所选项目未登记，请从本地项目列表选择。');
  render();
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
  const theme = window.MakerConsole.getTheme();
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
  if (status?.status === 'checking') return {label:'检测中',status:'检测中',detail:'正在检查本机 Lua 诊断环境',tone:'muted'};
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
  return ['confirm','qrcode-confirm','selection-dialog','qrcode-result','git-pull-conflict'].some(id => $(id)?.open);
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
  if (task.report) {
    const labels = {running:'正在提交问题反馈…',created:'问题反馈已提交',unavailable:'反馈未能自动提交，请检查 GitHub CLI 登录状态及网络。',unknown:'反馈提交结果未知，请勿重复提交。'};
    shortcuts.append(node('span',labels[task.report.status] || '反馈状态未知','muted'));
    if (task.report.status === 'running') shortcuts.append(node('span',undefined,'loading-spinner'));
    if (task.report.status === 'created' && /^https:\/\/github\.com\/taptap\/instant-games-open-mcp\/issues\/\d+$/.test(task.report.issue_url || '')) {
      const link = node('a','查看反馈','preview-link');
      link.href = task.report.issue_url; link.target = '_blank'; link.rel = 'noopener noreferrer';
      shortcuts.append(link);
    }
  }
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
function previewCachePanel() {
  const key = selected, epoch = selectionEpoch;
  const panel = node('section');
  panel.append(node('h3','本机预览缓存'));
  const label = node('p','尚未统计 · 验证自动保留最近 3 次，运行中或状态不明的记录额外保留。','muted');
  const details = node('p',undefined,'muted');
  details.style.overflowWrap = 'anywhere';
  const projects = node('details');
  projects.append(node('summary','按项目查看占用和缓存位置'));
  const projectList = node('div');
  projectList.style.overflowWrap = 'anywhere';
  projects.append(projectList);
  const actions = node('div',undefined,'actions');
  const format = bytes => (bytes / 1024 ** 3).toFixed(2) + ' GiB';
  const query = async (clear,all = false) => {
    if (clear && !window.confirm('清理' + (all ? '全部可确认归属项目' : '当前项目') + '已结束的测试记录、截图、日志及新旧预览副本？运行中、状态不明或归属不明的内容会保留。Runtime 下载资源、安装文件和存档不在此次清理范围。')) return;
    refresh.disabled = clean.disabled = cleanAll.disabled = true;
    label.textContent = clear ? '正在清理缓存…' : '正在统计缓存…';
    try {
      const result = await api(projectPath(key,clear ? '/preview/cache/clear' : '/preview/cache'),clear ? {method:'POST',body:{all_projects:all},timeoutMs:300000} : {timeoutMs:300000});
      if (!selectionMatches(key,epoch)) return;
      label.textContent = (result.complete === false ? '已统计占用（不完整）：' : '全部项目预览占用：') + format(result.total_bytes) + ' · 当前项目：' + format(result.bytes);
      const names = {validation:'测试记录及旧副本',sessions:'会话记录及旧副本',preparations:'旧准备记录及副本','validation-prep':'旧验证副本',storage:'Runtime 下载资源 / 存档','public-index-cache':'旧公共索引','project-workspace':'项目内固定缓存','legacy-runtime':'旧 Runtime 安装（保留）',other:'状态及其他文件',unattributed:'未归属内容（保留）','windows-downloads':'Windows 临时下载缓存（保留）'};
      details.textContent = Object.entries(result.total_categories || {}).map(([name,size]) => (names[name] || name) + ' ' + format(size)).join(' · ') + '。统计整个 ' + result.global_directory + '、已登记或有历史记录的项目内 .maker-preview，以及 Windows 已标记的临时下载缓存；不含原项目源码、正式构建产物和独立安装的共享 Runtime。按文件逻辑大小统计，不等同于可清理大小。' + (result.warnings || []).join('；');
      replace(projectList,(result.projects || []).filter(item => item.bytes > 0).sort((left,right) => right.bytes-left.bytes).map(item => node('p',(item.project || '未确认归属 ' + item.key) + '：' + format(item.bytes) + ' · ' + item.directory)));
      if (clear) {
        clearValidationDisplay();
        const view = validationView();
        view.runs = []; view.entries.clear(); view.paged = false; view.nextCursor = ''; view.initialized = false;
        renderConsoleLogs();
        void refreshValidation();
      }
    } catch (error) { if (selectionMatches(key,epoch)) label.textContent = '缓存操作失败：' + error.message; }
    finally { refresh.disabled = clean.disabled = cleanAll.disabled = false; }
  };
  const refresh = button('统计 / 刷新',() => void query(false));
  const clean = button('清理当前项目',() => void query(true));
  const cleanAll = button('清理全部项目',() => void query(true,true));
  actions.append(refresh,clean,cleanAll);
  panel.append(label,details,projects,actions);
  void query(false);
  return panel;
}
function renderBuild() {
  const title = heading('构建与测试',currentProject().name,true);
  const columns = node('div',undefined,'columns build-columns');
  const build = node('section'); build.id = 'build-panel';
  const local = node('section'); local.id = 'preview-panel';
  columns.append(build,local);
  const logs = node('section',undefined,'console-logs'); logs.id = 'console-logs';
  const history = node('section',undefined,'task-history'); history.id = 'task-history';
  replace($('view'),[title,columns,logs,previewCachePanel(),history]);
  updateBuild();
  if (logView().tab === 'validate' && !validationView().initialized) void refreshValidation();
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
async function refreshPreview(options = {}) {
  const key = selected, epoch = selectionEpoch;
  if (!key || !currentProject()?.valid) return;
  const quiet = options.quiet === true;
  if (!quiet) previewProbeFailures = 0;
  if (!quiet) {
    previewLoading = true;
    if (page === 'build') updateBuild();
  }
  try {
    const result = await api(projectPath(key,'/preview'));
    if (!selectionMatches(key,epoch)) return;
    const changed = JSON.stringify(preview) !== JSON.stringify(result) || previewError;
    preview = result; previewError = '';
    previewProbeFailures = 0;
    if (changed && page === 'overview') renderOverview();
    if (changed && page === 'build') updateBuild();
  } catch (error) {
    if (!selectionMatches(key,epoch)) return;
    previewError = error.message;
    previewProbeFailures++;
    if (preview?.process_alive !== true) preview = null;
    if (page === 'build') updateBuild();
    if (page === 'overview') renderOverview();
  } finally {
    if (!quiet && selectionMatches(key,epoch)) {
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
    entry.runtimeNotice = logs.truncated ? '仅显示最近日志，完整分页记录可通过 preview logs 读取。' : '';
    entry.runtime = Array.isArray(logs.logs) ? logs.logs.map(row => text(row.text,'')).join('\n') : text(logs);
  } catch (error) {
    entry.runtime = '';
    entry.runtimeNotice = '日志读取失败：' + error.message;
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
      $('confirm-message').textContent = '将关闭本机 Maker 控制台服务，所有已打开的控制台页面都会断开连接。不会删除项目文件；有正在运行的预览时，请先停止预览再关闭控制台。';
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
  let preflight = false;
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
      preflight = ['preview.start','preview.refresh','preview.install'].includes(action);
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
    const reportablePreflight = /timeout|timed out|HTTP 5\d\d|internal.*error|unverifiable|unexpected|connection closed/i
      .test(String(error?.message || error));
    if (preflight && reportablePreflight && selectionMatches(key,epoch)) {
      try {
        const failed = await api('/api/tasks/failure',{
          method:'POST',
          body:{projectKey:key,action,error:String(error?.message || error)}
        });
        rememberTask(failed);
        offerIssueReport(failed);
        showPendingIssueReport();
      } catch {
        // The original preflight error remains visible when the local task record cannot be saved.
      }
    }
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
function shouldQuietProbePreview() {
  return previewProbeFailures < PREVIEW_PROBE_RETRY_LIMIT &&
    (preview?.process_alive === true || previewProbeFailures > 0);
}
async function refreshSettledTask(task) {
  const key = selected, epoch = selectionEpoch;
  if (task?.projectKey !== selected) {
    if (task) settledTaskPending.set(task.id,task);
    return;
  }
  if (!task || task.status === 'running' || settledTaskRefresh.has(task.id)) return;
  settledTaskRefresh.add(task.id);
  if (settledTaskRefresh.size > 100) settledTaskRefresh.delete(settledTaskRefresh.values().next().value);
  announce((actionLabels[task.action] || task.action) + ' · ' + text(task.projectName) + ' · ' + (statusLabels[task.status] || '结果未知'));
  await refreshPreview();
  if (!selectionMatches(key,epoch)) {
    settledTaskPending.set(task.id,task);
    settledTaskRefresh.delete(task.id);
    return;
  }
  if (task.action === 'build' || task.action === 'qrcode') await loadProject({preview:false});
  if (!selectionMatches(key,epoch)) {
    settledTaskPending.set(task.id,task);
    settledTaskRefresh.delete(task.id);
    return;
  }
  settledTaskPending.delete(task.id);
  settledTaskRefresh.delete(task.id);
  handleQrcodeCompletion(task);
}
async function refreshPendingSettledTasks(projectKey) {
  for (const task of [...settledTaskPending.values()]) {
    if (task.projectKey === projectKey) await refreshSettledTask(task);
  }
}
async function pollTask(id,key,epoch) {
  try {
    const prior = tasksFor(key).find(t => t.id === id);
    const task = await api('/api/tasks/' + encodeURIComponent(id));
    if (task.projectKey !== key || task.id !== id) throw new Error('任务身份不一致');
    rememberTask(task);
    if (prior?.status === 'running' && task.status !== 'running') offerIssueReport(task);
    const index = state.tasks.findIndex(t => t.id === id);
    if (index >= 0) state.tasks[index] = task; else state.tasks.push(task);
    if (!selectionMatches(key,epoch)) return task;
    updateChrome(); updateBuild();
    if (task.status !== 'running' && prior?.status === 'running') await refreshSettledTask(task);
    showPendingIssueReport();
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
function renderGitPullNote() {
  if (!gitPull?.message) return null;
  const note = node('div',undefined,'git-pull-note');
  note.append(node('p',gitPull.message,gitPull.outcome === 'updated' || gitPull.outcome === 'up_to_date' ? 'good' : 'bad'));
  if (gitPull.prompt) {
    const box = node('textarea');
    box.readOnly = true;
    box.value = gitPull.prompt;
    box.setAttribute('aria-label','交给 AI 的提示词');
    note.append(box,button('复制给 AI',() => void copyGitPrompt(gitPull.prompt),{icon:'copy'}));
  }
  if (gitPull.detail) {
    const details = node('details');
    details.dataset.key = 'git-pull-detail';
    details.append(node('summary','诊断信息'),node('pre',gitPull.detail));
    note.append(details);
  }
  return note;
}
async function copyGitPrompt(prompt) {
  const boxes = [$('git-pull-conflict-prompt'), document.querySelector('.git-pull-note textarea')].filter(Boolean);
  try {
    await navigator.clipboard.writeText(prompt);
    announce('提示词已复制');
  } catch (_) {
    const box = boxes.find(item => item.value === prompt) || boxes[0];
    if (box) { box.value = prompt; box.focus(); box.select(); }
    notify('无法访问剪贴板，请复制已选中的提示词');
  }
}
function showGitPullDialog(result) {
  const dialog = $('git-pull-conflict');
  if (!dialog || !result?.prompt || consoleDialogOpen()) return;
  $('git-pull-conflict-summary').textContent = result.message;
  $('git-pull-conflict-prompt').value = result.prompt;
  dialog.showModal();
}
function renderGit() {
  const title = heading('Git 历史',currentProject().path);
  const actions = node('div',undefined,'actions');
  actions.append(
    button('刷新本地历史',() => void loadGit(false),{icon:'refresh',disabled:gitLoading || gitPulling}),
    button(gitPulling ? '正在拉取' : '拉取远端代码',() => void pullGit(),{disabled:gitLoading || gitPulling})
  );
  title.append(actions);
  const elements = [title];
  if (gitError) elements.push(node('p',gitError,'bad'));
  const pullNote = renderGitPullNote();
  if (pullNote) elements.push(pullNote);
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
async function pullGit() {
  if (gitPulling || gitLoading || !currentProject()?.valid) return;
  const key = selected, epoch = selectionEpoch, request = ++gitPullRequest;
  gitPulling = true; gitError = '';
  if (page === 'git') renderGit();
  try {
    const result = await api(projectPath(key,'/git/pull'),{method:'POST',body:{},timeoutMs:150000});
    if (!selectionMatches(key,epoch) || request !== gitPullRequest) return;
    gitPull = result;
    if (result.dialog && result.prompt) showGitPullDialog(result);
    if (result.outcome === 'updated') {
      git = null;
      void loadGit(false);
      void loadProject({preview:false});
    }
  } catch (error) {
    if (selectionMatches(key,epoch) && request === gitPullRequest) {
      gitPull = {outcome:'unavailable',message:error.message,dialog:false};
    }
  } finally {
    if (request === gitPullRequest) gitPulling = false;
    if (selectionMatches(key,epoch) && request === gitPullRequest && page === 'git') renderGit();
  }
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
const canvasFrames = new Map();
let uiEditorFrame;
let uiEditorProject = '';
let initialUiProject = '';
function uiEditorState() {
  try { return uiEditorFrame?.contentWindow?.UrhoxProject; }
  catch { return null; }
}
function leaveUiEditor() {
  const editor = uiEditorState();
  if (editor?.isBusy?.()) {
    notify('UI 编辑器正在打开或保存文档，请稍后切换项目。', 'warning');
    return false;
  }
  if (editor?.isDirty?.() && !window.confirm('UI 有未保存修改。切换项目会丢弃这些修改，确定继续？')) return false;
  uiEditorFrame?.remove();
  uiEditorFrame = undefined;
  uiEditorProject = '';
  return true;
}
function renderUiEditor() {
  const host = $('ui-editor-view');
  if (!currentProject()?.valid) return;
  if (uiEditorFrame && uiEditorProject !== selected && !leaveUiEditor()) return;
  if (!uiEditorFrame) {
    uiEditorFrame = node('iframe', undefined, 'canvas-frame');
    uiEditorFrame.title = 'UI 编辑器';
    uiEditorFrame.referrerPolicy = 'origin';
    const query = new URLSearchParams({project:selected});
    const requested = initialQuery.get('ui');
    if (requested && selected === initialUiProject) query.set('ui', requested);
    uiEditorFrame.src = '/ui-editor/?' + query.toString();
    uiEditorProject = selected;
    host.replaceChildren(uiEditorFrame);
  }
}
function protectUiEditorUnload(event) {
  const editor = uiEditorState();
  if (editor?.isDirty?.() || editor?.isBusy?.()) {
    event.preventDefault(); event.returnValue = '';
  }
}
const closedCanvasFrames = new Set();
const CANVAS_FRAME_LIMIT = 8;
function canvasUnsaved(frame) {
  try { return frame.contentWindow && frame.contentWindow.makerCanvasUnsaved === true; }
  catch { return true; }
}
function canvasPending(frame) {
  try { return frame.contentWindow && frame.contentWindow.makerCanvasPendingImport === true; }
  catch { return true; }
}
function closeCurrentCanvas() {
  const key = selected;
  const frame = canvasFrames.get(key);
  if (!frame) return;
  if (canvasPending(frame)) {
    notify('图片导入尚未完成，请等待导入结束后再关闭画布。', 'warning');
    return;
  }
  if (canvasUnsaved(frame) && !window.confirm('此项目画布有未保存编辑。关闭后这些编辑会丢失，已保存内容仍在项目里。确定关闭？')) return;
  frame.remove();
  canvasFrames.delete(key);
  closedCanvasFrames.add(key);
  renderCanvas();
}
function openCurrentCanvas() {
  closedCanvasFrames.delete(selected);
  renderCanvas();
}
function renderCanvas() {
  const host = $('canvas-views');
  host.hidden = false;
  $('view').hidden = true;
  $('plugin-views').hidden = true;
  pluginSessions.forEach(session => { session.element.hidden = true; });
  let bar = document.getElementById('canvas-toolbar');
  if (!bar) {
    bar = node('div', undefined, 'canvas-toolbar');
    bar.id = 'canvas-toolbar';
    host.prepend(bar);
  }
  const key = selected;
  $('close-canvas').hidden = !canvasFrames.has(key);
  bar.hidden = !closedCanvasFrames.has(key);
  if (!key || !currentProject()?.valid) return;
  if (closedCanvasFrames.has(key)) {
    bar.replaceChildren(button('打开当前项目画布', openCurrentCanvas));
    canvasFrames.forEach((item, itemKey) => { item.hidden = itemKey !== key; });
    return;
  }
  if (canvasFrames.size >= CANVAS_FRAME_LIMIT && !canvasFrames.has(key)) {
    notify('已打开 ' + CANVAS_FRAME_LIMIT + ' 个项目画布。请先打开其中一个并点击「关闭当前项目画布」。有未保存编辑时会先确认，不会静默丢掉。', 'warning');
    return;
  }
  let frame = canvasFrames.get(key);
  if (!frame) {
    frame = node('iframe', undefined, 'canvas-frame');
    frame.title = '自由画布';
    frame.referrerPolicy = 'origin';
    frame.src = '/canvas?project=' + encodeURIComponent(key);
    canvasFrames.set(key, frame);
    host.append(frame);
  }
  $('close-canvas').hidden = false;
  canvasFrames.forEach((item, itemKey) => { item.hidden = itemKey !== key; });
}
function navigate(next) {
  if (!currentProject()?.valid && next !== 'projects' && next !== 'documents') return;
  viewEpoch++; commitRequest++; gitLoading = false; page = next;
  render();
  if (next === 'overview' && !detail) void loadProject();
  if (next === 'git' && !git) void loadGit(false);
  if (next === 'build') void refreshPreview();
}
function render() {
  document.body.classList.toggle('canvas-mode', page === 'canvas' || page === 'ui-editor');
  $('close-canvas').hidden = true;
  syncValidationPolling();
  updateChrome();
  $('view').setAttribute('aria-busy','false');
  const plugin = currentProject()?.valid && pluginDescriptors().find(item => page === 'plugin:' + item.id);
  $('view').hidden = Boolean(plugin) || page === 'canvas' || page === 'ui-editor';
  $('plugin-views').hidden = !plugin;
  $('canvas-views').hidden = page !== 'canvas';
  $('ui-editor-view').hidden = page !== 'ui-editor';
  pluginSessions.forEach(session => { session.element.hidden = true; });
  if (page === 'canvas') { renderCanvas(); return; }
  if (page === 'ui-editor') { renderUiEditor(); return; }
  if (plugin) { renderPlugin(plugin); return; }
  if (page === 'documents') { void renderDocuments(); return; }
  if (page === 'projects' || !currentProject()?.valid) renderProjects();
  else if (page === 'build') renderBuild();
  else if (page === 'git') renderGit();
  else renderOverview();
}
async function loadProject(options = {}) {
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
  if (options.preview !== false && selectionMatches(key,epoch)) await refreshPreview();
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
    else void api('/api/console-preferences', {method:'PUT',body:{selectedProjectKey:selected}}).catch(() => {});
  } else if (first && hasExplicitProject) {
    const requested = projectKeyFromQuery(initialQuery);
    selected = state.projects.some(project => project.key === requested && project.valid) ? requested : '';
    page = selected ? 'overview' : 'projects';
    if (!selected) notify('链接中的项目未登记或已失效，请从项目列表选择。','warning');
    else void api('/api/console-preferences', {method:'PUT',body:{selectedProjectKey:selected}}).catch(() => {});
  } else if (first) {
    try {
      const preference = await api('/api/console-preferences');
      const project = state.projects.find(item => item.key === preference.selectedProjectKey && item.valid);
      selected = project ? project.key : '';
      page = selected ? 'overview' : 'projects';
    } catch {
      selected = '';
      page = 'projects';
    }
  }
  if (first && currentProject()?.valid && initialQuery.get('page') === 'ui-editor') {
    page = 'ui-editor';
    initialUiProject = selected;
  }
  if (first && initialQuery.get('page') === 'documents') page = 'documents';
  const settled = [];
  state.tasks.forEach(task => {
    const prior = acceptedTasks.get(task.id);
    if (prior?.status !== 'running' && task.status === 'running' && prior?.finishedAt) {
      Object.assign(task,prior);
    } else if (prior) rememberTask(task);
    if (task.projectKey === selected && previousTasks.get(task.id) === 'running' && task.status !== 'running') {
      offerIssueReport(task);
      settled.push(task);
    }
  });
  showPendingIssueReport();
  $('version').textContent = 'Maker ' + text(state.version) + ' · ' + text(state.distribution,'独立发行') + ' · ' + text(state.platform);
  renderVersionPicker();
  $('connection').textContent = '已连接';
  $('connection').title = '最近连接：' + new Date().toLocaleTimeString('zh-CN');
  $('connection').className = 'good';
  lastStateError = '';
  if (selected && !currentProject()?.valid && page !== 'projects' && page !== 'documents') page = 'projects';
  let projectChanged = false;
  if (first && projectNotice === '') projectNotice = currentProjectNotice();
  else projectChanged = publishProjectChange();
  if (projectChanged || (first && ['ui-editor', 'documents'].includes(page))) render();
  else {
    updateChrome();
    if (page === 'projects' && (first || priorProjects !== JSON.stringify(state.projects))) renderProjects();
    if (page === 'build' && priorTasks !== JSON.stringify(tasksFor(selected))) updateBuild();
    if (page === 'overview' && detail && priorLua !== JSON.stringify(state.luaLsp)) renderOverview();
  }
  for (const task of settled) await refreshSettledTask(task);
}
async function poll() {
  if (polling || document.hidden || offline || disposed) return;
  clearTimeout(pollTimer); polling = true;
  try {
    await pollState();
    if (offline || disposed) return;
    // 首屏在状态返回后才选定项目，这里只补一次详情。之后的心跳不再读 Git。
    if (page === 'overview' && !detail && currentProject()?.valid) {
      render();
      await loadProject();
    } else if (shouldQuietProbePreview()) await refreshPreview({quiet:true});
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
// 子页面在这里绑定切换：清掉自己的当前数据；正打开本页时再拉取。
onProjectChange(project => {
  if (project?.key) void refreshPendingSettledTasks(project.key);
  detail = null;
  if (page === 'overview' && project?.valid) void loadProject();
});
onProjectChange(project => {
  preview = null;
  previewError = '';
  previewLoading = false;
  if (page === 'build' && project?.valid) void refreshPreview();
});
onProjectChange(project => {
  clearGitPullState();
  git = null;
  gitError = '';
  gitLoading = false;
  if (page === 'git' && project?.valid) void loadGit(false);
});
onProjectChange(() => {
  syncValidationPolling();
});
onProjectChange(() => {
  documentItems = [];
  documentSelected = '';
  documentRequest++;
  documentDirectoryRequest++;
});
document.addEventListener('DOMContentLoaded',async () => {
  window.addEventListener('beforeunload', protectUiEditorUnload);
  $('git-pull-conflict-copy')?.addEventListener('click',() => void copyGitPrompt($('git-pull-conflict-prompt').value));
  let makerMarkClicks = 0;
  let makerMarkTimer;
  $('maker-mark').addEventListener('click',() => {
    makerMarkClicks += 1;
    clearTimeout(makerMarkTimer);
    if (makerMarkClicks >= 3) {
      $('maker-mark').classList.add('maker-easter-egg');
      $('maker-mark').setAttribute('aria-label','Maker 控制台彩蛋已触发');
      makerMarkClicks = 0;
      return;
    }
    makerMarkTimer = setTimeout(() => { makerMarkClicks = 0; },1000);
  });
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
  theme.checked = window.MakerConsole.getTheme() === 'dark';
  theme.addEventListener('change',() => {
    if (!window.MakerConsole.setTheme(theme.checked ? 'dark' : 'light')) notify('无法保存主题设置');
  });
  window.MakerConsole.onThemeChange(() => {
    pluginSessions.forEach(session => sendPluginTheme(session));
    if ($('fortune-frame').getAttribute('src')) {
      beginFortuneLoad(true);
    }
  });
  $('projects-button').append(icon('folder'));
  const fortunePanel = $('fortune-panel');
  const fortuneFrame = $('fortune-frame');
  fortunePanel.classList.add('fortune-preload');
  fortunePanel.hidden = true;
  fortuneFrame.addEventListener('load',revealFortune);
  fortuneFrame.addEventListener('error',() => {
    fortuneReady = false;
    $('fortune-corner').hidden = true;
    fortunePanel.hidden = true;
  });
  beginFortuneLoad();
  bindFortuneHover($('fortune-toggle'));
  bindFortuneHover($('fortune-panel'));
  $('fortune-toggle').addEventListener('click',event => {
    event.stopPropagation();
    openFortune();
  });
  window.addEventListener('resize',() => { if (!$('fortune-panel').hidden) positionFortune(); });
  document.addEventListener('keydown',event => { if (event.key === 'Escape') closeFortune(); });
  $('projects-button').addEventListener('click',() => navigate('projects'));
  $('close-canvas').addEventListener('click',closeCurrentCanvas);
  $('project-picker').addEventListener('change',event => chooseProject(event.target.value));
  $('maker-version-picker').addEventListener('change',selectMakerVersion);
  $('dismiss').addEventListener('click',() => { $('feedback').hidden = true; });
  document.querySelectorAll('nav [data-page]').forEach(b => b.addEventListener('click',() => navigate(b.dataset.page)));
  window.addEventListener('popstate',() => {
    chooseProject(projectKeyFromQuery(new URLSearchParams(location.search)),false);
  });
  document.addEventListener('visibilitychange',() => {
    clearTimeout(pollTimer);
    syncValidationPolling();
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
