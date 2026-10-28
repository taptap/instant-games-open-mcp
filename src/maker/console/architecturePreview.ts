/** Local, illustrative player; no project files or runtime events are read. */
export const architecturePreviewScript = String.raw`
const architecturePreview = (() => {
  const duration = 30;
  const modules = [
    {id:'assets', title:'资源服务', detail:'场景 · 图集 · 音效', tag:'ASSETS', tone:'amber'},
    {id:'boot', title:'游戏入口', detail:'初始化与生命周期', tag:'BOOT', tone:'amber'},
    {id:'scene', title:'场景管理', detail:'主菜单 → 游戏关卡', tag:'SCENE', tone:'cyan'},
    {id:'input', title:'玩家输入', detail:'触控 · 键鼠 · 操作意图', tag:'INPUT', tone:'cyan'},
    {id:'core', title:'玩法核心', detail:'状态机 · 规则 · 战斗结算', tag:'GAMEPLAY', tone:'mint'},
    {id:'world', title:'关卡与实体', detail:'角色 · 敌人 · 碰撞', tag:'WORLD', tone:'mint'},
    {id:'ui', title:'界面反馈', detail:'HUD · 动效 · 结果面板', tag:'VIEW', tone:'rose'},
    {id:'save', title:'进度存档', detail:'关卡进度 · 玩家数据', tag:'SAVE', tone:'rose'}
  ];
  const phases = [
    {title:'准备游戏世界', caption:'资源就绪，游戏入口创建场景，玩法核心进入待机状态。',
      nodes:['assets','boot','scene','core'], edges:['assets-boot','boot-scene','scene-core'], log:'资源准备完成 → 创建场景 → 初始化玩法状态'},
    {title:'接收玩家操作', caption:'玩家的操作转为玩法指令，由核心规则判断是否可以执行。',
      nodes:['input','core'], edges:['input-core'], log:'收到操作意图 → 校验当前状态 → 生成玩法指令'},
    {title:'驱动关卡与实体', caption:'玩法核心驱动角色和敌人，关卡实体执行移动、攻击与碰撞。',
      nodes:['core','world'], edges:['core-world'], log:'派发玩法指令 → 更新角色与敌人 → 执行关卡逻辑'},
    {title:'呈现即时反馈', caption:'玩法状态传给界面，玩家看到血量、得分和本次操作的反馈。',
      nodes:['core','ui'], edges:['core-ui'], log:'玩法状态更新 → 刷新 HUD → 播放界面反馈'},
    {title:'保存本次进度', caption:'示例关卡完成后保存进度，并把保存结果呈现在界面中。',
      nodes:['world','save','ui'], edges:['world-save','save-ui'], log:'关卡完成 → 写入进度 → 展示保存结果'}
  ];
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let time = 0, speed = 1, playing = false, frame = 0, previous = 0;
  let root, refs, observer, compact = false, contextKey, visited = false;
  const nodes = new Map(), wires = new Map();
  function svg(tag, attrs, value) {
    const el = svgNode(tag, attrs);
    if (value !== undefined) el.textContent = value;
    return el;
  }
  function phaseIndex() { return Math.min(phases.length - 1, Math.floor(time / 6)); }
  function clock(t) { return '00:' + String(Math.floor(t)).padStart(2, '0'); }
  function pause() {
    playing = false;
    cancelAnimationFrame(frame); frame = 0; previous = 0;
    if (refs) update();
  }
  function suspend() {
    pause(); observer?.disconnect(); observer = undefined;
    root = null; refs = null; nodes.clear(); wires.clear();
  }
  function tick(now) {
    if (!playing || !root?.isConnected || page !== 'other' || document.hidden || disposed) { pause(); return; }
    if (previous) time = Math.min(duration, time + (now - previous) / 1000 * speed);
    previous = now;
    if (time >= duration) playing = false;
    update();
    if (playing) frame = requestAnimationFrame(tick);
    else { frame = 0; previous = 0; }
  }
  function play() {
    if (document.hidden || disposed) return;
    if (time >= duration) time = 0;
    playing = true; previous = 0;
    cancelAnimationFrame(frame); frame = requestAnimationFrame(tick); update();
  }
  function seek(value) { time = Math.max(0, Math.min(duration, value)); previous = 0; update(); }
  function drawGraph() {
    nodes.clear(); wires.clear();
    const board = refs.board; board.replaceChildren();
    board.dataset.layout = compact ? 'compact' : 'wide';
    board.setAttribute('viewBox', compact ? '0 0 360 720' : '0 0 1140 510');
    const defs = svg('defs', {});
    const marker = svg('marker', {id:'arch-arrow', viewBox:'0 0 10 10', refX:9, refY:5,
      markerWidth:5, markerHeight:5, orient:'auto-start-reverse'});
    marker.append(svg('path', {d:'M 1 1 L 9 5 L 1 9', fill:'none', stroke:'var(--arch-wire)', 'stroke-width':1.5}));
    defs.append(marker); board.append(defs);
    const positions = compact ? {
      assets:[18,35], boot:[198,35], scene:[198,205], input:[18,205],
      core:[18,375], world:[198,375], ui:[18,565], save:[198,565]
    } : {
      assets:[44,322], boot:[44,96], scene:[324,96], input:[324,322],
      core:[604,96], world:[884,96], ui:[604,322], save:[884,322]
    };
    const routes = compact ? {
      'assets-boot':[[162,80],[198,80]],
      'boot-scene':[[270,125],[270,205]],
      'scene-core':[[270,295],[270,336],[130,336],[130,375]],
      'input-core':[[90,295],[90,375]],
      'core-world':[[162,420],[198,420]],
      'core-ui':[[90,465],[90,565]],
      'world-save':[[270,465],[270,565]],
      'save-ui':[[198,610],[162,610]]
    } : {
      'assets-boot':[[150,322],[150,190]],
      'boot-scene':[[256,143],[324,143]],
      'scene-core':[[536,143],[604,143]],
      'input-core':[[430,322],[430,252],[652,252],[652,190]],
      'core-world':[[816,143],[884,143]],
      'core-ui':[[734,190],[734,322]],
      'world-save':[[990,190],[990,322]],
      'save-ui':[[884,369],[816,369]]
    };
    if (!compact) {
      board.append(svg('text', {x:44,y:51,class:'arch-map-label'}, '01 / 世界与规则'),
        svg('text', {x:324,y:467,class:'arch-map-label'}, '02 / 输入与反馈'));
    }
    Object.entries(routes).forEach(([id,points]) => {
      const d = points.map((p,i) => (i ? 'L' : 'M') + p.join(' ')).join(' ');
      const group = svg('g', {class:'arch-wire'});
      const line = svg('path', {d,class:'arch-wire-base','marker-end':'url(#arch-arrow)'});
      const lit = svg('path', {d,class:'arch-wire-lit'});
      group.append(line,lit);
      const dots = Array.from({length:7}, (_,i) => svg('circle', {r:i ? 2.6 : 4,class:'arch-packet'}));
      group.append(...dots); board.append(group);
      wires.set(id, {group,line,lit,dots,length:line.getTotalLength()});
    });
    const shortDetails = ['图集 / 音效','生命周期','菜单 / 关卡','操作意图','规则 / 状态机','角色 / 碰撞','HUD / 结果','进度 / 玩家数据'];
    modules.forEach((item,index) => {
      const [x,y] = positions[item.id], w = compact ? 144 : 212, h = compact ? 90 : 94;
      const group = svg('g', {transform:'translate(' + x + ' ' + y + ')',class:'arch-node arch-' + item.tone});
      group.append(svg('rect', {width:w,height:h,rx:8,class:'arch-node-body'}));
      const border = svg('rect', {x:1,y:1,width:w-2,height:h-2,rx:7,pathLength:100,class:'arch-node-orbit'});
      group.append(border,
        svg('text', {x:14,y:22,class:'arch-node-tag'}, item.tag),
        svg('circle', {cx:w-16,cy:18,r:3,class:'arch-node-dot'}),
        svg('text', {x:14,y:compact ? 46 : 49,class:'arch-node-title'}, item.title),
        svg('text', {x:14,y:compact ? 69 : 74,class:'arch-node-detail'}, compact ? shortDetails[index] : item.detail));
      board.append(group); nodes.set(item.id, {group,border,index});
    });
    update();
  }
  function update() {
    if (!root || !refs) return;
    const index = phaseIndex(), phase = phases[index], local = time - index * 6;
    root.dataset.motion = 'full';
    refs.play.textContent = playing ? '暂停' : time >= duration ? '再播放一次' : '播放';
    refs.play.setAttribute('aria-label',refs.play.textContent);
    refs.scrub.value = String(time);
    refs.scrub.setAttribute('aria-valuetext', clock(time) + '，' + phase.title);
    refs.clock.textContent = clock(time) + ' / 00:30';
    refs.status.textContent = playing ? '正在演示' : time >= duration ? '演示结束' : '已暂停';
    refs.stepTitle.textContent = phase.title;
    refs.caption.textContent = phase.caption;
    refs.stepCount.textContent = 'STEP ' + String(index + 1).padStart(2,'0') + ' / 05';
    refs.steps.forEach((b,i) => {
      b.dataset.state = i === index ? 'active' : i < index ? 'done' : 'idle';
      b.setAttribute('aria-pressed',String(i === index));
    });
    nodes.forEach((item,id) => {
      item.group.dataset.active = String(phase.nodes.includes(id));
      item.border.style.strokeDashoffset = String(-time * 15 - item.index * 8);
    });
    wires.forEach((wire,id) => {
      const edgeIndex = phase.edges.indexOf(id), active = edgeIndex >= 0;
      wire.group.dataset.active = String(active);
      const progress = ((local * 0.55 - edgeIndex * 0.25) % 1 + 1) % 1;
      wire.dots.forEach((dot,i) => {
        const visible = active;
        dot.style.opacity = visible ? String(i ? (1-i/7)*0.6 : 1) : '0';
        if (!visible) return;
        const p = wire.line.getPointAtLength(((progress - i*0.018 + 1) % 1)*wire.length);
        dot.setAttribute('cx',String(p.x)); dot.setAttribute('cy',String(p.y));
      });
    });
    refs.logLines.forEach((line,i) => {
      line.hidden = i > index;
      line.classList.toggle('is-current',i === index);
      const message = phases[i].log;
      line.lastChild.textContent = i === index ? message.slice(0,Math.floor(local * 22)) : message;
    });
  }
  function render() {
    suspend();
    if (contextKey !== selected) { time = 0; visited = false; contextKey = selected; }
    root = node('section',undefined,'architecture-preview');
    root.setAttribute('aria-label','项目架构图效果预览');
    const tabs = node('div',undefined,'arch-tabs');
    tabs.append(node('span','项目架构图','arch-tab-current'));
    const head = node('div',undefined,'arch-heading');
    const title = node('div'); title.append(node('h1','项目架构图'),
      node('p','卡片外光 · 边框环绕 · 连线流动','muted'));
    const source = node('a','灵感来源 cinetty ↗','arch-source');
    source.href = 'https://github.com/JosssphZhou/cinetty'; source.target = '_blank'; source.rel = 'noopener noreferrer';
    head.append(title,source);
    root.append(tabs,head);
    const stage = node('div',undefined,'arch-stage');
    const stageHead = node('div',undefined,'arch-stage-head');
    const stageName = node('div'); stageName.append(node('span','DEMO / 001','arch-eyebrow'),node('h2','一次游戏操作，如何流转'));
    const status = node('span',undefined,'arch-status'); stageHead.append(stageName,status);
    const workspace = node('div',undefined,'arch-workspace');
    const diagram = node('div',undefined,'arch-diagram');
    const board = svg('svg',{class:'arch-board',role:'img','aria-label':'示例游戏架构：资源服务到游戏入口、场景管理与玩法核心；玩家输入进入玩法核心，核心驱动实体和界面，关卡进度存档后反馈到界面。'});
    diagram.append(board);
    const aside = node('aside',undefined,'arch-narrative');
    const stepCount = node('div',undefined,'arch-eyebrow');
    const stepTitle = node('h3'); const caption = node('p',undefined,'arch-caption');
    const steps = phases.map((phase,i) => {
      const b = button('',() => {
        pause(); seek(i * 6);
      },{className:'arch-step'});
      b.setAttribute('aria-label','查看步骤 ' + (i+1) + '：' + phase.title);
      b.append(node('span',String(i+1).padStart(2,'0'),'arch-step-number'),node('span',phase.title));
      return b;
    });
    const list = node('div',undefined,'arch-steps'); list.append(...steps);
    aside.append(stepCount,stepTitle,caption,list);
    workspace.append(diagram,aside);
    const transport = node('div',undefined,'arch-transport');
    const playButton = button('播放',() => playing ? pause() : play(),{className:'primary arch-play'});
    const replay = button('重播',() => { time = 0; play(); },{icon:'refresh'});
    const scrub = node('input'); scrub.type = 'range'; scrub.min = '0'; scrub.max = String(duration); scrub.step = '0.05';
    scrub.setAttribute('aria-label','演示进度');
    scrub.addEventListener('input',() => seek(Number(scrub.value)));
    const timeLabel = node('span',undefined,'arch-clock');
    const speedSelect = node('select'); speedSelect.setAttribute('aria-label','播放速度');
    [0.5,1,1.5,2].forEach(value => { const o = node('option',value + '×'); o.value = String(value); speedSelect.append(o); });
    speedSelect.value = String(speed); speedSelect.addEventListener('change',() => { speed = Number(speedSelect.value); previous = 0; });
    transport.append(playButton,replay,scrub,timeLabel,speedSelect);
    const log = node('details',undefined,'arch-log'); log.open = true;
    log.append(node('summary','流程记录 · 示例演示'));
    const logBody = node('div',undefined,'arch-log-body');
    const logLines = phases.map((phase,i) => {
      const line = node('div',undefined,'arch-log-line');
      line.append(node('span',clock(i * 6),'arch-log-time'),node('span'));
      logBody.append(line); return line;
    });
    log.append(logBody); stage.append(stageHead,workspace,transport,log);
    root.append(stage,node('p','本页仅播放本地示例，不代表当前项目架构或实时运行状态。','arch-footnote'));
    refs = {board,play:playButton,replay,scrub,speed:speedSelect,clock:timeLabel,status,stepTitle,caption,stepCount,steps,logLines};
    replace($('view'),[root]);
    compact = diagram.clientWidth < 700; drawGraph();
    observer = new ResizeObserver(entries => {
      const next = entries[0].contentRect.width < 700;
      if (next !== compact) { compact = next; drawGraph(); }
    });
    observer.observe(diagram);
    if (!visited && !reducedMotion.matches) play();
    visited = true;
  }
  document.addEventListener('visibilitychange',() => { if (document.hidden) pause(); });
  reducedMotion.addEventListener('change',event => {
    if (event.matches) pause();
  });
  return {render,suspend};
})();
`;

