import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import crypto from "crypto";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user?.role !== "admin") {
    return NextResponse.redirect(
      new URL(
        "/login?callbackUrl=/admin/clover-settings",
        process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3003",
      ),
    );
  }

  const state = crypto.randomUUID();

  const params = new URLSearchParams({
    client_id:     process.env.CLOVER_CLIENT_ID!,
    response_type: "code",
    redirect_uri:  process.env.CLOVER_REDIRECT_URI!,
    state,
  });

  const res = NextResponse.redirect(
    `${process.env.CLOVER_OAUTH_AUTHORIZE_URL}?${params.toString()}`,
  );
  res.cookies.set("clover_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}
