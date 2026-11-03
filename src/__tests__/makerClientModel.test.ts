import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import {
  extractMakerClientModelRequest,
  MAKER_CLIENT_MODEL_META_KEY,
  resolveMakerClientModel,
} from '../maker/clientModel';
import { reportMakerMcpActivity } from '../maker/tracking';

jest.mock('node:child_process', () => {
  const { promisify } = jest.requireActual('node:util');
  return { execFile: Object.assign(jest.fn(), { [promisify.custom]: jest.fn() }) };
});

const run = promisify(execFile) as unknown as jest.Mock;
const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')!;
const threadId = '01234567-89ab-cdef-0123-456789abcdef';
let home: string;

function workBuddySession() {
  const root = path.join(home, '.workbuddy');
  const sessions = path.join(root, 'sessions');
  const project = path.join(root, 'projects', 'workspace-game');
  fs.mkdirSync(sessions, { recursive: true });
  fs.mkdirSync(project, { recursive: true });
  fs.writeFileSync(
    path.join(sessions, process.ppid + '.json'),
    JSON.stringify({ sessionId: 'session-a', cwd: '/workspace/game' })
  );
  return path.join(project, 'session-a.jsonl');
}

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-model-test-'));
  jest.spyOn(os, 'homedir').mockReturnValue(home);
  Object.defineProperty(process, 'platform', { ...platformDescriptor, value: 'darwin' });
  run.mockReset().mockImplementation(async (command: string) => {
    if (command === 'ps') return { stdout: process.ppid + ' 1 /host/workbuddy' };
    throw new Error('Unexpected command: ' + command);
  });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  Object.defineProperty(process, 'platform', platformDescriptor);
  fs.rmSync(home, { recursive: true, force: true });
});

test('extracts a current-call model without changing business arguments or reading local state', async () => {
  const args = { target_dir: '/game', detail: false, _maker_client_model: ' model-a ' };
  const request = extractMakerClientModelRequest(args);
  expect(request.arguments).toEqual({ target_dir: '/game', detail: false });
  expect(args._maker_client_model).toBe(' model-a ');
  expect(await resolveMakerClientModel({ requestModel: request.model })).toEqual({
    client_model_id: 'model-a',
    model_lookup_scope: 'current_call',
    model_lookup_source: 'tool_argument',
  });
  expect(run).not.toHaveBeenCalled();
});

test('metadata takes precedence without backfilling from other sources or copying extra fields', async () => {
  const request = extractMakerClientModelRequest(
    { _maker_client_model: 'argument-model' },
    {
      [MAKER_CLIENT_MODEL_META_KEY]: {
        resolved_model: 'resolved-a',
        model_provider: 'provider-a',
        client_model_name: 'Model A',
        unrelated: 'private-data',
        model_lookup_scope: 'latest_session',
      },
    }
  );
  expect(await resolveMakerClientModel({ requestModel: request.model })).toEqual({
    resolved_model: 'resolved-a',
    client_model_name: 'Model A',
    model_provider: 'provider-a',
    model_lookup_scope: 'current_call',
    model_lookup_source: 'request_metadata',
  });
  expect(run).not.toHaveBeenCalled();
});

test('invalid metadata falls through to the argument and missing arguments use local lookup', async () => {
  const transcript = workBuddySession();
  fs.writeFileSync(transcript, JSON.stringify({ providerData: { requestModelId: 'local-a' } }));
  const metadata = { [MAKER_CLIENT_MODEL_META_KEY]: { client_model_id: [], model_provider: 'x' } };
  const supplied = extractMakerClientModelRequest({ _maker_client_model: 'auto' }, metadata);
  expect((await resolveMakerClientModel({ requestModel: supplied.model })).client_model_id).toBe(
    'auto'
  );
  expect(run).not.toHaveBeenCalled();
  const missing = extractMakerClientModelRequest(undefined, metadata);
  expect(await resolveMakerClientModel({ requestModel: missing.model })).toMatchObject({
    client_model_id: 'local-a',
    model_lookup_source: 'local_session',
  });
});

test.each([
  undefined,
  null,
  42,
  {},
  [],
  '',
  '  ',
  'UNKNOWN',
  'unavailable',
  'n/a',
  'x'.repeat(257),
])('ignores invalid reported model %p and always strips the statistics argument', (value) => {
  const request = extractMakerClientModelRequest({ detail: true, _maker_client_model: value });
  expect(request).toEqual({ arguments: { detail: true } });
});

