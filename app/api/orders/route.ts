import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/db';
import Order, { type IOrder } from '@/models/Order';
import mongoose, { type SortOrder } from 'mongoose';
import { buildOrderQuery, enrichOrders } from '@/lib/ordersServer';

type LeanOrder = IOrder & { _id: mongoose.Types.ObjectId };

/**
 * GET /api/orders
 * Server-side paginated, searchable, filterable order list.
 * Query params: tab, page, limit, search, status, paymentStatus,
 * deliveryMethod, minAmount, maxAmount (cents), dateFrom, dateTo, sort.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await dbConnect();
  const { searchParams } = new URL(req.url);

  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
  const sort = searchParams.get('sort') || 'newest';

  const query = await buildOrderQuery(searchParams);

  const sortMap: Record<string, Record<string, SortOrder>> = {
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
    amount_desc: { total: -1 },
    amount_asc: { total: 1 },
  };
  const sortObj = sortMap[sort] || sortMap.newest;

  const skip = (page - 1) * limit;
  const [rawOrders, total] = await Promise.all([
    Order.find(query).sort(sortObj).skip(skip).limit(limit).lean<LeanOrder[]>(),
    Order.countDocuments(query),
  ]);

  const orders = await enrichOrders(rawOrders);
  const pages = Math.ceil(total / limit) || 1;

  return NextResponse.json({ orders, total, page, pages, limit });
}
