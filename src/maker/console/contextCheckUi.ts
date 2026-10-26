/** Embedded in the console; uses its existing DOM, request and document-viewer helpers. */
export const contextCheckScript = String.raw`
const contextChecks = new Map();
const contextKinds = {rules:'规则',memory:'记忆',skills:'Skills',mcp:'MCP 配置'};
const contextLoading = {entry:'默认入口候选',conditional:'加载条件由客户端决定', 'on-demand':'通常按需加载',unknown:'加载情况未知'};
const contextWarningLabels = {invalid:'明确异常',unverified:'未完成检查',skipped:'跳过项'};
const contextLimits = '文件体积不等于已加载上下文。Skills 通常按需读取；MCP 注册数不等于工具数。实际加载量、工具定义和会话历史需在 AI 客户端查看。';
function contextSize(bytes) { return bytes < 1024 ? bytes + ' B' : (bytes / 1024).toFixed(1) + ' KiB'; }
function contextDiagnosis(result) {
  const lines = ['AI 上下文检查 · ' + result.checkedAt,
    '范围：当前项目',
    result.complete ? '约定位置检查完成' : '检查不完整', contextLimits,
    '覆盖边界：仅约定位置；不含父目录规则、子项目规则、会话自动记忆、托管策略、插件注册及自定义客户端目录。'];
  result.sources.forEach(source => {
    lines.push(contextKinds[source.kind] + ' · ' + source.path + ' · ' + contextSize(source.bytes) + ' · ' + contextLoading[source.loading]);
    if (source.registrations) lines.push('  MCP 注册：' + source.registrations.map(item => item.name + (item.enabled ? '（配置启用）' : '（配置停用）')).join('、'));
    if (source.aliases.length) lines.push('  同一文件的链接：' + source.aliases.join('、'));
  });
  result.findings.forEach(finding => lines.push(finding.title + '：' + finding.detail + '\n' +
    finding.sourceIds.map(id => result.sources.find(source => source.id === id)?.path || id).join('、')));
  result.warnings.forEach(warning => lines.push(contextWarningLabels[warning.kind] + '：' + warning.message));
  if (result.omittedWarningCount) lines.push('另有 ' + result.omittedWarningCount + ' 条未完成项未展示。');
  return lines.join('\n');
}
async function copyContextText(value) {
  try { await navigator.clipboard.writeText(value); announce('已复制'); }
  catch (_) { notify('复制失败，请展开明细手动选择复制。'); }
}
async function openContextSource(source) {
  const key = selected, epoch = selectionEpoch;
  try {
    const items = await api(documentApi());
    if (!selectionMatches(key,epoch) || page !== 'overview') return;
    const paths = [source.path,...source.aliases];
    const item = items.find(item => item.source === '当前项目' && paths.includes(item.relativePath));
    if (!item) { notify('此文件不在文档阅读器范围内，请复制路径后在本地查看。','warning'); return; }
    documentSelected = item.id; documentTab = item.kind; documentSearch = ''; requestedSkill = '';
    navigate('documents');
  } catch (_) { notify('读取文档目录失败，请重试或复制路径在本地查看。'); }
}
async function runContextCheck() {
  const key = selected;
  if (!key || offline || disposed || contextChecks.get(key)?.loading) return;
  const entry = {loading:true,result:null,error:''};
  contextChecks.set(key,entry);
  renderOverview();
  try { entry.result = await api(projectPath(key,'/context-check')); }
  catch (_) { entry.error = '检查未完成。请确认控制台仍在线，再点击重新检查。'; }
  finally {
    entry.loading = false;
    if (!disposed && selected === key && page === 'overview') renderOverview();
  }
}
function ensureInitialContextCheck() {
  if (page !== 'overview' || offline || disposed || !currentProject()?.valid ||
      contextChecks.has(selected)) return;
  void runContextCheck();
}
function contextSourceRow(source) {
  const row = node('div',undefined,'context-source'); const info = node('div');
  info.append(node('strong',source.name),node('div',source.path,'path'),
    node('div',contextSize(source.bytes) + ' · ' + contextLoading[source.loading],'muted'));
  if (source.aliases.length) info.append(node('div','同一文件的链接：' + source.aliases.join('、'),'path'));
  if (source.registrations) info.append(node('div',source.registrations.length ? source.registrations.map(item => item.name + (item.enabled ? '（配置启用）' : '（配置停用）')).join('、') : '未识别到 MCP 注册','muted'));
  const actions = node('div',undefined,'actions');
  if (source.kind !== 'mcp') actions.append(button('查看',() => void openContextSource(source)));
  actions.append(button('复制路径',() => void copyContextText(source.filePath)));
  row.append(info,actions); return row;
}
function contextCheckSection() {
  const section = node('section',undefined,'context-check');
  section.setAttribute('aria-label','AI 上下文检查');
  const entry = contextChecks.get(selected);
  const head = node('div',undefined,'context-check-head');
  head.append(node('h2','AI 上下文检查'),button(entry?.loading ? '检查中' : entry ? '重新检查' : '开始检查',() => void runContextCheck(),
    {loading:entry?.loading,disabled:offline,focus:'context-check'}));
  section.append(head);
  const result = entry?.result;
  const status = node('div',undefined,'context-check-status'); status.setAttribute('role','status');
  if (entry?.error) status.append(node('p',entry.error,'context-error'));
  else if (!result) status.append(node('p',entry?.loading ? '正在检查本地规则、记忆与 Skills…' : '此范围尚未检查。','muted'));
  else {
    const counts = result.warningCounts;
    status.append(node('p',counts.invalid ? '发现 ' + counts.invalid + ' 项文件或配置异常，展开查看' :
      result.complete ? '未发现明确异常' : '已检查部分未发现明确异常',counts.invalid ? 'context-error' : 'muted'));
    status.append(node('p','当前项目 · 已列出 ' + result.sources.length + ' 个来源','muted'));
    if (counts.unverified || counts.skipped) status.append(node('p','未完成检查 ' + counts.unverified + ' 项 · 跳过 ' + counts.skipped + ' 项','muted'));
    status.append(node('p','仅检查本地来源，无法判断本次会话的实际上下文占用。','muted'));
  }
  section.append(status);
  const details = node('details'); details.dataset.key = 'context-' + selected;
  details.append(node('summary','查看详情'));
  const actions = node('div',undefined,'actions context-check-actions');
  if (result) actions.append(button('复制诊断',() => void copyContextText(contextDiagnosis(result))));
  details.append(actions);
  if (result) details.append(node('p','检查于 ' + new Date(result.checkedAt).toLocaleTimeString() + ' · ' + result.sources.length + ' 个文件 · ' +
    (result.complete ? '约定位置检查完成' : '部分来源未完成检查'),'muted context-note'));
  details.append(node('p',contextLimits,'muted context-note'),
    node('p','检查跟随顶部当前项目，不读取客户端全局配置或 Maker 包内文件。不调用 AI、不启动 MCP、不修改文件。','muted context-note'));
  if (result) {
    result.findings.forEach(finding => {
      const item = node('div',undefined,'context-finding');
      item.append(node('strong',finding.title),node('p',finding.detail,'muted'));
      finding.sourceIds.forEach(id => { const source = result.sources.find(item => item.id === id); if (source) item.append(node('div',source.path,'path')); });
      details.append(item);
    });
    if (result.warnings.length) {
      const warnings = node('details',undefined,'context-group context-warnings');
      warnings.dataset.key = 'context-' + selected + '-warnings';
      warnings.append(node('summary','异常与未完成项 · ' + (result.warnings.length + (result.omittedWarningCount || 0)) + ' 条'));
      result.warnings.forEach(warning => warnings.append(node('p',contextWarningLabels[warning.kind] + ' · ' + warning.message,warning.kind === 'invalid' ? 'path context-error' : 'path muted')));
      if (result.omittedWarningCount) warnings.append(node('p','另有 ' + result.omittedWarningCount + ' 条未完成项未展示。请先处理已列出的来源，再重新检查。','muted'));
      details.append(warnings);
    }
    Object.entries(contextKinds).forEach(([kind,label]) => {
      const sources = result.sources.filter(source => source.kind === kind).sort((a,b) => b.bytes - a.bytes);
      if (!sources.length) return;
      const group = node('details',undefined,'context-group'); group.dataset.key = 'context-' + selected + '-' + kind;
      group.append(node('summary',label + ' · ' + sources.length + ' 个文件'));
      sources.forEach(source => group.append(contextSourceRow(source)));
      details.append(group);
    });
  }
  details.append(node('p','覆盖边界：仅扫描约定位置。父目录与子项目规则、会话自动记忆、托管策略、插件注册、自定义客户端目录未纳入。JSON/TOML 配置仅做基础注册识别，不推断继承与覆盖关系。','muted context-note'));
  section.append(details); return section;
}
`;
