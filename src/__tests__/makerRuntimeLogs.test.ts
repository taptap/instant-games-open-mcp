/**
 * Maker runtime log pull tests.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  DEFAULT_RUNTIME_LOG_SINCE_SECONDS,
  DEFAULT_RUNTIME_LOG_TOPICS,
  normalizeRuntimeLogQueryResult,
  pullRuntimeLogs,
  readRuntimeLogState,
  resetRuntimeLogs,
  watchRuntimeLogs,
  writeRuntimeLogRawResponse,
  type RuntimeLogQueryArgs,
} from '../maker/server/runtimeLogs';

describe('maker runtime logs', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-runtime-logs-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('pulls lua runtime logs once into one server-shaped log file', async () => {
    const remoteCalls: RuntimeLogQueryArgs[] = [];

    const result = await pullRuntimeLogs({
      projectRoot: tempDir,
      callRemoteRuntimeLogs: async (args) => {
        remoteCalls.push(args);
        return {
          logs: [
            {
              id: 'log-1',
              t: 1710000003,
              topic: 'user_script',
              level: 'ERROR',
              msg: 'runtime error',
              source: 'debugging',
            },
            {
              t: 1710000004,
              topic: 'server_user_script',
              level: 'INFO',
              msg: 'server ready',
            },
          ],
          nextStartTime: 1710000005,
          serverTime: 1710000008,
          hasMore: false,
        };
      },
    });

    expect(remoteCalls).toEqual([
      { sinceSeconds: DEFAULT_RUNTIME_LOG_SINCE_SECONDS, topics: DEFAULT_RUNTIME_LOG_TOPICS },
    ]);
    expect(result.writtenLogs).toBe(2);
    expect(result.files).toEqual([path.join(tempDir, '.maker', 'logs', 'runtime', 'runtime.log')]);
    const lines = fs
      .readFileSync(path.join(tempDir, '.maker', 'logs', 'runtime', 'runtime.log'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(lines).toEqual([
      {
        t: 1710000003,
        topic: 'user_script',
        level: 'ERROR',
        msg: 'runtime error',
        source: 'debugging',
      },
      {
        t: 1710000004,
        topic: 'server_user_script',
        level: 'INFO',
        msg: 'server ready',
      },
    ]);
    expect(fs.existsSync(path.join(tempDir, '.maker', 'logs', 'runtime', 'runtime.raw.log'))).toBe(
      false
    );
    expect(fs.existsSync(path.join(tempDir, '.maker', 'logs', 'runtime', 'engine.log'))).toBe(
      false
    );
    expect(
      fs.existsSync(path.join(tempDir, '.maker', 'logs', 'runtime', 'server_user_script.log'))
    ).toBe(false);
    expect(fs.existsSync(path.join(tempDir, '.maker', 'logs', 'runtime', 'user_script.log'))).toBe(
      false
    );
    expect(readRuntimeLogState(tempDir)).toMatchObject({
      nextStartTime: 1710000005,
    });
  });

  test('does not write meta rows into the local runtime log', async () => {
    await pullRuntimeLogs({
      projectRoot: tempDir,
      callRemoteRuntimeLogs: async () => ({
        logs: [],
        nextStartTime: 1710000005,
        serverTime: 1710000005,
        hasMore: false,
      }),
    });

    expect(fs.existsSync(path.join(tempDir, '.maker', 'logs', 'runtime', 'runtime.log'))).toBe(
      false
    );
  });

  test('keeps wrapped logs in server field names without id or duplicate aliases', () => {
    const result = normalizeRuntimeLogQueryResult({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            code: 0,
            data: {
              logs: [
                {
                  id: 'log-1',
                  time: 1710000003,
                  topic: 'user_script',
                  message: 'hello',
                },
              ],
              next_start_time: 1710000004,
              server_time: 1710000005,
              has_more: true,
            },
          }),
        },
      ],
    });

    expect(result).toEqual({
      logs: [{ t: 1710000003, topic: 'user_script', msg: 'hello' }],
      nextStartTime: 1710000004,
      serverTime: 1710000005,
      hasMore: true,
    });
  });

  test('stores legacy local runtime file in the compact server-shaped format', async () => {
    const result = await pullRuntimeLogs({
      projectRoot: tempDir,
      callRemoteRuntimeLogs: async () => ({
        logs: [
          {
            id: 'log-1',
            time: 1710000003,
            topic: 'user_script',
            level: 'ERROR',
            message: 'runtime error',
          },
        ],
        nextStartTime: 1710000005,
        serverTime: 1710000008,
        hasMore: false,
      }),
    });

    expect(result.files).toEqual([path.join(tempDir, '.maker', 'logs', 'runtime', 'runtime.log')]);
    expect(
      JSON.parse(
        fs.readFileSync(path.join(tempDir, '.maker', 'logs', 'runtime', 'runtime.log'), 'utf8')
      )
    ).toEqual({ t: 1710000003, topic: 'user_script', level: 'ERROR', msg: 'runtime error' });
  });

  test('runtime log file remains a single file for all script topics', async () => {
    await pullRuntimeLogs({
      projectRoot: tempDir,
      callRemoteRuntimeLogs: async () => ({
        logs: [
          {
            t: 1710000003,
            topic: 'user_script',
            level: 'INFO',
            msg: 'client',
          },
          {
            t: 1710000004,
            topic: 'server_user_script',
            level: 'INFO',
            msg: 'server',
          },
        ],
        nextStartTime: 1710000005,
        serverTime: 1710000008,
        hasMore: false,
      }),
    });

    const runtimeLog = fs.readFileSync(
      path.join(tempDir, '.maker', 'logs', 'runtime', 'runtime.log'),
      'utf8'
    );
    expect(runtimeLog).toContain('"topic":"user_script"');
    expect(runtimeLog).toContain('"topic":"server_user_script"');
    expect(fs.existsSync(path.join(tempDir, '.maker', 'logs', 'runtime', 'user_script.log'))).toBe(
      false
    );
  });

  test('uses a fresh saved cursor instead of the default since window', async () => {
    const stateDir = path.join(tempDir, '.maker', 'logs', 'runtime');
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(
      path.join(stateDir, 'state.json'),
      JSON.stringify({ nextStartTime: 1710000100, updatedAt: '2026-05-27T00:00:00.000Z' }),
      'utf8'
    );

    const remoteCalls: RuntimeLogQueryArgs[] = [];
    await pullRuntimeLogs({
      projectRoot: tempDir,
      nowMs: () => 1710000200 * 1000,
      callRemoteRuntimeLogs: async (args) => {
        remoteCalls.push(args);
        return {
          logs: [],
          nextStartTime: 1710000200,
          serverTime: 1710000200,
          hasMore: false,
        };
      },
    });

    expect(remoteCalls).toEqual([{ startTime: 1710000100, topics: DEFAULT_RUNTIME_LOG_TOPICS }]);
  });

  test('advances cursor past returned log timestamps when server cursor lags behind logs', async () => {
    await pullRuntimeLogs({
      projectRoot: tempDir,
      callRemoteRuntimeLogs: async () => ({
        logs: [
          {
            t: 1710000202,
            topic: 'user_script',
            level: 'INFO',
            msg: 'late log',
          },
        ],
        nextStartTime: 1710000199,
        serverTime: 1710000203,
        hasMore: false,
      }),
    });

    expect(readRuntimeLogState(tempDir)).toMatchObject({
      nextStartTime: 1710000203,
    });
  });

  test('appends runtime rows exactly as returned even when repeated', async () => {
    const log = {
      t: 1710000202,
      topic: 'user_script',
      level: 'INFO',
      msg: 'same log',
    };

    await pullRuntimeLogs({
      projectRoot: tempDir,
      callRemoteRuntimeLogs: async () => ({
        logs: [log],
        nextStartTime: 1710000203,
        serverTime: 1710000203,
        hasMore: false,
      }),
    });
    const second = await pullRuntimeLogs({
      projectRoot: tempDir,
      nowMs: () => 1710000204 * 1000,
      callRemoteRuntimeLogs: async () => ({
        logs: [log],
        nextStartTime: 1710000203,
        serverTime: 1710000204,
        hasMore: false,
      }),
    });

    const lines = fs
      .readFileSync(path.join(tempDir, '.maker', 'logs', 'runtime', 'runtime.log'), 'utf8')
      .trim()
      .split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(lines[1]);
    expect(second.writtenLogs).toBe(1);
  });

  test('records heartbeat fields after a successful runtime log pull', async () => {
    await pullRuntimeLogs({
      projectRoot: tempDir,
      nowMs: () => 1710000300 * 1000,
      callRemoteRuntimeLogs: async () => ({
        logs: [
          {
            t: 1710000299,
            topic: 'user_script',
            level: 'INFO',
            msg: 'heartbeat success',
          },
        ],
        nextStartTime: 1710000300,
        serverTime: 1710000300,
        hasMore: false,
      }),
    });

    expect(readRuntimeLogState(tempDir)).toMatchObject({
      nextStartTime: 1710000300,
      updatedAt: '2024-03-09T16:05:00.000Z',
      lastPollAt: '2024-03-09T16:05:00.000Z',
      lastSuccessAt: '2024-03-09T16:05:00.000Z',
      lastWrittenLogs: 1,
      consecutiveFailures: 0,
      lastError: null,
    });
  });

  test('ignores an expired saved cursor and falls back to the default since window', async () => {
    const stateDir = path.join(tempDir, '.maker', 'logs', 'runtime');
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(
      path.join(stateDir, 'state.json'),
      JSON.stringify({ nextStartTime: 1710000100, updatedAt: '2026-05-27T00:00:00.000Z' }),
      'utf8'
    );

    const remoteCalls: RuntimeLogQueryArgs[] = [];
    const result = await pullRuntimeLogs({
      projectRoot: tempDir,
      nowMs: () => 1710004001 * 1000,
      callRemoteRuntimeLogs: async (args) => {
        remoteCalls.push(args);
        return {
          logs: [],
          nextStartTime: 1710004001,
          serverTime: 1710004001,
          hasMore: false,
        };
      },
    });

    expect(remoteCalls).toEqual([
      { sinceSeconds: DEFAULT_RUNTIME_LOG_SINCE_SECONDS, topics: DEFAULT_RUNTIME_LOG_TOPICS },
    ]);
    expect(result.cursorExpired).toBe(true);
  });

  test('normalizes server wrapped runtime log payloads with snake case cursors', () => {
    const result = normalizeRuntimeLogQueryResult({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            code: 0,
            data: {
              logs: [{ time: 1710000003, topic: 'user_script', message: 'hello' }],
              next_start_time: 1710000004,
              server_time: 1710000005,
              has_more: true,
            },
          }),
        },
      ],
    });

    expect(result.nextStartTime).toBe(1710000004);
    expect(result.serverTime).toBe(1710000005);
    expect(result.hasMore).toBe(true);
  });

  test('writes raw remote response when runtime log payload shape is unknown', () => {
    const rawPath = writeRuntimeLogRawResponse(tempDir, {
      content: [{ type: 'text', text: JSON.stringify({ data: { items: [] } }) }],
    });

    const saved = JSON.parse(fs.readFileSync(rawPath, 'utf8')) as Record<string, unknown>;
    expect(rawPath).toBe(
      path.join(tempDir, '.maker', 'logs', 'runtime', 'last-query-runtime-logs-result.json')
    );
    expect(saved).toHaveProperty('capturedAt');
    expect(saved).toHaveProperty('raw');
  });

  test('normalizes server meta-only success response as an empty log page', () => {
    const result = normalizeRuntimeLogQueryResult({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            type: 'meta',
            success: true,
            nextStartTime: 1779868355,
            truncated: false,
          }),
        },
      ],
    });

    expect(result).toEqual({
      logs: [],
      nextStartTime: 1779868355,
      serverTime: 1779868355,
      hasMore: false,
    });
  });

  test('normalizes newline-delimited server log rows followed by meta', () => {
    const result = normalizeRuntimeLogQueryResult({
      content: [
        {
          type: 'text',
          text: [
            JSON.stringify({
              id: 'log-1',
              t: 1779861349,
              topic: 'user_script',
              level: 'INFO',
              msg: 'client heartbeat',
              userId: 2014634134,
            }),
            JSON.stringify({
              type: 'meta',
              success: true,
              nextStartTime: 1779861353,
              truncated: false,
            }),
          ].join('\n'),
        },
      ],
    });

    expect(result).toEqual({
      logs: [
        {
          t: 1779861349,
          topic: 'user_script',
          level: 'INFO',
          msg: 'client heartbeat',
          userId: 2014634134,
        },
      ],
      nextStartTime: 1779861353,
      serverTime: 1779861353,
      hasMore: false,
    });
  });

  test('normalizes newline-delimited server log rows when server no longer sends id', () => {
    const result = normalizeRuntimeLogQueryResult({
      content: [
        {
          type: 'text',
          text: [
            JSON.stringify({
              t: 1779861349,
              topic: 'user_script',
              level: 'INFO',
              msg: 'client heartbeat',
              userId: 2014634134,
            }),
            JSON.stringify({
              type: 'meta',
              success: true,
              nextStartTime: 1779861353,
              truncated: false,
            }),
          ].join('\n'),
        },
      ],
    });

    expect(result).toEqual({
      logs: [
        {
          t: 1779861349,
          topic: 'user_script',
          level: 'INFO',
          msg: 'client heartbeat',
          userId: 2014634134,
        },
      ],
      nextStartTime: 1779861353,
      serverTime: 1779861353,
      hasMore: false,
    });
  });

  test('watch resets local runtime history before polling and waits 5s between empty pages', async () => {
    const runtimeDir = path.join(tempDir, '.maker', 'logs', 'runtime');
    fs.mkdirSync(runtimeDir, { recursive: true });
    fs.writeFileSync(path.join(runtimeDir, 'runtime.log'), 'old log\n', 'utf8');
    fs.writeFileSync(
      path.join(runtimeDir, 'state.json'),
      JSON.stringify({ nextStartTime: 1710000000, updatedAt: '2026-05-27T00:00:00.000Z' }),
      'utf8'
    );
    fs.writeFileSync(path.join(runtimeDir, 'last-query-runtime-logs-result.json'), '{}', 'utf8');

    const remoteCalls: RuntimeLogQueryArgs[] = [];
    const sleepCalls: number[] = [];
    const result = await watchRuntimeLogs({
      projectRoot: tempDir,
      reset: true,
      intervalMs: 5000,
      maxPolls: 2,
      nowMs: () => 1710000003 * 1000,
      sleep: async (ms) => {
        sleepCalls.push(ms);
      },
      callRemoteRuntimeLogs: async (args) => {
        remoteCalls.push(args);
        return {
          logs: [
            {
              t: 1710000001 + remoteCalls.length,
              topic: 'user_script',
              level: 'INFO',
              msg: `poll-${remoteCalls.length}`,
            },
          ],
          nextStartTime: 1710000001 + remoteCalls.length,
          serverTime: 1710000001 + remoteCalls.length,
          hasMore: false,
        };
      },
    });

    expect(result.polls).toBe(2);
    expect(result.writtenLogs).toBe(2);
    expect(remoteCalls).toEqual([
      { sinceSeconds: DEFAULT_RUNTIME_LOG_SINCE_SECONDS, topics: DEFAULT_RUNTIME_LOG_TOPICS },
      { startTime: 1710000003, topics: DEFAULT_RUNTIME_LOG_TOPICS },
    ]);
    expect(sleepCalls).toEqual([5000]);
    const lines = fs.readFileSync(path.join(runtimeDir, 'runtime.log'), 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('poll-1');
    expect(lines.join('\n')).not.toContain('old log');
    expect(fs.existsSync(path.join(runtimeDir, 'last-query-runtime-logs-result.json'))).toBe(false);
  });

  test('watch pulls immediately again when server reports more pages', async () => {
    const sleepCalls: number[] = [];
    let calls = 0;
    const result = await watchRuntimeLogs({
      projectRoot: tempDir,
      intervalMs: 5000,
      maxPolls: 2,
      sleep: async (ms) => {
        sleepCalls.push(ms);
      },
      callRemoteRuntimeLogs: async () => {
        calls += 1;
        return {
          logs: [
            {
              t: 1710000000 + calls,
              topic: 'user_script',
              level: 'INFO',
              msg: `page-${calls}`,
            },
          ],
          nextStartTime: 1710000001 + calls,
          serverTime: 1710000001 + calls,
          hasMore: true,
        };
      },
    });

    expect(result.polls).toBe(2);
    expect(sleepCalls).toEqual([]);
  });

  test('watch sleeps instead of hot-looping when server reports more pages without cursor progress', async () => {
    const sleepCalls: number[] = [];
    const result = await watchRuntimeLogs({
      projectRoot: tempDir,
      intervalMs: 5000,
      maxPolls: 2,
      sleep: async (ms) => {
        sleepCalls.push(ms);
      },
      callRemoteRuntimeLogs: async () => ({
        logs: [],
        nextStartTime: 1710000001,
        serverTime: 1710000001,
        hasMore: true,
      }),
    });

    expect(result.polls).toBe(2);
    expect(sleepCalls).toEqual([5000]);
  });

  test('watch keeps retrying transient failures by default until a later poll succeeds', async () => {
    const errors: string[] = [];
    const sleepCalls: number[] = [];
    let attempts = 0;

    const result = await watchRuntimeLogs({
      projectRoot: tempDir,
      intervalMs: 5000,
      maxPolls: 1,
      sleep: async (ms) => {
        sleepCalls.push(ms);
      },
      onError: async (error) => {
        errors.push(error instanceof Error ? error.message : String(error));
      },
      callRemoteRuntimeLogs: async () => {
        attempts += 1;
        if (attempts < 3) {
          throw new Error(`temporary failure ${attempts}`);
        }
        return {
          logs: [],
          nextStartTime: 1710000001,
          serverTime: 1710000001,
          hasMore: false,
        };
      },
    });

    expect(result.polls).toBe(1);
    expect(attempts).toBe(3);
    expect(errors).toEqual(['temporary failure 1', 'temporary failure 2']);
    expect(sleepCalls).toEqual([5000, 5000]);
  });

  test('records failure heartbeat while retrying and clears it after success', async () => {
    const states: Array<ReturnType<typeof readRuntimeLogState>> = [];
    let attempts = 0;

    await watchRuntimeLogs({
      projectRoot: tempDir,
      maxPolls: 1,
      nowMs: () => 1710000400 * 1000 + attempts,
      sleep: async () => {},
      onError: async () => {
        states.push(readRuntimeLogState(tempDir));
      },
      callRemoteRuntimeLogs: async () => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error('temporary failure');
        }
        return {
          logs: [],
          nextStartTime: 1710000401,
          serverTime: 1710000401,
          hasMore: false,
        };
      },
    });

    expect(states[0]).toMatchObject({
      updatedAt: '2024-03-09T16:06:40.001Z',
      lastPollAt: '2024-03-09T16:06:40.001Z',
      consecutiveFailures: 1,
      lastError: 'temporary failure',
    });
    expect(readRuntimeLogState(tempDir)).toMatchObject({
      nextStartTime: 1710000401,
      consecutiveFailures: 0,
      lastError: null,
      lastSuccessAt: '2024-03-09T16:06:40.002Z',
    });
  });

  test('watch stops after three consecutive remote failures', async () => {
    await expect(
      watchRuntimeLogs({
        projectRoot: tempDir,
        maxPolls: 4,
        maxConsecutiveFailures: 3,
        sleep: async () => {},
        callRemoteRuntimeLogs: async () => {
          throw new Error('remote unavailable');
        },
      })
    ).rejects.toThrow('runtime log watch stopped after 3 consecutive failures');
  });

  test('reset runtime logs removes legacy split files and cursor state', () => {
    const runtimeDir = path.join(tempDir, '.maker', 'logs', 'runtime');
    fs.mkdirSync(runtimeDir, { recursive: true });
    for (const file of [
      'runtime.log',
      'state.json',
      'last-query-runtime-logs-result.json',
      'runtime.raw.log',
      'user_script.log',
      'server_user_script.log',
      'engine.log',
    ]) {
      fs.writeFileSync(path.join(runtimeDir, file), 'old', 'utf8');
    }

    resetRuntimeLogs(tempDir);

    expect(fs.readdirSync(runtimeDir)).toEqual([]);
  });
});
