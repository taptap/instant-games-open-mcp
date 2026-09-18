import { Script, runInNewContext } from 'node:vm';
import { getConsoleHtml } from '../maker/console/web.js';

function script(): string {
  const html = getConsoleHtml();
  return html.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? '';
}

function harness(hash = '', search = '?project=alpha', storageAvailable = true) {
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
    `return {api, selectDialog, confirmQrcode, previewActions, graphLayout, runAction, runProjectAction, loadProject, safePreviewUrl, taskPreviewUrl, healthLabel,
      qrcodeImageSource: typeof qrcodeImageSource === 'function' ? qrcodeImageSource : undefined,
      clearConsoleLogs: typeof clearConsoleLogs === 'function' ? clearConsoleLogs : undefined,
      consoleLogText, logView, tasksFor, loadFortuneFrame, logLineClass,
      showQrcode: typeof showQrcode === 'function' ? showQrcode : undefined,
      handleQrcodeCompletion: typeof handleQrcodeCompletion === 'function' ? handleQrcodeCompletion : undefined,
      poll, pollState, sendActivity, startActivityLease, dispose, shutdownConsole, rememberTask, buildPresentation, buildFailureMessage,
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
      current: () => selected, detail: () => detail, chooseProject, busy,
      setProjectQuery, projectKeyFromQuery,
      changeSelection: (key) => { selected = key; selectionEpoch++; },
      setup: (projects, hooks) => {
        state = {projects, tasks: []};
        updateChrome = hooks.render;
        updateBuild = hooks.render;
        renderConsoleLogs = hooks.render;
        renderOverview = hooks.render;
        render = hooks.render;
        refreshPreview = hooks.refresh;
        confirmAction = hooks.confirm;
        if (hooks.confirmQrcode) confirmQrcode = hooks.confirmQrcode;
        if (hooks.selectDialog) selectDialog = hooks.selectDialog;
        notify = hooks.notify;
        announce = hooks.announce;
        if (hooks.navigate) navigate = hooks.navigate;
        if (hooks.runAction) runAction = hooks.runAction;
        if (hooks.loadProject) loadProject = hooks.loadProject;
      }
    };})();`
  );
  const api = runInNewContext(exposed, context);
  return { api, fetch, storage, replaceState, intervals, setInterval, clearInterval, context };
}

