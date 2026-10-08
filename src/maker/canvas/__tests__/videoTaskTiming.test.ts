import { videoTaskTiming } from '../videoTaskTiming.js';

const createdAt = '2026-10-02T00:00:00Z';
const created = Date.parse(createdAt);

test.each([
  [599_999, false],
  [600_000, false],
  [21_599_999, false],
  [21_600_000, true],
])('only enforce the query deadline at %i ms', (elapsed, queryExpired) => {
  expect(videoTaskTiming({ createdAt }, created + elapsed)).toEqual({
    queryUntil: created + 21_600_000,
    queryExpired,
  });
});

test('invalid dates do not authorize a query', () => {
  expect(videoTaskTiming({ createdAt: 'invalid' }, created)).toEqual({
    queryUntil: undefined,
    queryExpired: true,
  });
});
