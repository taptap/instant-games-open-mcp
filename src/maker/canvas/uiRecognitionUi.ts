import { createUiRecognitionUiWithHost } from '../../../packages/maker-canvas/src/browser/uiRecognitionUi.js';
export { drawUiRecognition } from '../../../packages/maker-canvas/src/browser/uiRecognitionUi.js';
export function createUiRecognitionUi(
  options: Omit<
    Parameters<typeof createUiRecognitionUiWithHost>[0],
    'readSource' | 'webRecognitionHint' | 'localRecognitionHint' | 'localRecognitionViewHint'
  >
) {
  return createUiRecognitionUiWithHost({
    ...options,
    /* Retired local/website guidance. Recognition now uses API providers only.
    webRecognitionHint:
      '请让当前 AI 按当前模板关联的 Skill 使用已有浏览器完成 ChatGPT 网页识图并回填。无需安装执行器。登录可选：未登录时可选择直接识图，或登录后识图；未登录无法选择模型，识别质量和 Bbox 准确度可能有偏差。已登录则沿用当前模型和思考程度。',
    localRecognitionHint:
      '当前使用本地模型，请让 AI 客户端读取设计稿，通过 Maker CLI 写入 Bbox。画布不能直接调用客户端模型；也可在设置中选择自定义 API。',
    localRecognitionViewHint:
      '当前使用本地模型。请让 AI 客户端识别 UI 设计稿，通过 Maker CLI 写入 Bbox 后，在这里查看标注。',
    */
    readSource: async (path, signal) => {
      const response = await fetch(options.store.mediaUrl(path), { signal });
      if (!response.ok) throw new Error('无法读取识图原稿。');
      return response.blob();
    },
  });
}
