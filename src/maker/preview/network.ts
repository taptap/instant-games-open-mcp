import fs from 'node:fs';
import path from 'node:path';
import WebSocket from 'ws';
import { requestTapAuthWithPat } from '../auth/patTap.js';
import { getMakerEnvironment } from '../config.js';
import { readPreviewConfiguration } from './configuration.js';
import { previewWire as wire } from './networkProtocol.js';

interface NetworkProject {
  projectId: string;
  version: string;
}

export interface PreviewServer {
  userId: number;
  connectInfo: { pod_ip: string; server_port: 0; ws_port: number };
}

export function previewNetworkProject(source: string): NetworkProject | undefined {
  const settings = readPreviewConfiguration(source, 'settings');
  const runtime = settings?.['@runtime'];
  const multiplayer = runtime?.multiplayer;
  const enabled = multiplayer
    ? (multiplayer.enabled ?? multiplayer.max_players > 0)
    : runtime?.max_players > 0;
  if (!enabled) return undefined;
  const project = readPreviewConfiguration(source, 'project');
  const latestPath = path.join(source, 'dist', 'latest.json');
  const latest = fs.existsSync(latestPath)
    ? JSON.parse(fs.readFileSync(latestPath, 'utf8'))
    : undefined;
  if (
    typeof project?.project_id !== 'string' ||
    !project.project_id.trim() ||
    project.author?.id === 'local-preview' ||
    typeof latest?.version !== 'string' ||
    !latest.version
  )
    throw new Error('联网预览缺少游戏配置，请先提交构建并生成一次测试二维码，再启动本地预览。');
  return { projectId: project.project_id, version: latest.version };
}

export function previewNetworkArgs(server: PreviewServer): string[] {
  return [
    '-production',
    '-server=entrance-new-pd.spark.xd.com',
    '-tag=debug',
    '-directConnectParams=' + Buffer.from(JSON.stringify(server)).toString('base64'),
  ];
}

export async function preparePreviewServer(
  source: string,
  projectPath: string,
  signal?: AbortSignal
): Promise<PreviewServer | undefined> {
  const project = previewNetworkProject(source);
  if (!project) return undefined;
  if (signal?.aborted) throw new Error('CANCELLED');
  // Never send credentials from an internal environment to the production entrance.
  if (getMakerEnvironment(undefined, projectPath) !== 'production')
    throw new Error('当前环境暂不支持联网本地预览；请使用网页预览。');
  let auth;
  try {
    auth = await requestTapAuthWithPat(undefined, 'production');
  } catch {
    throw new Error('联网预览鉴权失败，请运行 taptap-maker login 后重试。');
  }
  if (signal?.aborted) throw new Error('CANCELLED');
  return requestPreviewServer(project, auth, signal);
}

export function requestPreviewServer(
  project: NetworkProject,
  auth: { mac_key: string; kid: string },
  signal?: AbortSignal,
  options: { url?: string; timeoutMs?: number } = {}
): Promise<PreviewServer> {
  if (signal?.aborted) return Promise.reject(new Error('CANCELLED'));
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(options.url ?? 'wss://entrance-new-pd.spark.xd.com', {
      handshakeTimeout: 10000,
      maxPayload: 1024 * 1024,
      perMessageDeflate: false,
      followRedirects: false,
    });
    let settled = false;
    let allocated = false;
    let userId = 0;
    const finish = (error?: Error, server?: PreviewServer): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      // Allocation is one-shot. Never reconnect/replay after an unknown result.
      socket.terminate();
      if (error) reject(error);
      else resolve(server!);
    };
    const cancel = (): void => finish(new Error('CANCELLED'));
    const timer = setTimeout(
      () => finish(new Error('获取测试服连接超时，请稍后重试；未自动重复创建游戏。')),
      options.timeoutMs ?? 45000
    );
    signal?.addEventListener('abort', cancel, { once: true });
    const send = (messageType: number, messageBody: Uint8Array): void => {
      socket.send(wire.header.encode({ messageType, messageBody, userId: 0, loginId: 0 }).finish());
    };
    socket.on('open', () => {
      if (settled) return;
      send(
        1,
        wire.login
          .encode({
            userName: Buffer.from('default'),
            userPasswd: Buffer.alloc(0),
            loginWay: 11,
            token: `${auth.mac_key}$${auth.kid}`,
            clientid: 'zgkpe37bjjs9gehbsz',
            deviceType: 0x2000008,
            tag: 'debug',
            isRnd: false,
            isSilence: true,
          })
          .finish()
      );
    });
    socket.on('message', (data, binary) => {
      if (settled) return;
      try {
        if (!binary) throw new Error('Unexpected text frame');
        const h = wire.header.decode(data as Buffer) as unknown as {
          messageType: number;
          messageBody: Uint8Array;
          userId?: { toString(): string };
        };
        if (h.messageType === 2 && !allocated) {
          const result = wire.loginResult.decode(h.messageBody) as unknown as {
            resultCode: number;
          };
          if (result.resultCode !== 0) {
            finish(
              new Error(`测试服登录失败（${result.resultCode}），请重新运行 taptap-maker login。`)
            );
            return;
          }
          userId = Number(h.userId?.toString());
          if (!Number.isSafeInteger(userId) || userId <= 0)
            throw new Error('Invalid user identity');
          allocated = true;
          send(
            0x3105,
            wire.lobby
              .encode({
                requestId: 1,
                messageBody: wire.create
                  .encode({
                    mapName: project.projectId,
                    playerCount: 1,
                    // Match the engine's CreateMultiDebugGame contract: test, never formal.
                    tag: 'test',
                    modeArgs: Buffer.from(JSON.stringify({ project_version: project.version })),
                  })
                  .finish(),
              })
              .finish()
          );
        } else if (h.messageType === 0x3105 && allocated) {
          const envelope = wire.lobby.decode(h.messageBody) as unknown as {
            requestId: number;
            messageBody: Uint8Array;
          };
          if (envelope.requestId !== 1) return;
          const result = wire.created.decode(envelope.messageBody) as unknown as {
            errorCode: number;
            connectInfo?: { podIp?: string; wsPort?: number };
          };
          if (result.errorCode !== 0) {
            finish(
              new Error(
                `测试服创建失败（${result.errorCode}），请确认项目已成功提交构建，再重试预览。`
              )
            );
            return;
          }
          const pod = result.connectInfo?.podIp;
          const port = result.connectInfo?.wsPort;
          if (
            typeof pod !== 'string' ||
            !/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/.test(pod) ||
            pod.length > 253 ||
            !Number.isInteger(port) ||
            port! < 1 ||
            port! > 65535
          )
            throw new Error('Invalid connection info');
          // Native defaults to KCP. Port zero selects the existing public WebSocket gateway.
          // DirectConnect ignores login_key; do not put credentials into argv or Runtime logs.
          finish(undefined, {
            userId,
            connectInfo: { pod_ip: pod, server_port: 0, ws_port: port! },
          });
        }
      } catch {
        finish(new Error('测试服返回的连接信息无效，未启动本地窗口。'));
      }
    });
    socket.on('error', () => finish(new Error('无法连接线上测试服入口，请检查网络后重试。')));
    socket.on('close', () => finish(new Error('测试服连接在准备完成前断开，请稍后重试。')));
  });
}
