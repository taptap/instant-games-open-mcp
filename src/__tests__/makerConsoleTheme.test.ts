import { runInNewContext } from 'node:vm';
import { consoleThemeScript } from '../maker/webTheme.js';

function themePage(initial?: string, parent?: any) {
  const events = new Map<string, Set<(event: any) => void>>();
  const storage = new Map(initial ? [['maker-console-theme', initial]] : []);
  const toggle = { checked: true };
  const document = {
    documentElement: { dataset: { theme: 'dark' } },
    getElementById: () => toggle,
  };
  const window: any = {
    location: { origin: 'http://127.0.0.1:1234' },
    addEventListener(type: string, listener: (event: any) => void) {
      if (!events.has(type)) events.set(type, new Set());
      events.get(type)!.add(listener);
    },
    removeEventListener(type: string, listener: (event: any) => void) {
      events.get(type)?.delete(listener);
    },
    dispatchEvent(event: { type: string }) {
      events.get(event.type)?.forEach((listener) => listener(event));
    },
  };
  window.parent = parent || window;
  runInNewContext(consoleThemeScript, {
    window,
    document,
    location: window.location,
    localStorage: {
      getItem: (key: string) => storage.get(key),
      setItem: (key: string, value: string) => storage.set(key, value),
    },
    CustomEvent: class {
      constructor(
        public type: string,
        public options: { detail: unknown }
      ) {}
      get detail() {
        return this.options.detail;
      }
    },
  });
  return { window, document, storage, toggle, events, api: window.MakerConsole };
}

describe('shared Maker console theme', () => {
  it('loads the saved theme and emits one event per actual change', () => {
    const page = themePage('light');
    expect(page.api.getTheme()).toBe('light');
    expect(page.toggle.checked).toBe(false);
    const listener = jest.fn();
    const unsubscribe = page.api.onThemeChange(listener);
    page.api.setTheme('dark');
    page.api.setTheme('dark');
    expect(page.api.setTheme('invalid')).toBe(false);
    expect(listener.mock.calls).toEqual([['dark']]);
    expect(page.storage.get('maker-console-theme')).toBe('dark');
    expect(page.toggle.checked).toBe(true);
    unsubscribe();
    page.api.setTheme('light');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('notifies consumers and the checkbox when another tab changes storage', () => {
    const page = themePage();
    const listener = jest.fn();
    page.api.onThemeChange(listener);
    page.window.dispatchEvent({ type: 'storage', key: 'maker-console-theme', newValue: 'light' });
    expect(page.api.getTheme()).toBe('light');
    expect(page.toggle.checked).toBe(false);
    expect(listener).toHaveBeenCalledWith('light');
  });

  it('initializes frames from the host and keeps hidden frames synchronized without reload', () => {
    const host = themePage('light');
    const child = themePage('dark', host.window);
    expect(child.api.getTheme()).toBe('light');
    host.api.setTheme('dark');
    expect(child.document.documentElement.dataset.theme).toBe('dark');
    child.api.setTheme('light');
    expect(host.api.getTheme()).toBe('light');
    child.window.dispatchEvent({ type: 'pagehide' });
    expect(host.events.get('maker-console:theme')!.size).toBe(0);
    host.api.setTheme('dark');
    child.window.dispatchEvent({ type: 'pageshow', persisted: true });
    expect(child.api.getTheme()).toBe('dark');
    expect(host.events.get('maker-console:theme')!.size).toBe(1);
  });

  it('still works when browser storage is unavailable', () => {
    const page = themePage();
    runInNewContext(consoleThemeScript, {
      window: page.window,
      document: page.document,
      location: page.window.location,
      localStorage: {
        getItem() {
          throw new Error('denied');
        },
      },
      CustomEvent: class {
        constructor(
          public type: string,
          public options: { detail: unknown }
        ) {}
        get detail() {
          return this.options.detail;
        }
      },
    });
    expect(page.window.MakerConsole.getTheme()).toBe('dark');
    expect(page.window.MakerConsole.setTheme('light')).toBe(false);
    expect(page.window.MakerConsole.getTheme()).toBe('light');
  });
});
