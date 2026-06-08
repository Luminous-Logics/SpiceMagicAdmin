import dbConnect from "@/lib/db";
import CloverMerchant from "@/models/CloverMerchant";

export interface CloverConfig {
  merchantId: string;
  baseUrl: string;
  headers: {
    Authorization: string;
    "Content-Type": string;
    Accept: string;
  };
}

function buildConfig(merchantId: string, accessToken: string): CloverConfig {
  return {
    merchantId,
    baseUrl: `${process.env.CLOVER_BASE_URL}/v3/merchants/${merchantId}`,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TODO (OAuth v2 — deferred): Clover v2 access tokens are EXPIRING.
// For initial launch/testing we rely on the manual reconnect flow
// (/api/clover/oauth/reconnect + the "Reconnect" button on /admin/clover-settings).
// A future iteration should add automatic refresh: when the stored token is at/near
// `expiresAt`, POST { client_id, refresh_token } to CLOVER_OAUTH_REFRESH_URL,
// then persist the rotated access_token + refresh_token + expiresAt back to Mongo.
// The callback already stores refreshToken/expiresAt so the data is ready for this.
// ─────────────────────────────────────────────────────────────────────────────

/** MongoDB first, env-var fallback (migration only). Never logs the token. */
export async function getCloverConfig(): Promise<CloverConfig> {
  try {
    await dbConnect();
    const merchant = await CloverMerchant.findOne();
    if (merchant) return buildConfig(merchant.merchantId, merchant.accessToken);
  } catch {
    // fall through to env fallback
  }
  return buildConfig(process.env.CLOVER_MERCHANT_ID!, process.env.CLOVER_ACCESS_TOKEN!);
}

export async function isCloverConnected(): Promise<boolean> {
  try {
    await dbConnect();
    return !!(await CloverMerchant.findOne());
  } catch {
    return false;
  }
}
