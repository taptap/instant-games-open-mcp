import { canvasLogLevel, CANVAS_LOG_STYLES } from '../logUi.js';
import { getCanvasPageHtml } from '../page.js';

test.each([
  ['开始生成视频', 'info'],
  ['处理失败', 'error'],
  ['请先完成上游', 'warning'],
  ['error result: execution state is unknown', 'warning'],
  ['{"execution_state":"unknown"}', 'warning'],
])('classifies display messages without changing task state: %s', (message, level) => {
  expect(canvasLogLevel(message)).toBe(level);
});

test('bundles an independent collapsible log and preserves the hidden compatibility error field', () => {
  const page = getCanvasPageHtml();
  expect(page).toContain(CANVAS_LOG_STYLES);
  expect(page).toContain(
    "createCanvasLog(document.getElementById('canvas-log'), [videoHistoryButton])"
  );
  expect(page).not.toContain('<button id="video-history"');
  expect(page).toContain('<p id="error" hidden aria-hidden="true">');
  expect(page).toContain('canvasLogs.setContext(documentState.id)');
});
