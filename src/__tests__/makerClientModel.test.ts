import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { resolveMakerClientModel } from '../maker/clientModel';
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
