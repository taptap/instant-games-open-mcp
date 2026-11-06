import { Script } from 'node:vm';
import { getCanvasPageHtml } from '../page.js';

test('joining an ordinary group refuses sprite mirrors before changing membership', () => {
  const html = getCanvasPageHtml();
  const start = html.indexOf('  function joinSelectedSection() {');
  const end = html.indexOf('  function createSection() {', start);
  expect(start).toBeGreaterThan(0);
  const mirror = {
    id: 'mirror',
    type: 'image',
    sectionId: 'sprite-group',
    mirror: { source: 'sprite-gen' },
  };
  const documentState = { nodes: [{ id: 'ordinary', type: 'section' }, mirror] };
  const remember = jest.fn();
  const setError = jest.fn();
  const join = new Script('(' + html.slice(start, end).trim() + ')').runInNewContext({
    documentState,
    selected: new Set(['ordinary', 'mirror']),
    groupQueue: undefined,
    remember,
    setError,
    markDirty: jest.fn(),
    render: jest.fn(),
  });
  expect(join()).toBe(true);
  expect(mirror.sectionId).toBe('sprite-group');
  expect(remember).not.toHaveBeenCalled();
  expect(setError).toHaveBeenCalledWith(expect.stringContaining('复制为普通卡片'));
});
