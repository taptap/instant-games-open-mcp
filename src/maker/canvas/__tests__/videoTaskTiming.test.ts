import { videoTaskTiming } from '../videoTaskTiming.js';

const createdAt = '2026-10-02T00:00:00Z';
const created = Date.parse(createdAt);

test.each([
  [599_999, false, false],
  [600_000, true, false],
  [21_599_999, true, false],
  [21_600_000, true, true],
])('separate occupancy and query deadlines at %i ms', (elapsed, waitExpired, queryExpired) => {
  expect(videoTaskTiming({ createdAt }, created + elapsed)).toEqual({
    waitUntil: created + 600_000,
    queryUntil: created + 21_600_000,
    waitExpired,
    queryExpired,
  });
});

test('invalid dates neither unlock an uncertain reservation nor authorize a query', () => {
  expect(videoTaskTiming({ createdAt: 'invalid' }, created)).toEqual({
    waitUntil: undefined,
    queryUntil: undefined,
    waitExpired: false,
    queryExpired: true,
  });
});
