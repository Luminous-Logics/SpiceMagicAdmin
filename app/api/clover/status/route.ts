import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import CloverMerchant from "@/models/CloverMerchant";

export async function GET() {
  try {
    await dbConnect();
    const merchant = await CloverMerchant.findOne().select("merchantName merchantId connectedAt").lean() as {
      merchantName?: string;
      merchantId?: string;
      connectedAt?: Date;
    } | null;
    if (merchant) {
      return NextResponse.json({
        connected: true,
        merchantName: merchant.merchantName ?? null,
        merchantId: merchant.merchantId ?? null,
        connectedAt: merchant.connectedAt ?? null,
      });
    }
    return NextResponse.json({ connected: false });
  } catch {
    return NextResponse.json({ connected: false });
  }
}
