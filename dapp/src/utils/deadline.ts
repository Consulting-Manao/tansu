/**
 * Every network call has a deadline: past it, the app stops waiting and says
 * who did not answer, instead of spinning forever.
 */

/** How long one network call may take. */
export const DEADLINE_MS = 15_000;

// Statuses whose responses have no body.
const NO_BODY = new Set([101, 204, 205, 304]);

/**
 * `fetch` within `ms`, body included: a server can answer, then stall. A
 * timeout names the host that did not answer.
 */
export async function fetchWithin(
  url: string,
  init: RequestInit = {},
  ms = DEADLINE_MS,
): Promise<Response> {
  const signal = AbortSignal.timeout(ms);
  try {
    const response = await fetch(url, { ...init, signal });
    const body = NO_BODY.has(response.status)
      ? null
      : await response.arrayBuffer();
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch (error) {
    if (signal.aborted) {
      throw new Error(
        `${new URL(url).host} did not answer within ${ms / 1000} s`,
        { cause: error },
      );
    }
    throw error;
  }
}