test('sequential and concurrent reports keep each call model and preserve the original event', async () => {
  const fetchImpl = jest.fn(
    async (_input: string | URL | Request, _init?: RequestInit) =>
      new Response(null, { status: 204 })
  );
  const report = (model: string, id: number) =>
    reportMakerMcpActivity({
      context: {
        userId: 'user',
        projectId: 'project',
        clientInfo: { name: 'any-ide', version: '1' },
        requestModel: extractMakerClientModelRequest({ _maker_client_model: model }).model,
      },
      toolName: 'maker_status_lite',
      requestId: id,
      success: true,
      fetchImpl,
    });
  await report('a', 1);
  await report('b', 2);
  await Promise.all([report('a', 3), report('b', 4)]);
  const payloads = fetchImpl.mock.calls.map(([, options]) => JSON.parse(String(options?.body)));
  expect(payloads.map((payload) => [payload.args.tool_id, payload.args.client_model_id])).toEqual([
    ['1', 'a'],
    ['2', 'b'],
    ['3', 'a'],
    ['4', 'b'],
  ]);
  for (const payload of payloads) {
    expect(payload).toMatchObject({
      action: 'tapmaker_mcp_call',
      args: {
        user_id: 'user',
        project_id: 'project',
        tool_name: 'maker_status_lite',
        source: 'local_mcp',
        success: true,
        client_name: 'any-ide',
        model_lookup_source: 'tool_argument',
        model_lookup_scope: 'current_call',
      },
    });
    expect(payload.args._maker_client_model).toBeUndefined();
  }
  expect(run).not.toHaveBeenCalled();
});

test('SDK transports optional arguments and custom metadata to extraction (simulated client)', async () => {
  const server = new Server({ name: 'test-server', version: '1' }, { capabilities: { tools: {} } });
  const client = new Client({ name: 'test-client', version: '1' });
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const extracted = extractMakerClientModelRequest(
      request.params.arguments,
      request.params._meta
    );
    const model = await resolveMakerClientModel({ requestModel: extracted.model });
    return {
      content: [{ type: 'text', text: JSON.stringify({ arguments: extracted.arguments, model }) }],
    };
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    for (const useMetadata of [false, true]) {
      const result = await client.callTool({
        name: 'maker_status_lite',
        arguments: { detail: false, _maker_client_model: 'argument-model' },
        ...(useMetadata
          ? { _meta: { [MAKER_CLIENT_MODEL_META_KEY]: { client_model_id: 'metadata-model' } } }
          : {}),
      });
      const content = result.content as Array<{ type: string; text: string }>;
      expect(JSON.parse(content[0].text)).toEqual({
        arguments: { detail: false },
        model: {
          client_model_id: useMetadata ? 'metadata-model' : 'argument-model',
          model_lookup_scope: 'current_call',
          model_lookup_source: useMetadata ? 'request_metadata' : 'tool_argument',
        },
      });
    }
    expect(run).not.toHaveBeenCalled();
  } finally {
    await client.close();
    await server.close();
  }
});

test('preserves explicit auto and rereads the latest WorkBuddy selection on each call', async () => {
  const transcript = workBuddySession();
  fs.writeFileSync(
    transcript,
    JSON.stringify({ providerData: { requestModelId: 'auto', model: 'resolved-a' } }) + '\n'
  );
  expect(await resolveMakerClientModel()).toMatchObject({
    client_model_id: 'auto',
    resolved_model: 'resolved-a',
  });
  fs.appendFileSync(
    transcript,
    JSON.stringify({
      providerData: { requestModelId: 'model-b', requestModelName: 'Model B', model: 'resolved-b' },
    }) + '\n'
  );
  expect(await resolveMakerClientModel()).toEqual({
    client_model_id: 'model-b',
    client_model_name: 'Model B',
    resolved_model: 'resolved-b',
    model_lookup_scope: 'current_session',
    model_lookup_source: 'local_session',
  });
});

test('does not fill missing fields from an older record or another session in the same project', async () => {
  const transcript = workBuddySession();
  fs.writeFileSync(
    transcript,
    [
      { providerData: { requestModelId: 'old-model', requestModelName: 'Old' } },
      { providerData: { model: 'current-resolved' } },
      { model: 'not-provider-data' },
    ]
      .map((record) => JSON.stringify(record))
      .join('\n') + '\n{"partial":'
  );
  fs.writeFileSync(
    path.join(path.dirname(transcript), 'session-b.jsonl'),
    JSON.stringify({ providerData: { requestModelId: 'other-session' } })
  );
  expect(JSON.parse(JSON.stringify(await resolveMakerClientModel()))).toEqual({
    resolved_model: 'current-resolved',
    model_lookup_scope: 'current_session',
    model_lookup_source: 'local_session',
  });
});

