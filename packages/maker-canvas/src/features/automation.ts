import type { CanvasDocument, CanvasNode } from '../contracts.js';
import { configureMergeIcons } from './mergeIcons.js';
import { canvasOriginalImage, imageRatioInfo } from './imageSizing.js';
import { canvasGenerationParameterChoices } from './automationInfo.js';
import { imageCardSize } from './imageInfo.js';
import { uiRecognitionStatus, validateUiRecognitionStructure } from './uiRecognition.js';
import { validateCanvasMark } from '../core/marks.js';

import type { CanvasCommand } from '../contracts.js';
import { validateUiAtlasPlanStructure } from './uiAssetBindings.js';
export const CANVAS_SEQUENCE_SETTING_FIELDS = [
  'start',
  'end',
  'fps',
  'width',
  'height',
  'fit',
  'pixel',
  'cutout',
  'cutoutMode',
  'backgroundColor',
  'tolerance',
];

export const CANVAS_COMMAND_ACTIONS = [
  'inspect',
  'save',
  'recognize-ui',
  'create',
  'open',
  'rename',
  'add-template',
  'add-node',
  'sync-ui-batches',
  'update-nodes',
  'delete-nodes',
  'duplicate',
  'group',
  'connect',
  'disconnect',
  'run',
  'stop',
  'query',
  'import',
  'set-references',
  'confirm-model',
  'preview-model',
  'preview-image-assets',
  'confirm-image-assets',
  'export',
  'undo',
  'redo',
  'fill-slot',
  'replace-image',
];
export function validateCanvasCommandStructure(value: unknown): CanvasCommand {
  // Hosts map INVALID_ARGS to "rejected, not executed"; every failure here precedes execution.
  const invalid = (message: string) => Object.assign(new Error(message), { code: 'INVALID_ARGS' });
  const command = value as CanvasCommand;
  if (!command || typeof command !== 'object' || Array.isArray(command))
    throw invalid('命令必须是 JSON 对象。');
  for (const key of Object.keys(command))
    if (
      !['requestId', 'pageId', 'canvasId', 'revision', 'action', 'input', 'allowPaid'].includes(key)
    )
      throw invalid('不支持的命令字段：' + key);
  for (const key of ['requestId', 'pageId', 'canvasId'] as const)
    if (typeof command[key] !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(command[key]))
      throw invalid('缺少或无效的 ' + key);
  if (!CANVAS_COMMAND_ACTIONS.includes(command.action))
    throw invalid('不支持的画布操作。请先查询 capabilities。');
  if (!command.input || typeof command.input !== 'object' || Array.isArray(command.input))
    throw invalid('input 必须是 JSON 对象。');
  if (command.allowPaid !== undefined && typeof command.allowPaid !== 'boolean')
    throw invalid('allowPaid 必须是布尔值。');
  if (
    !['inspect', 'stop', 'query'].includes(command.action) &&
    (!Number.isSafeInteger(command.revision) || command.revision! < 0)
  )
    throw invalid('操作前请 inspect，并传入当前 revision。');
  return command;
}
export function canvasAutomationSnapshot(document: CanvasDocument) {
  return {
    id: document.id,
    title: document.title,
    revision: document.revision,
    nodes: document.nodes.map((node) => {
      const original = node.type === 'image' ? canvasOriginalImage(document, node) : undefined;
      return {
        ...node,
        ...(node.uiRecognition ? { recognitionState: uiRecognitionStatus(node) } : {}),
        ...(node.uiRecognitionSourceId
          ? {
              text: uiRecognitionStatus(
                document.nodes.find((source) => source.id === node.uiRecognitionSourceId)
              ).text,
            }
          : {}),
        ...(node.imageInfo
          ? { imageInfo: { ...node.imageInfo, ...imageRatioInfo(node.imageInfo) } }
          : {}),
        ...(original?.imageInfo
          ? {
              originalImage: {
                nodeId: original.id,
                assetPath: original.assetPath,
                ...original.imageInfo,
                ...imageRatioInfo(original.imageInfo),
              },
            }
          : {}),
      };
    }),
    edges: document.edges,
    templateFlow: document.templateFlow,
    skills: [...new Set(document.nodes.flatMap((node) => node.templateSkills || []))],
  };
}
export function prepareCanvasNodeUpdatesWithValidation(
  document: CanvasDocument,
  input: Record<string, unknown>,
  validation: {
    validateUiRecognition: typeof validateUiRecognitionStructure;
    validateUiAtlasPlan: typeof validateUiAtlasPlanStructure;
  }
) {
  if (
    Object.keys(input).some((key) => key !== 'nodes') ||
    !Array.isArray(input.nodes) ||
    !input.nodes.length ||
    input.nodes.length > 100
  )
    throw new Error('nodes 必须包含 1～100 个卡片修改。');
  const seen = new Set<string>();
  return input.nodes.map((value) => {
    const patch = value as Record<string, unknown>;
    if (!patch || typeof patch !== 'object' || Array.isArray(patch))
      throw new Error('卡片修改无效。');
    const node = document.nodes.find((node) => node.id === patch.id);
    if (!node) throw Object.assign(new Error('卡片不存在或重复。'), { code: 'NOT_FOUND' });
    if (seen.has(node.id)) throw new Error('卡片不存在或重复。');
    seen.add(node.id);
    const next: CanvasNode = JSON.parse(JSON.stringify(node));
    let contentChanged = false;
    for (const [key, value] of Object.entries(patch)) {
      if (key === 'id') continue;
      if (key === 'title' || key === 'text') {
        if (
          typeof value !== 'string' ||
          !value.trim() ||
          value.length > (key === 'title' ? 80 : 4000) ||
          (key === 'text' && node.type !== 'note')
        )
          throw new Error('标题或便签内容无效。');
        next[key] = value;
      } else if (key === 'x' || key === 'y') {
        if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 100000)
          throw new Error('卡片位置无效。');
        if (node.type === 'section') throw new Error('首版不支持移动整个分组。');
        next[key] = value;
      } else if (key === 'width' || key === 'height') {
        const mark = node.type === 'mark';
        const min = mark ? 8 : key === 'width' ? 48 : 36;
        const max = node.type === 'section' ? 100000 : mark ? 8000 : key === 'width' ? 2000 : 1600;
        if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
          throw new Error('卡片' + key + '必须为 ' + min + '～' + max + '。');
        next[key] = value;
      } else if (key === 'uiAtlasPrelayout') {
        if (node.type !== 'image' || typeof value !== 'boolean')
          throw new Error('Bbox 预排开关只能配置在图片卡上。');
        next.uiAtlasPrelayout = value;
        contentChanged = next.uiAtlasPrelayout !== node.uiAtlasPrelayout || contentChanged;
      } else if (key === 'uiAtlasPlan') {
        if (node.type !== 'image') throw new Error('UI 槽位清单只能配置在图片卡上。');
        next.uiAtlasPlan = validation.validateUiAtlasPlan(value);
      } else if (key === 'uiRecognition') {
        const settings = value as Record<string, unknown>;
        if (
          node.type !== 'image' ||
          !next.uiRecognition ||
          !settings ||
          typeof settings !== 'object' ||
          Array.isArray(settings) ||
          !Object.keys(settings).length ||
          Object.keys(settings).some((key) => !['enabled', 'model', 'result'].includes(key)) ||
          (settings.enabled !== undefined && typeof settings.enabled !== 'boolean') ||
          (settings.model !== undefined &&
            (typeof settings.model !== 'string' || !/^[a-zA-Z0-9_.-]{1,80}$/.test(settings.model)))
        )
          throw new Error('识图设置仅支持原稿卡的 enabled、model 和 result。');
        if (settings.enabled !== undefined)
          next.uiRecognition.enabled = settings.enabled as boolean;
        if (settings.model !== undefined) next.uiRecognition.model = settings.model as string;
        if (settings.result !== undefined) {
          if (node.templatePending || !node.assetPath)
            throw new Error('请先完成去文字，再识别当前去文字图并写入清单。');
          if (next.uiRecognition.pendingId) throw new Error('请先确认原识图请求结果。');
          const result = settings.result as import('./uiRecognition.js').UiRecognitionResult;
          if (!result || result.sourcePath !== node.assetPath)
            throw new Error('识图清单不属于当前原稿，请重新看图。');
          next.uiRecognition = validation.validateUiRecognition({
            ...next.uiRecognition,
            enabled: settings.enabled !== false,
            results: [...next.uiRecognition.results, result],
            selectedId: result.id,
          });
          contentChanged = !next.uiRecognition.optional || contentChanged;
        }
      } else if (key === 'mergeIcons') {
        configureMergeIcons(next, value);
        contentChanged = true;
      } else if (key === 'modelQuality') {
        if (
          node.type !== 'model-views' ||
          !['fast', 'balanced', 'high_quality'].includes(String(value))
        )
          throw new Error('模型质量只能在多视图卡上设置为 fast、balanced 或 high_quality。');
        next.modelQuality = value as CanvasNode['modelQuality'];
        contentChanged = true;
      } else if (key === 'prompt' || key === 'parameters') {
        if (!['image', 'video', 'video-source'].includes(node.type))
          throw new Error('此卡片没有生成参数。');
        if (next.assetPath) next.generation ||= { prompt: '' };
        else next.generationDraft ||= { operation: 'generate' };
        const settings = next.assetPath ? next.generation! : next.generationDraft!;
        if (key === 'prompt') {
          if (next.mergeIcons) throw new Error('二合图标提示词由阶段设置生成，请修改 mergeIcons。');
          if (typeof value !== 'string' || !value.trim() || value.length > 8000)
            throw new Error('提示词必须为 1～8000 字符。');
          settings.prompt = value;
        } else {
          if (!value || typeof value !== 'object' || Array.isArray(value))
            throw new Error('生成参数无效。');
          const image = node.type === 'image';
          const choices = canvasGenerationParameterChoices(image);
          for (const [name, setting] of Object.entries(value)) {
            if (image && name === 'model') {
              if (typeof setting !== 'string' || !setting.trim() || setting.length > 200)
                throw new Error('图片模型 ID 无效。');
            } else if (!choices[name]?.includes(setting))
              throw new Error('不支持的生成参数：' + name);
          }
          settings.parameters = { ...settings.parameters, ...value };
          if (
            node.videoInputMode === 'first_last_frame' &&
            settings.parameters.mode !== undefined &&
            settings.parameters.mode !== 'first_last_frame'
          )
            throw new Error('此视频固定使用首尾帧模式。');
        }
        contentChanged = true;
      } else if (key === 'sequenceSettings') {
        if (
          node.type !== 'sequence' ||
          !node.sequenceSettings ||
          !value ||
          typeof value !== 'object' ||
          Array.isArray(value)
        )
          throw new Error('此卡片不能修改抽帧参数。');
        for (const name of Object.keys(value))
          if (!CANVAS_SEQUENCE_SETTING_FIELDS.includes(name))
            throw new Error('首版不支持的抽帧参数：' + name);
        const settings = { ...node.sequenceSettings, ...value };
        if (
          ![
            settings.start,
            settings.end,
            settings.fps,
            settings.width,
            settings.height,
            settings.tolerance,
          ].every(Number.isFinite) ||
          settings.start < 0 ||
          settings.end <= settings.start ||
          settings.end > 86400 ||
          settings.fps < 1 ||
          settings.fps > 30 ||
          Math.ceil((settings.end - settings.start) * settings.fps - 1e-8) > 120 ||
          !Number.isInteger(settings.width) ||
          !Number.isInteger(settings.height) ||
          settings.width < 1 ||
          settings.width > 2048 ||
          settings.height < 1 ||
          settings.height > 2048 ||
          typeof settings.cutout !== 'boolean' ||
          typeof settings.pixel !== 'boolean' ||
          !['contain', 'cover', 'stretch'].includes(settings.fit) ||
          (settings.cutoutMode !== undefined &&
            !['connected', 'chroma'].includes(settings.cutoutMode)) ||
          typeof settings.backgroundColor !== 'string' ||
          !/^#[0-9a-f]{6}$/i.test(settings.backgroundColor) ||
          settings.tolerance < 0 ||
          settings.tolerance > 255
        )
          throw new Error('抽帧参数超出支持范围。');
        next.sequenceSettings = settings;
        contentChanged = true;
      } else if (key === 'mark') {
        if (node.type !== 'mark' || !node.mark) throw new Error('标注样式只能修改标注。');
        if (!value || typeof value !== 'object' || Array.isArray(value))
          throw new Error('标注样式无效。');
        const patch = value as Record<string, unknown>;
        const shape = patch.shape === undefined ? node.mark.shape : patch.shape;
        next.mark = validateCanvasMark({
          ...node.mark,
          ...patch,
          ...(shape === 'ellipse'
            ? { point: undefined, direction: undefined, from: undefined, to: undefined }
            : {}),
        });
      } else throw new Error('不支持的卡片字段：' + key);
    }
    if (
      (patch.width !== undefined || patch.height !== undefined) &&
      next.type === 'image' &&
      next.assetPath &&
      next.imageInfo
    ) {
      const requestedWidth =
        patch.width !== undefined
          ? next.width
          : ((next.height - 42) * next.imageInfo.width) / next.imageInfo.height + 2;
      const size = imageCardSize(requestedWidth, next.imageInfo.width, next.imageInfo.height);
      if (
        !size ||
        size.width < 48 ||
        (patch.width !== undefined && Math.abs(size.width - next.width) > 0.01) ||
        (patch.height !== undefined && Math.abs(size.height - next.height) > 0.01)
      )
        throw new Error(
          '图片卡片尺寸需符合原图比例及尺寸范围；请只设置 width 或 height，另一边自动适配。'
        );
      Object.assign(next, size);
    }
    if (contentChanged && next.generation && !next.generation.prompt.trim())
      throw new Error('此素材尚未保存提示词，请在同一次修改中提供 prompt。');
    if (['model', 'model-views'].includes(next.type)) delete next.templatePending;
    else if (contentChanged && next.sectionId) next.templatePending = true;
    return { node: next, contentChanged };
  });
}
