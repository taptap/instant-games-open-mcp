type MotionTrack = {
  node: string;
  prop: string;
  at: number;
  duration: number;
  from: number;
  to: number;
  ease: string;
};
type MotionClip = { id: string; label: string; duration: number; tracks: MotionTrack[] };
export type MotionExample = {
  id: string;
  name: string;
  kind: 'scene' | 'transition';
  family: 'signal' | 'theater';
  summary: string;
  source: { scene: string; frames: [number, number] };
  clips: MotionClip[];
  interaction: string;
  states: string[];
  events: string[];
  related: string[];
  from?: string;
  to?: string;
};
function track(
  node: string,
  prop: string,
  at: number,
  duration: number,
  from: number,
  to: number,
  ease = 'outCubic'
): MotionTrack {
  return { node, prop, at, duration, from, to, ease };
}
function enter(node: string, at: number, duration = 0.4, dx = 0, dy = 28): MotionTrack[] {
  return [
    track(node, 'opacity', at, duration, 0, 1),
    track(node, 'dx', at, duration, dx, 0),
    track(node, 'dy', at, duration, dy, 0, 'outBack'),
  ];
}
function clip(id: string, label: string, duration: number, tracks: MotionTrack[]): MotionClip {
  return { id, label, duration, tracks };
}

// Preview, offline demo and AI reference consume this same choreography.
export const motionExamples: MotionExample[] = [
  {
    id: 'S01',
    name: '主菜单',
    kind: 'scene',
    family: 'signal',
    summary: '错峰入场 · 菜单焦点 · 确认扫条',
    source: { scene: 'S01', frames: [0, 46] },
    clips: [
      clip('entry', '菜单错峰入场', 0.9, [
        ...enter('logo', 0.08, 0.5, -70, 0),
        ...enter('actor', 0, 0.6, 80, 0),
        ...[0, 1, 2].flatMap((i) => enter('menu' + i, 0.2 + i * 0.1, 0.35, -120, 0)),
      ]),
      clip('focus', '焦点回弹', 0.35, [track('cursor', 'scale', 0, 0.35, 0.75, 1, 'outBack')]),
      clip('confirm', '确认扫条与回收', 0.65, [
        track('sweep', 'reveal', 0, 0.28, 0, 1, 'outExpo'),
        track('sweep', 'opacity', 0.3, 0.35, 1, 0),
        ...[0, 1, 2].map((i) => track('menu' + i, 'dx', 0.3 + i * 0.04, 0.25, 0, -700, 'inQuad')),
      ]),
    ],
    interaction:
      '鼠标悬停、方向键或点击移动焦点；确认播放扫条，再由演示宿主启动 T01。设置和档案入口只显示本地反馈。',
    states: ['entering', 'ready', 'confirming', 'transitioning'],
    events: ['menuFocus', 'menuConfirm'],
    related: ['T01', 'S02'],
  },
  {
    id: 'S02',
    name: '角色选择',
    kind: 'scene',
    family: 'signal',
    summary: '头像切换 · 属性级联 · 攻击预览',
    source: { scene: 'S02', frames: [47, 94] },
    clips: [
      clip('entry', '头像与属性级联', 1.1, [
        ...[0, 1, 2].flatMap((i) => enter('avatar' + i, i * 0.1, 0.4, -60, 0)),
        ...enter('actor', 0.2, 0.6, 90, 0),
        ...enter('stats', 0.35, 0.5, 0, 35),
        ...[0, 1, 2].flatMap((i) => enter('skill' + i, 0.45 + i * 0.08, 0.35, 0, 25)),
      ]),
      clip('select', '选框回弹与资料切换', 0.55, [
        track('selection', 'scale', 0, 0.45, 0.85, 1, 'outBack'),
        ...enter('stats', 0.05, 0.4, 35, 0),
      ]),
      clip('attack', '弧光、白芯与斜刃', 0.9, [
        track('actor', 'dx', 0, 0.18, 0, 80, 'inQuad'),
        track('actor', 'dx', 0.18, 0.5, 80, 0),
        track('arc', 'reveal', 0.08, 0.28, 0, 1, 'outExpo'),
        track('arc', 'opacity', 0.38, 0.4, 1, 0),
        track('slash', 'reveal', 0.22, 0.22, 0, 1, 'outExpo'),
        track('slash', 'opacity', 0.45, 0.35, 1, 0),
      ]),
    ],
    interaction:
      '三个头像共用 selectedCharacter；属性与角色颜色随选择更新。三个技能都可播放独立攻击反馈，连点替换本次预览。继续进入 S03。',
    states: ['entering', 'ready', 'previewing'],
    events: ['characterSelected', 'previewAttack', 'characterConfirm'],
    related: ['S03', 'T02'],
  },
  {
    id: 'S03',
    name: '剧情对话',
    kind: 'scene',
    family: 'signal',
    summary: '框体展开 · 逐字台词 · 继续提示',
    source: { scene: 'S03', frames: [95, 143] },
    clips: [
      clip('entry', '框体展开与逐字', 2.6, [
        ...enter('actor', 0, 0.6, 70, 0),
        track('dialog', 'revealY', 0.05, 0.4, 0, 1),
        ...enter('nameplate', 0.2, 0.35, -50, 0),
        track('text', 'textProgress', 0.5, 2, 0, 1, 'linear'),
      ]),
      clip('hint', '继续提示脉冲', 1.2, [
        track('hint', 'scale', 0, 0.6, 1, 1.16, 'inOutCubic'),
        track('hint', 'scale', 0.6, 0.6, 1.16, 1, 'inOutCubic'),
      ]),
      clip('exit', '对话框收拢', 0.35, [track('dialog', 'revealY', 0, 0.35, 1, 0, 'inQuad')]),
    ],
    interaction:
      'typing 阶段继续按钮禁用；台词完成后点击继续播放下一句。最后一句完成后由宿主演示切到 S04，时间线不持有剧情索引。',
    states: ['typing', 'complete', 'exiting'],
    events: ['textComplete', 'dialogueNext'],
    related: ['S04'],
  },
  {
    id: 'S04',
    name: '发条剧院',
    kind: 'scene',
    family: 'theater',
    summary: '分层登场 · 兔子弹出 · 场记板',
    source: { scene: 'S04', frames: [51, 221] },
    clips: [
      clip('entry', '角色与入口错峰登场', 1.8, [
        ...enter('actor', 0, 0.8, 0, 70),
        track('arm', 'rotation', 0, 0.5, 20, -48, 'outCubic'),
        track('arm', 'rotation', 0.5, 0.8, -48, 0, 'inOutCubic'),
        track('rabbit', 'dy', 0.25, 0.4, 90, -35, 'outBack'),
        track('rabbit', 'dy', 0.8, 0.55, -35, 0),
        ...[0, 1, 2].flatMap((i) => enter('menu' + i, 0.35 + i * 0.13, 0.5, -90, 0)),
        ...enter('logo', 0.9, 0.6, 0, -30),
      ]),
      clip('clap', '场记板开合与余振', 1.15, [
        track('hinge', 'rotation', 0, 0.3, 0, -24, 'outBack'),
        track('hinge', 'rotation', 0.42, 0.18, -24, 0, 'inQuad'),
        track('flash', 'opacity', 0.6, 0.4, 1, 0),
        track('clap', 'rotation', 0.6, 0.2, 0, 4, 'outBack'),
        track('clap', 'rotation', 0.8, 0.35, 4, 0, 'outBack'),
      ]),
      clip('rabbit', '兔子跃出帽口', 1.1, [
        track('rabbit', 'dy', 0, 0.4, 0, -95, 'outBack'),
        track('rabbit', 'dy', 0.5, 0.6, -95, 0, 'outBack'),
      ]),
    ],
    interaction:
      '点场记板重播开合，连续点击只保留一套反馈；点兔子重播弹出；章节入口通过 T03 展示承接页，其余入口显示本地提示。',
    states: ['entering', 'ready', 'clapping', 'transitioning'],
    events: ['clap', 'chapterRequested'],
    related: ['T03'],
  },
  ...(
    [
      [
        'T01',
        '斜面菜单揭幕',
        'signal',
        'S01',
        'S02',
        35,
        46,
        '拖影先行 · 斜面盖满 · 新页揭开',
        1.3,
      ],
      [
        'T02',
        '斜刃切换地图',
        'signal',
        'battle',
        'map',
        242,
        251,
        '白芯斜刃 · 整屏遮挡 · 地图显现',
        1.1,
      ],
      [
        'T03',
        '扑克牌遮场',
        'theater',
        'S04',
        'chapter',
        194,
        225,
        '扑克牌涌入 · 近景盖满 · 章节揭开',
        1.6,
      ],
    ] as const
  ).map(
    ([id, name, family, from, to, start, end, summary, duration]): MotionExample => ({
      id,
      name,
      kind: 'transition',
      family,
      from,
      to,
      summary,
      source: { scene: id, frames: [start, end] },
      clips: [
        clip('transition', '完整转场', duration, [
          track('cover', 'reveal', 0, duration * 0.45, 0, 1, 'inOutCubic'),
          track(
            'cover',
            'dx',
            duration * 0.55,
            duration * 0.45,
            0,
            id === 'T03' ? -2400 : -1600,
            'inOutCubic'
          ),
        ]),
      ],
      interaction:
        '遮挡 45% 时盖满，55% 时开始揭开；盖满期间由演示宿主切换承接内容。完成事件仅通知宿主，Seek 不发业务事件。战斗、地图和章节是转场承接示意。',
      states: ['covering', 'covered', 'revealing', 'complete'],
      events: ['covered', 'transitionComplete'],
      related: [from, to].filter((id) => id.startsWith('S')),
    })
  ),
];

