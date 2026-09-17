import { ConsoleUpdates } from '../maker/console/updates';

const catalog = async () => ({
  versions: ['1.0.1-beta.1', '1.0.0', '1.0.0-beta.2', '0.9.0'],
  latest: '1.0.0',
  beta: '1.0.1-beta.1',
});

describe('console package updates', () => {
  it('does not offer Beta updates to stable users', async () => {
    const value = await new ConsoleUpdates('1.0.0', undefined, catalog).list();
    expect(value.updateAvailable).toBe(false);
    expect(value.downgrades).toContain('1.0.0-beta.2');
    expect(
      (await new ConsoleUpdates('1.0.0-beta.2', undefined, catalog).list()).updateAvailable
    ).toBe(true);
  });
  it('never queries or upgrades a plugin managed distribution', async () => {
    const fetcher = jest.fn(catalog),
      upgrade = jest.fn();
    const updates = new ConsoleUpdates('1.0.0', 'external_plugin', fetcher, upgrade);
    expect((await updates.list()).managed).toBe(true);
    await expect(updates.start('0.9.0')).rejects.toThrow('插件');
    expect(fetcher).not.toHaveBeenCalled();
    expect(upgrade).not.toHaveBeenCalled();
  });
  it('validates versions and prevents concurrent updates', async () => {
    let finish!: () => void;
    const upgrade = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    const updates = new ConsoleUpdates('0.9.0', undefined, catalog, upgrade);
    await expect(updates.start('--bad')).rejects.toThrow();
    await expect(updates.start('9.0.0')).rejects.toThrow();
    await expect(updates.start('0.9.0')).rejects.toThrow();
    expect((await updates.start('1.0.0')).status).toBe('running');
    await expect(updates.start('1.0.0-beta.2')).rejects.toThrow('重复');
    finish();
    await new Promise((resolve) => setImmediate(resolve));
    expect(updates.job.status).toBe('succeeded');
    expect(updates.current).toBe('0.9.0');
    expect(upgrade).toHaveBeenCalledTimes(1);
  });
  it('records failure without automatic retry', async () => {
    const upgrade = jest.fn(async () => {
      throw new Error('network unavailable');
    });
    const updates = new ConsoleUpdates('0.9.0', undefined, catalog, upgrade);
    await updates.start('1.0.0');
    await new Promise((resolve) => setImmediate(resolve));
    expect(updates.job).toMatchObject({ status: 'failed', message: 'network unavailable' });
    expect(upgrade).toHaveBeenCalledTimes(1);
  });
});
