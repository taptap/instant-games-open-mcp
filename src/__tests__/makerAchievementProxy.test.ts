/**
 * Achievement proxy result normalization and local input-boundary tests.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  ACHIEVEMENT_BUSINESS_FAILURE_NEXT_ACTION,
  ACHIEVEMENT_PARTIAL_SUCCESS_GUIDANCE,
  normalizeAchievementProxyResult,
  prepareAchievementProxyToolArgs,
} from '../maker/server/achievementProxy';
import * as makerMcp from '../maker/server/mcp';
import { materializeRemoteProxyToolAssets } from '../maker/server/proxyAssets';
import type { MakerRemoteProxyManager } from '../maker/server/remoteProxyManager';
import { saveProjectConfig, saveTapAuth } from '../maker/storage';

const UINT64_USER_ID = '18446744073709551615';

function textResult(payload: unknown, extra?: Partial<CallToolResult>): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    ...extra,
  };
}

describe('Maker achievement proxy result normalization', () => {
  test('marks success:false business payloads as MCP errors', () => {
    const result = normalizeAchievementProxyResult(
      {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              op: 'sync_achievements',
              error: '未开通成就服务',
            }),
          },
        ],
      },
      'sync_achievements'
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]).toEqual(expect.objectContaining({ type: 'text' }));
    expect(JSON.parse((result.content[0] as { text: string }).text)).toEqual({
      success: false,
      op: 'sync_achievements',
      error: '未开通成就服务',
    });
    expect(result.content[1]).toEqual({
      type: 'text',
      text: ACHIEVEMENT_BUSINESS_FAILURE_NEXT_ACTION,
    });
  });

  test('keeps an upstream isError result even when the payload claims success', () => {
    const original = textResult(
      { success: true, op: 'get_achievement', achievement: { achievement_id: 'first_win' } },
      { isError: true }
    );

    const result = normalizeAchievementProxyResult(original, 'get_achievement');

    expect(result.isError).toBe(true);
    expect(result.content).toEqual(original.content);
  });

  test('keeps partial write success and appends lock-sync recovery guidance', () => {
    const payload = {
      success: true,
      op: 'create_achievement',
      remote_applied: true,
      lock_sync: {
        synced: false,
        path: '.project/achievements.lock.json',
        error: '远端写入已成功，但后续同步失败',
      },
      achievement_id: 'first_win',
    };
    const result = normalizeAchievementProxyResult(textResult(payload), 'create_achievement');

    expect(result.isError).not.toBe(true);
    expect(result.content).toHaveLength(2);
    expect(JSON.parse((result.content[0] as { text: string }).text)).toEqual(payload);
    expect(result.content[1]).toEqual({
      type: 'text',
      text: ACHIEVEMENT_PARTIAL_SUCCESS_GUIDANCE,
    });
    expect(ACHIEVEMENT_PARTIAL_SUCCESS_GUIDANCE).toMatch(/sync_achievements/);
    expect(ACHIEVEMENT_PARTIAL_SUCCESS_GUIDANCE).toMatch(/do not replay the original write/iu);
  });

  test('allows query results that omit lock_sync', () => {
    const payload = {
      success: true,
      op: 'get_achievement',
      achievement: { achievement_id: 'first_win', title: 'First Win' },
    };
    const result = normalizeAchievementProxyResult(textResult(payload), 'get_achievement');

    expect(result.isError).not.toBe(true);
    expect(result.content).toEqual(textResult(payload).content);
  });

  test('reports a protocol error when op does not match the requested operation', () => {
    const original = textResult({
      success: true,
      op: 'delete_achievement',
      achievement_id: 'first_win',
    });
    const result = normalizeAchievementProxyResult(original, 'create_achievement');

    expect(result.isError).toBe(true);
    expect(result.content).toEqual(original.content);
    expect(
      (result as CallToolResult & { structuredContent?: Record<string, unknown> }).structuredContent
    ).toMatchObject({
      automatic_retry: false,
      local_protocol_error: expect.stringMatching(/op mismatch/iu),
    });
  });

  test('reports a protocol error for damaged JSON that looks like a business object', () => {
    const original: CallToolResult = {
      content: [{ type: 'text', text: '{"success": false, "op": "sync_achievements"' }],
    };
    const result = normalizeAchievementProxyResult(original, 'sync_achievements');

    expect(result.isError).toBe(true);
    expect(result.content).toEqual(original.content);
    expect(
      (result as CallToolResult & { structuredContent?: Record<string, unknown> }).structuredContent
    ).toMatchObject({
      automatic_retry: false,
      local_protocol_error: expect.stringMatching(/damaged JSON/iu),
    });
  });

  test('reports a protocol error when structuredContent and text payloads conflict', () => {
    const original = {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ success: true, op: 'sync_achievements', achievementCount: 1 }),
        },
      ],
      structuredContent: { success: false, op: 'sync_achievements', error: 'conflict' },
    } as CallToolResult;
    const result = normalizeAchievementProxyResult(original, 'sync_achievements');

    expect(result.isError).toBe(true);
    expect(result.content).toEqual(original.content);
    expect(
      (result as CallToolResult & { structuredContent?: Record<string, unknown> }).structuredContent
    ).toMatchObject({
      automatic_retry: false,
      local_protocol_error: expect.stringMatching(/conflicting/iu),
    });
  });

  test('keeps progress text mixed with a business payload', () => {
    const payload = { success: true, op: 'list_achievement_test_users', users: [] };
    const original: CallToolResult = {
      content: [
        { type: 'text', text: 'Listing test users...' },
        { type: 'text', text: JSON.stringify(payload) },
      ],
    };
    const result = normalizeAchievementProxyResult(original, 'list_achievement_test_users');

    expect(result.isError).not.toBe(true);
    expect(result.content).toEqual(original.content);
  });

  test('preserves original fields and uint64 strings', () => {
    const payload = {
      success: true,
      op: 'add_achievement_test_users',
      addedUserIds: [UINT64_USER_ID],
      invalidUserIds: [],
      skippedUserIds: [],
    };
    const result = normalizeAchievementProxyResult(
      textResult(payload),
      'add_achievement_test_users'
    );
    const parsed = JSON.parse((result.content[0] as { text: string }).text) as {
      addedUserIds: unknown[];
    };

    expect(result.isError).not.toBe(true);
    expect(parsed.addedUserIds).toEqual([UINT64_USER_ID]);
    expect(typeof parsed.addedUserIds[0]).toBe('string');
  });

  test('does not treat lock_sync.path as a local I/O target', () => {
    const writeSpy = jest.spyOn(fs, 'writeFileSync');
    const readSpy = jest.spyOn(fs, 'readFileSync');
    const payload = {
      success: true,
      op: 'create_achievement',
      remote_applied: true,
      lock_sync: {
        synced: false,
        path: '.project/achievements.lock.json',
      },
    };

    try {
      const result = normalizeAchievementProxyResult(textResult(payload), 'create_achievement');
      expect(result.isError).not.toBe(true);
      expect(writeSpy).not.toHaveBeenCalled();
      expect(readSpy).not.toHaveBeenCalled();
    } finally {
      writeSpy.mockRestore();
      readSpy.mockRestore();
    }
  });

  test('does not materialize achievement results as generated assets', async () => {
    const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-achievement-materialize-'));
    try {
      const payload = {
        success: true,
        op: 'get_achievement',
        achievement: { achievement_id: 'first_win' },
        lock_sync: { path: '.project/achievements.lock.json', synced: true },
      };
      const result = await materializeRemoteProxyToolAssets({
        toolName: 'achievement',
        targetDir,
        result: textResult(payload),
      });

      expect(result).toEqual(textResult(payload));
      expect(fs.existsSync(path.join(targetDir, '.maker', 'assets', 'generated-assets.json'))).toBe(
        false
      );
      expect(fs.existsSync(path.join(targetDir, '.project', 'achievements.lock.json'))).toBe(false);
    } finally {
      fs.rmSync(targetDir, { recursive: true, force: true });
    }
  });
});

describe('Maker achievement proxy input boundaries', () => {
  let targetDir: string;

  beforeEach(() => {
    targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-achievement-args-'));
  });

  afterEach(() => fs.rmSync(targetDir, { recursive: true, force: true }));

  test('rejects extra identity override parameters', () => {
    expect(() =>
      prepareAchievementProxyToolArgs({
        targetDir,
        args: {
          op: 'sync_achievements',
          app_id: '123',
          developer_id: '456',
          _mac_token: { kid: 'kid', mac_key: 'secret' },
        },
      })
    ).toThrow(/does not accept identity override parameters[\s\S]*app_id[\s\S]*developer_id/iu);
  });

  test('forwards op, uint64 strings, and HTTP(S) image URLs unchanged', () => {
    const args = {
      op: 'create_achievement',
      achievement_id: 'first_win',
      title: 'First Win',
      image_url: 'https://cdn.example.test/first-win.png',
      user_ids: [UINT64_USER_ID],
      _mac_token: { kid: 'kid', mac_key: 'secret' },
    };

    expect(prepareAchievementProxyToolArgs({ targetDir, args })).toEqual(args);
  });

  test('rejects local image paths that have no trusted remote mapping', () => {
    expect(() =>
      prepareAchievementProxyToolArgs({
        targetDir,
        args: {
          op: 'create_achievement',
          achievement_id: 'first_win',
          image_url: 'assets/image/trophy.png',
        },
      })
    ).toThrow(/only accepts HTTP\(S\) URLs[\s\S]*does not upload local achievement icons/iu);
  });

  test('reuses a trusted generated-asset CDN URL instead of uploading again', () => {
    const registryDir = path.join(targetDir, '.maker', 'assets');
    fs.mkdirSync(registryDir, { recursive: true });
    fs.writeFileSync(
      path.join(registryDir, 'generated-assets.json'),
      JSON.stringify({
        'assets/image/trophy.png': {
          cdnUrl: 'https://cdn.example.test/mapped-trophy.png',
          localPath: 'assets/image/trophy.png',
        },
      })
    );

    expect(
      prepareAchievementProxyToolArgs({
        targetDir,
        args: {
          op: 'create_achievement',
          achievement_id: 'first_win',
          image_url: 'assets/image/trophy.png',
        },
      })
    ).toEqual({
      op: 'create_achievement',
      achievement_id: 'first_win',
      image_url: 'https://cdn.example.test/mapped-trophy.png',
    });
  });

  test('does not reuse another generated asset just because the file name matches', () => {
    const registryDir = path.join(targetDir, '.maker', 'assets');
    fs.mkdirSync(registryDir, { recursive: true });
    fs.writeFileSync(
      path.join(registryDir, 'generated-assets.json'),
      JSON.stringify({
        'assets/image/other/trophy.png': {
          cdnUrl: 'https://cdn.example.test/other-trophy.png',
          localPath: 'assets/image/other/trophy.png',
        },
      })
    );

    expect(() =>
      prepareAchievementProxyToolArgs({
        targetDir,
        args: {
          op: 'create_achievement',
          achievement_id: 'first_win',
          image_url: 'assets/image/trophy.png',
        },
      })
    ).toThrow(/only accepts HTTP\(S\) URLs[\s\S]*does not upload local achievement icons/iu);
  });
});

describe('Maker achievement proxy forwarding', () => {
  let targetDir: string;
  const originalMakerHome = process.env.TAPTAP_MAKER_HOME;

  beforeEach(() => {
    targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-achievement-forward-'));
    process.env.TAPTAP_MAKER_HOME = path.join(targetDir, 'maker-home');
    saveProjectConfig(targetDir, {
      project_id: 'app-achievement',
      user_id: 'user-achievement',
    });
    saveTapAuth({
      kid: 'rnd-kid',
      mac_key: 'rnd-mac-key',
      token_type: 'mac',
      mac_algorithm: 'hmac-sha-1',
    });
  });

  afterEach(() => {
    if (originalMakerHome === undefined) {
      delete process.env.TAPTAP_MAKER_HOME;
    } else {
      process.env.TAPTAP_MAKER_HOME = originalMakerHome;
    }
    fs.rmSync(targetDir, { recursive: true, force: true });
  });

  test('strips target_dir, preserves business fields, and isolates project context', async () => {
    const callTool = jest.fn(
      async (
        context: { projectId: string; projectPath: string },
        _request?: unknown,
        _options?: unknown,
        _onDispatch?: () => void
      ) =>
        textResult({
          success: true,
          op: 'get_achievement',
          achievement: { achievement_id: 'first_win' },
          project_id: context.projectId,
        })
    );
    const manager = {
      callTool,
      listTools: jest.fn(),
      getCachedTools: jest.fn(),
      closeAll: jest.fn(),
    } as unknown as MakerRemoteProxyManager;
    const callRemoteProxyTool = (
      makerMcp as typeof makerMcp & {
        callRemoteProxyTool: (options: Record<string, unknown>) => Promise<CallToolResult>;
      }
    ).callRemoteProxyTool;

    const requestArgs = {
      op: 'get_achievement',
      achievement_id: 'first_win',
      user_id: UINT64_USER_ID,
      target_dir: targetDir,
    };
    const { targetDir: strippedTargetDir, remoteArgs } = makerMcp.splitRemoteProxyToolPrivateArgs(
      requestArgs,
      'achievement'
    );
    expect(strippedTargetDir).toBe(targetDir);
    expect(remoteArgs).toEqual({
      op: 'get_achievement',
      achievement_id: 'first_win',
      user_id: UINT64_USER_ID,
    });

    const result = await callRemoteProxyTool({
      targetDir,
      name: 'achievement',
      args: remoteArgs,
      extra: { sendNotification: jest.fn() },
      manager,
    });

    expect(callTool).toHaveBeenCalledTimes(1);
    expect(callTool.mock.calls[0][0]).toMatchObject({
      projectId: 'app-achievement',
      projectPath: 'app-achievement/workspace',
    });
    expect(callTool.mock.calls[0][1]).toEqual({
      name: 'achievement',
      arguments: {
        op: 'get_achievement',
        achievement_id: 'first_win',
        user_id: UINT64_USER_ID,
      },
    });
    expect(result.isError).not.toBe(true);
  });

  test('normalizes business failures before activity accounting and does not retry unknown writes', async () => {
    const callTool = jest.fn(async () =>
      textResult({
        success: false,
        op: 'publish_achievements',
        error: '未开通成就服务',
      })
    );
    const manager = {
      callTool,
      listTools: jest.fn(),
      getCachedTools: jest.fn(),
      closeAll: jest.fn(),
    } as unknown as MakerRemoteProxyManager;
    const callRemoteProxyTool = (
      makerMcp as typeof makerMcp & {
        callRemoteProxyTool: (options: Record<string, unknown>) => Promise<CallToolResult>;
      }
    ).callRemoteProxyTool;

    let thrown: unknown;
    try {
      await callRemoteProxyTool({
        targetDir,
        name: 'achievement',
        args: { op: 'publish_achievements' },
        extra: { sendNotification: jest.fn() },
        manager,
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({
      name: 'RemoteProxyToolResultError',
      result: expect.objectContaining({ isError: true }),
    });
    expect(callTool).toHaveBeenCalledTimes(1);
    const output = makerMcp.formatToolException('achievement', thrown);
    expect(output).toContain('achievement_business_failure');
    expect(output).toContain(ACHIEVEMENT_BUSINESS_FAILURE_NEXT_ACTION);
    expect(output).not.toContain('请把完整、已脱敏的 remote_result 反馈给开发者');
  });

  test('marks interrupted achievement writes as unknown after a single dispatch', async () => {
    const networkError = new Error('embedded proxy response interrupted');
    const callTool = jest.fn(
      async (_context: unknown, _request: unknown, _options: unknown, onDispatch?: () => void) => {
        onDispatch?.();
        throw networkError;
      }
    );
    const manager = {
      callTool,
      listTools: jest.fn(),
      getCachedTools: jest.fn(),
      closeAll: jest.fn(),
    } as unknown as MakerRemoteProxyManager;
    const callRemoteProxyTool = (
      makerMcp as typeof makerMcp & {
        callRemoteProxyTool: (options: Record<string, unknown>) => Promise<unknown>;
      }
    ).callRemoteProxyTool;

    await expect(
      callRemoteProxyTool({
        targetDir,
        name: 'achievement',
        args: { op: 'create_achievement', achievement_id: 'first_win' },
        extra: { sendNotification: jest.fn() },
        manager,
      })
    ).rejects.toMatchObject({
      executionState: 'unknown',
      automaticRetry: false,
    });
    expect(callTool).toHaveBeenCalledTimes(1);
  });
});