export const motionContract = {
  version: 1,
  width: 1280,
  height: 720,
  units: 'logical pixels / seconds / degrees',
  provenance:
    '按两套本地 UI 演示的 S01–S04、T01–T03 整理；原创矢量示意素材，时长为便于交互重新编排。不是原片复刻。',
  boundary: '网页可运行参考，非 Maker 原生即插即用组件；未接入游戏账号、战斗、奖励或存档。',
  native: {
    Motion: '跨节点编排与绝对时间 sample(t)；事件与姿态采样分开，Seek 保持暂停。',
    LuaTween: '沿用目标项目现有 LuaTween 和统一 Update(dt)，仅取消当前页面自己的 controller。',
    WidgetBridge:
      '仅为无原生过渡的 wrapper 映射位移、缩放、旋转、透明度；裁切、轴缩放和文字进度需显式 adapter。',
    NanoVG: '只绘制斜面、弧光、白芯、环等特效；图片、文字与 Button 使用真实 UI 节点。',
    business: '输入、选中角色、当前台词、切页及副作用由业务层持有；禁止用全局 Clear/KillAll 清理。',
  },
  deferred: [
    '原片角色网格与美术精修',
    '完整战斗、地图、奖励和档案',
    '完整章节剧场和详情页',
    'Maker 原生接入验收',
  ],
};
