import { HiddenStdioClientTransport } from '../maker/server/hiddenStdioTransport';

function processAlive(pid: number | null): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe('HiddenStdioClientTransport close', () => {
  it('waits for a child that exits after stdin closes', async () => {
    const transport = new HiddenStdioClientTransport({
      command: process.execPath,
      args: [
        '-e',
        'process.stdin.resume(); process.stdin.on("end", () => setTimeout(() => process.exit(0), 300))',
      ],
      stderr: 'pipe',
    });
    await transport.start();
    const pid = transport.pid;
    const started = Date.now();
    await transport.close();
    expect(Date.now() - started).toBeGreaterThanOrEqual(250);
    expect(processAlive(pid)).toBe(false);
  });

  it('stops a child that ignores stdin', async () => {
    const transport = new HiddenStdioClientTransport({
      command: process.execPath,
      args: ['-e', 'setInterval(() => {}, 1000)'],
      stderr: 'pipe',
    });
    await transport.start();
    const pid = transport.pid;
    expect(processAlive(pid)).toBe(true);
    await transport.close();
    expect(processAlive(pid)).toBe(false);
  });
});
