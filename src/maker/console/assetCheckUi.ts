export const assetCheckScript = String.raw`
const assetChecks = new Map();
// The inline preview frame of the current report; hidden/re-rendered pages pause its animations through it.
let architectureFrame = null;
function assetBytes(bytes) {
  return bytes >= 1048576 ? (bytes / 1048576).toFixed(2) + ' MiB' : (bytes / 1024).toFixed(1) + ' KiB';
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
const autoChecked=new Set();
const projectCheckVisible=key=>!disposed&&selected===key&&page==='other'&&otherTab==='architecture';
async function loadProjectCheck() {
  const key = selected;
  if (!currentProject()?.valid || offline) return;
  const entry = assetChecks.get(key) || {result:null,error:''};
  if (entry.loading || entry.running) return;
  entry.loading = true; entry.error = ''; assetChecks.set(key,entry);
  try { entry.result = (await api(projectPath(key,'/project-check'))).result; }
  catch (error) { entry.error = error.message || '读取结果失败，请确认本地服务在线后重新打开页面。'; }
  finally {
    entry.loading = false;
    // First visit to a project without a report: run the read-only automatic check once.
    const firstRun = !entry.result && !entry.error && !autoChecked.has(key);
    if (firstRun) autoChecked.add(key);
    if (projectCheckVisible(key) && !firstRun) renderProjectCheck();
    if (firstRun) void runProjectCheck(key,false);
  }
}
async function runProjectCheck(key,replace) {
  const entry = assetChecks.get(key) || {result:null,error:''};
  if (entry.running) return;
  entry.running = true; entry.startedAt = Date.now(); entry.error = ''; assetChecks.set(key,entry);
  if (projectCheckVisible(key)) renderProjectCheck();
  try {
    await api(projectPath(key,'/project-check/run'),{method:'POST',body:{replace:Boolean(replace)},timeoutMs:600000});
    entry.result = (await api(projectPath(key,'/project-check'))).result;
  } catch (error) { entry.error = error.message || '检查失败，请重试。'; }
  finally { entry.running = false; if (projectCheckVisible(key)) renderProjectCheck(); }
}
function confirmRecheck(key,saved) {
  if (saved.analysis.auto) { void runProjectCheck(key,false); return; }
  checkDialog('重新检查',(content,dialog) => {
    content.append(node('p','当前结果包含 AI 阅读源码后写的模块职责说明和素材整理建议。重新检查是页面自动扫描，只按目录分组、不含这些说明，会替换当前结果。'),
      node('p','不会修改项目文件。需要保留说明时，请改用「让 AI 更新」。','muted'));
    const actions = node('div',undefined,'check-actions');
    actions.append(button('取消',() => dialog.close()),button('替换并重新检查',() => { dialog.close(); void runProjectCheck(key,true); },{className:'primary'}));
    content.append(actions);
  });
}
function checkLoading(label,startedAt) {
  const wrap = node('div',undefined,'check-loading'), head = node('div',undefined,'check-loading-head'), row = node('div',undefined,'check-loading-row');
  const text = node('div',undefined,'check-loading-text'), title = node('strong',label), sub = node('span','只读扫描源码与素材，不会修改项目文件。');
  text.append(title,sub); row.append(node('span',undefined,'check-spinner'),text); head.append(row,node('div',undefined,'check-progress'));
  head.setAttribute('role','status'); wrap.append(head);
  if (startedAt) {
    const tick = () => {
      if (!head.isConnected) { clearInterval(timer); return; }
      const seconds = Math.floor((Date.now() - startedAt) / 1000);
      sub.textContent = '只读扫描源码与素材，不会修改项目文件。已用时 ' + seconds + ' 秒' + (seconds >= 30 ? '，项目较大，请稍候。' : '。');
    };
    const timer = setInterval(tick,1000); tick();
  }
  const skeleton = (cls) => node('div',undefined,'check-skeleton ' + cls);
  const bar = (blockClass,withBody) => {
    const block = node('div',undefined,'check-block ' + blockClass), top = node('div',undefined,'check-bar');
    top.append(skeleton('check-skeleton-title')); block.append(top);
    if (withBody) { const body = node('div',undefined,'check-block-body'), stats = node('div',undefined,'check-stats'), grid = node('div',undefined,'check-skeleton-grid');
      for (let i = 0; i < 4; i++) { stats.append(skeleton('check-skeleton-stat')); grid.append(skeleton('check-skeleton-tile')); }
      body.append(stats,grid); block.append(body); block.classList.add('is-open'); }
    return block;
  };
  wrap.append(bar('',false),bar('',true)); return wrap;
}
function projectCheckPrompt(hasResult) {
  const guide = node('details',undefined,'asset-check-group'); guide.open = !hasResult;
  guide.append(node('summary',hasResult ? '让 AI 更新检查结果' : '通过 AI 对话生成项目检查'));
  const project = currentProject();
  const prompt = '请使用 Maker 内置 maker-project-check Skill 检查项目「' + project.name + '」，项目绝对路径：' + project.path + '。' +
    '先用 project-check collect 收集依据，再阅读真实源码，整理模块职责、模块关系和有源码依据的业务流程。' +
    '检查未被引用的资源候选、完全重复资源、超过 2K/4K 的图片，以及目录分类是否符合素材用途。' +
    '区分运行资源、创作原稿、历史文件和活动画布，说明动态引用与未核实项。' +
    '按 capabilities 的 organization 契约补充用途分组、逐项用途与保留/核实/迁移建议；看图和实际使用位置后分类，不确定的保留待分类。' +
    '核对生成注册表与画布来源/使用关系，画布缓存不随原图搬迁。' +
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

function checkDialog(title,fill,wide=false) {
  const dialog = node('dialog',undefined,'check-dialog' + (wide ? ' check-dialog-wide' : ''));
  dialog.setAttribute('aria-label',title); dialog.dataset.projectKey=selected;
  const head=node('div',undefined,'check-dialog-head'), close=button('关闭',()=>dialog.close());
  head.append(node('h2',title),close); const content=node('div',undefined,'check-dialog-content');
  dialog.append(head,content); fill(content,dialog);
  document.body.append(dialog); dialog.addEventListener('close',()=>dialog.remove(),{once:true});
  dialog.showModal(); close.focus(); return dialog;
}
function openCheckArchitecture(key,moduleId='') {
  checkDialog('项目架构图',content=>{
    const frame=node('iframe',undefined,'project-architecture-frame'); frame.title='当前项目架构图';
    frame.src='/project-architecture?project='+encodeURIComponent(key)+'&module='+encodeURIComponent(moduleId); content.append(frame);
  },true);
}
window.addEventListener('message',event=>{
  const frame=architectureFrame;
  if(disposed || page!=='other' || otherTab!=='architecture' || event.origin!==location.origin || !frame || event.source!==frame.contentWindow) return;
  if(event.data?.type==='maker:architecture-height' && Number.isFinite(event.data.height)){frame.style.height=Math.min(Math.max(event.data.height+2,240),1400)+'px';return;}
  if(event.data?.type!=='maker:architecture-expand' || !assetChecks.get(selected)?.result?.analysis.modules.some(module=>module.id===event.data.groupId)) return;
  openCheckArchitecture(selected,event.data.groupId);
});
// A report section: a full-width title bar plus a body. Collapsible sections toggle when the bar is clicked.
function checkBlock(title,meta,options={}) {
  const block=node('section',undefined,'check-block'),bar=node('div',undefined,'check-bar'),body=node('div',undefined,'check-block-body');
  const label=node('div',undefined,'check-bar-title'),actions=node('div',undefined,'check-actions');
  if(options.collapsible)label.append(node('span','›','check-chevron'));
  label.append(node('h2',title),node('span',meta,'check-bar-meta'));
  (options.actions||[]).forEach(action=>actions.append(action));bar.append(label,actions);block.append(bar,body);
  let open=options.open!==false;
  const sync=()=>{block.classList.toggle('is-open',open);body.hidden=!open;if(options.collapsible)bar.setAttribute('aria-expanded',String(open));options.onChange?.(open,body);};
  if(options.collapsible){
    bar.classList.add('is-collapsible');bar.tabIndex=0;bar.setAttribute('role','button');bar.setAttribute('aria-label',title);
    const toggle=()=>{open=!open;sync();options.onToggle?.(open);};
    bar.addEventListener('click',toggle);
    bar.addEventListener('keydown',event=>{if(event.target===bar&&(event.key==='Enter'||event.key===' ')){event.preventDefault();toggle();}});
    actions.addEventListener('click',event=>event.stopPropagation());
  }
  sync();return {block,body};
}
const architectureOpen=new Map();
function checkArchitecture(saved,body,key) {
  let frame;
  const detail=button('查看详细',()=>openCheckArchitecture(key));
  const {block,body:content}=checkBlock('项目架构',saved.analysis.modules.length+' 个模块',{
    collapsible:true,open:Boolean(architectureOpen.get(key)),actions:[detail],
    onToggle:open=>architectureOpen.set(key,open),
    onChange:(open,host)=>{
      if(open&&!frame){
        frame=architectureFrame=node('iframe',undefined,'project-architecture-frame check-architecture-frame');frame.title='项目架构概览';
        frame.src='/project-architecture?project='+encodeURIComponent(key)+'&view=compact';
        host.append(frame,node('p','连线为静态引用 · 点击模块查看详情','check-graph-note muted'));
      }else if(!open&&frame){host.replaceChildren();if(architectureFrame===frame)architectureFrame=null;frame=undefined;}
    },
  });
  body.append(block);
}
// Load the next batch when the button scrolls near view; re-observing after each click re-checks for short pages.
function autoLoadMore(more) {
  const watcher=new IntersectionObserver(entries=>{
    if(!more.isConnected){watcher.disconnect();return;}
    if(!more.hidden&&entries.some(entry=>entry.isIntersecting)){more.click();watcher.unobserve(more);watcher.observe(more);}
  },{rootMargin:'300px'});
  watcher.observe(more);
}
function assetTile(asset,saved,key,items,groups) {
  const item=items.get(asset.path),state=Math.max(asset.width||0,asset.height||0)>2048?'超大图片':assetUsageState(asset);
  const tile=button('',()=>assetDetail(asset,item,groups.get(item?.groupId),saved,key));tile.className='check-problem check-tile';tile.setAttribute('aria-label','查看素材 '+asset.path);tile.title=asset.path;
  const caption=node('span',undefined,'check-problem-caption');
  caption.append(node('strong',asset.path.split('/').pop()),node('span',(asset.width?asset.width+' × '+asset.height+' · ':'')+assetBytes(asset.bytes),'muted'));
  const folder=asset.path.split('/').slice(0,-1).join('/');
  caption.append(node('span',item?.usage||folder,'check-tile-note muted'));
  if(state!=='有明确引用')caption.append(node('span',state,state==='超大图片'?'check-badge check-badge-warm':'check-badge'));
  tile.append(assetImage(asset,saved,key),caption);return tile;
}
function checkAssetList(title,assets,saved,key,note) {
  checkDialog(title,content=>{
    if(note)content.append(node('p',note,'muted'));
    const search=node('input');search.type='search';search.placeholder='搜索文件名或路径';search.setAttribute('aria-label','搜索资源');
    const list=node('div',undefined,'check-file-grid'),status=node('p','','muted');status.setAttribute('role','status');
    const items=new Map((saved.analysis.organization?.items||[]).map(item=>[item.path,item]));
    const groups=new Map((saved.analysis.organization?.groups||[]).map(group=>[group.id,group]));
    let rows=assets,shown=0; const more=button('显示更多',append);
    function append(){
      rows.slice(shown,shown+30).forEach(asset=>list.append(assetTile(asset,saved,key,items,groups)));
      shown=Math.min(shown+30,rows.length);more.hidden=shown>=rows.length;status.textContent=rows.length?'已显示 '+shown+' / '+rows.length+' 项':'没有符合条件的资源';
    }
    search.addEventListener('input',()=>{rows=assets.filter(asset=>asset.path.toLowerCase().includes(search.value.trim().toLowerCase()));shown=0;list.replaceChildren();append();});
    content.append(search,status,list,more);append();autoLoadMore(more);
  },true);
}
function checkReportDetails(saved,content) {
  content.append(node('p','报告生成：'+new Date(saved.publishedAt).toLocaleString(),'muted'),node('p','依据采集：'+new Date(saved.facts.collectedAt).toLocaleString(),'muted'));
  const result=saved.facts.assets;
  const findings=saved.analysis.findings;
  content.append(node('h3','检查结论'));
  if(!findings.length)content.append(node('p','本次未列出具体结论，请结合检查范围阅读。'));
  findings.forEach(finding=>{
    const row=node('details',undefined,'asset-check-group');row.append(node('summary',finding.title),node('p',finding.detail));
    finding.evidence.forEach(ref=>row.append(node('p',ref.path+':'+ref.line+' · '+ref.symbol,'path muted')));content.append(row);
  });
  content.append(node('h3','检查范围'));
  saved.analysis.limitations.forEach(text=>content.append(node('p',text,'muted')));
  saved.facts.architecture.notes.forEach(text=>content.append(node('p',text,'muted')));
  for(const facts of [saved.facts.architecture,result]){
    (facts.warnings||[]).forEach(text=>content.append(node('p',text,'path muted')));
    if(facts.omittedWarnings)content.append(node('p','另有 '+facts.omittedWarnings+' 条范围提示未展开。','muted'));
  }
  content.append(node('p','报告是保存时的快照；此后修改尚未反映。未发现引用不代表可删除，磁盘占用不代表构建包体。','muted'),assetCopyButton('复制完整报告',JSON.stringify(saved,null,2)));
}
function checkAssets(saved,body,key) {
  const result=saved.facts.assets,assets=result.assets;
  const items=new Map((saved.analysis.organization?.items||[]).map(item=>[item.path,item]));
  const groups=new Map((saved.analysis.organization?.groups||[]).map(group=>[group.id,group]));
  const reviewed=asset=>{const item=items.get(asset.path);return Boolean(item?.action==='keep'&&item.role!=='unknown'&&item.evidence?.length>0);};
  const unused=assets.filter(asset=>['待核对','仅同名线索'].includes(assetUsageState(asset)));
  const oversized=assets.filter(asset=>Math.max(asset.width||0,asset.height||0)>2048).sort((a,b)=>Math.max(b.width,b.height)-Math.max(a.width,a.height));
  const total=assets.reduce((sum,asset)=>sum+asset.bytes,0);
  const blk=checkBlock('素材检查',assets.length+' 个文件 · '+assetBytes(total));
  const section=blk.body;
  const stats=node('div',undefined,'check-stats');
  const metric=(label,value,note,tone,action)=>{
    const tile=button('',action);tile.className='check-stat check-tile '+tone;
    tile.append(node('span',label,'check-stat-label'),node('strong',String(value)),node('span',note,'check-stat-note'));stats.append(tile);
  };
  metric('资源总量',assets.length,assetBytes(total)+' · 磁盘占用','check-neutral',()=>checkAssetList('全部资源',assets,saved,key,'仅统计本次采集的 assets 文件。'));
  metric('超大图片',oversized.length,'长边超过 2048 px','check-warm',()=>checkAssetList('超大图片',oversized,saved,key,'超过 2K 建议核对，超过 4K 优先关注。大背景和图集可能合理。'));
  metric('引用待核对',unused.length,'未找到明确引用','check-caution',()=>checkAssetList('引用待核对',unused,saved,key,'包含未发现引用或只有同名线索的资源。动态加载仍需核实，不代表可以删除。'));
  metric('重复资源',result.duplicates.length,'组内容完全相同','check-neutral',()=>checkDialog('重复资源',content=>{
    const byPath=new Map(assets.map(asset=>[asset.path,asset]));
    content.append(assetGroup('完全相同的文件',result.duplicates,group=>{
      const row=node('div',undefined,'asset-evidence check-dup-row'),info=node('div'),first=byPath.get(group.paths[0]);
      info.append(node('strong',group.paths.length+' 个副本 · 额外占用 '+assetBytes(group.extraBytes)));
      group.paths.slice(0,3).forEach(file=>info.append(node('p',file,'path')));
      if(group.paths.length>3){const rest=node('details'),more=node('div');rest.append(node('summary','其余 '+(group.paths.length-3)+' 个文件'),more);group.paths.slice(3).forEach(file=>more.append(node('p',file,'path')));info.append(rest);}
      if(first&&assetKind(first)==='图片')row.append(assetImage(first,saved,key));row.append(info);return row;
    },'合并前需核对 UUID 和引用；额外占用不等于可以释放的空间。'));content.querySelector('details').open=true;
  }));
  section.append(stats);
  // Many files sitting directly in one folder are hard to find; frame sequences and generated UI workspaces are expected to be large.
  result.directories
    .filter(dir=>dir.path.startsWith('assets/')&&dir.count>=100&&!/(^|\/)frames$|^assets\/ui\/ui015-/.test(dir.path))
    .sort((a,b)=>b.count-a.count).slice(0,2).forEach(dir=>{
      const hint=node('div',undefined,'check-hint'),info=node('div'),actions=node('div',undefined,'check-actions');
      info.append(node('strong','目录待整理：'+dir.path+' 直接放了 '+dir.count+' 个文件'),
        node('p','共 '+assetBytes(dir.bytes)+'，占全部素材 '+Math.max(1,Math.round(dir.count/assets.length*100))+'%。文件多又没按用途分子目录，后续很难查找，建议按界面、角色、场景等归类。','muted'));
      actions.append(button('查看这些文件',()=>checkAssetList(dir.path+' 下直接存放的文件',assets.filter(asset=>asset.path.split('/').slice(0,-1).join('/')===dir.path),saved,key,'这些文件直接放在该目录，没有放进子目录。')),
        button('让 AI 给整理建议',()=>checkDialog('更新项目检查',content=>{const guide=projectCheckPrompt(true);guide.open=true;content.append(guide);})));
      hint.append(info,actions);section.append(hint);
    });
  const problemPaths=new Set([...oversized,...unused].map(asset=>asset.path));
  const problemImages=assets.filter(asset=>assetKind(asset)==='图片'&&problemPaths.has(asset.path)).sort((a,b)=>Number(Math.max(b.width||0,b.height||0)>2048)-Number(Math.max(a.width||0,a.height||0)>2048)||Number(reviewed(a))-Number(reviewed(b))||b.bytes-a.bytes);
  const problemHead=node('div',undefined,'check-section-head');problemHead.append(node('h3','需要关注的图片'));
  if(problemImages.length)problemHead.append(button('查看全部 '+problemImages.length+' 张',()=>checkAssetList('需要关注的图片',problemImages,saved,key,'仅列出超大图及引用待核对的图片。')));
  section.append(problemHead,node('p',problemImages.length?'仅展示超大图与引用待核对的图片；未发现引用不代表可删除。':'本次已检查范围内，未发现这两类图片问题。','check-note muted'));
  const grid=node('div',undefined,'check-problem-grid');
  const previewCards=[];let columnCount=0;
  function layoutPreviews(force=false){
    const width=grid.clientWidth;if(!width)return;
    const count=Math.max(1,Math.min(8,Math.floor((width+14)/234)));
    if(!force&&count===columnCount)return;columnCount=count;
    const columns=Array.from({length:count},()=>node('div',undefined,'check-image-column'));
    const heights=Array(count).fill(0),cardWidth=(width-(count-1)*14)/count;
    // Use the original aspect ratio to keep tall artwork from leaving whole columns empty.
    previewCards.forEach(({card,asset})=>{
      const index=heights.indexOf(Math.min(...heights));columns[index].append(card);
      heights[index]+=Math.max(48,cardWidth*asset.height/asset.width)+140;
    });
    grid.style.gridTemplateColumns='repeat('+count+',minmax(0,1fr))';grid.replaceChildren(...columns);
  }
  const previewResize=new ResizeObserver(()=>{if(!grid.isConnected){previewResize.disconnect();return;}layoutPreviews();});
  previewResize.observe(grid);
  const previews=new Map();
  problemImages.filter(assetPreviewable).forEach(asset=>{const id=asset.sha256||asset.path;const group=previews.get(id)||[];group.push(asset);previews.set(id,group);});
  const unavailable=problemImages.filter(asset=>!assetPreviewable(asset));
  if(unavailable.length){const unavailableButton=button(unavailable.length+' 张暂不可预览 · 查看清单',()=>checkAssetList('暂不可预览的图片',unavailable,saved,key,'缺少本次摘要、格式不支持或超过预览上限；这些图片仍计入问题统计。'));unavailableButton.className='check-unavailable';section.append(unavailableButton);}
  const previewGroups=[...previews.values()];let shown=0;
  const more=button('查看更多问题图片',()=>showPreviews());more.className='check-more';
  function showPreviews(){previewGroups.slice(shown,shown+12).forEach(copies=>{
    const asset=copies[0];
    const item=items.get(asset.path),big=Math.max(asset.width||0,asset.height||0)>2048;
    const card=button('',()=>assetDetail(asset,item,groups.get(item?.groupId),saved,key));card.className='check-problem check-tile';card.setAttribute('aria-label','查看问题图片 '+asset.path);
    const caption=node('span',undefined,'check-problem-caption');caption.append(node('span',big?'超大图片':reviewed(asset)?'AI 已复核 · 保留':'引用待核对',big?'check-badge check-badge-warm':'check-badge'),node('strong',asset.path.split('/').pop()),node('span',(asset.width?asset.width+' × '+asset.height+' · ':'')+assetBytes(asset.bytes),'muted'));
    if(copies.length>1)caption.append(node('span','含 '+copies.length+' 个相同文件','muted'));
    card.append(assetImage(asset,saved,key),caption);previewCards.push({card,asset});
  });shown=Math.min(shown+12,previewGroups.length);more.hidden=shown>=previewGroups.length;
  more.textContent='查看更多图片（'+shown+' / '+previewGroups.length+' 组）';layoutPreviews(true);}
  showPreviews();section.append(grid,more);
  const extras=node('div',undefined,'check-extras');
  extras.append(button('体积与目录',()=>checkDialog('资源统计',content=>{
    assetSizeOverview(result,content,saved,key);content.append(assetGroup('目录分布',result.directories,dir=>{const row=node('p',dir.path+' · '+dir.count+' 项 · '+assetBytes(dir.bytes),'path');return row;},'按各目录直接包含的文件统计。'));
  })),button('检查结论与范围',()=>checkDialog('检查结论与范围',content=>checkReportDetails(saved,content))));
  if(saved.analysis.organization?.items.length)extras.append(button('整理建议',()=>checkDialog('整理建议',content=>assetOrganization(saved,content,key))));
  section.append(extras);body.append(blk.block);
}
function renderProjectCheck() {
  architecturePreview.suspend();
  document.querySelectorAll('dialog[data-project-key]').forEach(dialog=>{if(dialog.dataset.projectKey!==selected)dialog.close();});
  const host=$('other-architecture'),entry=assetChecks.get(selected),saved=entry?.result;
  const body=node('div',undefined,'check-report');replace(host,[body]);
  if(!currentProject()?.valid){body.append(node('p','请先在顶部选择本地项目。','empty'));return;}
  if(entry?.running){body.append(checkLoading('正在检查项目…',entry.startedAt));return;}
  if(!saved){
    if(!entry||entry.loading){body.append(checkLoading('正在读取检查结果…'));return;}
    const empty=node('div',undefined,'check-empty');
    empty.append(node('h2',entry.error?'检查没有完成':'还没有检查结果'),node('p',entry.error||'开始检查会只读扫描源码与素材，生成架构和素材报告，不会修改项目文件。','muted'));
    const actions=node('div',undefined,'check-actions');
    actions.append(button(entry.error?'重新检查':'开始检查',()=>{void runProjectCheck(selected,false);},{className:'primary'}));
    empty.append(actions);body.append(empty,projectCheckPrompt(false));return;
  }
  const toolbar=node('div',undefined,'check-toolbar'),info=node('div',undefined,'check-toolbar-info');
  const time=new Date(saved.publishedAt).toLocaleString(undefined,{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
  info.append(node('span',time+(saved.analysis.auto?' 自动检查 · 模块按目录分组，职责说明可让 AI 补充':' 保存的检查结果'),'muted'));
  if(entry?.error)info.append(node('span',entry.error,'check-inline-error'));
  if(!saved.facts.assets.complete||saved.facts.architecture.notes.length){
    const notice=button('本次检查有范围提示 · 查看详情',()=>checkDialog('检查范围',content=>checkReportDetails(saved,content)));notice.className='check-scope';info.append(notice);
  }
  const actions=node('div',undefined,'check-actions');
  actions.append(button('重新检查',()=>confirmRecheck(selected,saved)),button('让 AI 更新',()=>checkDialog('更新项目检查',content=>{const guide=projectCheckPrompt(true);guide.open=true;content.append(guide);})));
  toolbar.append(info,actions);body.append(toolbar);
  checkArchitecture(saved,body,selected);checkAssets(saved,body,selected);
}
`;
