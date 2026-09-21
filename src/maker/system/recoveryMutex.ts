import { createHash } from 'node:crypto';
import { createServer } from 'node:net';

const EPHEMERAL_PORT_BASE = 49152;
const EPHEMERAL_PORT_COUNT = 16384;
const MUTEX_PORT_ATTEMPTS = 8;

/**
 * 锁恢复互斥口：由锁路径哈希落到 49152–65535，再在邻近口上重试。
 * 不探测、不关闭占用该口的其它进程。
 */
export function recoveryMutexPort(filename: string, offset = 0): number {
  const preferred =
    EPHEMERAL_PORT_BASE +
    (createHash('sha256').update(filename).digest().readUInt16BE(0) % EPHEMERAL_PORT_COUNT);
  const shift = ((offset % EPHEMERAL_PORT_COUNT) + EPHEMERAL_PORT_COUNT) % EPHEMERAL_PORT_COUNT;
  return EPHEMERAL_PORT_BASE + ((preferred - EPHEMERAL_PORT_BASE + shift) % EPHEMERAL_PORT_COUNT);
}

function isPortBusy(error: NodeJS.ErrnoException): boolean {
  return error.code === 'EADDRINUSE' || error.code === 'EACCES';
}

/** OS-released mutex; collisions fail closed without probing or stopping the peer. */
export function claimRecoveryMutex(
  filename: string,
  busyError: (port: number) => Error
): Promise<() => Promise<void>> {
  const tryPort = (offset: number): Promise<() => Promise<void>> => {
    const port = recoveryMutexPort(filename, offset);
    const server = createServer((socket) => socket.destroy());
    return new Promise((resolve, reject) => {
      server.once('error', (error: NodeJS.ErrnoException) => {
        server.close();
        if (isPortBusy(error) && offset + 1 < MUTEX_PORT_ATTEMPTS) {
          resolve(tryPort(offset + 1));
          return;
        }
        reject(isPortBusy(error) ? busyError(recoveryMutexPort(filename)) : error);
      });
      server.listen({ host: '127.0.0.1', port, exclusive: true }, () => {
        resolve(
          () =>
            new Promise<void>((done, fail) => {
              server.close((error) => (error ? fail(error) : done()));
            })
        );
      });
    });
  };
  return tryPort(0);
}
