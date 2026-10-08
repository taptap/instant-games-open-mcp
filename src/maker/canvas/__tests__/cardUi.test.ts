import { canvasGroupState, CANVAS_CARD_UI_STYLES } from '../cardUi.js';
import { getCanvasPageHtml } from '../page.js';

describe('canvas group presentation', () => {
  test.each([
    [['ready', 'loading'], undefined, 'loading'],
    [['ready'], 'running', 'loading'],
    [['waiting'], 'queued', 'loading'],
    [['waiting'], 'waiting', 'loading'],
    [['failed', 'unknown'], 'paused', 'unknown'],
    [['waiting', 'failed'], 'paused', 'failed'],
    [['ready'], 'paused', 'paused'],
    [['ready', 'paused'], undefined, 'paused'],
    [['ready', 'waiting'], undefined, 'waiting'],
    [['ready', 'ready'], undefined, 'ready'],
    [[], undefined, 'empty'],
  ])('derives %s with queue phase %s as %s', (states, phase, expected) => {
    expect(canvasGroupState(states as string[], phase)).toMatchObject({ state: expected });
  });

  test('injects presentation helpers and styles into the executable page', () => {
    const page = getCanvasPageHtml();
    expect(page).toContain(CANVAS_CARD_UI_STYLES);
    expect(page).toContain('function canvasGroupState(');
    expect(page).toContain('function decorateCanvasCard(');
    expect(page).toContain('function refreshCanvasGroupHeaders(');
    expect(page).toContain('decorateCanvasCard(card, node, title, showContextMenu)');
  });
});
