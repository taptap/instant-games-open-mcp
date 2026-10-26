import type { CanvasRecognitionAttempt, UiBboxElement, UiBboxImage } from '../contracts.js';
import { bboxRecognitionElements } from './uiRecognition.js';
import { scaleCutElements, validateCutElements, validateBboxTexts } from './uiBbox.js';

export const CANVAS_VISION_MODEL = 'gpt-6.1-sol';

export interface ServerRecognitionStep {
  key: string;
  prompt: string;
  image: UiBboxImage;
  submittedAt?: string;
  requestId?: string;
  status?: 'running' | 'succeeded' | 'failed';
  output?: Record<string, unknown>;
  credits?: number;
  usage?: { input_tokens: number; output_tokens: number };
  error?: { code?: string; message: string; retryable?: boolean; httpStatus: number };
}

export interface ServerRecognitionState {
  appId: string;
  environment: string;
  apiBase: string;
  startedAt: string;
  durationMs?: number;
  design: UiBboxImage;
  cut: ServerRecognitionStep;
  text?: ServerRecognitionStep;
}

export function uiRecognitionPrompt(width: number, height: number): string {
  return [
    '这是一张已经去掉文字字形的游戏 UI 图，尺寸 ' +
      width +
      '×' +
      height +
      '。只根据这张图里看得见的内容作答，不根据文件名、旧清单或上一张稿的数量猜测。',
    '列出可独立切图、可独立拼装的最小 UI 单位。type 只用 icon、frame、panel、button、tab、title。',
    'icon 包括图标、箭头、叉号、加号、星星、物品图、人物。frame 包括槽位格、进度条、头像框、细底条。panel 是大面板，button 是按钮底板，tab 是页签底板，title 是标题底板。',
    '必须分开按钮底板和符号、物品格和物品图、每颗星星、进度条底槽和填充、头像和头像框。不要拆开底板的边框和内部底色，不要拆插画内部纹理。',
    '不要输出文字层，不要根据残留痕迹新造文字或数字。箭头、叉号、加号和星星是图标。重复实例逐个保留坐标，不用大框代替一排。',
    '逐项检查重复素材：只有形状、颜色、纹理和状态一致、可复用同一张PNG的实例，才用 duplicateOf 指向第一个原始实例id。不同颜色的装备框、选中与未选中、实心与空心星星不能合并。不确定时保留独立元素；原始实例省略 duplicateOf，不引用另一个重复实例。',
    '相同金色星星即使属于不同装备或位于不同面板，也共享一个原始实例；每颗星星仍保留自己的id、bbox和parent。name描述素材本身，例如“金色五角星”，不要写成“头盔第一颗星”而让后续生图误画出头盔。',
    'bbox 是所看图片的像素 [x,y,w,h]，左上角原点，禁止归一化和对角点。包含主体及自身阴影，不带相邻元素。parent 引用本次所属底板或面板 id，没有则 null。id 从 E001 递增。',
    '只输出一个 JSON，不要 Markdown，不要解释：' +
      JSON.stringify({
        pass: 'cut',
        image: { width, height },
        elements: [
          { id: 'E001', name: '中文短名', type: 'icon', bbox: ['x', 'y', 'w', 'h'], parent: null },
          {
            id: 'E002',
            name: '相同素材的另一实例',
            type: 'icon',
            bbox: ['x', 'y', 'w', 'h'],
            parent: null,
            duplicateOf: 'E001',
          },
        ],
      }),
  ].join(String.fromCharCode(10));
}

export function uiTextRecognitionPrompt(
  width: number,
  height: number,
  elements: UiBboxElement[]
): string {
  return [
    '这是同一张游戏 UI 的原稿，尺寸 ' +
      width +
      '×' +
      height +
      '，文字还在。下面是已确定的切图元素，坐标已换算到原稿像素空间：',
    JSON.stringify(elements),
    '这次只识别要拼回界面的文字和数字。不要输出图标、底板、人物、星星、箭头、叉号、加号，不新造切图元素。',
    '每个可见文字块单独一项，不合并属性名与数值，不漏页签、按钮、槽位名、数量和货币数字。text 只写图上实际画出的字，不翻译、不补全。',
    'bbox 是原稿像素 [x,y,w,h]，左上角原点，禁止归一化和对角点。parentId 填文字中心所在的已知底板 id，优先最小底板，对不上为 null。id 从 T001 递增。',
    'role 只用 title、tab、button、slot_name、stat_name、stat_value、currency、count、caption、other。标题、页签、按钮字、槽位名 align=center；属性名与说明 left；数值、货币、数量 right；经验和进度数字用墨迹框，align=left。',
    'color 取文字高光近似 #RRGGBB，不一律白色；bold 是布尔。文字全部 cutout=false，后续做 Label，不进 PNG。特殊美术字仍由原稿独立切图支线处理。',
    '只输出 JSON，不要 Markdown，不要解释：' +
      JSON.stringify({
        pass: 'text',
        image: { width, height },
        texts: [
          {
            id: 'T001',
            text: '实际文字',
            bbox: ['x', 'y', 'w', 'h'],
            parentId: null,
            role: 'caption',
            align: 'left',
            color: '#F2D48A',
            bold: false,
            cutout: false,
          },
        ],
      }),
  ].join(String.fromCharCode(10));
}

