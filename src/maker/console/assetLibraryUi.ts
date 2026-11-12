export const assetLibraryScript = String.raw`
const assetRoles = {runtime:'运行资源',source:'创作原稿',history:'历史备份',unknown:'用途待确认'};
const assetActions = {keep:'保持原位',review:'先核实',move:'建议迁移'};
function assetCopyButton(label,value) {
  const host = node('div'); const status = node('p','','muted'); status.setAttribute('role','status');
  let fallback;
  host.append(button(label,async () => {
    try { await navigator.clipboard.writeText(value); status.textContent = '已复制'; }
    catch (_) {
      if (!fallback) { fallback = node('textarea',undefined,'report-text'); fallback.readOnly=true; fallback.value=value; fallback.setAttribute('aria-label',label + '的手动复制内容'); host.append(fallback); }
      fallback.focus(); fallback.select(); status.textContent = '浏览器未允许自动复制，内容已选中，请手动复制。';
    }
  }),status); return host;
}
function assetKind(asset) {
  const ext = asset.path.split('.').pop().toLowerCase();
  if (['png','jpg','jpeg','webp','gif','svg','bmp','tga','avif'].includes(ext)) return '图片';
  if (['wav','ogg','mp3','m4a','flac'].includes(ext)) return '音频';
  if (['mp4','webm','mov'].includes(ext)) return '视频';
  if (['mdl','glb','gltf','obj','fbx'].includes(ext)) return '模型';
  if (['ttf','otf','woff','woff2'].includes(ext)) return '字体';
  return '其他';
}
function assetUsageState(asset) {
  if (!asset.referenceEvidence) return asset.references.length ? '旧版线索' : '待核对';
  if (asset.referenceEvidence.some(ref => ['path','uuid'].includes(ref.kind) || (ref.kind === 'canvas' && ref.relation === 'uses'))) return '有明确引用';
  if (asset.referenceEvidence.some(ref => ref.kind === 'filename')) return '仅同名线索';
  return '待核对';
}
function assetPreviewable(asset) {
  return asset.modifiedAt !== undefined && asset.width > 0 && asset.height > 0 && /\.(png|jpe?g|webp)$/i.test(asset.path) && asset.bytes <= 16777216 && asset.width * asset.height <= 16777216;
}
function assetImage(asset,saved,key) {
  const box = node('div',undefined,'asset-thumb');
  if (!assetPreviewable(asset)) {
    box.append(node('span',asset.unreadable === 'ktx' ? 'KTX 压缩纹理 · 无法预览' : assetKind(asset) === '图片' ? '图片 · 暂不预览' : assetKind(asset),'muted')); return box;
  }
  const img = node('img'); img.alt = asset.path.split('/').pop(); img.loading = 'lazy'; img.decoding = 'async';
  img.width=asset.width;img.height=asset.height;
  img.src = projectPath(key,'/project-check/image') + '?revision=' + encodeURIComponent(saved.resultRevision) + '&path=' + encodeURIComponent(asset.path);
  img.addEventListener('error',() => { img.remove(); box.append(node('span','图片不可用或已变化，请更新检查','muted')); },{once:true});
  box.append(img); return box;
}
function assetDetail(asset,item,group,saved,key) {
  const dialog = node('dialog',undefined,'asset-detail');
  dialog.setAttribute('aria-label','素材用途与关联'); dialog.dataset.projectKey=key;
  const close = button('关闭',() => dialog.close());
  const heading = node('div',undefined,'heading'); heading.append(node('h2',asset.path.split('/').pop()),close);
  dialog.append(heading);
  if (assetKind(asset) === '图片' && (Math.max(asset.width||0,asset.height||0)>2048 || ['待核对','仅同名线索'].includes(assetUsageState(asset)))) dialog.append(assetImage(asset,saved,key));
  dialog.append(node('p',asset.path,'path'),node('p',assetBytes(asset.bytes) + (asset.width ? ' · ' + asset.width + ' × ' + asset.height : ''),'muted'));
  dialog.append(node('h3',group?.title || '待分类'),node('p',item?.usage || '尚未逐图确认用途，不能仅凭文件名判断。'));
  if (item) {
    dialog.append(node('p',assetRoles[item.role] + ' · ' + assetActions[item.action]),node('p',item.reason));
    if (item.suggestedPath) dialog.append(node('p','建议位置：' + item.suggestedPath,'path'));
    item.evidence.forEach(ref => dialog.append(node('p','AI 依据：' + ref.path + ':' + ref.line + ' · ' + ref.symbol,'path muted')));
  }
  dialog.append(node('h3','来源与使用位置'));
  const refs = asset.referenceEvidence || [];
  const labels = {path:'路径引用',uuid:'UUID 引用',filename:'同名线索（待核实）',registry:'生成注册记录'};
  if (!refs.length) dialog.append(node('p',asset.references.length ? '旧报告线索：' + asset.references.join('、') : '没有记录到关联；不代表无用或可删除。','path muted'));
  refs.forEach(ref => {
    const row = node('div',undefined,'asset-evidence');
    const label = ref.kind === 'canvas' ? (ref.relation === 'origin' ? '来源任务关联（当前内容未比对）' : '画布当前路径引用') : labels[ref.kind];
    row.append(node('strong',label),node('p',ref.title || ref.path,'path'),node('p',ref.path + ':' + ref.line,'path muted'));
    if (ref.canvasId) row.append(node('p','画布 ' + ref.canvasId + ' · 卡片 ' + ref.nodeId,'path muted'));
    if (ref.cachePath) row.append(node('p','当前卡片使用独立缓存：' + ref.cachePath + '。此关联来自成功交付记录，不代表缓存与原图当前内容相同。','path muted'));
    dialog.append(row);
  });
  if (asset.omittedReferences) dialog.append(node('p','另有 ' + asset.omittedReferences + ' 条线索未展开，整理前需继续复核。','muted'));
  dialog.append(node('p','画布缓存与原图分别管理。注册记录和来源任务不证明运行时使用；动态引用、外部工作页仍需核实。','muted'));
  dialog.append(assetCopyButton('复制素材路径',asset.path));
  document.body.append(dialog); dialog.addEventListener('close',() => dialog.remove(),{once:true}); dialog.showModal(); close.focus();
}
function assetOrganization(saved,body,key) {
  const organization = saved.analysis.organization;
  const items = organization?.items || [];
  body.append(node('h2','整理前，先看影响范围'),node('p','这里是 AI 的整理建议，尚未移动任何文件。用途分类不要求马上改目录；共享素材保留一份，画布分组不复制原图。','muted'));
  if (!items.length) { body.append(node('p','尚未生成逐项整理建议，请让 AI 更新检查结果。','asset-callout')); return; }
  const assets = new Map(saved.facts.assets.assets.map(asset => [asset.path,asset]));
  const groups = new Map(organization.groups.map(group => [group.id,group]));
  for (const action of ['move','review','keep']) {
    const rows = items.filter(item => item.action === action);
    const section = assetGroup(assetActions[action],rows,item => {
      const row = node('div',undefined,'asset-check-row'),info = node('div');
      info.append(node('strong',item.path,'path'),node('p',item.reason));
      if (item.suggestedPath) info.append(node('p','建议位置 → ' + item.suggestedPath,'path'));
      info.append(node('p',assetRoles[item.role] + ' · ' + (groups.get(item.groupId)?.title || '待分类'),'muted'));
      const asset = assets.get(item.path);
      if (asset && assetKind(asset) === '图片') row.append(assetImage(asset,saved,key));
      row.append(info);
      if (asset) row.append(button('查看依据',() => assetDetail(asset,item,groups.get(item.groupId),saved,key))); return row;
    },action === 'move' ? '建议位置已做路径与碰撞校验；实际迁移前仍需核对动态引用、meta/UUID、构建规则和外部工作页，并确认清单。' : action === 'review' ? '先解决这些不确定项，再决定是否移动。' : '当前位置合理或有保留理由，无需为了分类而搬动。');
    section.open = action === 'move'; body.append(section);
  }
  const moves = items.filter(item => item.action === 'move');
  const prompt = '请根据项目「' + currentProject().name + '」的已保存项目检查结果准备素材整理计划。项目路径：' + currentProject().path + '。报告版本：' + saved.resultRevision + '。' +
    '先用 project-check show 读取并核对版本，再检查当前文件状态，逐项核对建议路径、实际引用、meta/UUID、生成注册表、构建忽略规则与画布缓存。' +
    '来源画布与使用画布分开；不直接改画布内部状态，不删除、去重或压缩。明确列出需要额外检查的外部资料范围。输出旧新路径、引用修改、阻塞项与撤回方式，等我确认具体清单后再执行。';
  const instructions = node('details',undefined,'asset-check-group'); instructions.append(node('summary','交给 AI 准备整理计划 · ' + moves.length + ' 项迁移建议'));
  const box = node('textarea',undefined,'report-text'); box.readOnly = true; box.value = prompt; box.setAttribute('aria-label','素材整理计划指令');
  instructions.append(box,assetCopyButton('复制整理指令',prompt),assetCopyButton('复制建议 JSON',JSON.stringify({project:currentProject().path,resultRevision:saved.resultRevision,organization},null,2)));
  body.append(instructions);
}
function assetSizeOverview(result,body,saved,key) {
  const totals = new Map(); let total = 0;
  result.assets.forEach(asset => { const kind = assetKind(asset); totals.set(kind,(totals.get(kind)||0)+asset.bytes); total += asset.bytes; });
  const panel = node('div',undefined,'asset-callout'); panel.append(node('h3','素材磁盘占用 · ' + assetBytes(total)),node('p','这是采集范围内的文件体积，不是构建包体，也不是可释放空间。','muted'));
  [...totals.entries()].sort((a,b) => b[1]-a[1]).forEach(([kind,bytes]) => {
    const row = node('div',undefined,'asset-size-row'); const meter = node('meter'); meter.min=0; meter.max=total||1; meter.value=bytes; meter.setAttribute('aria-label',kind + '占用');
    row.append(node('span',kind),meter,node('span',assetBytes(bytes))); panel.append(row);
  }); const items=new Map((saved.analysis.organization?.items||[]).map(item=>[item.path,item])),groups=new Map((saved.analysis.organization?.groups||[]).map(group=>[group.id,group]));
  const largest=node('div',undefined,'check-file-grid');result.assets.slice().sort((a,b)=>b.bytes-a.bytes).slice(0,12).forEach(asset=>largest.append(assetTile(asset,saved,key,items,groups)));
  body.append(panel,node('h3','体积最大的素材'),node('p','优先结合用途、尺寸和构建范围评估收益；文件大不等于应压缩或删除。','muted'),largest);
}
`;