test('returns no model for a malformed session record', async () => {
  workBuddySession();
  fs.writeFileSync(path.join(home, '.workbuddy', 'sessions', process.ppid + '.json'), '{broken');
  expect(await resolveMakerClientModel()).toEqual({});
});

test('does not use a WorkBuddy session outside the ancestor chain', async () => {
  const transcript = workBuddySession();
  fs.writeFileSync(transcript, JSON.stringify({ providerData: { requestModelId: 'other' } }));
  fs.renameSync(
    path.join(home, '.workbuddy', 'sessions', process.ppid + '.json'),
    path.join(home, '.workbuddy', 'sessions', '999999999.json')
  );
  expect(await resolveMakerClientModel()).toEqual({});
});

test('queries only the uniquely locked Codex thread and refreshes its model', async () => {
  const lock = path.join(home, 'codex-home', 'thread-writer-locks', threadId + '.lock');
  let model = 'model-a';
  run.mockImplementation(async (command: string) => {
    if (command === 'ps') return { stdout: process.ppid + ' 1 /host/codex' };
    if (command === 'lsof') return { stdout: 'n' + lock + '\nn' + lock + '\n' };
    if (command === 'sqlite3') {
      return { stdout: JSON.stringify([{ model, model_provider: 'provider-a' }]) };
    }
    throw new Error('Unexpected command');
  });
  expect(await resolveMakerClientModel()).toEqual({
    client_model_id: 'model-a',
    model_provider: 'provider-a',
    model_lookup_scope: 'current_session',
    model_lookup_source: 'local_session',
  });
  model = 'model-b';
  expect((await resolveMakerClientModel()).client_model_id).toBe('model-b');
  const query = run.mock.calls.find(([command]) => command === 'sqlite3')?.[1];
  expect(query).toEqual(
    expect.arrayContaining([
      '-readonly',
      path.join(home, 'codex-home', 'state_5.sqlite'),
      "SELECT model, model_provider FROM threads WHERE id = '" + threadId + "' LIMIT 1;",
    ])
  );
});

test('does not guess a Codex thread when multiple locks are open', async () => {
  const locks = ['session-a', 'session-b'].map((id) =>
    path.join(home, 'thread-writer-locks', id + '.lock')
  );
  run.mockImplementation(async (command: string) => ({
    stdout:
      command === 'ps'
        ? process.ppid + ' 1 /host/codex'
        : locks.map((lock) => 'n' + lock).join('\n'),
  }));
  expect(await resolveMakerClientModel()).toEqual({});
  expect(run.mock.calls.some(([command]) => command === 'sqlite3')).toBe(false);
});

test('bounds a stalled lookup and aborts its command', async () => {
  jest.useFakeTimers();
  run.mockImplementation(() => new Promise(() => {}));
  const pending = resolveMakerClientModel();
  await jest.advanceTimersByTimeAsync(1001);
  expect(await pending).toEqual({});
  expect(run.mock.calls[0][2].signal.aborted).toBe(true);
});

test('still reports client identity and the original event when model commands fail', async () => {
  run.mockRejectedValue(new Error('Command unavailable'));
  const fetchImpl = jest.fn(
    async (_input: string | URL | Request, _init?: RequestInit) =>
      new Response(null, { status: 204 })
  );
  await reportMakerMcpActivity({
    context: {
      userId: 'test-user',
      projectId: 'test-project',
      clientInfo: { name: 'test-client', version: '1.0' },
    },
    toolName: 'test-tool',
    success: true,
    fetchImpl,
  });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  const options = fetchImpl.mock.calls[0][1];
  expect(JSON.parse(String(options?.body))).toEqual({
    action: 'tapmaker_mcp_call',
    args: {
      user_id: 'test-user',
      project_id: 'test-project',
      tool_name: 'test-tool',
      source: 'local_mcp',
      mcp_version: 'dev',
      client_name: 'test-client',
      client_version: '1.0',
      success: true,
    },
  });
});

function writeKiroSession(id: string, model: string | undefined, modified: string, project = home) {
  const directory = path.join(home, '.kiro', 'sessions', 'workspace', 'sess_' + id);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(
    path.join(directory, 'session.json'),
    JSON.stringify({
      workspacePaths: [project],
      modelId: model,
      lastModifiedAt: modified,
      contextSnapshotModelDisplay: { display: model ? 'Display ' + model : undefined },
    })
  );
}

