/**
 * Achievement proxy passthrough tests.
 * 成就调用只验证原样转发，以及不把远端 lock 写到本机。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import * as makerMcp from '../maker/server/mcp';
import {
  materializeRemoteProxyToolAssets,
  prepareRemoteProxyToolArgs,
} from '../maker/server/proxyAssets';
import type { MakerRemoteProxyManager } from '../maker/server/remoteProxyManager';
import { saveProjectConfig, saveTapAuth } from '../maker/storage';

const UINT64_USER_ID = '18446744073709551615';

function textResult(payload: unknown, extra?: Partial<CallToolResult>): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    ...extra,
  };
}

describe('Maker achievement proxy passthrough', () => {
  test('forwards achievement arguments without rewriting local paths', () => {
    const args = {
      op: 'create_achievement',
      achievement_id: 'first_win',
      image_url: 'assets/image/trophy.png',
      app_id: '123',
    };

    expect(
      prepareRemoteProxyToolArgs({
        toolName: 'achievement',
        targetDir: '/tmp/unused',
        args,
      })
    ).toEqual(args);
  });

  test('does not materialize achievement results or write the remote lock locally', async () => {
    const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-achievement-materialize-'));
    try {
      const payload = {
        success: true,
        op: 'sync_achievements',
        lock_sync: { path: '.project/achievements.lock.json', synced: true },
      };
      const result = await materializeRemoteProxyToolAssets({
        toolName: 'achievement',
        targetDir,
        result: textResult(payload),
      });

      expect(result).toEqual(textResult(payload));
      expect(fs.existsSync(path.join(targetDir, '.project', 'achievements.lock.json'))).toBe(false);
    } finally {
      fs.rmSync(targetDir, { recursive: true, force: true });
    }
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
    expect(JSON.parse((result.content[0] as { text: string }).text).success).toBe(true);
  });

  test('returns remote business failures unchanged and does not retry', async () => {
    const remoteResult = textResult({
      success: false,
      op: 'publish_achievements',
      error: '未开通成就服务',
    });
    const callTool = jest.fn(async () => remoteResult);
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

    const result = await callRemoteProxyTool({
      targetDir,
      name: 'achievement',
      args: { op: 'publish_achievements' },
      extra: { sendNotification: jest.fn() },
      manager,
    });

    expect(callTool).toHaveBeenCalledTimes(1);
    expect(result.isError).not.toBe(true);
    expect(JSON.parse((result.content[0] as { text: string }).text)).toEqual({
      success: false,
      op: 'publish_achievements',
      error: '未开通成就服务',
    });
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
