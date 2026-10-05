import uiWorkflowData from './uiWorkflowData.json';
import type { CanvasPreset } from './presets.js';
import type { CanvasEdge, CanvasNode } from './model.js';

type UiScreen = {
  key: keyof typeof uiWorkflowData;
  title: string;
  prompt: string;
};

const screens: UiScreen[] = [
  {
    key: 'character',
    title: '角色 / 工人界面',
    prompt:
      '为《奥德彪拉香蕉》生成 9:16 竖屏手机游戏角色与工人管理界面设计稿。保留非洲香蕉运输经营主题、红土公路、温暖手绘木牌和现有项目的幽默经营气质；需要头像区、属性条、装备槽、角色立绘区、页签、空面板、关闭和主操作按钮。设计稿只用于后续拆分，文字、数字、价格和按钮文案必须使用留白或无文字占位形状。',
  },
  {
    key: 'inventory',
    title: '背包界面',
    prompt:
      '为《奥德彪拉香蕉》生成 9:16 竖屏手机游戏背包界面设计稿。使用非洲香蕉运输经营主题、温暖手绘木牌和红土公路风格；需要分类页签、物品网格、选中物品详情、数量角标位置、滚动区域、底部操作区、关闭按钮和空状态。文字、数字、价格和按钮文案必须使用留白或无文字占位形状。',
  },
  {
    key: 'daily-tasks',
    title: '每日任务界面',
    prompt:
      '为《奥德彪拉香蕉》生成 9:16 竖屏手机游戏每日任务界面设计稿。使用非洲香蕉运输经营主题、温暖手绘木牌和红土公路风格；需要任务卡列表、任务图标位、进度条、奖励图标位、已完成态、领取按钮空底、顶部资源区和关闭按钮。文字、数字、百分比和按钮文案必须使用留白或无文字占位形状。',
  },
  {
    key: 'seven-day-signin',
    title: '七天签到界面',
    prompt:
      '为《奥德彪拉香蕉》生成 9:16 竖屏手机游戏七天签到界面设计稿。使用非洲香蕉运输经营主题、温暖手绘木牌和红土公路风格；需要七个奖励格、已签到/今日/锁定三种状态、终极奖励大卡、进度连接线、奖励图标位、领取按钮空底、关闭按钮和背景遮罩。文字、日期、数字、标签和按钮文案必须使用留白或无文字占位形状。',
  },
];

const categories =
  'background、common_control、title_icon、tab_or_menu、panel_or_frame、icon_or_item、portrait_or_character、gameplay_entity、decoration、code_layer';

function nodeId(index: number): string {
  return '7e1cb6ad-732f-4dc3-a951-' + String(1200 + index).padStart(12, '0');
}

function edgeId(index: number): string {
  return '7e1cb6ad-732f-4dc3-a951-' + String(2200 + index).padStart(12, '0');
}

function image(
  id: string,
  title: string,
  x: number,
  y: number,
  width: number,
  height: number,
  options: Pick<CanvasNode, 'assetPath' | 'referenceInput' | 'generationDraft'> = {}
): CanvasNode {
  return { id, type: 'image', title, x, y, width, height, ...options };
}

function note(id: string, title: string, text: string, x: number, y: number): CanvasNode {
  return { id, type: 'note', title, text, x, y, width: 360, height: 220 };
}

function reviewPrompt(screen: UiScreen, pass: number): string {
  return [
    '你是移动游戏 UI 资产拆分工程师。只分析这张参考稿并生成一张视觉标注草图，不要替换美术风格。',
    '目标界面：' + screen.title + '。',
    '这是第 ' +
      pass +
      '/3 次独立识别。按顶部、左侧、主体、右侧、底部、浮层扫描，覆盖全部可见元素。',
    '必须按以下分类标注：' + categories + '。',
    '所有文字、数字、价格、百分比、红点和进度数值都标为 code_layer，不能进入后续素材。',
    '独立点击、缩放、显隐或动效的对象必须分开；背景、底图、面板/边框、页签/按钮状态组、滑动条、进度条、图标、头像和装饰层必须分别标明。',
    '这是候选识别图，保留清晰的编号框和层级线索，禁止凭空添加原稿不存在的功能。',
  ].join(' ');
}

function consensusPrompt(screen: UiScreen): string {
  return [
    '根据三份独立 UI 识别候选，生成一张最终人工复核用的组件清单板。目标界面：' +
      screen.title +
      '。',
    '只合并三轮共同确认的元素；冲突项标为待确认，低置信度项和可能遗漏项单独列出。',
    '必须区分背景、底图、背景框/面板、按钮 normal/pressed/selected、页签、滑动条、进度条、图标、头像/立绘、道具槽、装饰层和 code_layer。',
    '每项保留稳定编号、层级、矩形区域、状态组、是否去文字、透明要求和是否可复用的信息。',
    '这张板只用于人工选择和补充提示词，不是最终游戏素材。',
  ].join(' ');
}

function atlasPrompt(screen: UiScreen): string {
  return [
    '依据已确认的组件清单，重新绘制一张供游戏导出的 UI 组件图集，目标界面：' + screen.title + '。',
    '只保留清单确认的组件，按 4 列×3 行排列，不足 12 项时留空，不得脑补；每格只放一个独立组件。',
    '严格去除所有文字、数字、价格、百分比、红点和动态数值；按钮文案、任务文本和日期全部由程序绘制。',
    '背景框、底图、按钮、页签、滑动条、进度条、图标、头像/立绘、道具槽和装饰层必须分层，不要把前景格子和底图合成一张。',
    '整张图使用均匀纯洋红 #FF00FF 背景，透明组件之间不相互接触，不要网格线、编号、标签、水印或整屏截图。',
  ].join(' ');
}