test('Kiro selects the latest session in the real project and refreshes after a switch', async () => {
  const other = path.join(home, 'other-project');
  fs.mkdirSync(other);
  const alias = path.join(home, 'alias');
  fs.symlinkSync(home, alias, 'dir');
  writeKiroSession('a', 'model-a', '2026-11-03T10:00:00Z');
  writeKiroSession('b', 'model-b', '2026-11-03T11:00:00Z', alias);
  writeKiroSession('foreign', 'foreign-model', '2026-11-03T12:00:00Z', other);
  const context = { clientName: 'kiro', projectDir: home };
  expect(await resolveMakerClientModel(context)).toEqual({
    client_model_id: 'model-b',
    client_model_name: 'Display model-b',
    model_lookup_scope: 'latest_session',
    model_lookup_source: 'local_session',
  });
  writeKiroSession('b', 'auto', '2026-11-03T11:01:00Z');
  expect((await resolveMakerClientModel(context)).client_model_id).toBe('auto');
  expect(run).not.toHaveBeenCalled();
});

test('Kiro does not backfill an absent latest model or choose between tied sessions', async () => {
  const context = { clientName: 'kiro', projectDir: home };
  writeKiroSession('a', 'old', '2026-11-03T10:00:00Z');
  writeKiroSession('b', undefined, '2026-11-03T11:00:00Z');
  expect(await resolveMakerClientModel(context)).toEqual({});
  writeKiroSession('b', 'different', '2026-11-03T10:00:00Z');
  expect(await resolveMakerClientModel(context)).toEqual({});
});

test('Kiro fallback requires the matching editor and project', async () => {
  writeKiroSession('a', 'model-a', '2026-11-03T10:00:00Z');
  expect(await resolveMakerClientModel({ clientName: 'kiro' })).toEqual({});
  expect(await resolveMakerClientModel({ projectDir: home })).toEqual({});
  const other = path.join(home, 'other');
  fs.mkdirSync(other);
  expect(await resolveMakerClientModel({ clientName: 'kiro', projectDir: other })).toEqual({});
  run.mockResolvedValue({
    stdout: process.ppid + ' 1 /Applications/Kiro.app/Kiro Helper (Plugin)',
  });
  expect((await resolveMakerClientModel({ projectDir: home })).model_lookup_scope).toBe(
    'latest_session'
  );
});

test('Kiro skips corrupt metadata and returns empty when the scan bound is exceeded', async () => {
  const context = { clientName: 'kiro', projectDir: home };
  writeKiroSession('broken', 'old', '2026-11-03T10:00:00Z');
  fs.writeFileSync(path.join(home, '.kiro/sessions/workspace/sess_broken/session.json'), '{');
  writeKiroSession('valid', 'model-a', '2026-11-03T11:00:00Z');
  expect((await resolveMakerClientModel(context)).client_model_id).toBe('model-a');
  for (let i = 0; i < 512; i++) {
    fs.mkdirSync(path.join(home, '.kiro', 'sessions', 'workspace-' + i));
  }
  expect(await resolveMakerClientModel(context)).toEqual({});
});

function traeFixture() {
  const appData =
    process.platform === 'win32'
      ? process.env.APPDATA!
      : path.join(home, 'Library', 'Application Support');
  const root = path.join(appData, 'Trae CN', 'User');
  const directory = path.join(root, 'workspaceStorage', 'workspace-a');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(
    path.join(directory, 'workspace.json'),
    JSON.stringify({ folder: pathToFileURL(home).href })
  );
  const state = {
    sessionId: 'session-a',
    selections: {
      'session-a': { solo_agent: { modelId: 'solo_agent_1__deepseek-v4.1-flash' } },
      'session-b': { solo_agent: { modelId: 'other-model' } },
    } as Record<string, Record<string, { modelId: string }>>,
  };
  run.mockImplementation(async (command: string, args: string[]) => {
    if (command === 'ps')
      return { stdout: process.ppid + ' 1 /Applications/Trae CN.app/Contents/MacOS/Electron' };
    if (command === 'sqlite3') {
      expect(args).toEqual(
        expect.arrayContaining([
          '-readonly',
          '-init',
          process.platform === 'win32' ? 'NUL' : '/dev/null',
        ])
      );
      const query = args[args.length - 1];
      if (query.includes('lastActiveSessionId'))
        return { stdout: JSON.stringify([{ value: state.sessionId }]) };
      expect(query).toContain("substr(key, -length(':AI.agent.model.session_selected_model'))");
      return { stdout: JSON.stringify([{ value: JSON.stringify(state.selections) }]) };
    }
    throw new Error('Unexpected command');
  });
  return { root, state };
}

