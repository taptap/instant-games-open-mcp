import { createHash } from 'node:crypto';
import { createServer } from 'node:net';

/** OS-released mutex; collisions fail closed without probing or stopping the peer. */
export function claimRecoveryMutex(
  filename: string,
  busyError: (port: number) => Error
): Promise<() => Promise<void>> {
  const port = 49152 + (createHash('sha256').update(filename).digest().readUInt16BE(0) % 16384);
  const server = createServer((socket) => socket.destroy());
  return new Promise((resolve, reject) => {
    server.once('error', (error: NodeJS.ErrnoException) => {
      reject(error.code === 'EADDRINUSE' ? busyError(port) : error);
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
}
