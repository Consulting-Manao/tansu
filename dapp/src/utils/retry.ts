/**
 * `fn`, tried again up to `retries` times, first after `backoffMs`, then
 * twice as long each time. For calls outside a query: queries retry through
 * TanStack Query.
 */
export async function retryAsync<T>(
  fn: () => Promise<T>,
  retries = 3,
  backoffMs = 250,
): Promise<T> {
  let attempt = 0;

  while (true) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= retries) throw err;
      await new Promise((res) => setTimeout(res, backoffMs * 2 ** attempt));
      attempt += 1;
    }
  }
}
