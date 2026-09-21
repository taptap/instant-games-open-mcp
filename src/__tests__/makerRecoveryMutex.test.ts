/**
 * 锁恢复互斥口邻近退避测试。
 */

import { createServer } from 'node:net';
import { claimRecoveryMutex, recoveryMutexPort } from '../maker/system/recoveryMutex';

test('recovery mutex ports stay in the ephemeral range and wrap nearby offsets', () => {
  const filename = '/tmp/maker-lock';
  const preferred = recoveryMutexPort(filename);
  expect(preferred).toBeGreaterThanOrEqual(49152);
  expect(preferred).toBeLessThanOrEqual(65535);
  expect(recoveryMutexPort(filename, 1)).not.toBe(preferred);
  expect(recoveryMutexPort(filename, 16384)).toBe(preferred);
});

test('claimRecoveryMutex uses a nearby port when the preferred port is busy', async () => {
  const filename = '/tmp/maker-recovery-mutex-' + process.pid;
  const preferred = recoveryMutexPort(filename);
  const peer = createServer((socket) => socket.destroy());
  const connection = jest.fn();
  peer.on('connection', connection);
  await new Promise<void>((resolve, reject) => {
    peer.once('error', reject);
    peer.listen({ host: '127.0.0.1', port: preferred, exclusive: true }, resolve);
  });
  try {
    const release = await claimRecoveryMutex(filename, (port) => new Error('busy ' + port));
    expect(peer.listening).toBe(true);
    expect(connection).not.toHaveBeenCalled();
    await release();
  } finally {
    await new Promise<void>((resolve, reject) =>
      peer.close((error) => (error ? reject(error) : resolve()))
    );
  }
});
