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
