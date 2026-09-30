import { runInNewContext } from 'node:vm';
import { getConsoleHtml } from '../maker/console/web.js';

const first = '11111111-1111-4111-8111-111111111111';
const second = '22222222-2222-4222-8222-222222222222';
const third = '33333333-3333-4333-8333-333333333333';
const run = (run_id = first, status = 'finished') => ({
  run_id,
  project_realpath: '/tmp/alpha',
  started_at: '2026-09-29T10:00:00Z',
  phase: 'COMPLETED',
  status,
});

// Execute the shipped inline script, as in makerConsoleWeb.test.ts.
function harness() {
  function element(tag = 'div'): any {
    const listeners = new Map<string, (event?: any) => any>();
    const result: any = {
      tagName: tag,
      children: [],
      dataset: {},
      style: {},
      attributes: {},
      textContent: '',
      hidden: false,
      contains: () => false,
      querySelectorAll: () => [],
      setAttribute: (key: string, value: string) => (result.attributes[key] = value),
      append: (...children: any[]) => result.children.push(...children),
      prepend: (...children: any[]) => result.children.unshift(...children),
      replaceChildren: (...children: any[]) => (result.children = children),
      addEventListener: (name: string, callback: any) => listeners.set(name, callback),
      fire: (name: string, event?: any) => listeners.get(name)?.(event),
      scrollIntoView: jest.fn(),
    };
    return result;
  }
  const elements = new Map<string, any>([['console-logs', element()]]);
  const document = {
    hidden: false,
    documentElement: { dataset: {} },
    getElementById: (id: string) => elements.get(id),
    createElement: element,
    createElementNS: (_namespace: string, tag: string) => element(tag),
    createTextNode: (textContent: string) => ({ textContent }),
    createDocumentFragment: () => element('fragment'),
    addEventListener: jest.fn(),
  };
  const fetch = jest.fn(
    async (_url: string, _options?: any): Promise<any> => ({
      ok: true,
      json: async () => ({}),
    })
  );
  const timers = new Map<number, { callback: () => any; delay: number }>();
  let timerId = 0;
  const clipboard = jest.fn(async (_text: string) => undefined);
  const context = {
    fetch,
    document,
    URL,
    URLSearchParams,
    AbortController,
    console,
    navigator: { clipboard: { writeText: clipboard } },
    location: { search: '?project=alpha' },
    setTimeout: (callback: () => any, delay: number) => {
      timers.set(++timerId, { callback, delay });
      return timerId;
    },
    clearTimeout: (id: number) => timers.delete(id),
    clearInterval: jest.fn(),
  };
  const source = getConsoleHtml().match(/<script>([\s\S]*?)<\/script>/i)![1];
  const api = runInNewContext(
    source.replace(
      /\}\)\(\);\s*$/,
      `return {
        refreshValidation: typeof refreshValidation === 'function' ? refreshValidation : undefined,
        chooseValidationRun: typeof chooseValidationRun === 'function' ? chooseValidationRun : undefined,
        validationView: typeof validationView === 'function' ? validationView : undefined,
        syncValidationPolling: typeof syncValidationPolling === 'function' ? syncValidationPolling : undefined,
        renderConsoleLogs, consoleLogText, clearConsoleLogs, logView, selectLog, dispose,
        logFilters: typeof logFilters === 'function' ? logFilters : undefined,
        logLineClass, rememberTask, loadLogs,
        setup: () => {
          page = 'build'; loaded = true;
          state.projects = [{key:'alpha',valid:true,path:'/tmp/alpha'}, {key:'beta',valid:true,path:'/tmp/beta'}];
          notify = () => {}; announce = () => {};
          logView().tab = 'validate';
        },
        project: key => { selected = key; selectionEpoch++; },
        page: value => { page = value; viewEpoch++; },
      };})();`
    ),
    context
  );
  api.setup();
  const reply = (data: any) => ({ ok: true, json: async () => data });
  function respond(
    runs: Array<ReturnType<typeof run> & { game_result?: string }> = [run()],
    extra: Record<string, any> = {}
  ) {
    fetch.mockImplementation(async (url: string) => {
      if (url.endsWith('/prepare')) return reply({ text: 'prepare output', truncated: false });
      if (url.includes('/logs?')) {
        return reply({
          logs: [{ cursor: 1, text: 'Lua runtime output' }],
          next_cursor: 1,
          truncated: false,
        });
      }
      if (/\/validation(?:\?|$)/.test(url)) return reply({ runs, warnings: [], ...extra });
      const id = url.split('/').pop();
      return reply({
        run: runs.find((item) => item.run_id === id) || run(id),
        invocation: { entry: 'validate' },
        report: { note: '<script>bad()</script>' },
        artifacts: [{ id: 'screenshot.png', kind: 'screenshot' }],
        warnings: [],
      });
    });
  }
  function all(root = elements.get('console-logs')): any[] {
    return [root, ...(root?.children || []).flatMap((child: any) => all(child))];
  }
  return { api, fetch, document, timers, clipboard, respond, reply, all };
}

