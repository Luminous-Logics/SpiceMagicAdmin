/**
 * Clover Ecommerce API client — used ONLY for issuing refunds via the
 * order "returns" endpoint. This is a different API (and a different token)
 * from the Merchant REST client in `lib/clover.ts`:
 *
 *   - Merchant REST  → CLOVER_BASE_URL          + CLOVER_API_TOKEN        (inventory, items)
 *   - Ecommerce      → CLOVER_ECOMM_BASE_URL    + CLOVER_ECOMM_PRIVATE_KEY (refunds)
 *
 * Payments are taken via Clover's Ecommerce "pay for an order" flow, which lets
 * us issue per-item PARTIAL refunds against the order's line items. We always
 * refund line-items — never the whole charge — so repeat partial refunds work.
 */

const CLOVER_ECOMM_BASE_URL = process.env.CLOVER_ECOMM_BASE_URL;
const CLOVER_ECOMM_PRIVATE_KEY = process.env.CLOVER_ECOMM_PRIVATE_KEY;

/** One entry in the Clover returns payload. */
export interface CloverReturnItem {
  parent: string;
  amount: number;
  quantity: number;
  type: 'sku';
  description: string;
}

export interface CloverRefundSuccess {
  ok: true;
  /** Clover return id. */
  id: string;
  status: string;
  raw: unknown;
}

export interface CloverRefundFailure {
  ok: false;
  status: number;
  error: string;
  raw?: unknown;
}

export type CloverRefundResult = CloverRefundSuccess | CloverRefundFailure;

function getConfig(): { baseUrl: string; key: string } {
  if (!CLOVER_ECOMM_BASE_URL) {
    throw new Error('CLOVER_ECOMM_BASE_URL is not configured');
  }
  if (!CLOVER_ECOMM_PRIVATE_KEY) {
    throw new Error('CLOVER_ECOMM_PRIVATE_KEY is not configured');
  }
  return { baseUrl: CLOVER_ECOMM_BASE_URL, key: CLOVER_ECOMM_PRIVATE_KEY };
}

/** Transient gateway/network failures worth retrying (status 0 = network error). */
const RETRYABLE_STATUSES = new Set([0, 408, 429, 502, 503, 504]);

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractError(body: unknown, status: number): string {
  const err = body as { message?: string; error?: { message?: string } | string };
  const nestedError =
    typeof err?.error === 'object' ? err?.error?.message : (err?.error as string | undefined);
  return (
    err?.message ||
    nestedError ||
    (typeof body === 'string' && body ? body : '') ||
    `Clover refund failed (HTTP ${status})`
  );
}

/**
 * POST to the Clover returns endpoint with automatic retries for transient
 * gateway errors (502/503/504) and network failures. Retries are SAFE only
 * because every call carries an `idempotency-key` — Clover de-duplicates, so a
 * timed-out request that actually succeeded will not refund twice on retry.
 */
async function sendReturn(
  url: string,
  headers: Record<string, string>,
  body?: string,
  label = 'returns',
): Promise<CloverRefundResult> {
  const maxAttempts = 3;
  let last: CloverRefundResult = { ok: false, status: 0, error: 'Clover request never ran' };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, { method: 'POST', headers, ...(body ? { body } : {}) });
    } catch (err) {
      last = {
        ok: false,
        status: 0,
        error: `Network error calling Clover returns: ${(err as Error).message}`,
      };
      console.error(`[clover-refund] ${label} network error (attempt ${attempt})`, err);
      if (attempt < maxAttempts) {
        await delay(attempt * 1000);
        continue;
      }
      return last;
    }

    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      /* keep raw text */
    }

    if (!response.ok) {
      const message = extractError(parsed, response.status);
      last = { ok: false, status: response.status, error: message, raw: parsed };
      console.error(`[clover-refund] ${label} failed (attempt ${attempt})`, response.status, text);
      if (RETRYABLE_STATUSES.has(response.status) && attempt < maxAttempts) {
        await delay(attempt * 1000);
        continue;
      }
      return last;
    }

    console.log(`[clover-refund] ${label} success`, text);
    const refund = parsed as { id?: string; status?: string };
    return { ok: true, id: refund.id ?? '', status: refund.status ?? '', raw: parsed };
  }

  return last;
}

/**
 * Issue a per-line-item refund against a Clover order.
 *
 * POST {CLOVER_ECOMM_BASE_URL}/v1/orders/{cloverOrderId}/returns
 *
 * Returns a structured result. On failure the caller MUST NOT mutate the order —
 * surface the error to the UI so staff can retry (some merchant accounts must
 * have ecommerce refunds enabled by their Clover relationship manager).
 */
export async function issueCloverRefund(
  cloverOrderId: string,
  items: CloverReturnItem[],
  idempotencyKey?: string,
): Promise<CloverRefundResult> {
  const { baseUrl, key } = getConfig();
  const url = `${baseUrl}/v1/orders/${cloverOrderId}/returns`;
  const payload = JSON.stringify({ items });

  console.log('[clover-refund] POST', url);
  console.log('[clover-refund] body', payload);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    'content-type': 'application/json',
    accept: 'application/json',
    // Clover's returns endpoint requires a User-Agent; omitting it yields a
    // 400 Bad Request. Any descriptive, non-empty value is accepted.
    'user-agent': 'SpiceMagikAdmin/1.0 (cancellation-refund)',
  };
  // Stable key so a retry (timeout / DB save failure) does not double-refund.
  if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;

  return sendReturn(url, headers, payload, 'itemized-return');
}

/**
 * True when Clover rejected an itemized return because this order does not
 * accept line items in the return body (e.g. it was paid as a lump sum with no
 * usable line items). In that case the caller should fall back to a full return.
 */
export function isLineItemsNotAllowed(result: CloverRefundResult): boolean {
  if (result.ok) return false;
  return /line items? (are|is) not allowed/i.test(result.error || '');
}

/**
 * Issue a FULL return against a Clover order (no body). Refunds the entire
 * remaining paid amount of the order. Use only when the whole remaining order is
 * being cancelled AND no partial refund has been issued yet — otherwise it can
 * over-refund. This is the documented path for orders that reject itemized
 * returns.
 *
 * POST {CLOVER_ECOMM_BASE_URL}/v1/orders/{cloverOrderId}/returns  (empty body)
 */
export async function issueCloverFullReturn(
  cloverOrderId: string,
  idempotencyKey?: string,
): Promise<CloverRefundResult> {
  const { baseUrl, key } = getConfig();
  const url = `${baseUrl}/v1/orders/${cloverOrderId}/returns`;

  console.log('[clover-refund] POST (full return, no body)', url);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    accept: 'application/json',
    'user-agent': 'SpiceMagikAdmin/1.0 (cancellation-refund)',
  };
  if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;

  return sendReturn(url, headers, undefined, 'full-return');
}
