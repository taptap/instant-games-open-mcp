import { canvasCardStatus, CANVAS_CARD_STATUS_STYLES } from '../cardStatus.js';
import { getCanvasPageHtml } from '../page.js';

test.each([
  [{ busy: true, generation: 'failed' }, 'loading'],
  [{ generation: 'running' }, 'loading'],
  [{ generation: 'pending' }, 'loading'],
  [{ template: 'pending' }, 'waiting'],
  [{ template: 'loading' }, 'loading'],
  [{ template: 'pending', generation: 'failed' }, 'failed'],
  [{ template: 'loading', generation: 'unknown' }, 'unknown'],
  [{ generation: 'canceled' }, 'paused'],
  [{ sequence: 'running' }, 'loading'],
  [{ sequence: 'ready' }, 'paused'],
  [{ sequence: 'cancelled' }, 'paused'],
  [{ sequence: 'failed', template: 'pending' }, 'failed'],
  [{ sequence: 'complete', template: 'complete' }, undefined],
  [{ generation: 'succeeded' }, undefined],
  [{}, undefined],
])('shows the real state without disguising failures as loading: %j', (input, expected) => {
  expect(canvasCardStatus(input)).toBe(expected);
});

test('bundles the overlay and reduced-motion style into the actual canvas page', () => {
  const page = getCanvasPageHtml();
  expect(page).toContain(CANVAS_CARD_STATUS_STYLES);
  expect(page).toContain('renderCanvasCardStatus(card, overlayState');
  expect(page).toContain('generationUi.nodeState(node.id)');
  expect(page).toContain('sequenceUi.view(node.id).run');
  expect(page).toContain('prefers-reduced-motion:reduce');
});
