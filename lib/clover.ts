const CLOVER_MERCHANT_ID = process.env.CLOVER_MERCHANT_ID;
const CLOVER_API_TOKEN = process.env.CLOVER_API_TOKEN;
const CLOVER_BASE_URL = process.env.CLOVER_BASE_URL;

export function getCloverMerchantId(): string {
  if (!CLOVER_MERCHANT_ID) {
    throw new Error("CLOVER_MERCHANT_ID is not configured");
  }
  return CLOVER_MERCHANT_ID;
}

function getMerchantBaseUrl(): string {
  if (!CLOVER_BASE_URL) {
    throw new Error("CLOVER_BASE_URL is not configured");
  }
  return `${CLOVER_BASE_URL}/v3/merchants/${getCloverMerchantId()}`;
}

function getAuthHeaders(): Record<string, string> {
  if (!CLOVER_API_TOKEN) {
    throw new Error("CLOVER_API_TOKEN is not configured");
  }
  return {
    Authorization: `Bearer ${CLOVER_API_TOKEN}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

/**
 * Shared Clover HTTP client. Resolves merchant-scoped URLs and attaches the
 * Merchant API Token to every request so callers never build auth headers.
 *
 * Pass a merchant-relative path (e.g. "/items?limit=100") and it is appended to
 * the configured merchant base URL. Absolute URLs are used as-is.
 */
export async function cloverFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const url = path.startsWith("http") ? path : `${getMerchantBaseUrl()}${path}`;
  return fetch(url, {
    ...init,
    headers: {
      ...getAuthHeaders(),
      ...(init.headers ?? {}),
    },
  });
}

// ---------------------------------------------------------------------------
// Rate-limit handling (retry + throttle)
// ---------------------------------------------------------------------------
// Clover enforces per-app rate limits. On Vercel the sync runs from a single
// region with low latency, so paginated requests fire fast enough to trip the
// limit and return HTTP 429. The helper below retries 429s with exponential
// backoff and lets callers throttle between requests.

/** Maximum number of retries attempted after the initial request. */
export const CLOVER_MAX_RETRIES = 5;

/**
 * Base delay (ms) for exponential backoff. The delay for retry N is
 * BASE * 2^(N-1), producing: 2s, 4s, 8s, 16s, 32s for retries 1..5.
 */
export const CLOVER_RETRY_BASE_DELAY_MS = 2000;

/**
 * Delay (ms) applied between every paginated Clover request, even on success,
 * to stay comfortably under the rate limit. Tune via this constant (300-500ms).
 */
export const CLOVER_THROTTLE_DELAY_MS = 400;

/** HTTP status Clover returns when the app is rate-limited. */
const HTTP_TOO_MANY_REQUESTS = 429;

/** Promise-based delay used for both backoff and throttling. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Parse a `Retry-After` header into milliseconds. The header may be either a
 * number of seconds (e.g. "5") or an HTTP date. Returns null if absent/invalid
 * so the caller can fall back to exponential backoff.
 */
function parseRetryAfterMs(value: string | null): number | null {
  if (!value) return null;

  // Numeric form: delay in seconds.
  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }

  // HTTP-date form: absolute time to retry at.
  const dateMs = Date.parse(value);
  if (!Number.isNaN(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }

  return null;
}

export interface FetchWithRetryOptions {
  /** Human-readable label used in logs, e.g. "items offset=300". */
  label?: string;
  /** Override the default max retries. */
  maxRetries?: number;
  /** RequestInit forwarded to cloverFetch (method, body, headers, ...). */
  init?: RequestInit;
}

export interface FetchWithRetryResult {
  /**
   * The final Response. NOTE: this may be a non-OK response (e.g. a 429 after
   * retries are exhausted, or a 500). Callers MUST check `response.ok` and
   * translate failures into a structured error instead of throwing.
   */
  response: Response;
  /** Total attempts performed (1 = succeeded/failed on first try). */
  attempts: number;
  /** Number of retries performed (attempts - 1). */
  retries: number;
}

/**
 * Reusable Clover request wrapper with automatic retry for HTTP 429.
 *
 * Behaviour:
 *  - Performs the request via `cloverFetch`.
 *  - On HTTP 429, retries up to `maxRetries` times using exponential backoff
 *    (2s, 4s, 8s, 16s, 32s). If Clover sends a `Retry-After` header, that value
 *    is used instead of the computed backoff.
 *  - On a network-level error (fetch throwing), retries the same way so a
 *    transient blip does not surface as an uncaught exception.
 *  - Never throws for a non-OK *response*; it returns the Response so the caller
 *    can build a structured error and preserve the original status code.
 *
 * This is the single place retry logic lives; every Clover request should go
 * through it rather than calling fetch()/cloverFetch() directly.
 */
export async function fetchWithRetry(
  path: string,
  options: FetchWithRetryOptions = {},
): Promise<FetchWithRetryResult> {
  const { label = path, maxRetries = CLOVER_MAX_RETRIES, init } = options;

  let attempt = 0;
  let retries = 0;

  // Loops for the initial request plus up to `maxRetries` retries.
  while (true) {
    attempt += 1;
    console.log(`[clover] Fetching ${label} - Attempt: ${attempt}`);

    let response: Response;
    try {
      response = await cloverFetch(path, init);
    } catch (err) {
      // Network failure (DNS/socket/timeout). Retry like a transient error.
      if (retries < maxRetries) {
        retries += 1;
        const delay = CLOVER_RETRY_BASE_DELAY_MS * 2 ** (retries - 1);
        console.warn(`[clover] Network error on ${label}: ${(err as Error).message}`);
        console.warn(`[clover] Retry #${retries} - Waiting ${delay}ms...`);
        await sleep(delay);
        continue;
      }
      // Retries exhausted on a network error; rethrow so the caller's top-level
      // try/catch can return a structured 5xx (never a Vercel 502).
      throw err;
    }

    // Retry only on 429 (rate limit). Other statuses are returned as-is for the
    // caller to handle gracefully.
    if (response.status === HTTP_TOO_MANY_REQUESTS && retries < maxRetries) {
      retries += 1;
      const headerDelay = parseRetryAfterMs(response.headers.get('retry-after'));
      const backoffDelay = CLOVER_RETRY_BASE_DELAY_MS * 2 ** (retries - 1);
      const delay = headerDelay ?? backoffDelay;

      console.warn(`[clover] Received 429 - ${label}`);
      console.warn(
        `[clover] Retry #${retries} - Waiting ${delay}ms...` +
          (headerDelay !== null ? ' (from Retry-After header)' : ''),
      );

      // Drain the body so the underlying connection can be reused.
      await response.text().catch(() => undefined);
      await sleep(delay);
      continue;
    }

    return { response, attempts: attempt, retries };
  }
}
