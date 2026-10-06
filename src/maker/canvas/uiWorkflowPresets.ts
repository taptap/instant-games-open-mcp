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
  'background、panel_frame、flat_background、button_normal、button_pressed、button_selected、tab_state、icon、portrait、item_slot、progress_bar、slider、decoration、art_text、code_layer';

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
  options: Pick<CanvasNode, 'assetPath' | 'referenceInput' | 'generationDraft' | 'generation'> = {}
): CanvasNode {
  return {
    id,
    type: 'image',
    title,
    x,
    y,
    width,
    height,
    ...(options.generationDraft ? { referenceInput: { includeSelf: false } } : {}),
    ...options,
  };
}

function note(id: string, title: string, text: string, x: number, y: number): CanvasNode {
  return { id, type: 'note', title, text, x, y, width: 360, height: 220 };
}

function sourceDraft(
  sourceImageIds: string[],
  prompt: string,
  operation: 'generate' | 'variant' = 'variant'
): CanvasNode['generationDraft'] {
  return {
    operation,
    sourceImageId: sourceImageIds[0],
    sourceImageIds,
    prompt,
    parameters: { model: 'gpt', resolution: '2K', aspectRatio: '9:16' },
  };
}

function reviewPrompt(screen: UiScreen, pass: number): string {
  return [
    '你是移动游戏 UI 资产拆分工程师，只分析提供的原始设计稿，不改画风，不补画不存在的组件。',
    '目标界面：' + screen.title + '。这是第 ' + pass + '/3 次独立识别。',
    '从上到下、从左到右扫描背景、顶部栏、主体、浮层和底部区域，覆盖全部可见元素。',
    '按以下类别标注：' +
      categories +
      '。每项必须给出稳定编号、矩形区域、前后层级、是否可复用和置信度。',
    '立体、有外框、底部基座或阴影、存在按下/选中变化的对象识别为 button，并拆出 normal、pressed、selected 状态；平面信息条识别为 flat_background。',
    '按钮上的 Icon 与按钮底图分开，Icon 不并入按钮；面板边框和内部底色若属于同一视觉组件必须保持一体，叠加层另行标注。',
    '进度条、滑动条、九宫格可拉伸底图、装饰和程序绘制层单独标注。所有普通文字、数字、价格、百分比、红点和动态数值标为 code_layer；大型装饰性美术字体标为 art_text。',
    '这是候选识别草图，只画原稿中存在的编号框和连线；不凭空添加关闭按钮、状态、图标或背景。',
  ].join(' ');
}

function noTextPrompt(screen: UiScreen): string {
  return [
    '以提供的原始设计稿为唯一来源，生成同尺寸、同构图、同层级关系的去文字版本，目标界面：' +
      screen.title +
      '。',
    '移除所有普通文字、数字、价格、日期、百分比、红点、任务内容和按钮文案，使用原有底图纹理自然补齐。',
    '保留面板、边框、按钮立体结构、按钮阴影、选中态底图、Icon 轮廓、进度条填充和原稿中的装饰。',
    '大型装饰性美术字体也从该版本移除，另由下一张美术字体卡单独提取；Icon 内的小字全部移除。',
    '只处理原稿已有内容，不新增组件，不合并相邻图层，不改变颜色、比例和位置。输出透明背景 PNG；若模型使用临时纯色背景，后续必须先本地去背景再进入下一步。',
  ].join(' ');
}

function artTextPrompt(screen: UiScreen): string {
  return [
    '只从提供的原始设计稿提取大型装饰性美术字体，目标界面：' + screen.title + '。',
    '保留字体本身的笔画、描边、浮雕、发光、纹理和装饰，不保留普通 UI 小字、数字、价格、红点、任务文案或按钮文字。',
    '每组美术字体保持独立、透明背景、原始比例和清晰边缘；不要把标题底图框、按钮底图或 Icon 一起抠出。',
    '原稿没有的字体不得生成；输出只包含原稿中确实存在的美术字体，不添加编号、标签、水印或临时背景。',
  ].join(' ');
}

