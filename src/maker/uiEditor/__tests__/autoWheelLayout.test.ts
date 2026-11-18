import fs from 'node:fs';
import vm from 'node:vm';
import { createCanvasWheelInput } from '../../../../packages/maker-canvas/src/browser/wheel.js';

type Listener = (event: GestureEvent) => void;

interface GestureEvent {
  type: string;
  target?: ElementStub;
  button: number;
  pointerId: number;
  pointerType: string;
  clientX: number;
  clientY: number;
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  stopped?: boolean;
  prevented?: boolean;
  preventDefault: () => void;
  stopPropagation: () => void;
}

class ElementStub {
  listeners: { capture: Record<string, Listener[]>; bubble: Record<string, Listener[]> } = {
    capture: {},
    bubble: {},
  };
  style: {
    setProperty: (name: string, value: string) => void;
    [key: string]: string | ((name: string, value: string) => void);
  } = { setProperty: () => undefined };
  classList = { add: () => undefined, remove: () => undefined, toggle: () => undefined };
  dataset: Record<string, string> = {};
  width = 400;
  height = 400;
  clientWidth = 400;
  clientHeight = 400;
  textContent = '';
  addEventListener(type: string, fn: Listener, options?: boolean | { capture?: boolean }): void {
    const capture = options === true || (typeof options === 'object' && options.capture === true);
    const bucket = capture ? this.listeners.capture : this.listeners.bubble;
    (bucket[type] ||= []).push(fn);
  }
  dispatchEvent(event: GestureEvent): void {
    event.target = this;
    for (const fn of this.listeners.capture[event.type] || []) {
      fn(event);
      if (event.stopped) return;
    }
    for (const fn of this.listeners.bubble[event.type] || []) fn(event);
  }
  getBoundingClientRect(): { left: number; top: number; width: number; height: number } {
    return { left: 0, top: 0, width: this.clientWidth, height: this.clientHeight };
  }
  setPointerCapture(): void {
    return undefined;
  }
  closest(): null {
    return null;
  }
}

function source(name: string): string {
  return fs.readFileSync(require.resolve('../web/src/' + name), 'utf8');
}

interface PanelNode {
  type: string;
  position?: string;
  left: number;
  top: number;
  width: number;
  height: number;
  _layout?: { x: number; y: number; w: number; h: number };
  _editorId?: string;
}

interface EditorTree {
  type: string;
  width: number;
  height: number;
  children: PanelNode[];
}

interface HistoryApi {
  begin: (tree: unknown, id: string) => void;
  commit: (tree: unknown) => void;
  cancel: () => { tree: EditorTree } | null;
}

