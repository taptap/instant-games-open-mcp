import fs from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { MakerCanvasFiles } from './files.js';
import { bboxRecognitionElements, uiRecognitionInputs } from './uiRecognition.js';
import { scaleCutElements, validateBboxTexts, validateCutElements } from './uiBbox.js';
import { uiRecognitionPrompt, uiTextRecognitionPrompt } from '../console/canvasRecognition.js';

// Browser work belongs to the host Agent. This only prepares inputs and validates its replies.
export async function webRecognitionInput(
  root: string,
  canvasId: string,
  nodeId: string,
  input: Record<string, any>,
  finish: boolean
) {
  const files = new MakerCanvasFiles(root);
  const document = await files.load(canvasId);
  const node = document.nodes.find((item) => item.id === nodeId);
  if (!node?.uiRecognition) throw new Error('请选择具有 UI 识图功能的卡片。');
  const sources = uiRecognitionInputs(document, node);
  if (sources.cut.uiRecognition?.pendingId)
    throw new Error('原识图请求尚未确认，请先查询原请求，不会准备新的网页请求。');
  const image = (assetPath: string) => {
    const media = files.readMedia(assetPath);
    if (fs.statSync(media.file).size > 20 * 1024 * 1024) throw new Error('识图图片超过 20 MiB。');
    const size = files.imageInfo(assetPath);
    if (!size) throw new Error('识图图片尺寸无效。');
    return {
      path: assetPath,
      sha256: createHash('sha256').update(fs.readFileSync(media.file)).digest('hex'),
      width: size.width,
      height: size.height,
    };
  };
  const design = image(sources.design.assetPath!);
  const cutSource = image(sources.cut.assetPath!);
  const context = { canvasId, nodeId: sources.cut.id, design, cutSource };
  const cutPrompt = uiRecognitionPrompt(cutSource.width, cutSource.height);
  if (!finish && !input.cut)
    return {
      ...context,
      phase: 'cut',
      imagePath: files.readMedia(cutSource.path).file,
      prompt: cutPrompt,
    };
  // Reject replies collected for different files or a different canvas, even at the same size.
  const sameImage = (value: typeof design | undefined, actual: typeof design) =>
    value?.path === actual.path &&
    value?.sha256 === actual.sha256 &&
    value?.width === actual.width &&
    value?.height === actual.height;
  if (
    input.canvasId !== canvasId ||
    input.nodeId !== sources.cut.id ||
    !sameImage(input.design, design) ||
    !sameImage(input.cutSource, cutSource)
  )
    throw new Error('识图输入已变化，请使用本次 recognition-input 返回的图片身份。');
  const { cut, text } = input;
  if (
    cut?.pass !== 'cut' ||
    cut.image?.width !== cutSource.width ||
    cut.image?.height !== cutSource.height
  )
    throw new Error('识图 UI 回复阶段或尺寸不符。');
  const elements = scaleCutElements(
    validateCutElements(cut.elements, cutSource.width, cutSource.height),
    cutSource,
    design
  );
  const textPrompt = uiTextRecognitionPrompt(design.width, design.height, elements);
  if (!finish)
    return {
      ...context,
      phase: 'text',
      imagePath: files.readMedia(design.path).file,
      prompt: textPrompt,
    };
  if (
    text?.pass !== 'text' ||
    text.image?.width !== design.width ||
    text.image?.height !== design.height
  )
    throw new Error('识图文字回复阶段或尺寸不符。');
  if (typeof input.model !== 'string' || !input.model.trim() || input.model.length > 240)
    throw new Error('请记录网页实际模型；未登录或无法确认时填写 ChatGPT web / unknown model。');
  const bbox = {
    version: 1 as const,
    coordinateSpace: 'design-pixels' as const,
    bboxFormat: 'xywh' as const,
    design,
    cutSource,
    elements,
    texts: validateBboxTexts(text.texts, design.width, design.height, elements),
  };
  return {
    nodes: [
      {
        id: sources.cut.id,
        uiRecognition: {
          enabled: true,
          result: {
            id: randomUUID(),
            model: input.model,
            prompt: cutPrompt + '\n\n' + textPrompt,
            createdAt: new Date().toISOString(),
            durationMs: 0,
            sourcePath: cutSource.path,
            sourceSha256: cutSource.sha256,
            width: cutSource.width,
            height: cutSource.height,
            elements: bboxRecognitionElements(bbox),
            bbox,
          },
        },
      },
    ],
  };
}