function consensusPrompt(screen: UiScreen): string {
  return [
    '根据原始设计稿和三份独立识别候选，生成一张人工复核用的最终组件清单板，目标界面：' +
      screen.title +
      '。',
    '共同确认项合并为一个稳定编号；冲突项标为待确认；低置信度项、疑似遗漏项和原稿中无法确定的层级单独列出。',
    '最终清单必须区分 background、panel_frame、flat_background、button_normal、button_pressed、button_selected、tab_state、icon、art_text、progress_bar、slider 和 code_layer。',
    '每项标出矩形区域、层级顺序、状态组、是否保留文字、是否需要透明背景、是否适合九宫格/三宫格和是否可复用。',
    '这是复核板，不是最终素材；只使用输入图片中存在的元素，不补画缺失组件。',
  ].join(' ');
}

function iconButtonPrompt(screen: UiScreen): string {
  return [
    '依据原始设计稿、去文字版本和已确认组件清单，只提取 Icon 与按钮组件，目标界面：' +
      screen.title +
      '。',
    '按“独立 Icon”与“按钮底图”两类输出；按钮保留面、外框、底部立体基座/阴影以及原稿中的选中态或按下态，不保留任何文字。',
    '按钮上的 Icon 必须从按钮底图中移除并作为独立组件；同一按钮的 normal、pressed、selected 状态分别保留，不能合成一张。',
    '关闭、返回、页签、资源按钮、任务领取按钮和原稿中实际存在的交互按钮都要覆盖；没有出现的按钮不得生成。',
    '每格只放一个组件，组件之间不接触；输出透明 PNG 或先经本地去背景的组件图集，不显示纯色临时背景，不添加编号、标签、水印。',
  ].join(' ');
}

function framePrompt(screen: UiScreen): string {
  return [
    '依据原始设计稿、去文字版本和已确认组件清单，只提取底图、面板、边框、信息条、进度条和滑动条，目标界面：' +
      screen.title +
      '。',
    '先按前后层级拆分，再切图：面板边框与属于它的内部底色保持为一个完整组件；上层标题框、Icon、按钮和装饰另行输出，不能把多个底图叠成一个大图。',
    '进度条和滑动条单独分类，分别保留轨道、填充、滑块以及 normal/selected 状态；可九宫格或三宫格拉伸的底图记录为同一可复用样式并去重。',
    '只输出原稿中真实存在的底图，不能凭空补出不存在的关闭框、标题框或背景；所有文字、数字、Icon、按钮和美术字体都必须剔除。',
    '每格只放一个透明组件，不显示纯色临时背景，不添加编号、标签、水印；保留边缘高光、阴影和圆角。',
  ].join(' ');
}