test('Trae reads the matching workspace and retains the raw model ID on each lookup', async () => {
  const { state } = traeFixture();
  const context = { projectDir: home };
  expect(await resolveMakerClientModel(context)).toEqual({
    client_model_id: 'solo_agent_1__deepseek-v4.1-flash',
    model_lookup_scope: 'latest_session',
    model_lookup_source: 'local_session',
  });
  state.selections['session-a'].solo_agent.modelId = 'auto';
  expect((await resolveMakerClientModel(context)).client_model_id).toBe('auto');
  state.sessionId = 'session-b';
  expect((await resolveMakerClientModel(context)).client_model_id).toBe('other-model');
});

test('Trae omits missing selections and conflicting Agent models without preferring solo_agent', async () => {
  const { state } = traeFixture();
  const context = { clientName: 'Trae CN', projectDir: home };
  state.selections['session-a'].chat = { modelId: 'different' };
  expect(await resolveMakerClientModel(context)).toEqual({});
  state.selections['session-a'].chat.modelId = state.selections['session-a'].solo_agent.modelId;
  expect((await resolveMakerClientModel(context)).client_model_id).toBe(
    'solo_agent_1__deepseek-v4.1-flash'
  );
  state.sessionId = 'missing';
  expect(await resolveMakerClientModel(context)).toEqual({});
});

test('Windows fallback uses Kiro metadata and Trae APPDATA without process discovery', async () => {
  Object.defineProperty(process, 'platform', { ...platformDescriptor, value: 'win32' });
  writeKiroSession('a', 'model-a', '2026-11-03T10:00:00Z');
  expect(
    (await resolveMakerClientModel({ clientName: 'kiro', projectDir: home })).client_model_id
  ).toBe('model-a');
  expect(run).not.toHaveBeenCalled();
  const appData = process.env.APPDATA;
  try {
    process.env.APPDATA = path.join(home, 'AppData', 'Roaming');
    traeFixture();
    expect(
      (await resolveMakerClientModel({ clientName: 'Trae CN', projectDir: home })).client_model_id
    ).toBe('solo_agent_1__deepseek-v4.1-flash');
    expect(run.mock.calls.every(([command]) => command === 'sqlite3')).toBe(true);
  } finally {
    if (appData === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = appData;
  }
});

test('Trae does not use a foreign project or choose between duplicate workspace records', async () => {
  const { root } = traeFixture();
  const other = path.join(home, 'other-project');
  fs.mkdirSync(other);
  expect(await resolveMakerClientModel({ clientName: 'Trae CN', projectDir: other })).toEqual({});
  expect(run).not.toHaveBeenCalled();
  const duplicate = path.join(root, 'workspaceStorage', 'workspace-b');
  fs.mkdirSync(duplicate);
  fs.writeFileSync(
    path.join(duplicate, 'workspace.json'),
    JSON.stringify({ folder: pathToFileURL(home).href })
  );
  expect(await resolveMakerClientModel({ clientName: 'Trae CN', projectDir: home })).toEqual({});
  expect(run).not.toHaveBeenCalled();
});

test('fallback failures still send the original event without model fields', async () => {
  traeFixture();
  run.mockRejectedValue(new Error('Database unavailable'));
  const fetchImpl = jest.fn(
    async (_input: string | URL | Request, _init?: RequestInit) =>
      new Response(null, { status: 204 })
  );
  await reportMakerMcpActivity({
    context: {
      userId: 'user',
      projectId: 'project',
      clientInfo: { name: 'Trae CN', version: '1' },
      projectDir: home,
    },
    toolName: 'tool',
    fetchImpl,
  });
  const args = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body)).args;
  expect(args.client_name).toBe('Trae CN');
  expect(args.client_model_id).toBeUndefined();
  expect(args.model_lookup_scope).toBeUndefined();
  expect(args.projectDir).toBeUndefined();
});

test('tracking passes local project context and sends the fallback scope without local paths', async () => {
  writeKiroSession('a', 'model-a', '2026-11-03T10:00:00Z');
  const fetchImpl = jest.fn(
    async (_input: string | URL | Request, _init?: RequestInit) =>
      new Response(null, { status: 204 })
  );
  await reportMakerMcpActivity({
    context: {
      userId: 'user',
      projectId: 'project',
      clientInfo: { name: 'kiro', version: '0.0.0' },
      projectDir: home,
    },
    toolName: 'tool',
    fetchImpl,
  });
  const payload = String(fetchImpl.mock.calls[0]?.[1]?.body);
  expect(JSON.parse(payload).args).toMatchObject({
    client_name: 'kiro',
    client_model_id: 'model-a',
    model_lookup_scope: 'latest_session',
    model_lookup_source: 'local_session',
  });
  expect(payload).not.toContain(home);
});
