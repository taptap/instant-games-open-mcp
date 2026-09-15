import { Script, runInNewContext } from 'node:vm';
import { getConsoleHtml } from '../maker/console/web.js';

function script(): string {
  const html = getConsoleHtml();
  return html.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? '';
}

function harness(hash = '#token=secret', search = '?project=alpha') {
  const storage = new Map<string, string>();
  const replaceState = jest.fn();
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
    console,
    location: { hash, search, href: 'http://localhost:1234/' + search + hash },
    history: { replaceState },
    sessionStorage: {
      setItem: (key: string, value: string) => storage.set(key, value),
      getItem: (key: string) => storage.get(key) ?? null,
    },
    document: {
      addEventListener: jest.fn(),
      getElementById: jest.fn(() => ({ textContent: '', className: '', hidden: true })),
    },
    fetch,
  };
  const exposed = script().replace(
    /\}\)\(\);\s*$/,
    `return {api, previewActions, graphLayout, runAction, loadProject, safePreviewUrl, taskPreviewUrl, healthLabel,
      poll, pollState, sendActivity, dispose, rememberTask, buildPresentation, buildFailureMessage,
      loadedState: () => loaded,
      acceptedCount: () => acceptedTasks.size,
      offline: () => offline,
      current: () => selected, detail: () => detail,
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
      }
    };})();`
  );
  const api = runInNewContext(exposed, context);
  return { api, fetch, storage, replaceState };
}

describe('Maker console standalone UI', () => {
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
    ).toMatchObject({ label: '构建中', active: true, stage: '验证项目访问权限' });
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
    expect(api.buildPresentation({ status: 'unknown' }, false, false)).toMatchObject({
      label: '结果待核对',
      active: false,
    });
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

  it('stores fragment token before removing it and binds the explicit project', () => {
    const { api, storage, replaceState, fetch } = harness();
    expect(storage.get('maker-console-token')).toBe('secret');
    expect(replaceState).toHaveBeenCalledWith(null, '', '/?project=alpha');
    expect(api.current()).toBe('alpha');
    expect(fetch).not.toHaveBeenCalled();
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

  it('reports explicit activity with throttling, never a periodic heartbeat', async () => {
    const { api, fetch } = harness();
    await api.sendActivity();
    await api.sendActivity();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe('/api/activity');
    expect(fetch.mock.calls[0][1].method).toBe('POST');
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
      action: 'build',
    });
    api.changeSelection('beta');
    resolve(response({ id: 'task', projectKey: 'alpha', action: 'build', status: 'running' }));
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
