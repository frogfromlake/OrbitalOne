/**
 * @file src/globeTileEngine/utils/concurrency/runConcurrent.ts
 * @description Executes asynchronous tasks with a concurrency limit and periodic yielding to the event loop.
 *
 * @template T - The type of each resolved task result.
 * @param tasks - An array of async task functions returning Promise<T>.
 * @param limit - Maximum number of concurrent tasks to run.
 * @param yieldEveryMs - Optional duration in milliseconds after which to yield to the browser (default: 16ms).
 * @returns A Promise resolving to an array of task results, in the order they were completed.
 */
export async function runConcurrent<T>(
  tasks: (() => Promise<T>)[],
  limit: number,
  yieldEveryMs = 16,
): Promise<T[]> {
  const results: T[] = [];
  const executing: Promise<T>[] = [];
  let lastYield = performance.now();

  for (const task of tasks) {
    const p = task()
      .then((result) => results.push(result))
      .finally(() => {
        const i = executing.indexOf(p as Promise<T>);
        if (i > -1) executing.splice(i, 1);
      });

    executing.push(p as Promise<T>);

    // Throttle concurrency
    if (executing.length >= limit) await Promise.race(executing);

    // Yield periodically to avoid blocking the UI thread
    const now = performance.now();
    if (now - lastYield > yieldEveryMs) {
      await new Promise((resolve) => {
        requestAnimationFrame(() => {
          setTimeout(resolve, 0); // ensure a full yield
        });
      });
      lastYield = performance.now();
    }
  }

  await Promise.all(executing);
  return results;
}
