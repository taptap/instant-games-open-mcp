export const assetCheckScript = String.raw`
const assetChecks = new Map();
let projectCheckTab = 'assets';
function assetBytes(bytes) {
  return bytes >= 1048576 ? (bytes / 1048576).toFixed(2) + ' MiB' : (bytes / 1024).toFixed(1) + ' KiB';
}
function assetRow(asset) {
  const row = node('div',undefined,'asset-check-row'); const info = node('div');
  info.append(node('strong',asset.path,'path'),node('p',assetBytes(asset.bytes) +
    (asset.width ? ' · ' + asset.width + ' × ' + asset.height + ' · RGBA 估算 ' + assetBytes(asset.width * asset.height * 4) : ''),'muted'));
  if (asset.references.length) info.append(node('p','引用线索：' + asset.references.join('、'),'path muted'));
  row.append(info,button('复制路径',() => void copyContextText(asset.path))); return row;
}
function assetGroup(title,rows,renderRow,note) {
  const group = node('details',undefined,'asset-check-group');
  group.dataset.key = selected + '-asset-' + title;
  group.append(node('summary',title + ' · ' + rows.length),node('p',note,'muted'));
  const list = node('div'); let shown = 0;
  const more = button('显示更多',() => showMore());
  function showMore() {
    rows.slice(shown,shown + 50).forEach(row => list.append(renderRow(row)));
    shown = Math.min(shown + 50,rows.length); more.hidden = shown >= rows.length;
    more.textContent = '显示更多（已显示 ' + shown + ' / ' + rows.length + '）';
  }
  group.append(list,more); showMore(); return group;
}
async function loadProjectCheck() {
  const key = selected;
  if (!currentProject()?.valid || offline || assetChecks.get(key)?.loading) return;
  const entry = {loading:true,result:assetChecks.get(key)?.result || null,error:''}; assetChecks.set(key,entry);
  try { entry.result = (await api(projectPath(key,'/project-check'))).result; }
  catch (error) { entry.error = error.message || '读取结果失败，请确认本地服务在线后重新打开页面。'; }
  finally {
    entry.loading = false;
    if (!disposed && selected === key && page === 'other' && otherTab === 'architecture') renderProjectCheck();
  }
}
function projectCheckPrompt(hasResult) {
  const guide = node('details',undefined,'asset-check-group'); guide.open = !hasResult;
  guide.append(node('summary',hasResult ? '让 AI 更新检查结果' : '通过 AI 对话生成项目检查'));
  const project = currentProject();
  const prompt = '请使用 Maker 内置 maker-project-check Skill 检查项目「' + project.name + '」，项目绝对路径：' + project.path + '。' +
    '先用 project-check collect 收集依据，再阅读真实源码，整理模块职责、模块关系和有源码依据的业务流程。' +
    '检查未被引用的资源候选、完全重复资源、超过 2K/4K 的图片，以及目录分类是否符合素材用途。' +
    '区分运行资源、创作原稿、历史文件和活动画布，说明动态引用与未核实项。' +
    '使用 project-check publish 保存结果到该项目的控制台「其他 → 项目检查」。不要自动删除、移动或压缩素材。';
  const box = node('textarea',undefined,'report-text'); box.readOnly = true; box.rows = 6; box.value = prompt;
  box.setAttribute('aria-label','给 AI 的项目检查指令');
  const status = node('p','','muted'); status.setAttribute('role','status');
  guide.append(node('p','将指令发给正在协助你开发项目的 AI。完成后重新打开此页查看结果。','muted'),box,
    button('复制给 AI',async () => {
      try { await navigator.clipboard.writeText(prompt); status.textContent = '已复制'; }
      catch (_) { box.focus(); box.select(); status.textContent = '浏览器未允许自动复制，文本已选中，请按 Ctrl/Cmd+C。'; }
    }),status);
  return guide;
}
function renderProjectCheck() {
  architecturePreview.suspend();
  const host = $('other-architecture'); const head = node('div',undefined,'asset-check-heading');
  head.append(node('h1','项目检查'),node('p','查看项目结构，找到值得整理和优化的素材。','muted'));
  const tabs = node('div',undefined,'actions');
  [['assets','素材检查'],['architecture','项目架构图']].forEach(([key,label]) => {
    const tab = button(label,() => { projectCheckTab = key; renderProjectCheck(); });
    tab.setAttribute('aria-pressed',String(projectCheckTab === key)); tabs.append(tab);
  });
  const body = node('div',undefined,'asset-check-body'); replace(host,[head,tabs,body]);
  if (!currentProject()?.valid) { body.append(node('p','请先在顶部选择本地项目。','empty')); return; }
  const entry = assetChecks.get(selected), saved = entry?.result, result = saved?.facts.assets;
  if (entry?.error) body.append(node('p',entry.error,'context-error'));
  if (!saved) {
    if (!entry || entry.loading) body.append(node('p','正在读取已保存的检查结果…','muted'));
    else if (!entry.error) body.append(node('h2','还没有生成项目检查'),node('p','由 AI 阅读项目代码并完成检查后，这里会展示结果。','muted'));
    body.append(projectCheckPrompt(false)); return;
  }
  body.append(node('p','生成于 ' + new Date(saved.publishedAt).toLocaleString() + ' · 依据采集于 ' +
    new Date(saved.facts.collectedAt).toLocaleString() + '。这是已保存快照，之后的项目改动尚未反映。','muted'),projectCheckPrompt(true));
  if (projectCheckTab === 'architecture') {
    const frame = node('iframe',undefined,'project-architecture-frame');
    frame.title = '当前项目架构图'; frame.src = '/project-architecture?project=' + encodeURIComponent(selected);
    body.append(frame); return;
  }
  const actions = node('div',undefined,'actions');
  actions.append(node('h2',currentProject().name + ' · 素材检查'),button('复制检查结果',() => void copyContextText(JSON.stringify(saved,null,2))));
  body.append(actions,node('h3','AI 检查结论'));
  const categories = {unreferenced:'引用情况',duplicate:'冗余资源',oversized:'超大图片',organization:'目录分类'};
  const levels = {info:'说明',medium:'中高风险',high:'高风险'};
  if (!saved.analysis.findings.length) body.append(node('p','AI 未列出具体问题，请结合检查范围和未核实项阅读。','muted'));
  saved.analysis.findings.forEach(finding => {
    const item = node('details',undefined,'asset-check-group');
    item.append(node('summary',categories[finding.category] + ' · ' + levels[finding.severity] + ' · ' + finding.title),node('p',finding.detail));
    finding.evidence.forEach(ref => item.append(node('p',ref.path + ':' + ref.line + ' · ' + ref.symbol,'path muted')));
    body.append(item);
  });
  if (saved.analysis.limitations.length) {
    const limits = node('details',undefined,'asset-check-group'); limits.open = true; limits.append(node('summary','检查范围与未核实项'));
    saved.analysis.limitations.forEach(text => limits.append(node('p',text,'muted'))); body.append(limits);
  }
  body.append(node('h3','CLI 采集依据'),node('p','以下为收集时的本地文件统计。路径、文件名和 UUID 仅提供文本引用线索，未发现引用不代表可以删除。','muted'));
  if (result) {
    const unused = result.assets.filter(asset => !asset.references.length);
    const oversized = result.assets.filter(asset => Math.max(asset.width || 0,asset.height || 0) > 2048)
      .sort((a,b) => Math.max(b.width,b.height) - Math.max(a.width,a.height));
    const flat = result.directories.filter(dir => ['assets','assets/image','assets/images'].includes(dir.path) && dir.count >= 20);
    const summary = node('div',undefined,'asset-check-stats');
    [['资源',result.assets.length],['待核对引用',unused.length],['重复组',result.duplicates.length],['超大图片',oversized.length]].forEach(([label,value]) => {
      const item = node('div'); item.append(node('strong',String(value)),node('span',label)); summary.append(item);
    });
    body.append(summary,node('p',(result.complete ? '约定扫描范围已完成' : '部分检查未完成，请查看下方说明') +
      ' · ' + result.sourceCount + ' 份引用来源 · ' + new Date(result.checkedAt).toLocaleString(),'muted'));
    body.append(assetGroup('未发现静态引用',unused,assetRow,'这些是待核对候选，不等于无用资源。预加载通配规则、动态加载、创作原件和工具依赖需要进一步确认。'));
    body.append(assetGroup('冗余资源 / 完全相同副本',result.duplicates,group => {
      const row = node('div',undefined,'asset-check-row'); const info = node('div');
      info.append(node('strong',group.paths.length + ' 个相同文件 · 多份副本占用 ' + assetBytes(group.extraBytes)));
      group.paths.forEach(file => info.append(node('div',file,'path'))); row.append(info); return row;
    },'按字节数与 SHA-256 确认完全相同的内容，不判断视觉相似。合并前核对各自 UUID 和引用，占用不等于可释放空间。'));
    body.append(assetGroup('超大图片',oversized,asset => {
      const row = assetRow(asset); row.prepend(node('span',Math.max(asset.width,asset.height) > 4096 ? '高风险' : '中高风险','asset-risk')); return row;
    },'长边超过 2048 px 为中高风险，超过 4096 px 为高风险。RGBA 为宽 × 高 × 4 的单层估算，不含 mipmap，不是实测内存；大图集和背景需结合用途判断。尺寸检查支持 PNG、JPEG、WebP。'));
    const dirs = assetGroup('资源目录分布',result.directories,dir => {
      const row = node('div',undefined,'asset-check-row'); row.append(node('strong',dir.path,'path'),node('span',dir.count + ' 个文件 · ' + assetBytes(dir.bytes))); return row;
    },'统计各目录直接包含的文件。assets、assets/image 或 assets/images 直接堆放 20 个以上文件时提示检查分类；数量只是线索，不判定目录一定不合理。');
    if (flat.length) dirs.append(node('p','建议检查分类：' + flat.map(dir => dir.path + '（' + dir.count + ' 个）').join('、'),'asset-risk'));
    dirs.append(node('p','运行素材可按 UI 模块、角色、场景、音效分组；设计原稿、历史版本与过程记录另放创作资料库。活动画布由工具管理，搬动前核对路径、UUID 和构建配置。','muted')); body.append(dirs);
    if (result.warnings.length) {
      const warnings = node('details',undefined,'asset-check-group'); warnings.open = true;
      warnings.append(node('summary','未完成项 · ' + (result.warnings.length + result.omittedWarnings)));
      result.warnings.forEach(message => warnings.append(node('p',message,'path')));
      if (result.omittedWarnings) warnings.append(node('p','另有 ' + result.omittedWarnings + ' 项未展示，可让 AI 在后续检查时复核。'));
      body.append(warnings);
    }
  }
  const compression = node('details',undefined,'asset-check-group');
  compression.append(node('summary','图片压缩与尺寸优化'),
    node('p','Maker 已支持本地 PNG 无损压缩，可让 AI 调用 image compress 输出新副本，保持像素、透明度和尺寸不变。如需压缩，在 AI 对话中说明目标素材和输出位置。','muted'),
    node('p','无损压缩减少文件体积，不降低纹理内存。超大图片需要另外缩尺寸；图集、九宫格、像素风素材应先核对使用方式。','muted')); body.append(compression);
}
`;
