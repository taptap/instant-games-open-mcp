import { createCanvasTemplateUi } from './templateUi.js';
import { validateUiAtlasPlan } from './uiAssetBindings.js';
import { prepareCanvasImportedNode } from './automationAssets.js';
import { createCanvasResourceExport, downloadCanvasResource } from './resourceExport.js';
import { createSequenceUiController } from './sequenceUi.js';
import { createCanvasAutomationUi } from './automationUi.js';
import { createImageAssetsUi } from './imageAssetsUi.js';
import { createCanvasModelUi } from './model3dUi.js';
import { createUiRecognitionUi } from './uiRecognitionUi.js';
import { createCanvasGenerationUi } from './generationUi.js';
import type { CanvasPageHost } from '../../../packages/maker-canvas/src/browser/pageHost.js';
import type { CanvasCommand } from './automation.js';
import { connectCanvasAutomation } from './automationClient.js';
import { createBrowserCanvasDocumentStore } from './store.js';
import { gameUiHandoffText } from './uiWorkflowHandoff.js';

export function createLocalCanvasHost(projectKey: string): CanvasPageHost {
  const store = createBrowserCanvasDocumentStore(projectKey);
  return {
    store,
    createCanvasTemplateUi,
    deliverCanvasSnapshot(dataUrl, filename) {
      const link = document.createElement('a');
      link.download = filename;
      link.href = dataUrl;
      link.click();
    },
    unavailableReason: projectKey ? undefined : '缺少项目标识。',
    createCanvasGenerationUi,
    createUiRecognitionUi,
    createCanvasModelUi,
    createImageAssetsUi,
    createCanvasAutomationUi,
    createSequenceUiController,
    createCanvasResourceExport,
    downloadCanvasResource,
    prepareCanvasImportedNode,
    validateUiAtlasPlan,
    async readSource(path, signal, failure) {
      const response = await fetch(store.mediaUrl(path), { signal });
      if (!response.ok) throw new Error(failure);
      return response.blob();
    },
    publishActivity(running, pendingImport) {
      const canvasWindow: Window & {
        makerCanvasSequenceRunning?: boolean;
        makerCanvasPendingImport?: boolean;
      } = window;
      canvasWindow.makerCanvasSequenceRunning = running;
      if (pendingImport !== undefined) canvasWindow.makerCanvasPendingImport = pendingImport;
    },
    publishUnsaved(value: boolean): void {
      const canvasWindow: Window & { makerCanvasUnsaved?: boolean } = window;
      canvasWindow.makerCanvasUnsaved = value;
    },
    connectAutomation(options: Omit<Parameters<typeof connectCanvasAutomation>[0], 'projectKey'>) {
      return connectCanvasAutomation({ ...options, projectKey });
    },
    async deliverAutomationExport(
      command: Pick<CanvasCommand, 'requestId' | 'pageId'>,
      blob: Blob
    ): Promise<void> {
      if (!blob.size || blob.size > 128 * 1024 * 1024) throw new Error('导出文件必须小于128 MiB。');
      const response = await fetch(
        '/api/projects/' +
          encodeURIComponent(projectKey) +
          '/canvases/automation/exports/' +
          encodeURIComponent(command.requestId) +
          '?pageId=' +
          encodeURIComponent(command.pageId),
        { method: 'POST', body: blob, signal: AbortSignal.timeout(60000) }
      );
      if (!response.ok) {
        const failure = await response.json().catch(function () {
          return {};
        });
        throw new Error(failure.error || '导出结果传输失败，请重新导出，不要重新生成。');
      }
    },
    gameUiNextStep: (canvasId: string) => ({
      skill: 'maker-ui-workflow',
      instruction:
        '若用户目标是可编辑游戏 UI，请由当前 Agent 继续完成以下步骤，不停在 PNG 或要求用户再次复制指令；若只要求切图则在导出结束。单卡导出不代表整套资源已经完成。 ' +
        gameUiHandoffText(canvasId, projectKey),
    }),
  };
}
