import { canvasGroupState, CANVAS_CARD_UI_STYLES, refreshCanvasGroupHeaders } from '../cardUi.js';
import type { CanvasNode } from '../model.js';
import { getCanvasPageHtml } from '../page.js';

describe('canvas group presentation', () => {
  test.each([false, true])('bundle headers reflect the member PNG readiness: %s', (ready) => {
    const badge = { dataset: {}, textContent: '', title: '' };
    const card = { dataset: { id: 'group' }, querySelector: () => badge };
    const world = { querySelectorAll: () => [card] } as unknown as HTMLElement;
    const base = { x: 0, y: 0, width: 100, height: 100, title: 'test' };
    const nodes: CanvasNode[] = [
      { ...base, id: 'group', type: 'section' },
      { ...base, id: 'bundle', type: 'resource-bundle', sectionId: 'group' },
      {
        ...base,
        id: 'assets',
        type: 'image-assets',
        sectionId: 'group',
        imageAssetsInfo: {
          width: 10,
          height: 10,
          grid: { columns: 1, rows: 1, marginX: 0, marginY: 0, gapX: 0, gapY: 0 },
          items: ready
            ? [{ name: 'icon', assetPath: 'assets/icon.png', width: 10, height: 10 }]
            : [],
        },
      },
    ];
    refreshCanvasGroupHeaders(world, nodes, () => 'complete');
    expect(badge.dataset).toEqual({ state: ready ? 'ready' : 'waiting' });
    expect(badge.title).toBe((ready ? '1' : '0') + '/1 个资源已就绪');
  });

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
