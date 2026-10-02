export function videoTaskTiming(attempt: { createdAt: string }, now = Date.now()) {
  const created = Date.parse(attempt.createdAt);
  const valid = Number.isFinite(created);
  const waitUntil = valid ? created + 10 * 60_000 : undefined;
  const queryUntil = valid ? created + 6 * 60 * 60_000 : undefined;
  return {
    waitUntil,
    queryUntil,
    waitExpired: waitUntil !== undefined && now >= waitUntil,
    queryExpired: queryUntil === undefined || now >= queryUntil,
  };
}
