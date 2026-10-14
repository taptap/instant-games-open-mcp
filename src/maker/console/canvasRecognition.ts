import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { MakerCanvasFiles } from '../canvas/files.js';
import {
  bboxRecognitionElements,
  uiRecognitionInputs,
  type UiRecognitionResult,
} from '../canvas/uiRecognition.js';
import {
  scaleCutElements,
  validateCutElements,
  validateBboxTexts,
  validateBboxImage,
  type UiBboxElement,
  type UiBboxImage,
} from '../canvas/uiBbox.js';
import {
  readVisionSettings,
  UI_VISION_MODEL,
  validateVisionEndpoint,
  visionChatCompletionsUrl,
  modelSettingsForDisplay,
  type VisionSource,
} from './visionSettings.js';
import { ConsoleError } from './types.js';
import {
  serverRecognitionContext,
  serverRecognitionAvailable,
  serverRecognitionBody,
  serverRecognitionImage,
  serverRecognitionRequest,
  type ServerRecognitionState,
} from './serverRecognition.js';

export interface UiVisionModel {
  id: string;
  model: string;
  endpoint: string;
  source?: VisionSource;
  apiKeyEnv?: string;
  apiKey?: string;
}

export function configuredUiVisionModels(): UiVisionModel[] {
  const local = readVisionSettings();
  if (local) {
    if (local.source === 'chatgpt-web')
      return [
        { id: 'chatgpt-web', model: 'ChatGPT 网页当前模型', endpoint: '', source: 'chatgpt-web' },
      ];
    if (local.source === 'custom' && local.baseUrl && local.apiKey)
      return [
        {
          id: UI_VISION_MODEL,
          model: local.model || UI_VISION_MODEL,
          endpoint: visionChatCompletionsUrl(local.baseUrl),
          source: 'custom',
          apiKey: local.apiKey,
        },
      ];
    return [
      {
        id: UI_VISION_MODEL,
        model: UI_VISION_MODEL,
        endpoint: '',
        source: local.source,
      },
    ];
  }
  const filename = process.env.TAPTAP_MAKER_VISION_CONFIG;
  if (!filename)
    return [{ id: UI_VISION_MODEL, model: UI_VISION_MODEL, endpoint: '', source: 'server' }];
  let values: unknown;
  try {
    values = JSON.parse(fs.readFileSync(filename, 'utf8'));
  } catch {
    throw new ConsoleError('识图模型配置无法读取，请检查 TAPTAP_MAKER_VISION_CONFIG。');
  }
  if (!Array.isArray(values) || values.length > 20)
    throw new ConsoleError('识图模型配置应为模型列表。');
  const ids = new Set<string>();
  return values
    .map((value) => {
      if (
        !value ||
        typeof value.id !== 'string' ||
        !/^[a-zA-Z0-9_.-]{1,80}$/.test(value.id) ||
        ids.has(value.id) ||
        typeof value.model !== 'string' ||
        !value.model ||
        value.model.length > 120 ||
        typeof value.endpoint !== 'string' ||
        (value.apiKeyEnv !== undefined && !/^[A-Z][A-Z0-9_]{0,100}$/.test(value.apiKeyEnv))
      )
        throw new ConsoleError('识图模型配置字段无效。');
      ids.add(value.id);
      return {
        id: value.id,
        model: value.model,
        endpoint: validateVisionEndpoint(value.endpoint),
        source: 'custom' as const,
        apiKeyEnv: value.apiKeyEnv,
      };
    })
    .filter((value) => value.model === UI_VISION_MODEL)
    .slice(0, 1);
}

export async function resolvedUiVisionModels(
  root?: string,
  fetcher = fetch
): Promise<UiVisionModel[]> {
  const models = configuredUiVisionModels();
  if (models[0]?.source !== 'server' || (await serverRecognitionAvailable(root, fetcher)))
    return models;
  return [
    { id: 'chatgpt-web', model: 'ChatGPT 网页当前模型', endpoint: '', source: 'chatgpt-web' },
  ];
}

