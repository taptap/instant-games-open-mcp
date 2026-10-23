import {
  uiRecognitionPrompt,
  uiTextRecognitionPrompt,
  runCanvasServerRecognition,
  type ServerCanvasRecognitionAttempt,
} from '../../../packages/maker-canvas/src/features/serverRecognition.js';
export {
  uiRecognitionPrompt,
  uiTextRecognitionPrompt,
} from '../../../packages/maker-canvas/src/features/serverRecognition.js';
import type { CanvasRecognitionAttempt } from '../../../packages/maker-canvas/src/contracts.js';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { MakerCanvasFiles } from '../canvas/files.js';
import { bboxRecognitionElements, uiRecognitionInputs } from '../canvas/uiRecognition.js';
import {
  scaleCutElements,
  validateCutElements,
  validateBboxTexts,
  validateBboxImage,
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

export interface RecognitionAttempt extends CanvasRecognitionAttempt {
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
    const task = runCanvasServerRecognition(attempt as ServerCanvasRecognitionAttempt, {
      validateSources: async () => {
        const state = attempt.server!;
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
      },
      request: (step) =>
        serverRecognitionRequest(
          this.files,
          attempt.server!,
          step,
          this.fetcher,
          () => this.write(attempt),
          allowPost,
          recover
        ),
      persist: () => this.write(attempt),
    });
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
    if (input.recover === true)
      throw new ConsoleError('未找到原识图请求记录，不能恢复；未提交新请求。', 404);
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