export function createUiWorkflowPreset(): CanvasPreset {
  const nodes: CanvasNode[] = [
    note(
      nodeId(1),
      '工作流说明 · 先识别再导出',
      'BikeKingBanana UI 研究模板。每个界面先保留设计稿，再做 3 次独立识别，之后生成共识复核板；人工勾选要保留、删除和缺失项，补提示词后才进入去文字图集。任何付费结果未知时先查原任务，不自动重提。',
      0,
      -280
    ),
    note(
      nodeId(2),
      '固定分类与文字规则',
      '分类：' +
        categories +
        '。默认不切文字、数字、价格、百分比、倒计时、红点和状态蒙层；纯色面板、简单进度条和禁用态优先由程序绘制。独立点击、缩放、显隐或动效对象必须独立成图。',
      400,
      -280
    ),
    note(
      nodeId(3),
      '人工确认门',
      '每次把识别共识板作为选择清单：保留项进入下一步，误识别项删除，缺失项在此便签补充提示词后重做对应识别/图集。确认前不要导出 PNG；确认后仍需检查浅底、深底和程序文字叠加效果。',
      800,
      -280
    ),
  ];
  const edges: CanvasEdge[] = [];
  let sequence = 10;
  screens.forEach((screen, screenIndex) => {
    const baseY = screenIndex * 900;
    const ref = nodeId(sequence++);
    const passIds = [nodeId(sequence++), nodeId(sequence++), nodeId(sequence++)];
    const consensus = nodeId(sequence++);
    const clean = nodeId(sequence++);
    const assets = nodeId(sequence++);
    const key = String(screen.key);
    const refPath = 'assets/image/preset-bike-ui-' + key + '.jpg';
    nodes.push(
      image(ref, '① ' + screen.title + ' · image-2 设计稿', 0, baseY, 300, 520, {
        assetPath: refPath,
        generation: {
          prompt: screen.prompt,
          referenceImagePaths: [],
          parameters: { model: 'gpt', resolution: '2K', aspectRatio: '9:16' },
          operation: 'generate',
        },
      }),
      image(passIds[0], '②A 识别候选 1/3 · ' + screen.title, 380, baseY, 300, 420, {
        referenceInput: { includeSelf: false },
        generationDraft: {
          operation: 'variant',
          sourceImageId: ref,
          prompt: reviewPrompt(screen, 1),
          parameters: { model: 'gpt', resolution: '2K', aspectRatio: '9:16' },
        },
      }),
      image(passIds[1], '②B 识别候选 2/3 · 反向查漏', 380, baseY + 450, 300, 420, {
        referenceInput: { includeSelf: false },
        generationDraft: {
          operation: 'variant',
          sourceImageId: ref,
          prompt:
            reviewPrompt(screen, 2) + ' 本轮重点反查遮挡关系、状态组和可能漏掉的底图/滑动条。',
          parameters: { model: 'gpt', resolution: '2K', aspectRatio: '9:16' },
        },
      }),
      image(passIds[2], '②C 识别候选 3/3 · 交互与分层', 380, baseY + 900, 300, 420, {
        referenceInput: { includeSelf: false },
        generationDraft: {
          operation: 'variant',
          sourceImageId: ref,
          prompt: reviewPrompt(screen, 3) + ' 本轮重点检查前后景层级、独立交互对象和程序绘制层。',
          parameters: { model: 'gpt', resolution: '2K', aspectRatio: '9:16' },
        },
      }),
      image(consensus, '③ 三轮结果 → 共识复核板（人工选择）', 760, baseY + 260, 420, 520, {
        referenceInput: { includeSelf: false },
        generationDraft: {
          operation: 'generate',
          prompt: consensusPrompt(screen),
          parameters: { model: 'gpt', resolution: '2K', aspectRatio: '4:3' },
        },
      }),
      note(
        nodeId(sequence++),
        '③人工复核 · ' + screen.title,
        '完成三张识别候选后，把三张结果连接到共识复核板。检查：分类是否重复、层级是否正确、文字是否全部列入 code_layer、按钮/页签是否有状态组、是否缺少底图或滑动条。缺失项写入提示词后再生成。',
        760,
        baseY + 810
      ),
      image(clean, '④ 去文字 + 分层图集 · ' + screen.title, 1280, baseY + 260, 460, 520, {
        referenceInput: { includeSelf: false },
        generationDraft: {
          operation: 'generate',
          prompt: atlasPrompt(screen),
          parameters: { model: 'gpt', resolution: '2K', aspectRatio: '4:3' },
        },
      }),
      {
        id: assets,
        type: 'image-assets',
        title: '⑤ 游戏可用 UI · 独立 PNG（确认后导出）',
        x: 1840,
        y: baseY + 260,
        width: 480,
        height: 520,
      }
    );
    edges.push(
      ...passIds.map((passId) => ({
        id: edgeId(sequence++),
        from: ref,
        to: passId,
        kind: 'image-variant' as const,
      })),
      {
        id: edgeId(sequence++),
        from: clean,
        to: assets,
        kind: 'image-assets',
      }
    );
  });
  const assets = Object.fromEntries(
    Object.entries(uiWorkflowData).map(([key, data]) => [
      'assets/image/preset-bike-ui-' + key + '.jpg',
      { type: data.type, data: data.data },
    ])
  );
  return {
    id: '7e1cb6ad-732f-4dc3-a951-000000000012',
    name: 'BikeKingBanana UI · 多轮识别→去文字→分层导出',
    revision: 1,
    nodes,
    edges,
    assets,
  };
}