export interface ServerCanvasRecognitionAttempt extends CanvasRecognitionAttempt {
  server: ServerRecognitionState;
}

/** Both hosts share the workflow; I/O and authority remain outside. */
export async function runCanvasServerRecognition(
  attempt: ServerCanvasRecognitionAttempt,
  host: {
    validateSources(): Promise<void>;
    request(step: ServerRecognitionStep): Promise<Record<string, unknown> | undefined>;
    persist(): void | Promise<void>;
  }
): Promise<ServerCanvasRecognitionAttempt> {
  const state = attempt.server!;
  const started = Date.now();
  try {
    const request = async (step: ServerRecognitionState['cut'], pass: 'cut' | 'text') => {
      await host.validateSources();
      const data = await host.request(step);
      if (!data) {
        attempt.status =
          step.status === 'failed' && step.error?.retryable === false
            ? 'failed'
            : step.status === 'running' && !step.error
              ? 'running'
              : 'unknown';
        attempt.error = step.error
          ? [step.error.code, step.error.message].filter(Boolean).join(': ')
          : step.requestId
            ? '识图任务仍在执行，请继续查询原请求。'
            : '识图等待恢复；需要明确确认后使用原请求继续，不会自动提交。';
        return undefined;
      }
      const size = data.image as { width?: number; height?: number } | undefined;
      if (
        data.pass !== pass ||
        size?.width !== step.image.width ||
        size?.height !== step.image.height
      )
        throw new Error('识图结果阶段或图片尺寸无效。');
      return data;
    };
    const cut = await request(state.cut, 'cut');
    if (!cut) return attempt;
    const cutSource = state.cut.image;
    const design = state.design;
    const cutElements = validateCutElements(cut.elements, cutSource.width, cutSource.height);
    attempt.cut = { image: cutSource, elements: cutElements };
    attempt.phase = 'text';
    const elements = scaleCutElements(cutElements, cutSource, design);
    if (!state.text || (!state.text.submittedAt && !state.text.requestId))
      state.text = {
        key: attempt.id + ':text',
        // Parent geometry is already known locally; keep the paid text prompt bounded.
        prompt:
          uiTextRecognitionPrompt(design.width, design.height, []) +
          '\n本轮不附带切图清单，parentId 全部填写 null。本地按文字中心所在的最小底板关联父级。',
        image: design,
      };
    await host.persist();
    const text = await request(state.text, 'text');
    if (!text) return attempt;
    const bbox = {
      version: 1 as const,
      coordinateSpace: 'design-pixels' as const,
      bboxFormat: 'xywh' as const,
      design,
      cutSource,
      elements,
      texts: validateBboxTexts(text.texts, design.width, design.height, elements).map((item) => {
        if (item.parentId) return item;
        const cx = item.bbox[0] + item.bbox[2] / 2;
        const cy = item.bbox[1] + item.bbox[3] / 2;
        const parents = elements
          .filter(
            ({ type, bbox: [x, y, width, height] }) =>
              type !== 'icon' && cx >= x && cx < x + width && cy >= y && cy < y + height
          )
          .sort((a, b) => a.bbox[2] * a.bbox[3] - b.bbox[2] * b.bbox[3]);
        return { ...item, parentId: parents[0]?.id || null };
      }),
    };
    attempt.result = {
      id: attempt.id,
      model: CANVAS_VISION_MODEL + ' / low',
      prompt: state.cut.prompt + '\n\n' + state.text.prompt,
      createdAt: new Date().toISOString(),
      durationMs: Math.max(1, (state.durationMs || 0) + Date.now() - started),
      sourcePath: cutSource.path,
      sourceSha256: cutSource.sha256,
      width: cutSource.width,
      height: cutSource.height,
      elements: bboxRecognitionElements(bbox),
      bbox,
      ...(state.cut.credits !== undefined && state.text.credits !== undefined
        ? { credits: state.cut.credits + state.text.credits }
        : {}),
    };
    attempt.status = 'succeeded';
    delete attempt.error;
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const validation = /^(识图|普通文字)/.test(message);
    attempt.status = validation ? 'failed' : 'unknown';
    attempt.error = validation
      ? message +
        (state.cut.status === 'succeeded' && state.text?.status === 'succeeded'
          ? ' 两轮原始结果已保留；可查询原请求重新校验，无需重新生成图片。'
          : '')
      : '识图连接或响应无法确认；请查询原请求，不会自动重试。';
  } finally {
    state.durationMs = (state.durationMs || 0) + Math.max(0, Date.now() - started);
    await host.persist();
  }
  return attempt;
}
