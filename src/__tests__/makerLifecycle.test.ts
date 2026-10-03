import { PassThrough } from 'node:stream';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { shouldExitForParentDeath, isDisconnectedStdioError } from '../maker/lifecycle';
import {
  closeTrackedMakerChildTransports,
  trackMakerChildTransport,
} from '../maker/server/childTransports';
import { TapTapMCPProxy } from '../mcp-proxy/proxy';
import type { ProxyConfig } from '../mcp-proxy/types';

function createProxyConfig(options?: ProxyConfig['options']): ProxyConfig {
  return {
    server: {
      url: 'http://127.0.0.1:1/mcp',
    },
    auth: {
      kid: 'kid',
      mac_key: 'key',
      mac_algorithm: 'hmac-sha-256',
    },
    tenant: {
      project_path: '/tmp/project',
    },
    options: {
      log: {
        enabled: false,
      },
      ...options,
    },
  };
}

describe('Maker process lifecycle guards', () => {
  test('MCP host still finishes tracked cleanup when manager shutdown rejects and signals repeat', () => {
    const serverUrl = pathToFileURL(path.resolve(__dirname, '../maker/server/mcp.ts')).href;
    const transportsUrl = pathToFileURL(
      path.resolve(__dirname, '../maker/server/childTransports.ts')
    ).href;
    const source = [
      `const server = await import(${JSON.stringify(serverUrl)});`,
      `const transports = await import(${JSON.stringify(transportsUrl)});`,
      'const { installMakerServerExitHandlers } = server.default ?? server;',
      'const { trackMakerChildTransport } = transports.default ?? transports;',
      'process.on("unhandledRejection", () => { console.error("unhandled rejection"); process.exit(2); });',
      'trackMakerChildTransport({ async close() { await new Promise(resolve => setTimeout(resolve, 30)); console.log("tracked closed"); } });',
      'installMakerServerExitHandlers({ async closeAll() { console.log("manager close"); throw new Error("exit unknown"); } });',
      'process.emit("SIGTERM"); process.emit("SIGINT");',
    ].join('\n');
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-mcp-shutdown-'));
    try {
      const result = spawnSync(
        process.execPath,
        ['--import', 'tsx', '--input-type=module', '-e', source],
        {
          encoding: 'utf8',
          timeout: 15000,
          env: { ...process.env, TAPTAP_MAKER_HOME: directory },
        }
      );
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout.trim().split('\n')).toEqual(['manager close', 'tracked closed']);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  test('treats disconnected stdio stream errors as client shutdown', () => {
    expect(
      isDisconnectedStdioError(Object.assign(new Error('broken pipe'), { code: 'EPIPE' }))
    ).toBe(true);
    expect(
      isDisconnectedStdioError(
        Object.assign(new Error('stream destroyed'), { code: 'ERR_STREAM_DESTROYED' })
      )
    ).toBe(true);
    expect(
      isDisconnectedStdioError(Object.assign(new Error('reset'), { code: 'ECONNRESET' }))
    ).toBe(true);
    expect(isDisconnectedStdioError(Object.assign(new Error('read EIO'), { code: 'EIO' }))).toBe(
      true
    );
    expect(
      isDisconnectedStdioError(Object.assign(new Error('read ENXIO'), { code: 'ENXIO' }))
    ).toBe(true);
    expect(isDisconnectedStdioError(Object.assign(new Error('other'), { code: 'ENOENT' }))).toBe(
      false
    );
  });

  test('detects parent death from orphan ppid or ESRCH probe', () => {
    expect(
      shouldExitForParentDeath({
        initialPpid: 123,
        currentPpid: 1,
        platform: 'darwin',
        probeParent: () => true,
      })
    ).toBe(true);

    expect(
      shouldExitForParentDeath({
        initialPpid: 123,
        currentPpid: 456,
        platform: 'win32',
        probeParent: () => {
          throw Object.assign(new Error('missing'), { code: 'ESRCH' });
        },
      })
    ).toBe(true);

    expect(
      shouldExitForParentDeath({
        initialPpid: 123,
        currentPpid: 456,
        platform: 'linux',
        probeParent: () => true,
      })
    ).toBe(false);
  });

  test('proxy closes stale client before reconnecting with a new client', async () => {
    const proxy = new TapTapMCPProxy(createProxyConfig());
    const close = jest.fn(async () => undefined);
    const nextClient = {
      connect: jest.fn(async () => undefined),
      listTools: jest.fn(async () => ({ tools: [] })),
      close: jest.fn(async () => undefined),
    };
    const originalClient = { close };
    const proxyInternals = proxy as unknown as {
      client: unknown;
      connected: boolean;
      createClient: () => unknown;
      reconnectToServer: () => Promise<void>;
      stopHealthCheck: () => void;
    };
    proxyInternals.client = originalClient;
    proxyInternals.connected = false;
    proxyInternals.createClient = () => nextClient;
    proxyInternals.stopHealthCheck = jest.fn();

    await proxyInternals.reconnectToServer();

    expect(close).toHaveBeenCalledTimes(1);
    expect(nextClient.connect).toHaveBeenCalledTimes(1);
    expect(nextClient.listTools).toHaveBeenCalledTimes(1);
  });

  test('proxy restores configured reconnect interval after a successful reconnect', async () => {
    const proxy = new TapTapMCPProxy(createProxyConfig({ reconnect_interval: 30_000 }));
    const close = jest.fn(async () => undefined);
    const nextClient = {
      connect: jest.fn(async () => undefined),
      listTools: jest.fn(async () => ({ tools: [] })),
      close: jest.fn(async () => undefined),
    };
    const proxyInternals = proxy as unknown as {
      client: unknown;
      connected: boolean;
      createClient: () => unknown;
      reconnectDelayMs: number;
      reconnectToServer: () => Promise<void>;
      stopHealthCheck: () => void;
    };
    proxyInternals.client = { close };
    proxyInternals.connected = false;
    proxyInternals.createClient = () => nextClient;
    proxyInternals.reconnectDelayMs = 60_000;
    proxyInternals.stopHealthCheck = jest.fn();

    await proxyInternals.reconnectToServer();

    expect(proxyInternals.reconnectDelayMs).toBe(30_000);
  });

  test('proxy stdin EOF handler runs cleanup and exits through callback', async () => {
    const stdin = new PassThrough();
    const cleanup = jest.fn();
    const exit = jest.fn();
    const proxy = { cleanup } as unknown as TapTapMCPProxy;
    const { installProxyStdinExitHandler } = jest.requireActual('../maker/lifecycle');

    installProxyStdinExitHandler(proxy, stdin, exit);
    stdin.emit('end');
    await new Promise((resolve) => setImmediate(resolve));

    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });

  test('maker server transport registry closes and unregisters active children', async () => {
    const firstClose = jest.fn(async () => undefined);
    const secondClose = jest.fn(async () => undefined);
    const first = { close: firstClose };
    const second = { close: secondClose };

    const trackedFirst = trackMakerChildTransport(first);
    trackMakerChildTransport(second);
    await trackedFirst.close();
    await closeTrackedMakerChildTransports();

    expect(firstClose).toHaveBeenCalledTimes(1);
    expect(secondClose).toHaveBeenCalledTimes(1);
  });

  test('registry shutdown waits for a close already in progress', async () => {
    let finish: (() => void) | undefined;
    const close = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    const transport = trackMakerChildTransport({ close });
    const firstClose = transport.close();
    await Promise.resolve();
    let shutdownFinished = false;
    const shutdown = closeTrackedMakerChildTransports().then(() => {
      shutdownFinished = true;
    });
    await Promise.resolve();
    expect(shutdownFinished).toBe(false);
    finish?.();
    await Promise.all([firstClose, shutdown]);
    expect(close).toHaveBeenCalledTimes(1);
  });

  test('failed cleanup stays registered and can be retried', async () => {
    const close = jest
      .fn()
      .mockRejectedValueOnce(new Error('exit unknown'))
      .mockResolvedValue(undefined);
    trackMakerChildTransport({ close });
    await expect(closeTrackedMakerChildTransports()).rejects.toThrow('exit unknown');
    await closeTrackedMakerChildTransports();
    await closeTrackedMakerChildTransports();
    expect(close).toHaveBeenCalledTimes(2);
  });
});
