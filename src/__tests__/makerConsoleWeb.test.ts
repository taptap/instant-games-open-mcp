import { Script, runInNewContext } from 'node:vm';
import { getConsoleHtml } from '../maker/console/web.js';

function script(): string {
  const html = getConsoleHtml();
  return html.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? '';
}

function harness(hash = '#token=secret', search = '?project=alpha', storageAvailable = true) {
  const storage = new Map<string, string>();
  const replaceState = jest.fn();
  const intervals = new Map<number, () => void>();
  let nextInterval = 1;
  const setInterval = jest.fn((callback: () => void) => {
    const id = nextInterval++;
    intervals.set(id, callback);
    return id;
  });
  const clearInterval = jest.fn((id: number) => intervals.delete(id));
  const fetch = jest.fn<Promise<unknown>, [string, { method: string; body?: string }]>(
    async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    })
  );
  const context = {
    URL,
    URLSearchParams,
    AbortController,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    console,
    location: { hash, search, href: 'http://localhost:1234/' + search + hash },
    history: { replaceState },
    sessionStorage: {
      setItem: (key: string, value: string) => storage.set(key, value),
      getItem: (key: string) => storage.get(key) ?? null,
    },
    document: {
      documentElement: { dataset: { theme: 'dark' } },
      addEventListener: jest.fn(),
      createElement: (tag: string) => ({
        tagName: tag,
        className: '',
        hidden: false,
        dataset: {},
        style: {},
        append: jest.fn(),
        prepend: jest.fn(),
        replaceChildren: jest.fn(),
        setAttribute: jest.fn(),
        addEventListener: jest.fn(),
        querySelectorAll: () => [],
      }),
      createElementNS: (_ns: string, tag: string) => ({
        tagName: tag,
        setAttribute: jest.fn(),
        append: jest.fn(),
      }),
      createTextNode: (value: string) => ({ textContent: value }),
      getElementById: jest.fn(() => ({
        textContent: '',
        className: '',
        hidden: true,
        dataset: {},
        replaceChildren: jest.fn(),
        querySelectorAll: () => [],
        append: jest.fn(),
      })),
    },
    fetch,
  };
  if (!storageAvailable) context.sessionStorage = undefined as never;
  const exposed = script().replace(
    /\}\)\(\);\s*$/,
    `return {api, previewActions, graphLayout, runAction, runProjectAction, loadProject, safePreviewUrl, taskPreviewUrl, healthLabel,
      poll, pollState, sendActivity, startActivityLease, dispose, rememberTask, buildPresentation, buildFailureMessage,
      buildFailureDetails, luaLspPresentation, luaCheckBlocksBuild, runtimePresentation,
      previewPresentation: typeof previewPresentation === 'function' ? previewPresentation : undefined,
      previewStateLabel: typeof previewStateLabel === 'function' ? previewStateLabel : undefined,
      taskOutputText: typeof taskOutputText === 'function' ? taskOutputText : undefined,
      taskStartsOpen: typeof taskStartsOpen === 'function' ? taskStartsOpen : undefined,
      luaCheckSummary: typeof luaCheckSummary === 'function' ? luaCheckSummary : undefined,
      pluginDescriptors, pluginUrl, pluginMessageMatches,
      pruneFailedPluginSessions, pluginSessions, sendPluginTheme,
      loadedState: () => loaded,
      acceptedCount: () => acceptedTasks.size,
      offline: () => offline,
      current: () => selected, detail: () => detail,
      setProjectQuery,
      changeSelection: (key) => { selected = key; selectionEpoch++; },
      setup: (projects, hooks) => {
        state = {projects, tasks: []};
        updateChrome = hooks.render;
        updateBuild = hooks.render;
        renderOverview = hooks.render;
        refreshPreview = hooks.refresh;
        confirmAction = hooks.confirm;
        notify = hooks.notify;
        announce = hooks.announce;
        if (hooks.navigate) navigate = hooks.navigate;
        if (hooks.runAction) runAction = hooks.runAction;
      }
    };})();`
  );
  const api = runInNewContext(exposed, context);
  return { api, fetch, storage, replaceState, intervals, setInterval, clearInterval, context };
}

