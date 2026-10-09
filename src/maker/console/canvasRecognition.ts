import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { MakerCanvasFiles } from '../canvas/files.js';
import { validateUiElements, type UiRecognitionResult } from '../canvas/uiRecognition.js';
import { ConsoleError } from './types.js';

export interface UiVisionModel {
  id: string;
  model: string;
  endpoint: string;
  apiKeyEnv?: string;
}

export function configuredUiVisionModels(): UiVisionModel[] {
  const filename = process.env.TAPTAP_MAKER_VISION_CONFIG;
  if (!filename) return [];
  let values: unknown;
  try {
    values = JSON.parse(fs.readFileSync(filename, 'utf8'));
  } catch {
    throw new ConsoleError('识图模型配置无法读取，请检查 TAPTAP_MAKER_VISION_CONFIG。');
  }
  if (!Array.isArray(values) || values.length > 20)
    throw new ConsoleError('识图模型配置应为模型列表。');
  const ids = new Set<string>();
  return values.map((value) => {
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
    let url: URL;
    try {
      url = new URL(value.endpoint);
    } catch {
      throw new ConsoleError('识图服务地址无效。');
    }
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.protocol !== 'https:' &&
        !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)))
    )
      throw new ConsoleError('识图服务应使用 HTTPS，或本机 HTTP；地址不能包含凭证、查询参数。');
    ids.add(value.id);
    return { id: value.id, model: value.model, endpoint: url.href, apiKeyEnv: value.apiKeyEnv };
  });
}

export function uiRecognitionPrompt(width: number, height: number): string {
  return [
    '分析这张游戏 UI 原设计稿，返回 JSON 对象 {"elements":[...]}，不要生成图片或 Markdown。',
    '原图尺寸为 ' + width + '×' + height + '。rect 必须使用原图绝对像素 [x,y,width,height]。',
    '从上到下、从左到右覆盖全部可见 UI 元素，特别核对底部、重复行、小按钮和不同配色的按钮；重复实例也逐个记录。',
    '每项字段：id（字母开头的唯一编号）、name（含颜色/形状等区分信息）、category、rect、parentId（无父级为null）、zIndex（整数）、states（实际可见状态名称数组）、cutout（布尔）。',
    'category 仅使用：icon（独立图标和前景装饰）、frame（内部底框、信息条、进度条各层）、tab（页签底板）、action（主操作/购买/领取按钮底板）、shortcut（快捷入口底板）、close（关闭/返回底板）、title（标题底板）、panel（完整外部主面板或背景）、art_text（装饰性美术字）、text（普通文字）。',
    '按钮上的图标与底板分别记录；面板边框与其所属底色保持一体；叠加的上层控件分别记录。不要把底板覆盖的所有控件合成一个元素。',
    '普通文字、数字记录为 text，cutout=false；需要图片素材的元素 cutout=true。不能凭空添加原稿不存在的组件或状态。',
    'ID 在本次清单中稳定且唯一，父级只能引用本清单 ID。仅返回 JSON，不省略字段。',
  ].join(String.fromCharCode(10));
}

export interface RecognitionAttempt {
  id: string;
  canvasId: string;
  nodeId: string;
  model: string;
  sourcePath: string;
  status: 'running' | 'succeeded' | 'failed' | 'unknown';
  result?: UiRecognitionResult;
  error?: string;
}
const active = new Map<string, Promise<RecognitionAttempt>>();

export class CanvasRecognitionService {
  private files: MakerCanvasFiles;
  constructor(
    root: string,
    private models = configuredUiVisionModels(),
    private fetcher = fetch
  ) {
    this.files = new MakerCanvasFiles(root);
  }
  modelsForDisplay() {
    return this.models.map(({ id, model }) => ({ id, model }));
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
    if (attempt.status === 'running' && !active.has(filename))
      return {
        ...attempt,
        status: 'unknown',
        error: '识图等待已中断，远端结果未知；请核对服务端请求记录，不会自动重试。',
      };
    return attempt;
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
    }
  ): Promise<RecognitionAttempt> {
    const filename = this.filename(input.id);
    if (fs.existsSync(filename)) {
      const previous = this.query(canvasId, input.id);
      if (previous.nodeId !== input.nodeId || previous.model !== input.model)
        throw new ConsoleError('识图请求编号已被其他输入使用。', 409);
      return active.get(filename) || previous;
    }
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
    const model = this.models.find((model) => model.id === input.model);
    if (!model) throw new ConsoleError('尚未配置所选识图模型，请配置 TAPTAP_MAKER_VISION_CONFIG。');
    if (![input.width, input.height].every((n) => Number.isInteger(n) && n > 0 && n <= 16384))
      throw new ConsoleError('原稿尺寸无效。');
    const key = model.apiKeyEnv ? process.env[model.apiKeyEnv] : undefined;
    if (model.apiKeyEnv && !key) throw new ConsoleError('识图模型的密钥环境变量未配置。');
    const media = this.files.readMedia(node.assetPath);
    const bytes = fs.readFileSync(media.file);
    if (bytes.length > 20 * 1024 * 1024) throw new ConsoleError('识图原稿超过 20 MiB。');
    const prompt = uiRecognitionPrompt(input.width, input.height);
    const attempt: RecognitionAttempt = {
      id: input.id,
      canvasId,
      nodeId: node.id,
      model: model.id,
      sourcePath: node.assetPath,
      status: 'running',
    };
    // Persist before sending: a lost HTTP response must not replay a potentially billed request.
    this.write(attempt);
    const task = (async () => {
      const started = Date.now();
      try {
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
            response_format: { type: 'json_object' },
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: prompt },
                  {
                    type: 'image_url',
                    image_url: {
                      url: 'data:' + media.type + ';base64,' + bytes.toString('base64'),
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
              ? '所选模型或接口可能不支持图片输入或 JSON 输出；建议切换支持这两项能力的识图模型后重试。'
              : response.status === 401 || response.status === 403
                ? '请检查模型服务密钥和访问权限。'
                : response.status === 404
                  ? '请检查接口地址及模型名称，或切换已配置的识图模型。'
                  : response.status === 429
                    ? '请检查模型服务额度或限流，稍后再试或切换可用模型。'
                    : '请先核对模型服务中的原请求状态，结果可能未知，不会自动重试。');
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
          let data: { elements: unknown };
          try {
            data = JSON.parse(content);
          } catch {
            throw new Error('识图返回的内容不是有效 JSON。');
          }
          const elements = validateUiElements(data?.elements, input.width, input.height);
          attempt.result = {
            id: input.id,
            model: model.id + ' / ' + model.model,
            prompt,
            createdAt: new Date().toISOString(),
            durationMs: Date.now() - started,
            sourcePath: node.assetPath!,
            sourceSha256: createHash('sha256').update(bytes).digest('hex'),
            width: input.width,
            height: input.height,
            elements,
          };
          attempt.status = 'succeeded';
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        const validation = /^(识图|普通文字)/.test(message);
        attempt.status = validation ? 'failed' : 'unknown';
        attempt.error = validation
          ? message + ' 请核对模型是否支持图片输入和 JSON 输出；建议切换识图模型后重试。'
          : '识图连接中断或响应无法确认，结果未知；请查询原请求，不会自动重试。';
      }
      this.write(attempt);
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
