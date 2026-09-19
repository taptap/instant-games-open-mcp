export type ProcessPresence = 'alive' | 'missing' | 'unknown';

export function processPresence(pid: number): ProcessPresence {
  if (!Number.isInteger(pid) || pid <= 0) return 'unknown';
  try {
    process.kill(pid, 0);
    return 'alive';
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ESRCH' ? 'missing' : 'unknown';
  }
}