export async function resolvedModelSettingsForDisplay(root?: string, fetcher = fetch) {
  const settings = modelSettingsForDisplay();
  const available = await serverRecognitionAvailable(root, fetcher);
  const source = configuredUiVisionModels()[0]?.source || settings.vision.source;
  return {
    ...settings,
    vision: {
      ...settings.vision,
      selectedSource: source,
      source: source === 'server' && !available ? 'chatgpt-web' : source,
      serverAvailable: available,
    },
  };
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

export interface RecognitionAttempt {
  id: string;
  canvasId: string;
  nodeId: string;
  model: string;
  source?: VisionSource;
  sourcePath: string;
  phase?: 'cut' | 'text';
  cut?: { image: UiBboxImage; elements: UiBboxElement[] };
  status: 'running' | 'succeeded' | 'failed' | 'unknown';
  result?: UiRecognitionResult;
  error?: string;
  server?: ServerRecognitionState;
}
const active = new Map<string, Promise<RecognitionAttempt>>();

export class CanvasRecognitionService {
  private files: MakerCanvasFiles;
  constructor(
    root: string,
    private models?: UiVisionModel[],
    private fetcher = fetch
  ) {
    this.files = new MakerCanvasFiles(root);
  }
  async modelsForDisplay() {
    return (this.models || (await resolvedUiVisionModels(this.files.root, this.fetcher))).map(
      ({ id, model, source }) => ({
        id,
        model,
        source: source || 'custom',
      })
    );
  }
  private filename(id: string, create = false) {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new ConsoleError('识图请求编号无效。');
    let folder = this.files.root;
    for (const part of ['.maker', 'canvases', 'recognition-attempts']) {
      folder = path.join(folder, part);
      if (!fs.existsSync(folder) && create) fs.mkdirSync(folder);
      if (fs.existsSync(folder) && fs.lstatSync(folder).isSymbolicLink())
        throw new ConsoleError('识图记录目录不能是符号链接。');
    }
    const filename = path.join(folder, id + '.json');
    if (fs.existsSync(filename) && fs.lstatSync(filename).isSymbolicLink())
      throw new ConsoleError('识图记录不能是符号链接。');
    return filename;
  }
  private write(attempt: RecognitionAttempt) {
    const filename = this.filename(attempt.id, true);
    const temporary = filename + '.' + randomUUID() + '.tmp';
    try {
      fs.writeFileSync(temporary, JSON.stringify(attempt), { flag: 'wx', mode: 0o600 });
      fs.renameSync(temporary, filename);
    } finally {
      fs.rmSync(temporary, { force: true });
    }
  }
  query(canvasId: string, id: string): RecognitionAttempt {
    const filename = this.filename(id);
    if (!fs.existsSync(filename))
      throw new ConsoleError('未找到识图请求记录；不会自动重新提交。', 404);
    const attempt = JSON.parse(fs.readFileSync(filename, 'utf8')) as RecognitionAttempt;
    if (attempt.canvasId !== canvasId) throw new ConsoleError('识图请求不属于当前画布。', 404);
    if (attempt.status === 'running' && !attempt.server && !active.has(filename))
      return {
        ...attempt,
        status: 'unknown',
        error: '识图等待已中断，远端结果未知；请核对服务端请求记录，不会自动重试。',
      };
    return attempt;
  }
  async refresh(canvasId: string, id: string): Promise<RecognitionAttempt> {
    const attempt = this.query(canvasId, id);
    return attempt.server && attempt.status !== 'succeeded'
      ? this.runServer(attempt, false, false)
      : attempt;
  }
  private async runServer(attempt: RecognitionAttempt, allowPost: boolean, recover: boolean) {
    const filename = this.filename(attempt.id);
    const existing = active.get(filename);
    if (existing) return existing;
    const task = (async () => {
      const state = attempt.server!;
      const started = Date.now();
      try {
        const request = async (step: ServerRecognitionState['cut'], pass: 'cut' | 'text') => {
          const document = await this.files.load(attempt.canvasId);
          const node = document.nodes.find((item) => item.id === attempt.nodeId);
          if (!node) throw new ConsoleError('识图输入卡片已变化，不能恢复原请求。');
          const inputs = uiRecognitionInputs(document, node);
          if (
            inputs.cut.assetPath !== state.cut.image.path ||
            inputs.design.assetPath !== state.design.path
          )
            throw new ConsoleError('识图输入图片已变化，不能恢复原请求。');
          serverRecognitionImage(this.files, state.cut.image);
          serverRecognitionImage(this.files, state.design);
          const data = await serverRecognitionRequest(
            this.files,
            state,
            step,
            this.fetcher,
            () => this.write(attempt),
            allowPost,
            recover
          );
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
            throw new ConsoleError('识图结果阶段或图片尺寸无效。');
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
        this.write(attempt);
        const text = await request(state.text, 'text');
        if (!text) return attempt;
        const bbox = {
          version: 1 as const,
          coordinateSpace: 'design-pixels' as const,
          bboxFormat: 'xywh' as const,
          design,
          cutSource,
          elements,
          texts: validateBboxTexts(text.texts, design.width, design.height, elements).map(
            (item) => {
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
            }
          ),
        };
        attempt.result = {
          id: attempt.id,
          model: UI_VISION_MODEL + ' / low',
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
          ? message
          : '识图连接或响应无法确认；请查询原请求，不会自动重试。';
      } finally {
        state.durationMs = (state.durationMs || 0) + Math.max(0, Date.now() - started);
        this.write(attempt);
      }
      return attempt;
    })();
    active.set(filename, task);
    try {
      return await task;
    } finally {
      active.delete(filename);
    }
  }
  async run(
    canvasId: string,
    input: {
      id: string;
      nodeId: string;
      model: string;
      revision: number;
      width: number;
      height: number;
      recover?: boolean;
    }
  ): Promise<RecognitionAttempt> {
    const filename = this.filename(input.id);
    if (fs.existsSync(filename)) {
      const previous = this.query(canvasId, input.id);
      if (previous.nodeId !== input.nodeId || previous.model !== input.model)
        throw new ConsoleError('识图请求编号已被其他输入使用。', 409);
      return (
        active.get(filename) ||
        (previous.server && previous.status !== 'succeeded'
          ? this.runServer(previous, input.recover === true, input.recover === true)
          : previous)
      );
    }
    const models = this.models || (await resolvedUiVisionModels(this.files.root, this.fetcher));
    const document = await this.files.load(canvasId);
    if (fs.existsSync(filename)) return this.run(canvasId, input);
    if (document.revision !== input.revision)
      throw new ConsoleError('画布已变化，请先保存再识图。', 409);
    const node = document.nodes.find((node) => node.id === input.nodeId);
    if (
      node?.type !== 'image' ||
      node.templatePending ||
      !node.assetPath ||
      !node.uiRecognition ||
      node.uiRecognition.pendingId !== input.id
    )
      throw new ConsoleError('请先保存原稿及本次识图请求。');
    const model = models.find((model) => model.id === input.model);
    if (models[0]?.source === 'chatgpt-web')
      throw new ConsoleError(
        '当前使用 ChatGPT 网页识图，请让当前 AI 按当前模板关联的 Skill 使用已有浏览器完成识图并回填。无需安装执行器；登录可选，未登录无法选择模型，识别质量和 Bbox 准确度可能有偏差。',
        409
      );
    if (!model) throw new ConsoleError('识图配置已变化，请刷新后重试，并检查设置中的 API 配置。');
    const source = model.source || 'custom';
    if (source === 'local')
      throw new ConsoleError(
        '当前使用本地模型。请让 AI 客户端读取设计稿，通过 Maker CLI 写入 Bbox；画布不能直接调用客户端模型。也可在设置中选择自定义 API。',
        503
      );
    if (source === 'server') serverRecognitionContext(this.files.root);
    if (![input.width, input.height].every((n) => Number.isInteger(n) && n > 0 && n <= 16384))
      throw new ConsoleError('原稿尺寸无效。');
    const key = model.apiKey || (model.apiKeyEnv ? process.env[model.apiKeyEnv] : undefined);
    if (model.apiKeyEnv && !key) throw new ConsoleError('识图模型的密钥环境变量未配置。');
    const media = this.files.readMedia(node.assetPath);
    const bytes = fs.readFileSync(media.file);
    if (bytes.length > 20 * 1024 * 1024) throw new ConsoleError('识图原稿超过 20 MiB。');
    const cutSize = this.files.imageInfo(node.assetPath);
    if (!cutSize || cutSize.width !== input.width || cutSize.height !== input.height)
      throw new ConsoleError('去文字图真实尺寸与识图请求不一致。');
    let originalPath: string;
    try {
      const inputs = uiRecognitionInputs(document, node);
      if (inputs.cut.id !== node.id) throw new Error('请从去文字稿提交识图请求。');
      originalPath = inputs.design.assetPath!;
    } catch (error) {
      throw new ConsoleError((error as Error).message);
    }
    const originalMedia = this.files.readMedia(originalPath);
    const originalBytes = fs.readFileSync(originalMedia.file);
    const originalSize = this.files.imageInfo(originalPath);
    if (!originalSize || originalBytes.length > 20 * 1024 * 1024)
      throw new ConsoleError('原 UI 设计稿尺寸无效或超过 20 MiB。');
    const design: UiBboxImage = {
      path: originalPath,
      sha256: createHash('sha256').update(originalBytes).digest('hex'),
      width: originalSize.width,
      height: originalSize.height,
    };
    const cutSource: UiBboxImage = {
      path: node.assetPath,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      width: cutSize.width,
      height: cutSize.height,
    };
    const prompt = uiRecognitionPrompt(cutSize.width, cutSize.height);
    validateBboxImage(design);
    validateBboxImage(cutSource);
    const attempt: RecognitionAttempt = {
      id: input.id,
      canvasId,
      nodeId: node.id,
      model: model.id,
      source,
      sourcePath: node.assetPath,
      status: 'running',
      phase: 'cut',
    };
    if (source === 'server') {
      attempt.server = {
        ...serverRecognitionContext(this.files.root),
        startedAt: new Date().toISOString(),
        design,
        cut: { key: input.id + ':cut', prompt, image: cutSource },
      };
      serverRecognitionBody(this.files, attempt.server.cut);
      serverRecognitionBody(this.files, {
        key: input.id + ':text',
        prompt: 'validate',
        image: design,
      });
      this.write(attempt);
      return this.runServer(attempt, true, false);
    }
    // Persist before sending: a lost HTTP response must not replay a potentially billed request.
    this.write(attempt);
    const task = (async () => {
      const started = Date.now();
      try {
        const request = async (
          requestPrompt: string,
          imageBytes: Buffer,
          imageType: string,
          pass: 'cut' | 'text',
          size: { width: number; height: number }
        ) => {
          const response = await this.fetcher(model.endpoint, {
            method: 'POST',
            redirect: 'error',
            signal: AbortSignal.timeout(180000),
            headers: {
              'content-type': 'application/json',
              ...(key ? { Authorization: 'Bearer ' + key } : {}),
            },
            body: JSON.stringify({
              model: model.model,
              ...(model.model === UI_VISION_MODEL ? { reasoning_effort: 'low' } : {}),
              response_format: { type: 'json_object' },
              messages: [
                {
                  role: 'user',
                  content: [
                    { type: 'text', text: requestPrompt },
                    {
                      type: 'image_url',
                      image_url: {
                        url: 'data:' + imageType + ';base64,' + imageBytes.toString('base64'),
                        detail: 'high',
                      },
                    },
                  ],
                },
              ],
            }),
          });
          if (!response.ok) {
            attempt.status = response.status >= 500 ? 'unknown' : 'failed';
            attempt.error =
              '识图服务返回 HTTP ' +
              response.status +
              '。' +
              (response.status === 400 || response.status === 422
                ? '请核对模型名称，以及接口对图片、JSON 和请求参数的支持。'
                : response.status === 401 || response.status === 403
                  ? '请检查模型服务密钥和访问权限。'
                  : response.status === 404
                    ? '请在控制台设置中检查接口地址及模型名称。'
                    : response.status === 429
                      ? '请检查模型服务额度或限流，稍后再试。'
                      : '请先核对模型服务中的原请求状态，结果可能未知，不会自动重试。');
            return undefined;
          } else {
            const text = await response.text();
            if (text.length > 2 * 1024 * 1024) throw new Error('识图响应超过 2 MiB。');
            let body;
            try {
              body = JSON.parse(text);
            } catch {
              throw new Error('识图响应不是有效协议 JSON。');
            }
            const content = body?.choices?.[0]?.message?.content;
            if (typeof content !== 'string' || body.choices?.[0]?.finish_reason === 'length')
              throw new Error('识图响应缺少完整文本结果。');
            let data;
            try {
              data = JSON.parse(content);
            } catch {
              throw new Error('识图返回的内容不是有效 JSON。');
            }
            if (
              !data ||
              data.pass !== pass ||
              data.image?.width !== size.width ||
              data.image?.height !== size.height
            )
              throw new Error('识图结果阶段或图片尺寸无效。');
            return data;
          }
        };
        const cut = await request(prompt, bytes, media.type, 'cut', cutSize);
        if (!cut) return attempt;
        const cutElements = validateCutElements(cut.elements, cutSize.width, cutSize.height);
        attempt.cut = { image: cutSource, elements: cutElements };
        attempt.phase = 'text';
        this.write(attempt);
        const elements = scaleCutElements(cutElements, cutSize, design);
        const textPrompt = uiTextRecognitionPrompt(design.width, design.height, elements);
        const text = await request(textPrompt, originalBytes, originalMedia.type, 'text', design);
        if (!text) return attempt;
        const bbox = {
          version: 1 as const,
          coordinateSpace: 'design-pixels' as const,
          bboxFormat: 'xywh' as const,
          design,
          cutSource,
          elements,
          texts: validateBboxTexts(text.texts, design.width, design.height, elements),
        };
        attempt.result = {
          id: input.id,
          model: model.model + (model.model === UI_VISION_MODEL ? ' / low' : ''),
          prompt: prompt + String.fromCharCode(10, 10) + textPrompt,
          createdAt: new Date().toISOString(),
          durationMs: Date.now() - started,
          sourcePath: node.assetPath!,
          sourceSha256: cutSource.sha256,
          width: input.width,
          height: input.height,
          elements: bboxRecognitionElements(bbox),
          bbox,
        };
        attempt.status = 'succeeded';
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        const validation = /^(识图|普通文字)/.test(message);
        attempt.status = validation ? 'failed' : 'unknown';
        attempt.error = validation
          ? message + ' 请核对所选模型的接口配置与原稿；不会切换其他模型。'
          : '识图连接中断或响应无法确认，结果未知；请查询原请求，不会自动重试。';
      } finally {
        this.write(attempt);
      }
      return attempt;
    })();
    active.set(filename, task);
    try {
      return await task;
    } finally {
      active.delete(filename);
    }
  }
}