export const architecturePreviewStyles = String.raw`
.architecture-preview{--arch-mint:#66dcc0;--arch-cyan:#7ac8f4;--arch-amber:#e9b878;--arch-rose:#e3a8ba;--arch-wire:#566463;--arch-node:#1b2326;max-width:1600px;margin:0 auto}
:root[data-theme="light"] .architecture-preview{--arch-mint:#16816e;--arch-cyan:#287ca7;--arch-amber:#9e681a;--arch-rose:#a75070;--arch-wire:#98aaa5;--arch-node:#fff}
.arch-tabs{display:flex;border-bottom:1px solid var(--border);margin-bottom:22px}
.arch-tab-current{font-size:13px;padding:0 2px 10px;border-bottom:2px solid var(--accent);color:var(--accent);font-weight:600}
.arch-heading{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:24px}
.arch-heading h1{font-size:25px;letter-spacing:-.6px;margin:0 0 4px}.arch-heading p{margin:0;font-size:12px}
.arch-source{font-size:12px;color:var(--muted);text-decoration:none;white-space:nowrap}.arch-source:hover{color:var(--accent)}
.arch-stage{border:1px solid var(--border);border-radius:10px;overflow:hidden;background:var(--top)}
.arch-stage-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:24px 28px 0}
.arch-eyebrow{font:10px/1.5 "SFMono-Regular",Consolas,monospace;letter-spacing:2px;color:var(--muted)}
.arch-stage-head h2{font-size:19px;font-weight:500;margin:6px 0 0;letter-spacing:.2px}
.arch-status{font-size:11px;color:var(--arch-mint);padding:4px 10px;border:1px solid var(--border);border-radius:20px;white-space:nowrap}
.arch-workspace{display:grid;grid-template-columns:minmax(0,1fr) 238px;align-items:center;min-width:0}
.arch-diagram{min-width:0;position:relative;background-image:radial-gradient(circle,var(--border) .7px,transparent .9px);background-size:18px 18px;margin:20px 0 20px 16px;border-radius:8px}
.arch-board{display:block;width:100%;height:auto;overflow:visible}
.arch-board[data-layout="compact"]{max-width:440px;margin:auto}
.arch-map-label{fill:var(--muted);font-size:12px;letter-spacing:2px}
.arch-wire-base,.arch-wire-lit{fill:none;stroke-linejoin:round;stroke-linecap:round;stroke-width:1.5}
.arch-wire-base{stroke:var(--arch-wire);stroke-dasharray:4 5}.arch-wire-lit{stroke:var(--arch-mint);opacity:0;stroke-width:2}
.arch-wire[data-active="true"] .arch-wire-lit{opacity:.65}.arch-packet{fill:var(--arch-mint);opacity:0}
.arch-node{--node-color:var(--arch-mint)}.arch-amber{--node-color:var(--arch-amber)}.arch-cyan{--node-color:var(--arch-cyan)}.arch-rose{--node-color:var(--arch-rose)}
.arch-node-body{fill:var(--arch-node);stroke:var(--arch-wire);stroke-width:1;stroke-opacity:.55}
.arch-node-orbit{fill:none;stroke:var(--node-color);stroke-width:2;stroke-dasharray:14 86;opacity:0}
.arch-node-tag{font:12px "SFMono-Regular",Consolas,monospace;letter-spacing:1.3px;fill:var(--node-color);opacity:.7}
.arch-node-title{font-size:21px;font-weight:600;fill:var(--text)}.arch-node-detail{font-size:14px;fill:var(--muted)}
.arch-board[data-layout="compact"] .arch-node-title{font-size:17px}
.arch-board[data-layout="compact"] .arch-node-detail{font-size:12px}
.arch-board[data-layout="compact"] .arch-node-tag{font-size:10px;letter-spacing:.7px}
.arch-node-dot{fill:var(--node-color);opacity:.4}
.arch-node[data-active="true"] .arch-node-body{stroke:var(--node-color);stroke-opacity:1}
.arch-node[data-active="true"] .arch-node-dot{opacity:1}
.architecture-preview[data-motion="full"] .arch-node[data-active="true"] .arch-node-orbit{opacity:1}
.architecture-preview[data-motion="full"] .arch-wire[data-active="true"] .arch-packet{filter:drop-shadow(0 0 5px var(--arch-mint))}
.architecture-preview[data-motion="full"] .arch-node[data-active="true"] .arch-node-body{filter:drop-shadow(0 0 7px color-mix(in srgb,var(--node-color) 18%,transparent))}
.arch-narrative{padding:26px 24px 26px 22px;min-width:0}.arch-narrative h3{font-size:17px;margin:10px 0}
.arch-caption{font-size:12px;color:var(--muted);line-height:1.9;min-height:70px;margin:0 0 18px}
.arch-steps{display:grid;gap:5px}
button.arch-step{justify-content:flex-start;width:100%;gap:12px;background:transparent;border-color:transparent;color:var(--muted);padding:8px 10px;text-align:left;font-size:12px;min-height:36px}
.arch-step-number{font:10px "SFMono-Regular",Consolas,monospace;opacity:.7}
button.arch-step[data-state="active"]{background:var(--selection-soft);border-color:var(--border);color:var(--arch-mint)}
button.arch-step[data-state="done"] .arch-step-number{color:var(--arch-mint)}
.arch-transport{border-top:1px solid var(--border);display:flex;align-items:center;gap:12px;padding:16px 24px;flex-wrap:wrap}
.arch-transport button{font-size:12px;min-height:32px}.arch-play{min-width:80px}
.arch-transport input[type="range"]{flex:1;min-width:100px;width:150px;accent-color:var(--accent);cursor:pointer;margin:0}
.arch-clock{font:11px "SFMono-Regular",Consolas,monospace;color:var(--muted);white-space:nowrap}
.arch-transport select{font-size:12px;padding:5px 8px;min-height:32px;background:var(--top);color:var(--text);border:1px solid var(--border);border-radius:4px}
.arch-log{border-top:1px solid var(--border);background:var(--code);padding:12px 24px}
.arch-log summary{cursor:pointer;font-size:11px;color:var(--muted);letter-spacing:.3px}
.arch-log-body{min-height:104px;padding-top:8px;display:flex;flex-direction:column;gap:3px}
.arch-log-line{display:flex;gap:16px;font:11px/1.7 "SFMono-Regular",Consolas,"PingFang SC",monospace;color:var(--muted)}
.arch-log-line[hidden]{display:none}.arch-log-line.is-current{color:var(--arch-mint)}.arch-log-time{opacity:.6;flex:none}
.arch-footnote{font-size:11px;color:var(--muted);margin:12px 0 0;text-align:right}
.architecture-preview button:focus-visible,.architecture-preview input:focus-visible,.architecture-preview select:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
@media(min-width:1500px){.arch-workspace{grid-template-columns:minmax(0,1fr) 280px}.arch-narrative{padding:30px}.arch-caption{font-size:13px}}
@media(max-width:1280px){.arch-workspace{grid-template-columns:minmax(0,1fr)}.arch-diagram{margin:20px 16px 0}.arch-narrative{border-top:1px solid var(--border);padding:20px 24px}.arch-caption{min-height:0;margin-bottom:14px}.arch-steps{grid-template-columns:repeat(5,minmax(0,1fr))}button.arch-step{flex-direction:column;gap:4px;padding:8px 3px;text-align:center;font-size:11px}}
@media(max-width:600px){.arch-heading{align-items:flex-start;flex-direction:column;gap:8px;margin-bottom:18px}.arch-heading h1{font-size:22px}.arch-stage-head{padding:20px 16px 0}.arch-stage-head h2{font-size:16px}.arch-status{font-size:10px}.arch-diagram{margin:4px 4px 0}.arch-node-title{font-size:17px}.arch-node-detail{font-size:10px}.arch-node-tag{font-size:9px;letter-spacing:.7px}.arch-narrative{padding:18px 14px}.arch-steps{grid-template-columns:1fr}button.arch-step{flex-direction:row;gap:12px;padding:6px 10px;min-height:32px;font-size:12px}.arch-transport{padding:14px;gap:10px}.arch-transport input[type="range"]{order:5;flex-basis:100%}.arch-clock{margin-left:auto}.arch-log{padding:12px 14px}.arch-log-body{min-height:140px}.arch-log-line{gap:10px;font-size:10px}.arch-footnote{text-align:left}}
`;
