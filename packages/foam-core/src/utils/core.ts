/**
 * Checks if a value is not null, undefined, or void.
 *
 * @param value - The value to check.
 * @returns True if the value is not null, undefined, or void, otherwise false.
 */
export function isSome<T>(value: T | null | undefined | void): value is NonNullable<T> {
  return value != null;
}

/**
 * Checks if a value is null, undefined, or void.
 *
 * @param value - The value to check.
 * @returns True if the value is null, undefined, or void, otherwise false.
 */
export function isNone<T>(value: T | null | undefined | void): value is null | undefined | void {
  return value == null;
}

/**
 * Runs an async task for each item with a bounded concurrency.
 *
 * Without a cap, `Promise.all(items.map(fn))` schedules every task at once.
 * For I/O-heavy tasks like reading file contents this can hold the bytes of
 * every file resident in memory simultaneously, which on large workspaces
 * exhausts the V8 external-memory budget (see issue #1167).
 *
 * @param items - the items to process
 * @param limit - the maximum number of tasks running concurrently
 * @param fn - the async task to run per item
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number = 256,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  if (limit <= 0) {
    throw new Error(`mapWithConcurrency: limit must be > 0, got ${limit}`);
  }
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}
