import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/db';
import Order, { type IOrder } from '@/models/Order';
import mongoose, { type SortOrder } from 'mongoose';
import { buildOrderQuery, enrichOrders } from '@/lib/ordersServer';

type LeanOrder = IOrder & { _id: mongoose.Types.ObjectId };

/**
 * GET /api/orders/export
 * Returns ALL orders matching the current filters (no pagination) as JSON, plus
 * an optional explicit id list (?ids=a,b,c) for exporting a bulk selection.
 * File generation (CSV / Excel / PDF) happens client-side from these rows.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await dbConnect();
  const { searchParams } = new URL(req.url);

  const idsParam = searchParams.get('ids');
  let query;
  if (idsParam) {
    const ids = idsParam
      .split(',')
      .map((s) => s.trim())
      .filter((s) => mongoose.isValidObjectId(s))
      .map((s) => new mongoose.Types.ObjectId(s));
    query = { _id: { $in: ids } };
  } else {
    query = await buildOrderQuery(searchParams);
  }

  const sort: Record<string, SortOrder> = { createdAt: -1 };
  // Cap the export to keep responses bounded.
  const raw = await Order.find(query).sort(sort).limit(5000).lean<LeanOrder[]>();
  const orders = await enrichOrders(raw);

  return NextResponse.json({ orders, count: orders.length });
}
