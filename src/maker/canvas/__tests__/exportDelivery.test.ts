import { createCanvasResourceExportWithHost } from '../../../../packages/maker-canvas/src/browser/resourceExport.js';
import type { CanvasExportResult } from '../../../../packages/maker-canvas/src/browser/exportDelivery.js';
import type { CanvasDocument, CanvasNode } from '../model.js';

test.each(['saved', 'downloaded', 'canceled'] as const)(
  'handoff uses %s receipt, not progress wording, and exposes busy until settled',
  async (status) => {
    const node = {
      id: 'assets',
      title: 'Assets',
      type: 'image-assets',
      sectionId: 'group',
    } as CanvasNode;
    const current = {
      id: 'canvas',
      nodes: [
        node,
        { id: 'group', type: 'section', templateId: '7e1cb6ad-732f-4dc3-a951-000000000013' },
      ],
      edges: [],
    } as unknown as CanvasDocument;
    let finish!: (result: CanvasExportResult) => void;
    const pending = new Promise<CanvasExportResult>((resolve) => {
      finish = resolve;
    });
    const handoff = jest.fn();
    const states: boolean[] = [];
    const ui = createCanvasResourceExportWithHost({
      deliver: async () => ({ status: 'saved' }),
      downloadResource: async () => pending,
      getDocument: () => current,
      mediaUrl: (path) => path,
      openHandoff: handoff,
      openAtlas: jest.fn(),
      error: jest.fn(),
      onBusyChange: () => states.push(ui.isBusy),
    });
    const operation = ui.download(node, 'images');
    expect(ui.isBusy).toBe(true);
    finish({ status });
    await operation;
    expect(ui.isBusy).toBe(false);
    expect(states).toEqual([true, false]);
    expect(handoff).toHaveBeenCalledTimes(status === 'canceled' ? 0 : 1);
  }
);

test('delivery errors release busy and do not trigger success handoff', async () => {
  const error = jest.fn(),
    handoff = jest.fn();
  const ui = createCanvasResourceExportWithHost({
    deliver: async () => ({ status: 'saved' }),
    downloadResource: async () => {
      throw new Error('write failed');
    },
    getDocument: () => undefined,
    mediaUrl: (path) => path,
    openHandoff: handoff,
    openAtlas: jest.fn(),
    error,
  });
  await ui.download({ id: 'image', title: 'Image', type: 'image' } as CanvasNode, 'png');
  expect(ui.isBusy).toBe(false);
  expect(error).toHaveBeenCalledWith('write failed');
  expect(handoff).not.toHaveBeenCalled();
});