function boot() {
  const preview = new ElementStub();
  const canvas = new ElementStub();
  const stageWrap = new ElementStub();
  const root = new ElementStub();
  const store = {
    capture: {} as Record<string, Listener[]>,
    bubble: {} as Record<string, Listener[]>,
  };
  const listen = (type: string, fn: Listener, options?: boolean | { capture?: boolean }) => {
    const capture = options === true || (typeof options === 'object' && options.capture === true);
    const bucket = capture ? store.capture : store.bubble;
    (bucket[type] ||= []).push(fn);
  };
  const memory = new Map<string, string>();
  const context = vm.createContext({
    console,
    localStorage: {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, String(value));
      },
    },
    requestAnimationFrame: () => 0,
    innerWidth: 1400,
    innerHeight: 900,
    Event: class {
      type: string;
      constructor(type: string) {
        this.type = type;
      }
      preventDefault(): void {
        return undefined;
      }
      stopPropagation(): void {
        return undefined;
      }
    },
  }) as vm.Context & Record<string, any>;
  context.window = context;
  context.document = {
    documentElement: root,
    hidden: false,
    getElementById: (id: string) =>
      ({
        preview,
        previewStage: stageWrap,
        stage: canvas,
        zoomLabel: new ElementStub(),
        fitBtn: new ElementStub(),
        artboardLabel: new ElementStub(),
        resetLayoutBtn: new ElementStub(),
      })[id] || null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: listen,
  };
  context.addEventListener = listen;
  context.UrhoxHost = {
    fileRoot: '/files?path=',
    wheel: 'auto',
    manifest: () => ({}),
    readText: () => '',
    save: () => ({ ok: true }),
  };
  vm.runInContext(source('config.js'), context);
  for (const name of ['history.js', 'doc.js', 'geom.js', 'input.js'])
    vm.runInContext(source(name), context);
  const doc = context.UrhoxDoc;
  context.UrhoxYoga = { walk: doc.walk };
  context.UrhoxCanvas = {
    handleSize: () => 3,
    handlesFor: (box: { x: number; y: number; w: number; h: number }) => [
      { x: box.x + box.w, y: box.y + box.h, id: 'se' },
    ],
  };
  const node: PanelNode = {
    type: 'Panel',
    position: 'absolute',
    left: 30,
    top: 30,
    width: 50,
    height: 50,
  };
  const tree: EditorTree = { type: 'Panel', width: 400, height: 400, children: [node] };
  const history = new context.UrhoxHistory.History() as HistoryApi;
  const app = {
    canvas,
    tree,
    sourceTree: tree,
    selected: node as PanelNode | null,
    selectedNodes: [node] as PanelNode[],
    drag: null as unknown,
    origin: () => ({ x: 0, y: 0 }),
    contentTransform: () => ({ x: 0, y: 0, scale: 1 }),
    designSize: () => ({ width: 400, height: 400 }),
    sourceNode: (item: PanelNode) => item,
    isSelected(item: PanelNode) {
      return this.selectedNodes.includes(item);
    },
    ensureKeys() {
      doc.ensureEditorIds(this.sourceTree);
    },
    beginHistory() {
      history.begin(this.sourceTree, doc.getEditorId(this.selected));
    },
    commitHistory() {
      history.commit(this.sourceTree);
    },
    cancelHistory(ids: string[]) {
      const snap = history.cancel();
      if (!snap) return;
      this.tree = this.sourceTree = snap.tree;
      this.selectedNodes = ids.map((id) => doc.findByEditorId(this.tree, id)).filter(Boolean);
      this.selected = this.selectedNodes[this.selectedNodes.length - 1] || null;
      this.rebuildPreview();
    },
    setSelection(nodes: PanelNode[]) {
      this.selectedNodes = nodes;
      this.selected = nodes[nodes.length - 1] || null;
    },
    selectNode(item: PanelNode | null) {
      this.setSelection(item ? [item] : []);
    },
    rebuildPreview() {
      doc.walk(this.tree, (current: PanelNode) => {
        current._layout = {
          x: current.left || 0,
          y: current.top || 0,
          w: current.width,
          h: current.height,
        };
      });
    },
    draw() {
      return undefined;
    },
    refreshInspector() {
      return undefined;
    },
    updateMeta() {
      return undefined;
    },
  };
  app.ensureKeys();
  app.rebuildPreview();
  context.UrhoxInput.bind(app);
  context.UrhoxCanvasWheel = { createCanvasWheelInput };
  vm.runInContext(source('layout.js'), context);
  return { app, preview, canvas, context };
}

function emit(
  target: ElementStub,
  preview: ElementStub,
  type: string,
  init: Partial<GestureEvent>
): GestureEvent {
  const event: GestureEvent = {
    type,
    button: 0,
    pointerId: 1,
    pointerType: 'mouse',
    clientX: 0,
    clientY: 0,
    deltaX: 0,
    deltaY: 0,
    deltaMode: 0,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    preventDefault() {
      this.prevented = true;
    },
    stopPropagation() {
      this.stopped = true;
    },
    ...init,
  };
  event.target = target;
  if (!event.closest) event.closest = () => null;
  if (target !== preview) {
    for (const fn of preview.listeners.capture[type] || []) {
      fn(event);
      if (event.stopped) return event;
    }
  }
  target.dispatchEvent(event);
  return event;
}

test('auto wheel pans trackpad input, zooms ctrl wheel, and a second touch cancels a node drag', () => {
  const { app, preview, canvas, context } = boot();
  expect(context.UrhoxConfig.WHEEL).toBe('auto');
  const view = () => context.UrhoxView.getView() as { zoom: number; panX: number; panY: number };
  const before = view();
  emit(preview, preview, 'wheel', { deltaX: 18, deltaY: 2.5, clientX: 30, clientY: 30 });
  const panned = view();
  expect(panned.zoom).toBe(before.zoom);
  expect(panned.panX).toBe(before.panX - 18);
  expect(panned.panY).toBe(before.panY - 2.5);
  emit(preview, preview, 'wheel', { deltaY: 80, ctrlKey: true, clientX: 30, clientY: 30 });
  expect(view().zoom).not.toBe(panned.zoom);

  emit(canvas, preview, 'pointerdown', {
    pointerType: 'touch',
    pointerId: 1,
    clientX: 45,
    clientY: 45,
  });
  emit(canvas, preview, 'pointermove', {
    pointerType: 'touch',
    pointerId: 1,
    clientX: 90,
    clientY: 70,
  });
  expect(app.tree.children[0].left).not.toBe(30);
  emit(canvas, preview, 'pointerdown', {
    pointerType: 'touch',
    pointerId: 2,
    clientX: 12,
    clientY: 12,
  });
  expect(app.drag).toBeNull();
  expect(app.tree.children[0].left).toBe(30);
});
