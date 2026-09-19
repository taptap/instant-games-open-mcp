import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import {
  previewNetworkProject,
  requestPreviewServer,
  previewNetworkArgs,
} from '../maker/preview/network.js';
import { previewWire } from '../maker/preview/networkProtocol.js';

let directory: string;
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-network-'));
  fs.mkdirSync(path.join(directory, '.project'));
});
afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

function config(name: string, value: unknown): void {
  fs.writeFileSync(path.join(directory, '.project', name + '.json'), JSON.stringify(value));
}

test('single-player preview requires no credentials or remote project', () => {
  expect(previewNetworkProject(directory)).toBeUndefined();
  config('settings', { '@runtime': { multiplayer: { enabled: false, max_players: 4 } } });
  expect(previewNetworkProject(directory)).toBeUndefined();
});

test.each([
  { multiplayer: { enabled: true, max_players: 100 } },
  { multiplayer: { max_players: 4 } },
  { max_players: 4 },
])('uses the game project ID and built version, not the Maker binding: %j', (runtime) => {
  config('settings', { '@runtime': runtime });
  config('project', { project_id: 'p_test', version: '1.0.{x}' });
  fs.mkdirSync(path.join(directory, 'dist'));
  fs.writeFileSync(path.join(directory, 'dist', 'latest.json'), '{"version":"1.0.2"}');
  expect(previewNetworkProject(directory)).toEqual({ projectId: 'p_test', version: '1.0.2' });
});

test('unbuilt multiplayer project fails instead of silently starting offline', () => {
  config('settings', { '@runtime': { multiplayer: { enabled: true } } });
  config('project', { project_id: 'p_test' });
  expect(() => previewNetworkProject(directory)).toThrow('构建产物');
});

test('malformed local build metadata still fails instead of silently connecting', () => {
  config('settings', { '@runtime': { multiplayer: { enabled: true } } });
  config('project', { project_id: 'local-uuid' });
  fs.mkdirSync(path.join(directory, 'dist'));
  fs.writeFileSync(path.join(directory, 'dist', 'latest.json'), '{"version":""}');
  expect(() => previewNetworkProject(directory)).toThrow('构建');
});

async function serve(
  action: (ws: import('ws').WebSocket, message: any) => void,
  run: (url: string) => Promise<void>
): Promise<void> {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await new Promise<void>((resolve) => server.once('listening', resolve));
  server.on('connection', (ws) =>
    ws.on('message', (data) => action(ws, previewWire.header.decode(data as Buffer)))
  );
  try {
    await run(`ws://127.0.0.1:${(server.address() as import('net').AddressInfo).port}`);
  } finally {
    for (const ws of server.clients) ws.terminate();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

function reply(ws: import('ws').WebSocket, messageType: number, body: Uint8Array): void {
  ws.send(previewWire.header.encode({ messageType, messageBody: body, userId: 123 }).finish());
}

const auth = { mac_key: 'private-mac', kid: 'private-kid' };
const project = { projectId: 'p_test', version: '1.0.2' };

test('logs in with Maker identity, allocates test server once and forces WebSocket without credentials in argv', async () => {
  let allocations = 0;
  await serve(
    (ws, h) => {
      if (h.messageType === 1) {
        const login = previewWire.login.decode(h.messageBody) as any;
        expect(login).toMatchObject({
          clientid: 'zgkpe37bjjs9gehbsz',
          token: 'private-mac$private-kid',
          loginWay: 11,
          tag: 'debug',
          isRnd: false,
        });
        reply(ws, 2, previewWire.loginResult.encode({ resultCode: 0 }).finish());
        reply(ws, 2, previewWire.loginResult.encode({ resultCode: 0 }).finish());
      } else if (h.messageType === 0x3105) {
        allocations++;
        const envelope = previewWire.lobby.decode(h.messageBody) as any;
        const request = previewWire.create.decode(envelope.messageBody) as any;
        expect(request).toMatchObject({ mapName: 'p_test', playerCount: 1, tag: 'test' });
        expect(JSON.parse(Buffer.from(request.modeArgs).toString())).toEqual({
          project_version: '1.0.2',
        });
        reply(
          ws,
          0x3105,
          previewWire.lobby
            .encode({
              requestId: 1,
              messageBody: previewWire.created
                .encode({
                  errorCode: 0,
                  loginKey: 'never-forward-this',
                  connectInfo: { podIp: '61.254', wsPort: 1234 },
                })
                .finish(),
            })
            .finish()
        );
      }
    },
    async (url) => {
      const result = await requestPreviewServer(project, auth, undefined, { url, timeoutMs: 1000 });
      const args = previewNetworkArgs(result);
      expect(args).toContain('-server=entrance-new-pd.spark.xd.com');
      const encoded = args.find((arg) => arg.startsWith('-directConnectParams='))!.split('=')[1];
      const decoded = JSON.parse(Buffer.from(encoded, 'base64').toString());
      expect(decoded).toEqual({
        userId: 123,
        connectInfo: { pod_ip: '61.254', server_port: 0, ws_port: 1234 },
      });
      expect(JSON.stringify(result)).not.toMatch(/private|never-forward/);
    }
  );
  expect(allocations).toBe(1);
});

test.each(['login', 'allocation', 'invalid', 'malformed', 'disconnect', 'timeout', 'cancel'])(
  'fails cleanly for %s without retrying allocation or leaking credentials',
  async (failure) => {
    await serve(
      (ws, h) => {
        if (failure === 'malformed') {
          ws.send(Buffer.from([255]));
          return;
        }
        if (failure === 'disconnect') {
          ws.close();
          return;
        }
        if (failure === 'timeout' || failure === 'cancel') return;
        if (h.messageType === 1) {
          reply(
            ws,
            2,
            previewWire.loginResult.encode({ resultCode: failure === 'login' ? 10 : 0 }).finish()
          );
        } else {
          reply(
            ws,
            0x3105,
            previewWire.lobby
              .encode({
                requestId: 1,
                messageBody: previewWire.created
                  .encode({
                    errorCode: failure === 'allocation' ? 7 : 0,
                    connectInfo: { podIp: '../bad', wsPort: -1 },
                  })
                  .finish(),
              })
              .finish()
          );
        }
      },
      async (url) => {
        const abort = new AbortController();
        const pending = requestPreviewServer(project, auth, abort.signal, { url, timeoutMs: 100 });
        if (failure === 'cancel') abort.abort();
        await expect(pending).rejects.toThrow();
      }
    );
  }
);
