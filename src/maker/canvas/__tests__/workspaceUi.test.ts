import { getCanvasPageHtml } from '../page.js';
import { CANVAS_WORKSPACE_STYLES } from '../workspaceUi.js';

test('workspace is declared in the page scope, not inside injected helpers', () => {
  const page = getCanvasPageHtml();
  expect(page).toContain(
    "const sequenceVideo = document.getElementById('sequence-source');\n  let workspace = null;"
  );
  expect(page.match(/let workspace = null;/g)).toHaveLength(1);
  expect(page).toContain(
    'function render() {\n    if (!documentState) return;\n    if (workspace) workspace.sync();'
  );
});

test('workspace keeps page actions and scoped layout without legacy hidden action rules', () => {
  const page = getCanvasPageHtml();
  expect(page).toContain(CANVAS_WORKSPACE_STYLES);
  expect(page).not.toContain('#export-canvas { display: none !important; }');
  expect(page).toContain('void workspace.activate(select.value)');
  expect(page).toContain('if (!(await leaveCurrent())) return false;');
  expect(page).toContain('const next = future.shift();');
  expect(page).toContain('videoHistory.inert = true');
  expect(page).toContain('videoHistory.inert = false');
});
