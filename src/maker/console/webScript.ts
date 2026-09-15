import { consoleIcons } from './webIcons.js';

export const consoleScript = String.raw`
(function(){
'use strict';
const iconNodes = ${JSON.stringify(consoleIcons)};
let token = '';
let authError = '';
try {
  const fragment = location.hash.slice(1);
  const incoming = fragment.includes('=') ? new URLSearchParams(fragment).get('token') : fragment;
  if (incoming) sessionStorage.setItem('maker-console-token', incoming);
  token = incoming || sessionStorage.getItem('maker-console-token') || '';
} catch (_) { authError = '无法访问会话存储。请允许会话存储后重新打开控制台。'; }
if (location.hash) {
  const clean = new URL(location.href);
  clean.hash = '';
  history.replaceState(null, '', clean.pathname + clean.search);
}
let selected = new URLSearchParams(location.search).get('project') || '';
let page = selected ? 'overview' : 'projects';
let selectionEpoch = 0;
let viewEpoch = 0;
let state = {projects: [], tasks: []};
let loaded = false;
let detail = null;
let preview = null;
let previewError = '';
let git = null;
let gitError = '';
let gitLoading = false;
let commitRequest = 0;
let pollTimer;
let polling = false;
let offline = false;
let disposed = false;
let lastActivitySent = -Infinity;
const requests = new Set();
const offlineMessage = '控制台已离线或会话已过期，请通过 Maker 重新打开控制台。未确认的任务结果需要核对，不要重复提交。';
let lastStateError = '';
const pending = new Set();
const pendingActions = new Map();
const acceptedTasks = new Map();
function rememberTask(task) {
  acceptedTasks.set(task.id,task);
  while (acceptedTasks.size > 100) {
    const oldest = Array.from(acceptedTasks.values()).find(item => item.status !== 'running');
    if (!oldest) break;
    acceptedTasks.delete(oldest.id);
  }
}
const actionLabels = {
  build: '构建', 'preview.start': '启动预览', 'preview.refresh': '刷新预览',
  'preview.stop': '停止预览', 'preview.install': '安装 Runtime'
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
  const b = node('button', options.iconOnly ? undefined : label, options.className);
  b.type = 'button';
  b.disabled = Boolean(options.disabled);
  b.title = label;
  b.setAttribute('aria-label', label);
  if (options.icon) b.prepend(icon(options.icon));
  if (options.focus) b.dataset.focus = options.focus;
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
  if (authError || !token) throw new Error(authError || '缺少访问令牌。请从 Maker CLI 重新打开控制台。');
  const controller = new AbortController();
  requests.add(controller);
  const timeout = setTimeout(() => controller.abort(), 20000);
  let received = false;
  try {
    const response = await fetch(path, {
      method: options.method || 'GET',
      headers: {Authorization: 'Bearer ' + token, 'Content-Type':'application/json'},
      ...(options.body === undefined ? {} : {body:JSON.stringify(options.body)}),
      credentials:'omit', cache:'no-store', redirect:'error', signal:controller.signal
    });
    if (response.status === 401 || response.status === 503) {
      disconnect();
      throw new Error(offlineMessage);
    }
    const data = await response.json();
    received = true;
    if (!response.ok) throw new Error(text(data.error, '请求失败（HTTP ' + response.status + '）'));
    return data;
  } catch (error) {
    if (!received && !disposed) {
      disconnect();
      throw new Error(offlineMessage);
    }
    throw error;
  } finally { clearTimeout(timeout); requests.delete(controller); }
}
function disconnect() {
  offline = true;
  clearTimeout(pollTimer);
  $('connection').textContent = '已离线';
  $('connection').className = 'bad';
  notify(offlineMessage);
  if (loaded && currentProject()?.valid) { updateChrome(); updateBuild(); }
}
async function sendActivity() {
  if (offline || disposed || document.hidden || Date.now() - lastActivitySent < 30000) return;
  lastActivitySent = Date.now();
  try { await api('/api/activity', {method:'POST', body:{}}); }
  catch (error) { if (!disposed) notify(error.message); }
}
function dispose() {
  disposed = true;
  clearTimeout(pollTimer);
  requests.forEach(controller => controller.abort());
  requests.clear();
}
function projectPath(key, suffix = '') { return '/api/projects/' + encodeURIComponent(key) + suffix; }
function currentProject() { return state.projects.find(p => p.key === selected); }
function tasksFor(key) {
  const tasks = new Map(state.tasks.filter(t => t.projectKey === key).map(t => [t.id, t]));
  acceptedTasks.forEach(t => { if (t.projectKey === key && !tasks.has(t.id)) tasks.set(t.id, t); });
  return Array.from(tasks.values()).sort((a,b) => String(b.startedAt).localeCompare(String(a.startedAt)));
}
function busy(key = selected) { return pending.has(key) || tasksFor(key).some(t => t.status === 'running'); }
function selectionMatches(key, epoch) { return key === selected && epoch === selectionEpoch; }
function notify(message) {
  $('feedback-text').textContent = text(message);
  $('feedback').hidden = false;
}
function announce(message) {
  $('announcement').hidden = false;
  $('announcement').textContent = message;
}
function setProjectQuery() {
  const url = new URL(location.href);
  if (selected) url.searchParams.set('project', selected);
  else url.searchParams.delete('project');
  url.hash = '';
  history.replaceState(null, '', url.pathname + url.search);
}
function chooseProject(key, updateUrl = true) {
  if (busy()) { updateChrome(); return; }
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
  picker.disabled = !loaded || busy();
  $('context').textContent = currentProject() ? currentProject().name + ' / ' + text(detail?.git?.branch, '分支未提供') : '本地项目';
  $('footer-path').textContent = currentProject()?.path || '';
  document.querySelectorAll('nav [data-page]').forEach(b => {
    b.disabled = !currentProject()?.valid;
    if (b.dataset.page === page) b.setAttribute('aria-current','page');
    else b.removeAttribute('aria-current');
  });
  if ($('heading-actions')) replace($('heading-actions'),headingActionButtons());
  if ($('overview-task')) {
    const latest = tasksFor(selected)[0];
    replace($('overview-task'),[node('h2','最近任务'),
      latest ? taskBlock(latest) : node('p','暂无控制台任务','muted')]);
  }
}
function headingActionButtons() {
  const actions = previewActions(preview);
  const local = button('本地预览',() => {
    const action = previewActions(preview)[0];
    if (action) void runAction(action);
  },{icon:'monitor',disabled:offline || busy() || !actions.length,focus:'heading-preview'});
  local.title = actions.length ? '本地预览 · ' + actionLabels[actions[0]] :
    '本地预览 · ' + (previewError || text(preview?.error,previewLabel()));
  const task = tasksFor(selected).find(t => t.action === 'build');
  const presentation = buildPresentation(task,pendingActions.get(selected) === 'build',offline);
  const build = button(presentation.active ? presentation.label : '构建',() => void runAction('build'),
    {className:'primary build-button' + (presentation.active ? ' is-building' : ''),
      icon:presentation.active ? 'refresh' : 'hammer',disabled:offline || busy(),focus:'heading-build'});
  build.setAttribute('aria-busy',String(presentation.active));
  const result = [local,build];
  if (!presentation.active && task) result.push(node('span',presentation.label,'build-badge ' + presentation.tone));
  return result;
}

function buildFailureMessage(task) {
  const error = text(task?.error,'');
  if (/BLACKLISTED|Account restricted|账号受到限制/i.test(error))
    return 'Maker 账号受到限制。请联系管理员核实账号状态，解除限制后再构建。';
  const failure = task?.result?.result?.submitResult?.failure;
  if (failure?.classification === 'auth' || /returned error: (401|403)/i.test(error))
    return '项目同步被拒绝，远端构建未启动。请核对当前 Maker 账号、项目访问权限和登录凭证。';
  return error.split('\n').find(line => line.trim()) || '构建失败，请展开任务详情查看原因。';
}
function buildPresentation(task, submitting = false, disconnected = false) {
  if (disconnected) return {label:'连接已断开',stage:'任务结果待核对，请勿重复提交',active:false,tone:'pending'};
  if (submitting) return {label:'正在发起构建',stage:'等待本地服务接收',active:true,tone:'pending'};
  if (!task) return {label:'尚未构建',stage:'',active:false,tone:'muted'};
  if (task.status === 'running') {
    const stages = {sync:'同步项目',prepare:'准备项目',auth:'验证项目访问权限',
      remote_sync:'检查远端版本',commit:'提交本地变更',push:'推送项目',build:'远端构建',
      remote_build:'远端构建',preview:'准备预览'};
    return {label:'构建中',stage:stages[task.progress?.phase] || task.progress?.message || '等待构建进度',
      active:true,tone:'pending'};
  }
  if (task.status === 'succeeded') return {label:'构建成功',stage:'',active:false,tone:'good'};
  if (task.status === 'failed') return {label:'构建失败',stage:buildFailureMessage(task),active:false,tone:'bad'};
  return {label:'结果待核对',stage:'请先核对远端结果，不要重复提交',active:false,tone:'pending'};
}
function buildStatusBlock(task, submitting = false) {
  const info = buildPresentation(task,submitting,offline);
  const block = node('div',undefined,'build-status ' + info.tone);
  const title = node('div',undefined,'build-status-title');
  if (info.active) { const spinner = icon('refresh'); spinner.classList.add('build-spinner'); title.append(spinner); }
  title.append(node('strong',info.label));
  block.append(title);
  if (info.stage) block.append(node('p',info.stage,'build-stage'));
  if (info.active) {
    const bar = node('div',undefined,'build-progress');
    bar.setAttribute('role','progressbar');
    bar.setAttribute('aria-label','构建进行中');
    bar.append(node('span'));
    block.append(bar);
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
    actions.append(button('打开', () => chooseProject(p.key), {disabled:busy() || !p.valid}));
    actions.append(button('移除登记（保留项目文件）', () => void removeProject(p.key), {
      icon:'trash',iconOnly:true,className:'icon-button danger',disabled:busy() || busy(p.key),
      focus:'remove-' + p.key
    }));
    r.append(label,actions); list.append(r);
  });
  if (loaded && !state.projects.length) list.append(node('p','尚未登记本地项目','empty'));
  const form = node('form', undefined, 'entry');
  const label = node('label','项目绝对路径'); label.htmlFor = 'project-path';
  const input = node('input'); input.id = 'project-path'; input.name = 'path'; input.type = 'text';
  input.required = true; input.autocomplete = 'off'; input.spellcheck = false;
  const submit = button('检查并添加', () => {}, {disabled:busy() || !loaded});
  submit.type = 'submit';
  form.append(label,input,submit);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const path = input.value.trim();
    if (!path || submit.disabled) return;
    submit.disabled = true;
    try {
      const project = await api('/api/projects', {method:'POST',body:{path}});
      await pollState();
      if (project?.key) announce('已登记项目：' + text(project.name));
      if (page === 'projects') renderProjects();
    } catch (error) { notify(error.message); submit.disabled = false; }
  });
  replace(view,[title,list,form]);
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
    metric.append(node('div',name,'muted'),node('div',text(value),'value')); metrics.append(metric);
  });
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
  const links = node('div',undefined,'actions preview-controls');
  links.append(button('构建与测试',() => navigate('build')),button('查看 Git',() => navigate('git')));
  health.append(links);
  columns.append(configSection,health);
  const recent = node('section',undefined,'task-history'); recent.id = 'overview-task';
  const latest = tasksFor(selected)[0];
  recent.append(node('h2','最近任务'),latest ? taskBlock(latest) : node('p','暂无控制台任务','muted'));
  replace($('view'),[title,metrics,columns,recent]);
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
function previewLabel() {
  if (!preview) return previewError ? '检测失败' : '待检测';
  if (preview.process_alive === true) return '运行中';
  if (preview.process_alive === false) return '已停止';
  return '进程身份未知';
}
function taskBlock(task, open = false) {
  const d = node('details',undefined,'task'); d.dataset.key = task.id; d.open = open;
  const summary = node('summary');
  summary.dataset.focus = 'task-' + task.id;
  summary.append(node('strong', actionLabels[task.action] || task.action),
    node('span', statusLabels[task.status] || '结果未知',
      task.status === 'failed' ? 'bad' : task.status === 'succeeded' ? 'good' : 'pending'),
    node('time',date(task.startedAt)));
  const meta = node('p','项目：' + text(task.projectName) + ' · 任务：' + text(task.id),'task-meta muted');
  d.append(summary,meta);
  if (task.finishedAt) d.append(node('p','结束：' + date(task.finishedAt),'task-meta muted'));
  if (task.error) {
    d.append(node('p',task.action === 'build' ? buildFailureMessage(task) : text(task.error),'bad'));
    if (task.action === 'build') {
      const diagnostic = node('details'); diagnostic.dataset.key = 'error-' + task.id;
      diagnostic.append(node('summary','错误详情'),node('pre',text(task.error)));
      d.append(diagnostic);
    }
  }
  const previewUrl = taskPreviewUrl(task);
  if (previewUrl) {
    const link = node('a','打开 Web 预览','preview-link');
    link.href = previewUrl; link.target = '_blank'; link.rel = 'noopener noreferrer';
    link.referrerPolicy = 'no-referrer';
    d.append(link);
  }
  d.append(node('pre', text(task.output, task.status === 'running' ? '等待任务输出' : '无任务输出')));
  if (task.result !== undefined) {
    const result = node('details'); result.dataset.key = 'result-' + task.id;
    result.append(node('summary','完整结果'),node('pre',text(task.result))); d.append(result);
  }
  return d;
}
function renderBuild() {
  const title = heading('构建与测试',currentProject().path,true);
  const columns = node('div',undefined,'columns');
  const build = node('section'); build.id = 'build-panel';
  const local = node('section'); local.id = 'preview-panel';
  columns.append(build,local);
  const history = node('section',undefined,'task-history'); history.id = 'task-history';
  replace($('view'),[title,columns,history]);
  updateBuild();
}
function updateBuild() {
  if (page !== 'build' || !$('build-panel')) return;
  const tasks = tasksFor(selected);
  const buildTasks = tasks.filter(t => t.action === 'build');
  const buildStatus = buildStatusBlock(buildTasks[0],pendingActions.get(selected) === 'build');
  const buildChildren = [node('h2','远端构建'),buildStatus];
  if (buildTasks[0]) buildChildren.push(taskBlock(buildTasks[0],true));
  replace($('build-panel'),buildChildren);
  const localChildren = [node('h2','本地预览'),node('p',previewLabel(),'status-line')];
  localChildren.push(fields([['Runtime',preview?.install_state === 'ready' ? '已安装' :
    preview?.install_state === 'missing' ? '未安装' : '待检测'],['会话状态',preview?.state],
    ['会话 ID',preview?.session_id]]));
  if (previewError || preview?.error) localChildren.push(node('p',previewError || text(preview.error),'bad'));
  if (preview?.supported === false) localChildren.push(node('p','当前平台不支持本地预览','bad'));
  const actions = node('div',undefined,'actions preview-controls');
  previewActions(preview).forEach(action => actions.append(button(actionLabels[action],() => void runAction(action),{
    disabled:busy(),focus:action, ...(action === 'preview.refresh' ? {icon:'refresh'} : {})
  })));
  actions.append(button('检测预览状态',() => void refreshPreview(),{icon:'refresh',iconOnly:true,
    className:'icon-button',focus:'preview-status'}));
  actions.append(button('运行日志',() => void loadLogs(),{focus:'preview-logs'}));
  localChildren.push(actions);
  const logs = $('preview-logs');
  const logSection = logs || node('div'); logSection.id = 'preview-logs';
  localChildren.push(logSection);
  replace($('preview-panel'),localChildren);
  const history = [node('h2','任务历史')];
  if (!tasks.length) history.push(node('p','暂无控制台任务','muted'));
  tasks.forEach(task => history.push(taskBlock(task)));
  replace($('task-history'),history);
}
async function refreshPreview() {
  const key = selected, epoch = selectionEpoch;
  if (!key || !currentProject()?.valid) return;
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
  }
}
async function loadLogs() {
  const key = selected, epoch = selectionEpoch, view = viewEpoch;
  const target = $('preview-logs');
  if (!target) return;
  replace(target,[node('p','正在读取日志','muted')]);
  try {
    const logs = await api(projectPath(key,'/preview/logs'));
    if (!selectionMatches(key,epoch) || view !== viewEpoch) return;
    replace($('preview-logs'),[node('pre',text(logs))]);
  } catch (error) {
    if (selectionMatches(key,epoch) && view === viewEpoch) replace($('preview-logs'),[node('p',error.message,'bad')]);
  }
}
function confirmAction(action, name) {
  return new Promise(resolve => {
    const dialog = $('confirm');
    $('confirm-title').textContent = action === 'preview.install' ? '安装本地 Runtime？' : '刷新预览？';
    $('confirm-message').textContent = action === 'preview.install' ?
      '项目：' + name + '\n将下载并安装 Runtime。完成后不会自动启动预览。' :
      '项目：' + name + '\n刷新会重启预览并丢失当前内存状态。';
    $('confirm-accept').textContent = actionLabels[action];
    dialog.returnValue = 'cancel';
    dialog.addEventListener('close',() => resolve(dialog.returnValue === 'accept'),{once:true});
    dialog.showModal();
  });
}
async function runAction(action) {
  const key = selected, epoch = selectionEpoch;
  const project = currentProject();
  if (!project?.valid || busy(key) || !Object.hasOwn(actionLabels,action)) return;
  pending.add(key); pendingActions.set(key,action); updateChrome(); updateBuild();
  try {
    if (action !== 'build') {
      const status = await api(projectPath(key,'/preview'));
      if (!selectionMatches(key,epoch)) return;
      preview = status;
      if (!previewActions(status).includes(action)) throw new Error(text(status.error,'预览状态已改变，请重新检测后操作。'));
      if (action === 'preview.install' || action === 'preview.refresh') {
        if (!await confirmAction(action,project.name)) return;
        if (!selectionMatches(key,epoch)) return;
      }
    }
    const task = await api('/api/tasks',{method:'POST',body:{projectKey:key,action}});
    if (task.projectKey !== key) throw new Error('任务项目与请求不一致，已停止更新。请检查任务状态。');
    rememberTask(task);
    if (!selectionMatches(key,epoch)) return;
    announce(actionLabels[action] + ' · ' + project.name + ' · ' + (statusLabels[task.status] || '结果未知'));
    void pollTask(task.id,key,epoch);
  } catch (error) {
    if (selectionMatches(key,epoch)) notify(error.message);
  } finally {
    pending.delete(key);
    pendingActions.delete(key);
    if (selectionMatches(key,epoch)) { updateChrome(); updateBuild(); }
  }
}
async function pollTask(id,key,epoch) {
  try {
    const task = await api('/api/tasks/' + encodeURIComponent(id));
    if (task.projectKey !== key || task.id !== id) throw new Error('任务身份不一致');
    const prior = tasksFor(key).find(t => t.id === id);
    rememberTask(task);
    const index = state.tasks.findIndex(t => t.id === id);
    if (index >= 0) state.tasks[index] = task; else state.tasks.push(task);
    if (!selectionMatches(key,epoch)) return;
    updateChrome(); updateBuild();
    if (task.status !== 'running' && prior?.status === 'running') {
      announce((actionLabels[task.action] || task.action) + ' · ' + text(task.projectName) + ' · ' + (statusLabels[task.status] || '结果未知'));
      await refreshPreview();
    }
  } catch (error) { if (selectionMatches(key,epoch)) notify(error.message); }
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
  if (!currentProject()?.valid && next !== 'projects') return;
  viewEpoch++; commitRequest++; gitLoading = false; page = next;
  render();
  if (next === 'git' && !git) void loadGit(false);
  if (next === 'build') void refreshPreview();
}
function render() {
  updateChrome();
  $('view').setAttribute('aria-busy','false');
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
  state = result; loaded = true;
  state.tasks.forEach(task => {
    const prior = acceptedTasks.get(task.id);
    if (prior?.status !== 'running' && task.status === 'running' && prior?.finishedAt) {
      Object.assign(task,prior);
    } else if (prior) rememberTask(task);
    if (task.projectKey === selected && previousTasks.get(task.id) === 'running' && task.status !== 'running') {
      announce((actionLabels[task.action] || task.action) + ' · ' + text(task.projectName) + ' · ' + (statusLabels[task.status] || '结果未知'));
    }
  });
  $('version').textContent = 'Maker ' + text(state.version) + ' · ' + text(state.distribution,'独立发行') + ' · ' + text(state.platform);
  $('connection').textContent = '已连接 · ' + new Date().toLocaleTimeString('zh-CN');
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
  const activity = event => { if (event.isTrusted) void sendActivity(); };
  document.addEventListener('pointerdown',activity,{passive:true});
  document.addEventListener('keydown',activity,{passive:true});
  document.addEventListener('wheel',activity,{passive:true});
  window.addEventListener('pagehide',dispose,{once:true});
  const theme = $('theme');
  try { theme.checked = localStorage.getItem('maker-console-theme') !== 'light'; } catch (_) {}
  document.documentElement.dataset.theme = theme.checked ? 'dark' : 'light';
  theme.addEventListener('change',() => {
    const value = theme.checked ? 'dark' : 'light';
    document.documentElement.dataset.theme = value;
    try { localStorage.setItem('maker-console-theme',value); } catch (_) { notify('无法保存主题设置'); }
  });
  $('projects-button').append(icon('folder'));
  $('projects-button').addEventListener('click',() => navigate('projects'));
  $('project-picker').addEventListener('change',event => chooseProject(event.target.value));
  $('dismiss').addEventListener('click',() => { $('feedback').hidden = true; });
  document.querySelectorAll('nav [data-page]').forEach(b => b.addEventListener('click',() => navigate(b.dataset.page)));
  window.addEventListener('popstate',() => {
    if (busy()) { setProjectQuery(); return; }
    chooseProject(new URLSearchParams(location.search).get('project') || '',false);
  });
  document.addEventListener('visibilitychange',() => {
    clearTimeout(pollTimer);
    if (!document.hidden) void poll();
  });
  render();
  await sendActivity();
  await poll();
  if (selected && !currentProject()) notify('所选项目未登记，请从本地项目列表选择。');
});
})();
`;