describe('Maker console standalone UI', () => {
  it('reclaims failed plugin placeholders without destroying loaded or starting workspaces', () => {
    const { api } = harness();
    const remove = jest.fn();
    for (let i = 0; i < 8; i++)
      api.pluginSessions.set(String(i), { loading: false, iframe: null, element: { remove } });
    api.pluginSessions.set('editing', { loading: false, iframe: {}, element: { remove } });
    api.pluginSessions.set('starting', { loading: true, iframe: null, element: { remove } });
    api.pruneFailedPluginSessions();
    expect([...api.pluginSessions.keys()]).toEqual(['editing', 'starting']);
    expect(remove).toHaveBeenCalledTimes(8);
  });
  it('provides a persistent plugin host, not an external FrameCrate launcher', () => {
    expect(getConsoleHtml()).toContain('id="plugin-views"');
    expect(getConsoleHtml()).toContain('id="plugin-tabs"');
    expect(script()).not.toContain("window.open('about:blank'");
    expect(script()).not.toContain('/framecrate/open');
    expect(script()).toContain('pluginStatus(session,session.projectName,true)');
    expect(script()).toContain('if (offline || disposed || session.loading) return;');
  });

  it('accepts only unique supported plugin descriptors and safe project-bound URLs', () => {
    const { api } = harness();
    const plugin = {
      id: 'framecrate',
      title: 'FrameCrate',
      order: 100,
      protocolVersion: 1,
      requiresProject: true,
    };
    expect(
      api.pluginDescriptors([
        plugin,
        plugin,
        { ...plugin, id: '../bad' },
        { ...plugin, id: 'other', protocolVersion: 2 },
      ])
    ).toEqual([plugin]);
    const ready = { projectPath: '/tmp/game', url: 'http://127.0.0.1:8123/#studio_token=secret' };
    expect(api.pluginUrl(ready, '/tmp/game')).toBe(ready.url);
    for (const url of [
      'https://example.com/',
      'http://127.0.0.1.evil:123/',
      'http://u:p@127.0.0.1:123/',
      'http://127.0.0.1:123/api/state',
      'http://127.0.0.1:123/?token=secret',
    ]) {
      expect(() => api.pluginUrl({ ...ready, url }, '/tmp/game')).toThrow();
    }
    expect(() => api.pluginUrl(ready, '/tmp/other')).toThrow();
  });

  it('accepts host messages only from the exact embedded window and origin', () => {
    const { api } = harness();
    const source = {};
    const session = { origin: 'http://127.0.0.1:8123', iframe: { contentWindow: source } };
    const event = {
      source,
      origin: session.origin,
      data: { type: 'maker-console:plugin-ready', protocolVersion: 1 },
    };
    expect(api.pluginMessageMatches(event, session)).toBe(true);
    expect(api.pluginMessageMatches({ ...event, source: {} }, session)).toBe(false);
    expect(api.pluginMessageMatches({ ...event, origin: 'http://127.0.0.1:8124' }, session)).toBe(
      false
    );
    expect(
      api.pluginMessageMatches({ ...event, data: { ...event.data, protocolVersion: 2 } }, session)
    ).toBe(false);
  });

  it('sends the current console theme to connected plugin frames', () => {
    const { api, context } = harness();
    const postMessage = jest.fn();
    const session = {
      origin: 'http://127.0.0.1:8123',
      iframe: { contentWindow: { postMessage } },
    };
    api.sendPluginTheme(session, 'maker-console:connect');
    expect(postMessage).toHaveBeenLastCalledWith(
      { type: 'maker-console:connect', protocolVersion: 1, theme: 'dark' },
      session.origin
    );
    context.document.documentElement.dataset.theme = 'light';
    api.sendPluginTheme(session);
    expect(postMessage).toHaveBeenLastCalledWith(
      { type: 'maker-console:theme', protocolVersion: 1, theme: 'light' },
      session.origin
    );
  });

  it('shows activity without inventing a total build percentage', () => {
    const { api } = harness();
    expect(api.buildPresentation(null, true, false)).toMatchObject({
      label: '正在发起构建',
      active: true,
    });
    expect(
      api.buildPresentation(
        {
          status: 'running',
          progress: { phase: 'auth', progress: 10, total: 100 },
        },
        false,
        false
      )
    ).toMatchObject({ label: '构建中', active: true, stage: '验证项目访问权限', percent: 10 });
    expect(
      api.buildPresentation(
        { status: 'running', progress: { phase: 'push', progress: 150, total: 100 } },
        false,
        false
      )
    ).toMatchObject({ stage: '推送项目', percent: 100 });
    expect(
      api.buildPresentation(
        { status: 'running', progress: { phase: 'build', progress: 10, total: 0 } },
        false,
        false
      ).percent
    ).toBeUndefined();
    expect(
      api.buildPresentation(
        { status: 'running', progress: { phase: 'build', progress: null, total: 100 } },
        false,
        false
      ).percent
    ).toBeUndefined();
    expect(api.buildPresentation({ status: 'succeeded' }, false, false)).toMatchObject({
      label: '构建成功',
      active: false,
      tone: 'good',
    });
    expect(api.buildPresentation({ status: 'running' }, false, true)).toMatchObject({
      label: '连接已断开',
      active: false,
    });
    expect(getConsoleHtml()).toContain('prefers-reduced-motion');
  });

  it('distinguishes account restrictions from project access errors and unknown results', () => {
    const { api } = harness();
    expect(api.buildFailureMessage({ error: 'HTTP 406 BLACKLISTED Account restricted' })).toContain(
      '账号受到限制'
    );
    expect(
      api.buildFailureMessage({
        result: { result: { submitResult: { failure: { classification: 'auth' } } } },
      })
    ).toContain('项目访问权限');
    expect(
      api.buildFailureDetails({
        error: '✗ Maker project submit failed',
        result: {
          result: {
            mode: 'submit_failed_before_build',
            submitResult: {
              status: 'failed',
              failure: {
                classification: 'remote_rejected',
                command: 'git push',
                stderr: 'remote: protected branch',
                nextAction: 'fix the remote rejection then retry',
              },
            },
          },
        },
      })
    ).toContain('remote: protected branch');
    expect(api.buildPresentation({ status: 'unknown' }, false, false)).toMatchObject({
      label: '结果待核对',
      active: false,
    });
  });

  it('presents independent Lua LSP install status on the project page', () => {
    const { api } = harness();
    expect(
      api.luaLspPresentation({ ready: true, version: '0.22.2', nextAction: 'ready' })
    ).toMatchObject({
      label: '已安装',
      detail: '0.22.2',
      tone: 'good',
    });
    expect(api.luaLspPresentation({ ready: false, status: 'missing' })).toMatchObject({
      label: '未安装',
      tone: 'pending',
    });
    expect(script()).toContain("luaMetric.append(node('div','Lua LSP','muted')");
    expect(script()).toContain("button(checking ? '检查中' : 'Lua 检查'");
    expect(script()).toContain('构建前检查 Lua');
    expect(api.luaCheckBlocksBuild({ status: 'failed', result: { errorCount: 1 } })).toBe(true);
    expect(api.luaCheckBlocksBuild({ status: 'failed', result: { ready: false } })).toBe(false);
    expect(api.luaCheckBlocksBuild({ status: 'succeeded' })).toBe(false);
  });

  it('announces completion when the state poll sees the finished task first', async () => {
    const { api, fetch } = harness();
    const announce = jest.fn();
    const projects = [{ key: 'alpha', name: 'A', valid: true }];
    api.setup(projects, {
      render: jest.fn(),
      refresh: jest.fn(),
      confirm: jest.fn(),
      notify: jest.fn(),
      announce,
    });
    const task = {
      id: 'build-1',
      projectKey: 'alpha',
      projectName: 'A',
      action: 'build',
      status: 'running',
      startedAt: '2026-09-15T00:00:00Z',
    };
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ projects, tasks: [task] }),
    });
    await api.pollState();
    expect(announce).not.toHaveBeenCalled();
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ projects, tasks: [{ ...task, status: 'succeeded' }] }),
    });
    await api.pollState();
    expect(announce).toHaveBeenCalledWith('构建 · A · 已完成');
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ projects, tasks: [{ ...task, status: 'succeeded' }] }),
    });
    await api.pollState();
    expect(announce).toHaveBeenCalledTimes(1);
  });
  it('embeds syntactically valid script and styles without remote dependencies', () => {
    const html = getConsoleHtml();
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('lang="zh-CN"');
    expect(html).toContain('<style>');
    expect(script().length).toBeGreaterThan(1000);
    expect(() => new Script(script())).not.toThrow();
    expect(html).not.toMatch(/<(?:script|link)[^>]+(?:src|href)=/i);
    expect(script()).not.toMatch(/\.innerHTML|insertAdjacentHTML|document\.write|eval\(/);
    expect(html).toContain('Lucide Contributors 2026');
    expect(html).toContain('The MIT License (MIT)');
  });

  it('stores the fragment token without removing the reload credential', () => {
    const { api, storage, replaceState, fetch } = harness();
    expect(storage.get('maker-console-token')).toBe('secret');
    expect(replaceState).not.toHaveBeenCalled();
    expect(api.current()).toBe('alpha');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps the fragment token usable when session storage is unavailable', async () => {
    const { api, replaceState, fetch } = harness('#token=secret', '?project=alpha', false);
    await api.api('/api/state');
    expect(replaceState).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith(
      '/api/state',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer secret' }),
      })
    );
  });

  it('preserves the fragment token while changing the selected project URL', () => {
    const { api, replaceState } = harness();
    api.changeSelection('beta');
    api.setProjectQuery();
    expect(replaceState).toHaveBeenLastCalledWith(null, '', '/?project=beta#token=secret');
  });

  it('never chooses the first project when the URL has no project', () => {
    expect(harness('#token=secret', '').api.current()).toBe('');
  });

  it('authenticates all API requests and does not send credentials elsewhere', async () => {
    const { api, fetch } = harness();
    await api.api('/api/tasks', { method: 'POST', body: { projectKey: 'alpha', action: 'build' } });
    expect(fetch).toHaveBeenCalledWith(
      '/api/tasks',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer secret' }),
        body: JSON.stringify({ projectKey: 'alpha', action: 'build' }),
        redirect: 'error',
      })
    );
    await expect(api.api('https://foreign.example/api')).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does not request anything when authentication is absent', async () => {
    const { api, fetch } = harness('');
    await expect(api.api('/api/state')).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('stops automatic requests after disconnect and does not retry mutations', async () => {
    const { api, fetch } = harness();
    fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(
      api.api('/api/tasks', {
        method: 'POST',
        body: { projectKey: 'alpha', action: 'build' },
      })
    ).rejects.toThrow('重新打开');
    expect(api.offline()).toBe(true);
    await api.poll();
    await api.sendActivity();
    await expect(api.api('/api/state')).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('also stops polling when the response body is interrupted after headers arrive', async () => {
    const { api, fetch } = harness();
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => {
        throw new TypeError('terminated');
      },
    } as never);
    await expect(api.api('/api/state')).rejects.toThrow('重新打开');
    expect(api.offline()).toBe(true);
    await api.poll();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does not restore connected UI from a late state response after another request disconnects', async () => {
    const { api, fetch } = harness();
    let resolve!: (value: unknown) => void;
    fetch.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    const pending = api.pollState();
    fetch.mockRejectedValueOnce(new TypeError('disconnected'));
    await expect(api.api('/api/state')).rejects.toThrow();
    resolve({ ok: true, status: 200, json: async () => ({ projects: [], tasks: [] }) });
    await pending;
    expect(api.offline()).toBe(true);
    expect(api.loadedState()).toBe(false);
  });

  it('reports explicit activity with throttling', async () => {
    const { api, fetch } = harness();
    await api.sendActivity();
    await api.sendActivity();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe('/api/activity');
    expect(fetch.mock.calls[0][1].method).toBe('POST');
  });

  it('keeps an open console leased until page teardown, including while hidden', async () => {
    const { api, fetch, intervals, setInterval, clearInterval, context } = harness();
    api.startActivityLease();
    expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 60000);
    expect(intervals.size).toBe(1);

    context.document.hidden = true;
    intervals.values().next().value();
    await Promise.resolve();
    expect(fetch).toHaveBeenCalledWith(
      '/api/activity',
      expect.objectContaining({ method: 'POST' })
    );

    api.dispose();
    expect(clearInterval).toHaveBeenCalled();
    expect(intervals.size).toBe(0);
  });

  it('page teardown aborts outstanding reads and prevents further polling', async () => {
    const { api, fetch } = harness();
    let signal!: AbortSignal;
    fetch.mockImplementationOnce(
      (_path, options: any) =>
        new Promise((_, reject) => {
          signal = options.signal;
          signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        })
    );
    const pending = api.api('/api/state').catch(() => {});
    api.dispose();
    await pending;
    expect(signal.aborted).toBe(true);
    await api.poll();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('caps browser task retention during a long session', () => {
    const { api } = harness();
    api.rememberTask({ id: 'running', status: 'running' });
    for (let i = 0; i < 150; i++) api.rememberTask({ id: String(i), status: 'succeeded' });
    expect(api.acceptedCount()).toBe(100);
  });

  it('handles preview liveness strictly without starting unknown processes', () => {
    const { api } = harness();
    expect(api.previewActions({ process_alive: true })).toEqual([
      'preview.refresh',
      'preview.stop',
    ]);
    expect(api.previewActions({ process_alive: false, install_state: 'missing' })).toEqual([
      'preview.install',
    ]);
    expect(api.previewActions({ process_alive: false, install_state: 'ready' })).toEqual([
      'preview.start',
    ]);
    expect(api.previewActions({ process_alive: null, install_state: 'ready' })).toEqual([]);
    expect(api.previewActions({ install_state: 'ready' })).toEqual([]);
    expect(api.previewActions({ process_alive: false, supported: false })).toEqual([]);
  });

  it('keeps a running preview active while surfacing Runtime log errors', () => {
    const { api } = harness();
    expect(
      api.previewPresentation({
        state: 'running',
        process_alive: true,
        errors: ['ERROR: Could not find resource Cube/Day/DaySpecularHDR_QualityLow.dds', ''],
      })
    ).toEqual({
      label: '运行中 · 有日志错误',
      stateLabel: '运行中',
      tone: 'good',
      error: '',
      errors: ['ERROR: Could not find resource Cube/Day/DaySpecularHDR_QualityLow.dds'],
      errorCount: 1,
    });
  });

  it('localizes preview states and keeps session ids in diagnostic details', () => {
    const { api } = harness();
    expect(api.previewStateLabel('starting')).toBe('启动中');
    expect(api.previewStateLabel('running')).toBe('运行中');
    expect(api.previewStateLabel('reloading')).toBe('刷新中');
    expect(api.previewStateLabel('stopped')).toBe('已停止');
    expect(api.previewStateLabel('failed')).toBe('启动失败');
    expect(script()).not.toContain("['会话 ID',preview?.session_id]");
    expect(script()).toContain("node('summary','诊断信息')");
  });

  it('does not auto-expand or repeat structured Lua check failures in task history', () => {
    const { api } = harness();
    const task = {
      action: 'lua-lsp.check',
      status: 'failed',
      error: '发现 3 个 Lua 问题',
      output: '发现 3 个 Lua 问题\nscripts/main.lua:1: undefined-global sdk',
      result: {
        summary: '发现 3 个 Lua 问题',
        error: '发现 3 个 Lua 问题',
        issues: ['scripts/main.lua:1: undefined-global sdk'],
      },
    };
    expect(api.taskStartsOpen(task, false)).toBe(false);
    expect(api.taskStartsOpen({ ...task, action: 'build' }, false)).toBe(true);
    expect(api.taskOutputText(task)).toBe('');
    expect(script()).not.toContain("taskBlock(latest, latest.status === 'failed')");
    expect(api.taskOutputText({ ...task, action: 'build', result: undefined })).toContain(
      'scripts/main.lua:1'
    );
  });

  it('uses the structured Lua summary without repeating issue lines in the check panel', () => {
    const { api } = harness();
    expect(
      api.luaCheckSummary(
        {
          status: 'failed',
          error: 'Lua 检查未通过：1 个错误\nERROR | scripts/main.lua:1: undefined-global sdk',
          result: {
            summary: 'Lua 检查未通过：1 个错误',
            error: 'Lua 检查未通过：1 个错误\nERROR | scripts/main.lua:1: undefined-global sdk',
            issues: ['ERROR | scripts/main.lua:1: undefined-global sdk'],
          },
        },
        false
      )
    ).toBe('Lua 检查未通过：1 个错误');
  });

  it('renders the build-before-Lua-check option only beside the top-level build button', () => {
    const source = script();
    expect(source).toContain('const result = [local,build,luaCheckOption()]');
    expect(source).not.toContain('checkActions.append(luaCheckOption())');
  });

  it('presents Runtime installation status with version, date fallback, and install action', () => {
    const { api } = harness();
    expect(api.runtimePresentation({ install_state: 'ready', runtime_version: '1.2.3' })).toEqual({
      label: '已安装',
      detail: '1.2.3',
      tone: 'good',
    });
    expect(
      api.runtimePresentation({
        install_state: 'ready',
        runtime_version: 'external-session',
        runtime: { runtime_version: 'managed-installation' },
      })
    ).toEqual({ label: '已安装', detail: 'managed-installation', tone: 'good' });
    expect(
      api.runtimePresentation({
        install_state: 'ready',
        runtime_version: 'unknown',
        installed_at: '2026-09-16T02:00:00.000Z',
      })
    ).toMatchObject({ label: '已安装', detail: expect.stringContaining('2026') });
    expect(api.runtimePresentation({ install_state: 'missing' })).toEqual({
      label: '未安装',
      detail: '',
      tone: 'pending',
      action: 'preview.install',
    });
  });

  it('switches to build and test before running a project shortcut', async () => {
    const { api } = harness();
    const calls: string[] = [];
    api.setup([{ key: 'alpha', name: 'A', path: '/tmp/a', valid: true }], {
      render: jest.fn(),
      refresh: jest.fn(),
      confirm: jest.fn(),
      notify: jest.fn(),
      announce: jest.fn(),
      navigate: jest.fn(() => calls.push('navigate')),
      runAction: jest.fn(async (action: string) => calls.push(action)),
    });
    await api.runProjectAction('build');
    expect(calls).toEqual(['navigate', 'build']);
  });

  it('keeps build details and preview logs outside the two-column status layout', () => {
    const source = script();
    const styles = getConsoleHtml().match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
    expect(source).toContain("const logs = node('section',undefined,'console-logs')");
    expect(source).toContain("['build','构建日志'],['lua','Lua 检查'],['runtime','Runtime 日志']");
    expect(source).toContain("replace($('view'),[title,columns,logs,history])");
    expect(source).toContain("bar.setAttribute('aria-valuenow',String(info.percent))");
    expect(styles.indexOf('.build-progress.indeterminate span{width:35%}')).toBeGreaterThan(-1);
    expect(styles.indexOf('.build-progress.indeterminate span{width:35%}')).toBeLessThan(
      styles.indexOf('@media(prefers-reduced-motion:no-preference)')
    );
  });

  it('lays out actual parent edges including merge lanes rather than a decorative line', () => {
    const { api } = harness();
    const graph = api.graphLayout([
      { hash: 'a', parents: ['b', 'c'], date: '2026-09-15T00:00:00Z' },
      { hash: 'b', parents: ['d'] },
      { hash: 'c', parents: ['d'] },
      { hash: 'd', parents: [] },
    ]);
    expect(graph.edges.map((edge: { from: string; to: string }) => [edge.from, edge.to])).toEqual([
      ['a', 'b'],
      ['a', 'c'],
      ['b', 'd'],
      ['c', 'd'],
    ]);
    expect(graph.nodes[1].lane).not.toBe(graph.nodes[2].lane);
  });

  it('includes stale-response guards, visible-only polling and accessible confirmations', () => {
    const source = script();
    expect(source).toContain('selectionEpoch');
    expect(source).toContain('document.hidden');
    expect(source).toContain("document.addEventListener('visibilitychange'");
    expect(source).toContain("action === 'preview.install'");
    expect(source).toContain("action === 'preview.refresh'");
    expect(source).toContain('showModal()');
    expect(getConsoleHtml()).toContain('aria-labelledby="confirm-title"');
    expect(getConsoleHtml()).toContain('aria-live="polite"');
  });

  const project = { key: 'alpha', name: '测试项目', path: '/tmp/game', valid: true };
  const hooks = () => ({
    render: jest.fn(),
    refresh: jest.fn(async () => {}),
    confirm: jest.fn(async () => true),
    notify: jest.fn(),
    announce: jest.fn(),
  });
  const response = (data: unknown) => ({ ok: true, status: 200, json: async () => data });

  it('discards a project detail response after the selection changes', async () => {
    const { api, fetch } = harness();
    const ui = hooks();
    api.setup([project], ui);
    let resolve!: (value: unknown) => void;
    fetch.mockImplementationOnce(
      () =>
        new Promise((resolveRequest) => {
          resolve = resolveRequest;
        }) as never
    );
    const loading = api.loadProject();
    api.changeSelection('beta');
    resolve(response({ project, config: { version: '1' } }));
    await loading;
    expect(api.detail()).toBeNull();
    expect(ui.render).not.toHaveBeenCalled();
    expect(ui.refresh).not.toHaveBeenCalled();
  });

  it('builds without confirmation, rejects duplicate clicks and binds the initiating project', async () => {
    const { api, fetch } = harness();
    const ui = hooks();
    api.setup([project], ui);
    let resolve!: (value: unknown) => void;
    fetch.mockImplementationOnce(
      () =>
        new Promise((resolveRequest) => {
          resolve = resolveRequest;
        }) as never
    );
    const running = api.runAction('build');
    await api.runAction('build');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(ui.confirm).not.toHaveBeenCalled();
    expect(JSON.parse(fetch.mock.calls[0][1].body!)).toEqual({
      projectKey: 'alpha',
      action: 'lua-lsp.check',
    });
    api.changeSelection('beta');
    resolve(
      response({ id: 'task', projectKey: 'alpha', action: 'lua-lsp.check', status: 'running' })
    );
    await running;
    expect(ui.announce).not.toHaveBeenCalled();
  });

  it('requires installation consent and performs no mutation when cancelled', async () => {
    const { api, fetch } = harness();
    const ui = hooks();
    ui.confirm.mockResolvedValue(false);
    api.setup([project], ui);
    fetch.mockResolvedValueOnce(
      response({ process_alive: false, install_state: 'missing' }) as never
    );
    await api.runAction('preview.install');
    expect(ui.confirm).toHaveBeenCalledWith('preview.install', project.name);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][1].method).toBe('GET');
  });

  it('checks live preview status before refreshing and never treats null as stopped', async () => {
    const { api, fetch } = harness();
    const ui = hooks();
    api.setup([project], ui);
    fetch.mockResolvedValueOnce(
      response({ process_alive: null, install_state: 'ready', error: 'ownership unknown' }) as never
    );
    await api.runAction('preview.start');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(ui.confirm).not.toHaveBeenCalled();
    expect(ui.notify).toHaveBeenCalledWith('ownership unknown');
  });

  it.each(['preview.start', 'preview.refresh'])(
    'warns about server edits without blocking %s',
    async (action) => {
      const { api, fetch } = harness();
      const ui = hooks();
      ui.confirm.mockResolvedValue(true);
      api.setup([project], ui);
      fetch.mockResolvedValueOnce(
        response({
          process_alive: action === 'preview.refresh',
          install_state: 'ready',
          server_changes: { checked: true, changed: true },
        }) as never
      );
      fetch.mockResolvedValueOnce(
        response({
          id: 'task',
          projectKey: 'alpha',
          action,
          status: 'succeeded',
        }) as never
      );
      await api.runAction(action);
      expect(fetch.mock.calls[0][0]).toContain('/preview?check_server_changes=1');
      expect(ui.notify).toHaveBeenCalledWith(
        expect.stringContaining('检测到本地有服务端代码修改'),
        'warning'
      );
      expect(
        fetch.mock.calls.some(
          ([url, options]) =>
            url === '/api/tasks' && JSON.parse(options.body || '{}').action === action
        )
      ).toBe(true);
      expect(ui.confirm).toHaveBeenCalledTimes(action === 'preview.refresh' ? 1 : 0);
    }
  );

  it('accepts only explicit HTTP(S) preview URLs without embedded credentials', () => {
    const { api } = harness();
    expect(api.safePreviewUrl('https://maker.example/app/id?localDev=1')).toBe(
      'https://maker.example/app/id?localDev=1'
    );
    for (const unsafe of [
      'javascript:alert(1)',
      'data:text/html,x',
      '//example.com',
      '/api/state',
      'https://user:secret@example.com',
      'file:///tmp/game',
    ]) {
      expect(api.safePreviewUrl(unsafe)).toBeNull();
    }
  });

  it('shows successful build preview links but not refresh API endpoints or failed task URLs', () => {
    const { api } = harness();
    const task = {
      status: 'succeeded',
      result: { ok: true, result: { makerUrl: 'https://maker.example/app/id' } },
    };
    expect(api.taskPreviewUrl(task)).toBe('https://maker.example/app/id');
    expect(api.taskPreviewUrl({ ...task, status: 'failed' })).toBeNull();
    expect(
      api.taskPreviewUrl({
        status: 'succeeded',
        result: { previewRefresh: { ok: true, url: 'https://api.example/preview-refresh' } },
      })
    ).toBeNull();
  });

  it('translates known project health states without claiming missing checks passed', () => {
    const { api } = harness();
    expect(api.healthLabel({ status: 'ready' })).toBe('检查通过');
    expect(api.healthLabel({ status: 'warning' })).toBe('有待处理的问题');
    expect(api.healthLabel({ status: 'error' })).toBe('检查未通过');
    expect(api.healthLabel(undefined)).toBe('未提供检查结果');
  });
});