describe('Maker console standalone UI', () => {
  it('clears the selected log without stopping the task and shows subsequent output', () => {
    const { api, fetch } = harness();
    api.setup([], { render: jest.fn(), notify: jest.fn(), announce: jest.fn() });
    const task = {
      id: 'build-1',
      projectKey: 'alpha',
      action: 'build',
      status: 'running',
      output: 'old\n',
    };
    api.rememberTask(task);
    api.clearConsoleLogs();
    expect(api.consoleLogText()).toBe('日志已清理');
    api.rememberTask({ ...task, output: 'old\nnew\n' });
    expect(api.consoleLogText()).toBe('new\n');
    api.changeSelection('beta');
    expect(api.consoleLogText()).toBe('暂无日志');
    api.changeSelection('alpha');
    api.logView().tab = 'runtime';
    api.logView().runtime = 'runtime old';
    api.clearConsoleLogs();
    expect(api.consoleLogText()).toBe('日志已清理');
    api.logView().runtime = 'runtime old\nnew';
    expect(api.consoleLogText()).toBe('\nnew');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not resurrect discarded task history from the local task cache', () => {
    const { api } = harness();
    api.setup([], { render: jest.fn(), notify: jest.fn(), announce: jest.fn() });
    for (let i = 0; i < 15; i++)
      api.rememberTask({
        id: String(i),
        projectKey: 'alpha',
        status: 'succeeded',
        action: 'build',
        startedAt: new Date(i * 1000).toISOString(),
      });
    expect(api.tasksFor('alpha')).toHaveLength(10);
    expect(api.tasksFor('alpha')[9].id).toBe('5');
  });
  const qrTask = (url = 'https://tapcode-sce.spark.xd.com/qrcode/game.png') => ({
    id: 'qr-result',
    projectKey: 'alpha',
    projectName: 'Game',
    action: 'qrcode',
    status: 'succeeded',
    result: {
      ok: true,
      result: { content: [{ type: 'text', text: `![测试二维码](${url} "扫描此二维码测试游戏")` }] },
    },
  });

  it('extracts the actual remote Markdown QR image without rendering arbitrary Markdown images', () => {
    const { api } = harness();
    expect(api.qrcodeImageSource(qrTask())).toBe(
      'https://tapcode-sce.spark.xd.com/qrcode/game.png'
    );
    for (const url of [
      'http://127.0.0.1/qrcode/a.png',
      'https://evil.example/qrcode/a.png',
      'https://tapcode-sce.spark.xd.com.evil.example/qrcode/a.png',
      'https://user:pass@tapcode-sce.spark.xd.com/qrcode/a.png',
      'https://tapcode-sce.spark.xd.com/qrcode/a.svg',
    ])
      expect(api.qrcodeImageSource(qrTask(url))).toBeNull();
    expect(api.qrcodeImageSource({ ...qrTask(), status: 'failed' })).toBeNull();
  });

  it('opens a large QR dialog and retries only the image after a loading error', () => {
    const { api, context, fetch } = harness();
    const elements = new Map<string, any>();
    context.document.getElementById.mockImplementation(((id: string) => {
      if (!elements.has(id))
        elements.set(id, {
          hidden: false,
          open: false,
          textContent: '',
          src: '',
          removeAttribute: jest.fn(),
          showModal: jest.fn(),
          close: jest.fn(),
        });
      return elements.get(id);
    }) as never);
    api.showQrcode(qrTask());
    const image = elements.get('qrcode-result-image');
    expect(image.src).toContain('/qrcode/game.png');
    expect(elements.get('qrcode-result').showModal).toHaveBeenCalledTimes(1);
    image.onerror();
    expect(elements.get('qrcode-result-reload').hidden).toBe(false);
    elements.get('qrcode-result-reload').onclick();
    expect(image.src).toContain('/qrcode/game.png');
    image.onload();
    expect(elements.get('qrcode-result-status').hidden).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('opens a completed QR only once, without interrupting another project or dialog', () => {
    const { api, context } = harness();
    const modal = { open: false, hidden: false, showModal: jest.fn() };
    context.document.getElementById.mockImplementation(() => modal as never);
    api.setup([], { render: jest.fn(), notify: jest.fn(), announce: jest.fn() });
    api.handleQrcodeCompletion({ ...qrTask(), projectKey: 'beta' });
    expect(modal.showModal).not.toHaveBeenCalled();
    api.handleQrcodeCompletion(qrTask());
    api.handleQrcodeCompletion(qrTask());
    expect(modal.showModal).toHaveBeenCalledTimes(1);
    modal.open = true;
    api.handleQrcodeCompletion({ ...qrTask(), id: 'next' });
    expect(modal.showModal).toHaveBeenCalledTimes(1);
  });

  it('continues known developer prompts through confirmation but never retries unknown failures', () => {
    const { api, fetch } = harness();
    const runAction = jest.fn();
    api.setup([], { render: jest.fn(), notify: jest.fn(), announce: jest.fn(), runAction });
    api.handleQrcodeCompletion({ ...qrTask(), status: 'unknown' });
    expect(runAction).not.toHaveBeenCalled();
    const task = {
      ...qrTask(),
      id: 'needs-choice',
      status: 'unknown',
      interaction: {
        kind: 'select_developer',
        options: [{ value: 1, label: 'Studio' }],
      },
    };
    api.handleQrcodeCompletion(task);
    api.handleQrcodeCompletion(task);
    expect(runAction).toHaveBeenCalledTimes(1);
    expect(runAction).toHaveBeenCalledWith('qrcode', { sourceTaskId: 'needs-choice' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows a failed preview entry message once and only for the selected project', () => {
    const { api } = harness();
    const notify = jest.fn();
    api.setup([], { render: jest.fn(), notify });
    const task = {
      id: 'entry-failed',
      projectKey: 'alpha',
      action: 'preview.start',
      status: 'failed',
      error: '找不到本地预览入口 scripts/main.lua',
    };
    api.rememberTask(task);
    api.rememberTask(task);
    api.rememberTask({ ...task, id: 'other-project', projectKey: 'beta' });
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(task.error);
  });

  it.each([false, true])('only shuts down after confirmation=%s', async (confirmed) => {
    const { api, fetch } = harness();
    const confirm = jest.fn().mockResolvedValue(confirmed);
    api.setup([], { render: jest.fn(), confirm, notify: jest.fn() });
    await api.shutdownConsole();
    expect(confirm).toHaveBeenCalledWith('console.shutdown');
    expect(fetch).toHaveBeenCalledTimes(confirmed ? 1 : 0);
    if (confirmed) {
      expect(fetch.mock.calls[0][0]).toBe('/api/shutdown');
      expect(fetch.mock.calls[0][1].method).toBe('POST');
    }
    expect(api.offline()).toBe(confirmed);
  });

  it('keeps the console available if shutdown is rejected by active tasks', async () => {
    const { api, fetch } = harness();
    const notify = jest.fn();
    api.setup([], {
      render: jest.fn(),
      confirm: jest.fn().mockResolvedValue(true),
      notify,
    });
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ error: 'Wait for active tasks before stopping the console.' }),
    });
    await api.shutdownConsole();
    expect(api.offline()).toBe(false);
    expect(notify).toHaveBeenCalled();
    await api.api('/api/state');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

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

  it('places a pale-yellow game fortune trigger beside the footer version label', () => {
    const html = getConsoleHtml();
    const styles = html.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
    const footer = html.match(/<footer>[\s\S]*?<\/footer>/)?.[0] ?? '';
    expect(footer.indexOf('id="version"')).toBeGreaterThan(-1);
    expect(footer.indexOf('id="version"')).toBeLessThan(footer.indexOf('id="fortune-toggle"'));
    expect(footer.indexOf('id="fortune-toggle"')).toBeLessThan(footer.indexOf('id="footer-path"'));
    expect(footer).toContain('id="fortune-corner" aria-label="开发者日签" hidden');
    expect(footer).toContain('>独立游戏开发日签<');
    expect(styles).toContain('button#fortune-toggle{border:0;background:none;color:#f5e6a3;');
    expect(html).toContain('id="fortune-panel"');
    expect(html).toContain('id="fortune-frame"');
    expect(html).not.toContain('gDEV 日签');
    expect(html).not.toContain('id="fortune-close"');
    expect(script()).toContain("theme=dungeon&mode=' + fortuneMode()");
    expect(script()).toContain('/gdev-fortune/?embed=1&theme=dungeon&mode=');
    expect(script()).toContain('https://liangdong-ttm.github.io/gdev-fortune/');
    expect(script()).not.toContain('gdev-fortune:size');
    expect(html).not.toContain('id="fortune-retry"');
    expect(script()).toContain('function fortuneIsOpen()');
    expect(script()).toContain('if (!fortuneReady) return;');
    expect(script()).not.toContain('finishFortuneLoad');
    expect(script()).not.toContain('fortuneLoadTimer');
    expect(script()).not.toContain('fortune-retry');
    expect(script()).not.toContain('fortune-status');
    expect(script()).toContain("fortuneFrame.addEventListener('load'");
    expect(script()).toContain("fortunePanel.classList.add('fortune-preload')");
    expect(script()).toContain('if (!fortuneReady) return;');
    expect(script()).toContain('function beginFortuneLoad(reload)');
    expect(script()).not.toContain('setTimeout(revealFortune,3000)');
    expect(script()).not.toContain('fortunePreloadTimer = setTimeout');
    expect(script()).toContain("transformOrigin = 'left bottom'");
    expect(script()).toContain('scheduleCloseFortune');
    expect(script()).toContain(
      'if (panel.parentElement !== document.body) document.body.append(panel);'
    );
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

  it('does not store credentials from legacy fragment URLs', () => {
    const { api, storage, replaceState, fetch } = harness('#token=secret');
    expect(storage.size).toBe(0);
    expect(replaceState).not.toHaveBeenCalled();
    expect(api.current()).toBe('alpha');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('opens a bare URL even when session storage is unavailable', async () => {
    const { api, replaceState, fetch } = harness('', '', false);
    await api.api('/api/state');
    expect(replaceState).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith(
      '/api/state',
      expect.objectContaining({
        headers: { 'Content-Type': 'application/json' },
      })
    );
  });

  it('changes the selected project URL without a token', () => {
    const { api, replaceState } = harness();
    api.setup([{ key: 'beta', projectid: 'actual-project-id' }], { render: jest.fn() });
    api.changeSelection('beta');
    api.setProjectQuery();
    expect(replaceState).toHaveBeenLastCalledWith(null, '', '/?projectid=actual-project-id');
  });

  it('resolves actual project IDs and keeps duplicate checkout selection unambiguous', () => {
    const { api, replaceState } = harness();
    api.setup(
      [
        { key: 'alpha', projectid: 'shared-id' },
        { key: 'beta', projectid: 'shared-id' },
        { key: 'gamma', projectid: 'unique-id' },
      ],
      { render: jest.fn() }
    );
    expect(api.projectKeyFromQuery(new URLSearchParams('projectid=unique-id'))).toBe('gamma');
    expect(api.projectKeyFromQuery(new URLSearchParams('projectid=shared-id'))).toBe('');
    expect(api.projectKeyFromQuery(new URLSearchParams('projectid=shared-id&checkout=beta'))).toBe(
      'beta'
    );
    expect(api.projectKeyFromQuery(new URLSearchParams('projectid=unique-id&checkout=beta'))).toBe(
      ''
    );
    expect(api.projectKeyFromQuery(new URLSearchParams('project=alpha'))).toBe('alpha');
    api.changeSelection('beta');
    api.setProjectQuery();
    expect(replaceState).toHaveBeenLastCalledWith(null, '', '/?projectid=shared-id&checkout=beta');
  });

  it('never chooses the first project when the URL has no project', () => {
    expect(harness('#token=secret', '').api.current()).toBe('');
  });

  it('sends token-free API requests only to local API paths', async () => {
    const { api, fetch } = harness();
    await api.api('/api/tasks', { method: 'POST', body: { projectKey: 'alpha', action: 'build' } });
    expect(fetch).toHaveBeenCalledWith(
      '/api/tasks',
      expect.objectContaining({
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectKey: 'alpha', action: 'build' }),
        redirect: 'error',
      })
    );
    await expect(api.api('https://foreign.example/api')).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('requests state without credentials', async () => {
    const { api, fetch } = harness('');
    await expect(api.api('/api/state')).resolves.toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps local failures isolated and never retries mutations', async () => {
    const { api, fetch } = harness();
    fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(
      api.api('/api/tasks', {
        method: 'POST',
        body: { projectKey: 'alpha', action: 'build' },
      })
    ).rejects.toThrow('结果尚未确认');
    expect(api.offline()).toBe(false);
    await api.api('/api/state');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(1);
  });

  it('allows another read after an interrupted response body', async () => {
    const { api, fetch } = harness();
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => {
        throw new TypeError('terminated');
      },
    } as never);
    await expect(api.api('/api/state')).rejects.toThrow('请求失败');
    expect(api.offline()).toBe(false);
    await api.api('/api/state');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('does not disable other features after a service-unavailable response from one operation', async () => {
    const { api, fetch } = harness();
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({ error: '弹窗不可用' }),
    } as never);
    await expect(
      api.api('/api/projects/select-folder', { method: 'POST', body: {} })
    ).rejects.toThrow('弹窗不可用');
    expect(api.offline()).toBe(false);
    await api.api('/api/state');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('does not restore connected UI from a late state response after page teardown', async () => {
    const { api, fetch } = harness();
    let resolve!: (value: unknown) => void;
    fetch.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    const pending = api.pollState();
    api.dispose();
    resolve({ ok: true, status: 200, json: async () => ({ projects: [], tasks: [] }) });
    await pending;
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
    api.rememberTask({ id: 'running', projectKey: 'alpha', status: 'running' });
    for (let i = 0; i < 150; i++)
      api.rememberTask({ id: String(i), projectKey: 'beta', status: 'succeeded' });
    expect(api.acceptedCount()).toBe(11);
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

  it('separates primary preview/build/QR actions from Lua checks and build status', () => {
    const source = script();
    expect(source).toContain("primary.append(local,build,button('测试二维码'");
    expect(source).toContain('secondary.append(luaCheckOption())');
    expect(source).toContain('return [primary,secondary]');
    expect(source).toContain("checkActions.append(button(checking ? '检查中' : 'Lua 检查'");
    expect(source).toContain('Lua 检查未通过，已停止构建，请查看下方 Lua 检查日志。');
    expect(source).toContain('Lua 检查不可用，已继续构建，请查看下方 Lua 检查日志。');
    expect(source).not.toContain('notify(text(nestedResult(check)?.error || check?.error');
    expect(source).not.toContain('notify(text(check.error');
    expect(getConsoleHtml()).toContain('<option value="puzzle">益智</option>');
    expect(getConsoleHtml()).toContain('<option value="casual">休闲</option>');
  });

  it('colors shared console log lines by severity without changing their text', () => {
    const { api } = harness();
    expect(api.logLineClass('ERROR | main.lua:1 | bad field')).toBe('log-line log-error');
    expect(api.logLineClass('warning: retrying request')).toBe('log-line log-warning');
    expect(api.logLineClass('普通构建日志')).toBe('log-line');
    expect(api.logLineClass('finished with no errors')).toBe('log-line');
  });

  it('keeps successful QR output collapsed without hiding actionable failures', () => {
    const { api } = harness();
    expect(api.taskStartsOpen({ action: 'qrcode', status: 'succeeded' })).toBe(true);
    expect(api.taskStartsOpen({ action: 'qrcode', status: 'failed' })).toBe(true);
    expect(api.taskStartsOpen({ action: 'build', status: 'running' })).toBe(false);
    expect(api.taskStartsOpen({ action: 'build', status: 'unknown' })).toBe(false);
    expect(api.taskStartsOpen({ action: 'qrcode', status: 'failed' }, false, false)).toBe(true);
    expect(api.taskStartsOpen({ action: 'build', status: 'unknown' }, false, false)).toBe(false);
    expect(api.taskStartsOpen({ action: 'build', status: 'running' }, false, false)).toBe(false);
    expect(api.taskStartsOpen({ action: 'build', status: 'failed' }, true, false)).toBe(true);
    expect(script()).toContain("d.append(button('查看二维码'");
    expect(script()).toContain("d.append(button('选择开发者并继续'");
  });

  it.each([null, { confirmedOrientation: 'portrait' }])(
    'only dispatches a QR task after confirmation: %j',
    async (choice) => {
      const { api, fetch } = harness();
      const confirmQrcode = jest.fn(async () => choice);
      api.setup([{ key: 'alpha', name: 'A', valid: true }], {
        render: jest.fn(),
        confirmQrcode,
        notify: jest.fn(),
        announce: jest.fn(),
      });
      fetch.mockImplementation(async (url) => ({
        ok: true,
        status: 200,
        json: async () =>
          url === '/api/tasks'
            ? { id: 'qr', projectKey: 'alpha', action: 'qrcode', status: 'succeeded' }
            : { health: { canGenerateTestQrcode: true }, config: {} },
      }));
      await api.runAction('qrcode');
      expect(confirmQrcode).toHaveBeenCalledTimes(1);
      const mutations = fetch.mock.calls.filter(([, options]) => options.method === 'POST');
      expect(mutations).toHaveLength(choice ? 1 : 0);
      if (choice)
        expect(JSON.parse(mutations[0][1].body!)).toEqual({
          projectKey: 'alpha',
          action: 'qrcode',
          confirmedOrientation: 'portrait',
        });
      expect(fetch.mock.calls.some(([url]) => url.includes('/preview'))).toBe(false);
    }
  );

  it('allows missing publishing fields to be completed in QR confirmation', async () => {
    const { api, fetch } = harness();
    const notify = jest.fn(),
      confirmQrcode = jest.fn(async () => null);
    api.setup([{ key: 'alpha', name: 'A', valid: true }], {
      render: jest.fn(),
      confirmQrcode,
      notify,
      announce: jest.fn(),
    });
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ health: { canGenerateTestQrcode: false } }),
    });
    await api.runAction('qrcode');
    expect(confirmQrcode).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls.every(([, options]) => options.method === 'GET')).toBe(true);
    expect(notify).not.toHaveBeenCalled();
  });

  it.each(['needs_initialization', 'blocked'])(
    'explains QR prerequisites before collecting choices or starting work: %s',
    async (status) => {
      const { api, fetch, context } = harness();
      const confirmQrcode = jest.fn();
      const modal = { open: false, showModal: jest.fn(), textContent: '' };
      context.document.getElementById.mockImplementation(() => modal as never);
      api.setup([{ key: 'alpha', name: 'A', valid: true }], {
        render: jest.fn(),
        confirmQrcode,
        notify: jest.fn(),
        announce: jest.fn(),
      });
      fetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          config: {
            qrcodeNeedsInitialization: status === 'needs_initialization',
            qrcodePreparation: { status, message: '请先处理配置' },
          },
        }),
      });
      await api.runAction('qrcode');
      expect(modal.showModal).toHaveBeenCalledTimes(1);
      expect(confirmQrcode).not.toHaveBeenCalled();
      expect(fetch.mock.calls.every(([, options]) => options.method === 'GET')).toBe(true);
    }
  );

  it.each([
    'cancel-select',
    'cancel-confirm',
    'switch-select',
    'switch-confirm',
    'confirm',
    'direct',
  ])('developer continuation stays bound to its source task: %s', async (mode) => {
    const { api, fetch } = harness();
    const selectDialog = jest.fn(async () => {
      if (mode === 'switch-select') api.changeSelection('beta');
      return mode === 'cancel-select' ? null : 123;
    });
    const confirmQrcode = jest.fn(async () => {
      if (mode === 'switch-confirm') api.changeSelection('beta');
      return mode === 'cancel-confirm' ? null : { confirmedBuild: true };
    });
    api.setup(
      [
        { key: 'alpha', name: 'A', valid: true },
        { key: 'beta', name: 'B', valid: true },
      ],
      {
        render: jest.fn(),
        selectDialog,
        confirmQrcode,
        notify: jest.fn(),
        announce: jest.fn(),
      }
    );
    api.rememberTask({
      id: 'source',
      projectKey: 'alpha',
      action: 'qrcode',
      status: 'unknown',
      interaction: {
        kind: 'select_developer',
        title: '选择开发者身份',
        options: [{ value: 123, label: 'A' }],
      },
    });
    fetch.mockImplementation(async (url) => ({
      ok: true,
      status: 200,
      json: async () =>
        url === '/api/tasks'
          ? { id: 'next', projectKey: 'alpha', action: 'qrcode', status: 'succeeded' }
          : { config: { orientation: 'portrait', qrcodeNeedsTitle: mode !== 'direct' } },
    }));
    await api.runAction('qrcode');
    expect(selectDialog).toHaveBeenCalledTimes(1);
    const posts = fetch.mock.calls.filter(([, options]) => options.method === 'POST');
    if (mode === 'confirm' || mode === 'direct') {
      expect(posts).toHaveLength(1);
      expect(JSON.parse(posts[0][1].body!)).toEqual({
        projectKey: 'alpha',
        action: 'qrcode',
        sourceTaskId: 'source',
        publication: { developer_id: 123 },
        confirmedBuild: true,
      });
      if (mode === 'direct') expect(confirmQrcode).not.toHaveBeenCalled();
      else
        expect(confirmQrcode).toHaveBeenCalledWith(
          expect.objectContaining({ name: 'A' }),
          expect.objectContaining({ qrcodeNeedsSync: true, developerLabel: 'A' })
        );
    } else expect(posts).toHaveLength(0);
  });

  it('renders selection labels as text and requires a real choice and explicit confirmation', async () => {
    const { api, context } = harness();
    const elements = new Map<string, any>();
    context.document.getElementById.mockImplementation(((id: string) => {
      if (!elements.has(id))
        elements.set(id, {
          value: '',
          disabled: false,
          textContent: '',
          append: jest.fn(),
          replaceChildren: jest.fn(),
          showModal: jest.fn(),
          addEventListener: (_event: string, callback: () => void) => {
            elements.get(id).close = callback;
          },
        });
      return elements.get(id);
    }) as never);
    const choice = api.selectDialog('选择', '确认将同步所有本地改动', [
      { value: 123, label: '<img src=x onerror=alert(1)>' },
    ]);
    const picker = elements.get('selection-options');
    expect(picker.value).toBe('');
    expect(elements.get('selection-accept').disabled).toBe(true);
    expect(picker.append.mock.calls[0][0].textContent).toBe('<img src=x onerror=alert(1)>');
    expect(picker.append.mock.calls[0][0].innerHTML).toBeUndefined();
    picker.value = '456';
    picker.onchange();
    expect(elements.get('selection-accept').disabled).toBe(true);
    picker.value = '123';
    picker.onchange();
    expect(elements.get('selection-accept').disabled).toBe(false);
    elements.get('selection-dialog').returnValue = 'cancel';
    elements.get('selection-dialog').close();
    expect(await choice).toBeNull();
  });

  it.each([false, true])(
    'QR dialog collects only missing fields and requires sync consent: %s',
    async (missing) => {
      const { api, context } = harness();
      const elements = new Map<string, any>();
      context.document.getElementById.mockImplementation(((id: string) => {
        if (!elements.has(id))
          elements.set(id, {
            value: '',
            hidden: false,
            disabled: false,
            textContent: '',
            showModal: jest.fn(),
            addEventListener: (_event: string, callback: () => void) => {
              elements.get(id).close = callback;
            },
          });
        return elements.get(id);
      }) as never);
      const result = api.confirmQrcode(
        { name: 'Game' },
        {
          orientation: 'portrait',
          qrcodeNeedsTitle: missing,
          qrcodeNeedsCategory: missing,
        }
      );
      expect(elements.get('qrcode-orientation-field').hidden).toBe(true);
      expect(elements.get('qrcode-name-field').hidden).toBe(!missing);
      expect(elements.get('qrcode-accept').disabled).toBe(missing);
      if (missing) {
        expect(elements.get('qrcode-effects').textContent).toContain('所有本地改动');
        elements.get('qrcode-name').value = '拼豆';
        elements.get('qrcode-name').oninput();
        expect(elements.get('qrcode-accept').disabled).toBe(true);
        elements.get('qrcode-category').value = 'puzzle';
        elements.get('qrcode-category').onchange();
        expect(elements.get('qrcode-accept').disabled).toBe(false);
      }
      elements.get('qrcode-confirm').returnValue = 'accept';
      elements.get('qrcode-confirm').close();
      expect(await result).toEqual({
        confirmedOrientation: undefined,
        confirmedBuild: missing,
        ...(missing ? { publication: { title: '拼豆', category: 'puzzle' } } : {}),
      });
    }
  );

  it('keeps explicit sync confirmation on retry after saved QR configuration failed to build', async () => {
    const { api, fetch } = harness();
    const confirmQrcode = jest.fn(async () => null);
    api.setup([{ key: 'alpha', name: 'A', valid: true }], {
      render: jest.fn(),
      confirmQrcode,
      notify: jest.fn(),
      announce: jest.fn(),
    });
    api.rememberTask({
      id: 'qr-failed',
      projectKey: 'alpha',
      action: 'qrcode',
      status: 'failed',
      result: { ok: false, requiresSync: true },
    });
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ config: { orientation: 'portrait' } }),
    });
    await api.runAction('qrcode');
    expect(confirmQrcode).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ qrcodeNeedsSync: true })
    );
    expect(fetch.mock.calls.every(([, options]) => options.method === 'GET')).toBe(true);
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

  it('allows switching away from a busy project without unlocking its task', () => {
    const { api } = harness();
    api.setup([project, { ...project, key: 'beta', name: 'B' }], {
      ...hooks(),
      loadProject: jest.fn(),
    });
    api.rememberTask({ id: 'running', projectKey: 'alpha', action: 'build', status: 'running' });
    api.chooseProject('beta');
    expect(api.current()).toBe('beta');
    expect(api.busy('alpha')).toBe(true);
    expect(api.busy('beta')).toBe(false);
    expect(script()).toContain('picker.disabled = !loaded || offline;');
  });

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
    fetch.mockResolvedValueOnce(
      response({
        id: 'task',
        projectKey: 'alpha',
        action: 'lua-lsp.check',
        status: 'succeeded',
      }) as never
    );
    fetch.mockResolvedValueOnce(
      response({
        id: 'build',
        projectKey: 'alpha',
        action: 'build',
        status: 'succeeded',
      }) as never
    );
    resolve(
      response({ id: 'task', projectKey: 'alpha', action: 'lua-lsp.check', status: 'running' })
    );
    await running;
    expect(ui.announce).not.toHaveBeenCalled();
    expect(JSON.parse(fetch.mock.calls[2][1].body!)).toEqual({
      projectKey: 'alpha',
      action: 'build',
    });
  });

  it('continues preview in the original project after installation and a project switch', async () => {
    const { api, fetch } = harness();
    const ui = hooks();
    api.setup([project], ui);
    fetch.mockResolvedValueOnce(
      response({ process_alive: false, install_state: 'missing' }) as never
    );
    fetch.mockImplementationOnce(async () => {
      api.changeSelection('beta');
      return response({
        id: 'install',
        projectKey: 'alpha',
        action: 'preview.install',
        status: 'succeeded',
      });
    });
    fetch.mockResolvedValueOnce(
      response({ process_alive: false, install_state: 'ready' }) as never
    );
    fetch.mockResolvedValueOnce(
      response({
        id: 'start',
        projectKey: 'alpha',
        action: 'preview.start',
        status: 'succeeded',
      }) as never
    );
    await api.runAction('preview.install', { startAfterInstall: true });
    expect(ui.confirm).toHaveBeenCalledWith('preview.install', project.name, true);
    expect(fetch.mock.calls[2][0]).toBe('/api/projects/alpha/preview?check_server_changes=1');
    expect(JSON.parse(fetch.mock.calls[3][1].body!)).toEqual({
      projectKey: 'alpha',
      action: 'preview.start',
    });
    expect(api.current()).toBe('beta');
  });

  it('does not start preview after an independent install or failed installation', async () => {
    for (const [startAfterInstall, status] of [
      [false, 'succeeded'],
      [true, 'failed'],
    ] as const) {
      const { api, fetch } = harness();
      api.setup([project], hooks());
      fetch.mockResolvedValueOnce(
        response({ process_alive: false, install_state: 'missing' }) as never
      );
      fetch.mockResolvedValueOnce(
        response({ id: 'install', projectKey: 'alpha', action: 'preview.install', status }) as never
      );
      await api.runAction('preview.install', { startAfterInstall });
      expect(
        fetch.mock.calls.filter(
          ([url, options]) =>
            url === '/api/tasks' && JSON.parse(options.body!).action === 'preview.start'
        )
      ).toHaveLength(0);
    }
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
    expect(ui.confirm).toHaveBeenCalledWith('preview.install', project.name, false);
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
