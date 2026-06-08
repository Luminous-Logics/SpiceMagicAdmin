import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import CloverMerchant from "@/models/CloverMerchant";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code       = searchParams.get("code");
  const merchantId = searchParams.get("merchant_id");
  const clientId   = searchParams.get("client_id");
  const state      = searchParams.get("state");

  const storedState = req.cookies.get("clover_oauth_state")?.value;

  // Require code and merchant_id (always needed for token exchange)
  if (!code || !merchantId) {
    return NextResponse.json(
      { error: "Missing required OAuth parameters", received: { code: !!code, merchant_id: !!merchantId } },
      { status: 400 }
    );
  }

  // Optional sanity check: log if client_id doesn't match (non-fatal)
  if (clientId && clientId !== process.env.CLOVER_CLIENT_ID) {
    console.warn("Clover OAuth: client_id mismatch", { expected: process.env.CLOVER_CLIENT_ID, received: clientId });
  }

  // CSRF state validation is conditional: only enforce if BOTH state param and cookie exist
  // (i.e., flow started from /api/clover/oauth/login with state generation).
  // App Market-initiated flows have no state, so skip validation cleanly.
  if (state && storedState) {
    if (storedState !== state) {
      console.error("Clover OAuth state mismatch");
      return NextResponse.json({ error: "Invalid state parameter" }, { status: 400 });
    }
  }

  try {
    // Clover v2 high-trust token exchange — POST /oauth/v2/token with JSON body.
    const tokenRes = await fetch(process.env.CLOVER_OAUTH_TOKEN_URL!, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id:     process.env.CLOVER_CLIENT_ID,
        client_secret: process.env.CLOVER_CLIENT_SECRET,
        code,
      }),
    });
    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      console.error("Clover token exchange failed", { status: tokenRes.status, details: body });
      return NextResponse.json(
        { error: "Token exchange failed", status: tokenRes.status, details: body },
        { status: 502 }
      );
    }

    const tokenData    = await tokenRes.json();
    const accessToken  = tokenData.access_token as string;
    const refreshToken = tokenData.refresh_token as string | undefined;
    // Clover may return an absolute Unix timestamp (access_token_expiration)
    // or a relative lifetime in seconds (expires_in). Support both.
    const expirationTs = tokenData.access_token_expiration as number | undefined;
    const expiresIn    = tokenData.expires_in as number | undefined;

    // Safe debug logs — booleans + expiry details only, never the token values.
    console.log("Clover OAuth: access_token received:", !!accessToken);
    console.log("Clover OAuth: refresh_token received:", !!refreshToken);
    if (expiresIn) console.log("Clover OAuth: expires_in (seconds):", expiresIn);
    if (expirationTs) console.log("Clover OAuth: access_token_expiration (Unix ts):", expirationTs);

    if (!accessToken) {
      return NextResponse.json({ error: "No access token received" }, { status: 502 });
    }

    const expiresAt = expirationTs
      ? new Date(expirationTs * 1000)
      : expiresIn
      ? new Date(Date.now() + expiresIn * 1000)
      : null;

    let merchantName = "Clover Store";
    try {
      const mRes = await fetch(`${process.env.CLOVER_BASE_URL}/v3/merchants/${merchantId}`, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
        cache: "no-store",
      });
      if (mRes.ok) merchantName = (await mRes.json()).name ?? merchantName;
    } catch { /* non-fatal */ }

    await dbConnect();
    await CloverMerchant.findOneAndUpdate(
      { merchantId },
      {
        merchantId,
        accessToken,
        // NOTE: v2 tokens expire. refreshToken/expiresAt are persisted now so a
        // future automatic-refresh flow can use them (see TODO in lib/cloverAuth.ts).
        ...(refreshToken ? { refreshToken } : {}),
        ...(expiresAt ? { expiresAt } : {}),
        merchantName,
        connectedAt: new Date(),
      },
      { upsert: true, new: true },
    );

    const res = NextResponse.redirect(
      new URL(
        "/admin/clover-settings?success=true",
        process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000",
      ),
    );
    res.cookies.delete("clover_oauth_state");
    return res;
  } catch (err) {
    console.error("Clover OAuth callback error:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: "Failed to connect Clover" }, { status: 500 });
  }
}
