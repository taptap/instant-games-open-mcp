import { PreviewOwner } from '../maker/preview/owner.js';

test('owner closes only its registered sessions and releases them', async () => {
  const owner = new PreviewOwner();
  const other = new PreviewOwner();
  const otherStop = jest.fn(async () => {});
  other.register(otherStop);
  const stop = jest.fn(async () => unregister());
  const unregister = owner.register(stop);
  expect(owner.active).toBe(true);
  await owner.close();
  expect(owner.active).toBe(false);
  expect(stop).toHaveBeenCalledTimes(1);
  expect(otherStop).not.toHaveBeenCalled();
  expect(() => owner.register(stop)).toThrow('closing');
});

test('unconfirmed cleanup remains owned and can be retried', async () => {
  const owner = new PreviewOwner();
  let confirmed = false;
  const unregister = owner.register(async () => {
    if (confirmed) unregister();
  });
  await expect(owner.close()).rejects.toThrow('not yet confirmed');
  expect(owner.active).toBe(true);
  confirmed = true;
  await owner.close();
  expect(owner.active).toBe(false);
});