export function createUiWorkflowPreset(): CanvasPreset {
  const nodes: CanvasNode[] = [
    note(
      nodeId(1),
      '工作流说明 · 来源受控、分阶段确认',
      'BikeKingBanana UI 拆分模板。每个界面先保留原设计稿，再去普通文字并单独提取美术字体；随后做三轮独立识别，汇总为共识复核板，人工确认后才拆 Icon/按钮和底图/进度条，最后进入透明 PNG 导出。Art 只负责受控的图像请求，来源、参数和阶段结果都保留。',
      0,
      -280
    ),
    note(
      nodeId(2),
      '识别分类与层级规则',
      '按钮按立体面、外框、底部基座/阴影和 normal/pressed/selected 状态识别；Icon 从按钮中独立出来。面板边框和所属底色保持一体，叠加层另切。进度条、滑动条、九宫格底图单独分类并去重。普通文字、数字、价格、红点和动态数值归 code_layer；大型装饰性字体归 art_text。',
      400,
      -280
    ),
    note(
      nodeId(3),
      '透明结果门',
      '洋红或其它纯色只允许作为模型的临时中间背景，不能作为最终卡片结果。进入下一阶段前必须先用本地去背景得到透明 PNG，并检查浅色/深色游戏背景上的边缘、空心区域、阴影和文字残留。',
      800,
      -280
    ),
  ];
  const edges: CanvasEdge[] = [];
  let sequence = 10;
  screens.forEach((screen, screenIndex) => {
    const baseY = screenIndex * 1450;
    const ref = nodeId(sequence++);
    const textFree = nodeId(sequence++);
    const artText = nodeId(sequence++);
    const passIds = [nodeId(sequence++), nodeId(sequence++), nodeId(sequence++)];
    const consensus = nodeId(sequence++);
    const manualNote = nodeId(sequence++);
    const iconAtlas = nodeId(sequence++);
    const iconAssets = nodeId(sequence++);
    const frameAtlas = nodeId(sequence++);
    const frameAssets = nodeId(sequence++);
    const key = String(screen.key);
    const refPath = 'assets/image/preset-bike-ui-' + key + '.jpg';
    nodes.push(
      image(ref, '① ' + screen.title + ' · image-2 设计稿（原始）', 0, baseY, 300, 520, {
        assetPath: refPath,
        generation: {
          prompt: screen.prompt,
          referenceImagePaths: [],
          parameters: { model: 'gpt', resolution: '2K', aspectRatio: '9:16' },
          operation: 'generate',
        },
      }),
      image(textFree, '② 去普通文字 · ' + screen.title, 380, baseY, 320, 420, {
        generationDraft: sourceDraft([ref], noTextPrompt(screen)),
      }),
      image(artText, '②B 美术字体独立提取 · ' + screen.title, 380, baseY + 450, 320, 420, {
        generationDraft: sourceDraft([ref], artTextPrompt(screen)),
      }),
      image(passIds[0], '③A 识别候选 1/3 · ' + screen.title, 760, baseY, 320, 420, {
        generationDraft: sourceDraft([ref], reviewPrompt(screen, 1)),
      }),
      image(passIds[1], '③B 识别候选 2/3 · 反向查漏', 760, baseY + 450, 320, 420, {
        generationDraft: sourceDraft(
          [ref],
          reviewPrompt(screen, 2) +
            ' 本轮重点反查遮挡关系、状态组和可能遗漏的底图、进度条或滑动条。'
        ),
      }),
      image(passIds[2], '③C 识别候选 3/3 · 交互与分层', 760, baseY + 900, 320, 420, {
        generationDraft: sourceDraft(
          [ref],
          reviewPrompt(screen, 3) +
            ' 本轮重点核对按钮立体性、Icon 与按钮分离、前后景层级和程序绘制层。'
        ),
      }),
      image(consensus, '④ 三轮结果 → 共识复核板（人工选择）', 1140, baseY + 260, 440, 520, {
        generationDraft: sourceDraft([ref, ...passIds], consensusPrompt(screen)),
      }),
      note(
        manualNote,
        '④人工复核 · ' + screen.title,
        '只勾选原稿中确认存在的组件。冲突项标待确认，误识别项删除，缺失项写入补充提示词后重做对应阶段。确认前不进入拆图，不接受模型凭空添加关闭按钮、标题框、Icon 或背景。',
        1140,
        baseY + 820
      ),
      image(iconAtlas, '⑤ Icon + 按钮拆分 · ' + screen.title, 1640, baseY, 460, 520, {
        generationDraft: sourceDraft([ref, textFree, consensus], iconButtonPrompt(screen)),
      }),
      {
        id: iconAssets,
        type: 'image-assets',
        title: '⑥ Icon / 按钮 · 独立 PNG（透明后导出）',
        x: 2160,
        y: baseY,
        width: 480,
        height: 520,
      },
      image(frameAtlas, '⑤B 底图 + 进度条拆分 · ' + screen.title, 1640, baseY + 650, 460, 520, {
        generationDraft: sourceDraft([ref, textFree, consensus], framePrompt(screen)),
      }),
      {
        id: frameAssets,
        type: 'image-assets',
        title: '⑥ 底图 / 进度条 · 独立 PNG（透明后导出）',
        x: 2160,
        y: baseY + 650,
        width: 480,
        height: 520,
      }
    );
    const sourceEdges = [textFree, artText, ...passIds, consensus, iconAtlas, frameAtlas];
    edges.push(
      ...sourceEdges.map((target) => ({
        id: edgeId(sequence++),
        from: ref,
        to: target,
        kind: 'image-variant' as const,
      })),
      { id: edgeId(sequence++), from: iconAtlas, to: iconAssets, kind: 'image-assets' },
      { id: edgeId(sequence++), from: frameAtlas, to: frameAssets, kind: 'image-assets' }
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
    name: 'BikeKingBanana UI · 去文字→三轮识别→Icon/按钮与底图分层导出',
    revision: 2,
    nodes,
    edges,
    assets,
  };
}