describe('Maker console passive Validate UI', () => {
  const runtimeText = [
    '[2026-09-30 12:00:00][1] INFO: warning and error counters initialized',
    '[lua] WARNING: texture fallback',
    '[lua] ERROR: bad field',
    'stack traceback:',
    '\tscripts/main.lua:12: in function update',
    '[lua] INFO: game ready',
  ].join('\n');

  function runtimeHarness() {
    const h = harness();
    h.api.logView().tab = 'runtime';
    h.api.logView().runtime = runtimeText;
    h.api.renderConsoleLogs();
    return h;
  }

  function toggle(h: ReturnType<typeof harness>, level: string) {
    const control = h.all().find((node) => node.dataset?.level === level);
    expect(control).toBeDefined();
    control.fire('click');
  }

  it.each(Array.from({ length: 8 }, (_, mask) => mask))(
    'independently toggles all severity combinations (%i), including multiline error stacks',
    (mask) => {
      const h = runtimeHarness();
      const levels = ['info', 'warning', 'error'];
      levels.forEach((level, index) => {
        if (!(mask & (1 << index))) toggle(h, level);
      });
      const visible = h.api.consoleLogText();
      const expected = runtimeText.split('\n').filter((_, index) => {
        const severity = index === 1 ? 1 : index >= 2 && index <= 4 ? 2 : 0;
        return mask & (1 << severity);
      });
      expect(visible).toBe(expected.length ? expected.join('\n') : '当前筛选无匹配日志');
      const output = h.all().find((node) => node.tagName === 'pre');
      const rendered = h
        .all(output)
        .filter((node) => node.tagName === 'span')
        .map((node) => node.textContent);
      expect(rendered).toEqual(expected.length ? expected : ['当前筛选无匹配日志']);
      expect(h.fetch).not.toHaveBeenCalled();
    }
  );

  it('shows counts before filtering and exposes independent pressed states in a secondary group', () => {
    const h = runtimeHarness();
    const filters = h.all().find((node) => node.attributes?.['aria-label'] === '日志类型筛选');
    expect(filters?.attributes.role).toBe('group');
    expect(filters.children.map((node: any) => node.attributes['aria-pressed'])).toEqual([
      'true',
      'true',
      'true',
    ]);
    expect(
      h
        .all()
        .filter((node) => node.className === 'log-count')
        .map((node) => node.textContent)
    ).toEqual(['2', '1', '3']);
    toggle(h, 'info');
    const info = h.all().find((node) => node.dataset?.level === 'info');
    expect(info.attributes['aria-pressed']).toBe('false');
    expect(info.dataset.focus).toBe('log-filter-info');
    expect(
      h
        .all()
        .filter((node) => node.className === 'log-count')
        .map((node) => node.textContent)
    ).toEqual(['2', '1', '3']);
  });

  it('preserves filters on refresh, isolates projects and source tabs, and copies only visible logs', async () => {
    const h = runtimeHarness();
    toggle(h, 'info');
    const filters = h.api.logFilters();
    h.api.selectLog('build');
    expect(h.api.logFilters().info).toBe(true);
    h.api.selectLog('runtime');
    expect(h.api.logFilters()).toBe(filters);
    h.api.project('beta');
    h.api.logView().tab = 'runtime';
    expect(h.api.logFilters().info).toBe(true);
    h.api.project('alpha');
    h.fetch.mockResolvedValue(
      h.reply({ session_id: 'session-a', reload_id: 0, logs: [{ text: runtimeText }] })
    );
    await h.api.loadLogs();
    expect(h.api.logFilters().info).toBe(false);
    await h
      .all()
      .find((node) => node.attributes?.['aria-label'] === '复制')
      .fire('click');
    expect(h.clipboard).toHaveBeenCalledWith(h.api.consoleLogText());
    expect(h.clipboard.mock.calls[0][0]).not.toContain('game ready');
    expect(h.api.logView().runtime).toBe(runtimeText);
  });

  it('clears all displayed levels without resetting filters or discarding later output', () => {
    const h = runtimeHarness();
    toggle(h, 'info');
    h.api.clearConsoleLogs();
    expect(h.api.consoleLogText()).toBe('日志已清理');
    h.api.logView().runtime += '\nINFO: new frame\nWARNING: new warning';
    h.api.renderConsoleLogs();
    expect(h.api.consoleLogText()).toBe('WARNING: new warning');
    toggle(h, 'info');
    expect(h.api.consoleLogText()).toContain('INFO: new frame');
    expect(h.api.consoleLogText()).not.toContain('game ready');
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it('keeps truncation and read failures visible even when all log levels are hidden', async () => {
    const h = runtimeHarness();
    for (const level of ['info', 'warning', 'error']) toggle(h, level);
    h.fetch.mockResolvedValue(
      h.reply({
        session_id: 'session-a',
        reload_id: 0,
        truncated: true,
        logs: [{ text: runtimeText }],
      })
    );
    await h.api.loadLogs();
    expect(h.api.consoleLogText()).toContain('仅显示最近日志');
    expect(h.api.consoleLogText()).toContain('当前筛选无匹配日志');
    expect(
      h
        .all()
        .filter((node) => node.className === 'log-count')
        .map((node) => node.textContent)
    ).toEqual(['2', '1', '3']);
    h.fetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: '日志暂不可用' }),
    });
    await h.api.loadLogs();
    expect(h.api.consoleLogText()).toContain('日志读取失败：日志暂不可用');
  });

  it.each([
    ['[lua] WARNING: an error will be retried', 'log-line log-warning'],
    ['{"l":"INFO","m":"error counts initialized"}', 'log-line'],
    ['{"l":"WARN","m":"fallback"}', 'log-line log-warning'],
    ['{"l":"FATAL","m":"shutdown"}', 'log-line log-error'],
    ['[2026-09-30 12:00:00][1] INFO: error counts initialized', 'log-line'],
    ['资源加载失败，请检查路径', 'log-line log-error'],
    ['警告：资源缺失', 'log-line log-warning'],
    ['ERROR: <script>alert(1)</script>', 'log-line log-error'],
  ])('classifies explicit severity before message keywords: %s', (line, expected) => {
    expect(harness().api.logLineClass(line)).toBe(expected);
  });

  it('filters Validate prepare/runtime logs without hiding JSON, screenshots or collection warnings', async () => {
    const h = harness();
    h.respond([run()], { warnings: ['Evidence cache budget exceeded'] });
    const fallback = h.fetch.getMockImplementation()!;
    h.fetch.mockImplementation(async (url, options) =>
      url.endsWith('/prepare')
        ? h.reply({ text: 'INFO: preparing\nWARNING: prepare fallback' })
        : url.includes('/logs?')
          ? h.reply({ logs: [{ cursor: 1, text: runtimeText }], next_cursor: 1 })
          : fallback(url, options)
    );
    await h.api.refreshValidation();
    const runtimeSection = h.all().find((node) => node.dataset?.evidence === 'runtime');
    runtimeSection.open = true;
    toggle(h, 'info');
    expect(h.api.consoleLogText()).not.toContain('game ready');
    expect(h.api.consoleLogText()).not.toContain('INFO: preparing');
    expect(h.api.consoleLogText()).toContain('WARNING: prepare fallback');
    expect(h.api.consoleLogText()).toContain('<script>bad()</script>');
    expect(h.all().some((node) => node.tagName === 'img')).toBe(true);
    expect(h.all().some((node) => node.textContent.includes('Evidence cache budget'))).toBe(true);
    expect(h.all().find((node) => node.dataset?.evidence === 'runtime')).toBe(runtimeSection);
    expect(runtimeSection.open).toBe(true);
  });

  it('renders a passive tab, collection status separately from game result, and inert JSON', async () => {
    const h = harness();
    expect(h.api.refreshValidation).toEqual(expect.any(Function));
    h.respond();
    await h.api.refreshValidation();
    h.api.renderConsoleLogs();
    const nodes = h.all();
    expect(nodes.some((node) => node.textContent === 'Validate')).toBe(true);
    const text = nodes.map((node) => node.textContent).join('\n');
    expect(text).toContain('采集状态：已结束');
    expect(text).toContain('游戏结果：未提供');
    expect(text).toContain('COMPLETED');
    expect(text).toContain('<script>bad()</script>');
    expect(nodes.filter((node) => node.tagName === 'img')).toHaveLength(1);
    const sections = nodes.filter((node) => node.tagName === 'details');
    expect(sections).toHaveLength(4);
    expect(sections.find((node) => node.dataset.evidence === 'json').open).toBe(false);
    expect(sections.find((node) => node.dataset.evidence === 'runtime').open).toBe(false);
    expect(sections.find((node) => node.dataset.evidence === 'prepare').open).toBe(false);
    expect(sections.find((node) => node.dataset.evidence === 'screenshot').open).toBe(true);
    expect(nodes.filter((node) => node.tagName === 'script')).toHaveLength(0);
    expect(h.fetch.mock.calls.every(([, options]) => options.method === 'GET')).toBe(true);
    expect(h.fetch.mock.calls.some(([url]) => /actions|preview|build/.test(url))).toBe(false);
  });

  it('loads history pages without stealing selection or losing the older-page cursor on refresh', async () => {
    const h = harness();
    expect(h.api.refreshValidation).toEqual(expect.any(Function));
    h.respond([run()], { next_cursor: first });
    await h.api.refreshValidation();
    h.respond([run(second)], { next_cursor: second });
    await h.api.refreshValidation({ more: true });
    expect(h.fetch.mock.calls.some(([url]) => url.endsWith('?before=' + first))).toBe(true);
    await h.api.chooseValidationRun(second);
    h.respond([run(third), run()], { next_cursor: first });
    await h.api.refreshValidation();
    expect(h.api.validationView().selectedRun).toBe(second);
    expect(h.api.validationView().runs.map((item: any) => item.run_id)).toEqual([
      third,
      first,
      second,
    ]);
    expect(h.api.validationView().nextCursor).toBe(second);
  });

  it('keeps per-project selection and incremental cursors and bounds runtime display', async () => {
    const h = harness();
    expect(h.api.refreshValidation).toEqual(expect.any(Function));
    h.respond();
    await h.api.refreshValidation();
    const fallback = h.fetch.getMockImplementation()!;
    h.fetch.mockImplementation(async (url, options) =>
      url.includes('/logs?')
        ? h.reply({
            logs: [{ cursor: 2, text: 'x'.repeat(90000) + '\nlatest Lua' }],
            next_cursor: 2,
            truncated: true,
          })
        : fallback(url, options)
    );
    await h.api.refreshValidation();
    expect(h.fetch.mock.calls.some(([url]) => url.endsWith('/logs?cursor=1'))).toBe(true);
    expect(h.api.consoleLogText()).toContain('latest Lua');
    expect(h.api.consoleLogText().length).toBeLessThan(70000);
    expect(h.api.consoleLogText()).toContain('截断');
    h.api.project('beta');
    h.api.logView().tab = 'validate';
    expect(h.api.validationView().selectedRun).toBe('');
    h.api.project('alpha');
    expect(h.api.validationView().selectedRun).toBe(first);
    expect(h.api.validationView().entries.get(first).cursor).toBe(2);
  });

  it.each(['project', 'run', 'clear'])(
    'discards stale evidence after %s changes',
    async (change) => {
      const h = harness();
      expect(h.api.refreshValidation).toEqual(expect.any(Function));
      h.respond([run(), run(second)]);
      await h.api.refreshValidation();
      let release!: (value: any) => void;
      const fallback = h.fetch.getMockImplementation()!;
      h.fetch.mockImplementation((url, options) => {
        if (url.endsWith('/validation/' + first))
          return new Promise((resolve) => (release = resolve));
        return fallback(url, options);
      });
      const pending = h.api.refreshValidation();
      for (let i = 0; i < 20 && !release; i++) await Promise.resolve();
      expect(release).toEqual(expect.any(Function));
      if (change === 'project') {
        h.api.project('beta');
        h.api.project('alpha'); // Same key is insufficient: selectionEpoch must also match.
      } else if (change === 'run') await h.api.chooseValidationRun(second);
      else h.api.clearConsoleLogs();
      release(
        h.reply({ run: run(), report: { stale: 'stale response' }, artifacts: [], warnings: [] })
      );
      await pending;
      expect(h.api.consoleLogText()).not.toContain('stale response');
      if (change === 'run') expect(h.api.validationView().selectedRun).toBe(second);
    }
  );

  it('polls every five seconds only while Validate and the build page are visible', async () => {
    const h = harness();
    expect(h.api.syncValidationPolling).toEqual(expect.any(Function));
    h.respond();
    h.api.syncValidationPolling();
    const timer = [...h.timers.values()].find((item) => item.delay === 5000);
    expect(timer).toBeDefined();
    await timer!.callback();
    expect(h.fetch).toHaveBeenCalled();
    for (const inactive of ['hidden', 'page', 'tab', 'disposed']) {
      h.fetch.mockClear();
      if (inactive === 'hidden') h.document.hidden = true;
      if (inactive === 'page') {
        h.document.hidden = false;
        h.api.page('overview');
      }
      if (inactive === 'tab') {
        h.api.page('build');
        h.api.logView().tab = 'runtime';
      }
      if (inactive === 'disposed') {
        h.api.logView().tab = 'validate';
        h.api.dispose();
      }
      await timer!.callback();
      expect(h.fetch).not.toHaveBeenCalled();
    }
  });

  it('clears only displayed evidence and appends new runtime output without resetting the cursor', async () => {
    const h = harness();
    expect(h.api.refreshValidation).toEqual(expect.any(Function));
    h.respond();
    await h.api.refreshValidation();
    h.fetch.mockClear();
    h.api.clearConsoleLogs();
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.api.consoleLogText()).not.toContain('Lua runtime output');
    expect(h.api.consoleLogText()).not.toContain('prepare output');
    const fallback = h.fetch.getMockImplementation()!;
    h.fetch.mockImplementation(async (url, options) =>
      url.includes('/logs?')
        ? h.reply({ logs: [{ cursor: 2, text: 'new output' }], next_cursor: 2, truncated: false })
        : fallback(url, options)
    );
    await h.api.refreshValidation();
    expect(h.api.consoleLogText()).toContain('new output');
    expect(h.api.consoleLogText()).not.toContain('prepare output');
    expect(h.fetch.mock.calls.some(([url]) => url.endsWith('/logs?cursor=1'))).toBe(true);
    expect(h.api.validationView().runs).toHaveLength(1);
  });

  it('shows the fixed PNG inline, preserves it on polling, and supports wrap/copy', async () => {
    const h = harness();
    expect(h.api.refreshValidation).toEqual(expect.any(Function));
    h.respond();
    await h.api.refreshValidation();
    h.api.renderConsoleLogs();
    let images = h.all().filter((node) => node.tagName === 'img');
    expect(images).toHaveLength(1);
    expect(images[0].src).toBe('/api/projects/alpha/validation/' + first + '/screenshot.png');
    const image = images[0];
    await h.api.refreshValidation();
    h.api.renderConsoleLogs();
    images = h.all().filter((node) => node.tagName === 'img');
    expect(images[0]).toBe(image);
    const wrap = h.all().find((node) => node.type === 'checkbox');
    wrap.checked = true;
    wrap.fire('change');
    expect(h.api.logView().wrap).toBe(true);
    await h
      .all()
      .find((node) => node.attributes?.['aria-label'] === '复制')
      .fire('click');
    expect(h.clipboard).toHaveBeenCalledWith(h.api.consoleLogText());
  });

  it.each([true, false])(
    'preserves log disclosure (%s) and scroll state across polling and run switches',
    async (open) => {
      const h = harness();
      h.respond([run(), run(second)]);
      await h.api.refreshValidation();
      const section = h.all().find((node) => node.dataset?.evidence === 'runtime');
      expect(section).toBeDefined();
      section.open = open;
      const output = h.all(section).find((node) => node.tagName === 'pre');
      output.scrollTop = 120;
      await h.api.refreshValidation();
      expect(h.all().find((node) => node.dataset?.evidence === 'runtime')).toBe(section);
      expect(section.open).toBe(open);
      expect(output.scrollTop).toBe(120);
      await h.api.chooseValidationRun(second);
      await h.api.chooseValidationRun(first);
      expect(h.all().find((node) => node.dataset?.evidence === 'runtime')).toBe(section);
      expect(section.open).toBe(open);
    }
  );

  it('retries failed image reads without rerunning validation and keeps cleared images hidden', async () => {
    const h = harness();
    h.respond();
    await h.api.refreshValidation();
    const image = h.all().find((node) => node.tagName === 'img');
    expect(image).toBeDefined();
    image.fire('error');
    await h.api.refreshValidation();
    expect(h.all().some((node) => node.tagName === 'img')).toBe(false);
    h.fetch.mockClear();
    h.all()
      .find((node) => node.attributes?.['aria-label'] === '重载截图')
      .fire('click');
    expect(h.all().find((node) => node.tagName === 'img')).not.toBe(image);
    expect(h.fetch).not.toHaveBeenCalled();
    h.api.clearConsoleLogs();
    await h.api.refreshValidation();
    expect(h.all().some((node) => node.tagName === 'img')).toBe(false);
    expect(
      h
        .all()
        .map((node) => node.textContent)
        .join('\n')
    ).toContain('截图已清理显示');
  });

  it.each([
    ['finished', 'validate', '本轮未请求截图'],
    ['running', 'both', '等待截图采集完成'],
    ['finished', 'both', '本轮未收集到截图'],
    ['incomplete', undefined, '本轮未收集到截图'],
  ])('explains screenshot absence for %s / %s', async (status, mode, expected) => {
    const h = harness();
    h.respond([run(first, status)]);
    const fallback = h.fetch.getMockImplementation()!;
    h.fetch.mockImplementation(async (url, options) =>
      url.endsWith('/' + first)
        ? h.reply({ run: run(first, status), result: { mode }, artifacts: [] })
        : fallback(url, options)
    );
    await h.api.refreshValidation();
    expect(
      h
        .all()
        .map((node) => node.textContent)
        .join('\n')
    ).toContain(expected);
    expect(h.all().some((node) => node.tagName === 'img')).toBe(false);
  });

  it('keeps failures local to Validate and offers refresh without treating errors as game failure', async () => {
    const h = harness();
    expect(h.api.refreshValidation).toEqual(expect.any(Function));
    h.fetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: '证据暂不可用' }),
    });
    await h.api.refreshValidation();
    h.api.renderConsoleLogs();
    expect(
      h
        .all()
        .map((node) => node.textContent)
        .join('\n')
    ).toContain('证据暂不可用');
    h.respond([]);
    await h.api.refreshValidation();
    h.api.renderConsoleLogs();
    expect(
      h
        .all()
        .map((node) => node.textContent)
        .join('\n')
    ).toContain('暂无 Validate 调用');
  });

  it('does not restore cleared output when an older history request resolves', async () => {
    const h = harness();
    h.respond();
    await h.api.refreshValidation();
    let release!: (value: any) => void;
    const fallback = h.fetch.getMockImplementation()!;
    h.fetch.mockImplementation((url, options) =>
      url.endsWith('/validation')
        ? new Promise((resolve) => (release = resolve))
        : fallback(url, options)
    );
    const pending = h.api.refreshValidation();
    h.api.clearConsoleLogs();
    const requestCount = h.fetch.mock.calls.length;
    release(h.reply({ runs: [run()], warnings: [] }));
    await pending;
    expect(h.fetch).toHaveBeenCalledTimes(requestCount);
    expect(h.api.consoleLogText()).not.toContain('Lua runtime output');
  });

  it('retains available logs on partial failure and uses the latest history collection status', async () => {
    const h = harness();
    h.respond([run(first, 'running')]);
    await h.api.refreshValidation();
    h.respond([{ ...run(), game_result: 'NEEDS_REVIEW' }]);
    const fallback = h.fetch.getMockImplementation()!;
    h.fetch.mockImplementation(async (url, options) =>
      url.endsWith('/' + first)
        ? { ok: false, status: 400, json: async () => ({ error: '详情暂不可用' }) }
        : fallback(url, options)
    );
    await h.api.refreshValidation();
    h.api.renderConsoleLogs();
    expect(h.api.consoleLogText()).toContain('详情暂不可用');
    expect(h.api.consoleLogText()).toContain('prepare output');
    const text = h
      .all()
      .map((node) => node.textContent)
      .join('\n');
    expect(text).toContain('采集状态：已结束');
    expect(text).toContain('游戏结果：NEEDS_REVIEW');
  });

  it('does not repeat the last runtime row when a response overlaps its cursor', async () => {
    const h = harness();
    h.respond();
    await h.api.refreshValidation();
    await h.api.refreshValidation();
    expect(h.api.consoleLogText().match(/Lua runtime output/g)).toHaveLength(1);
  });

  it('does not load arbitrary artifacts or screenshots that are still being collected', async () => {
    const h = harness();
    h.respond([run(first, 'running')]);
    await h.api.refreshValidation();
    h.api.renderConsoleLogs();
    expect(h.all().some((node) => node.attributes?.['aria-label'] === '查看截图')).toBe(false);
    h.respond();
    const fallback = h.fetch.getMockImplementation()!;
    h.fetch.mockImplementation(async (url, options) =>
      url.endsWith('/' + first)
        ? h.reply({ run: run(), artifacts: [{ id: '../../secret.png', kind: 'screenshot' }] })
        : fallback(url, options)
    );
    await h.api.refreshValidation();
    h.api.renderConsoleLogs();
    expect(h.all().some((node) => node.attributes?.['aria-label'] === '查看截图')).toBe(false);
    expect(h.all().some((node) => node.tagName === 'img')).toBe(false);
  });

  it('surfaces history, detail and result warnings outside JSON, including cache budget warnings', async () => {
    const h = harness();
    h.respond([run()], { warnings: ['History scan limited'] });
    const fallback = h.fetch.getMockImplementation()!;
    h.fetch.mockImplementation(async (url, options) =>
      url.endsWith('/' + first)
        ? h.reply({
            run: { ...run(), result: 'COMPLETED', game_result: 'PASS' },
            result: { warnings: ['Evidence cache budget exceeded', '<img src=x onerror=bad()>'] },
            warnings: ['Optional screenshot unavailable'],
            artifacts: [],
          })
        : fallback(url, options)
    );
    await h.api.refreshValidation();
    h.api.renderConsoleLogs();
    const warnings = h
      .all()
      .filter((node) => node.tagName === 'p' && node.className === 'pending')
      .map((node) => node.textContent)
      .join('\n');
    expect(warnings).toContain('History scan limited');
    expect(warnings).toContain('Optional screenshot unavailable');
    expect(warnings).toContain('Evidence cache budget exceeded');
    expect(warnings).toContain('<img src=x onerror=bad()>');
    expect(h.all().some((node) => node.tagName === 'img')).toBe(false);
    expect(
      h
        .all()
        .map((node) => node.textContent)
        .join('\n')
    ).toContain('游戏结果：PASS');
  });

  it('recovers an expired history cursor on refresh while preserving the selected run', async () => {
    const h = harness();
    h.respond([run()], { next_cursor: first });
    await h.api.refreshValidation();
    h.respond([run(second)], { next_cursor: second });
    await h.api.refreshValidation({ more: true });
    await h.api.chooseValidationRun(second);
    h.fetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'History cursor expired. Refresh validation history.' }),
    });
    await h.api.refreshValidation({ more: true });
    h.respond([run(third)], { next_cursor: third });
    await h.api.refreshValidation();
    expect(h.api.validationView().nextCursor).toBe(third);
    expect(h.api.validationView().selectedRun).toBe(second);
  });
});
