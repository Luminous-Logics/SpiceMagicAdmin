import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/db';
import FoodOrder, { FOOD_ORDER_STATUSES, type FoodOrderStatus } from '@/models/FoodOrder';

/**
 * GET /api/food-orders
 * Paginated food preorder list with search, status filter and a status breakdown
 * for the summary cards.
 * Query params: page, limit, search, status, dateFrom, dateTo.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (session?.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await dbConnect();
    const { searchParams } = new URL(req.url);

    const page  = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
    const search = searchParams.get('search')?.trim();
    const status = searchParams.get('status');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo   = searchParams.get('dateTo');

    const query: Record<string, unknown> = {};

    if (status && FOOD_ORDER_STATUSES.includes(status as FoodOrderStatus)) {
      query.status = status;
    }

    if (search) {
      // Escape regex metacharacters so a search like "a+b" can't blow up.
      const safe = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rx = new RegExp(safe, 'i');
      query.$or = [
        { orderNumber: rx },
        { 'customer.name': rx },
        { 'customer.phone': rx },
        { 'customer.email': rx },
        { 'items.title': rx },
      ];
    }

    if (dateFrom || dateTo) {
      const range: Record<string, Date> = {};
      if (dateFrom) range.$gte = new Date(dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        range.$lte = end;
      }
      query.createdAt = range;
    }

    const skip = (page - 1) * limit;
    const [orders, total, statusGroups] = await Promise.all([
      FoodOrder.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      FoodOrder.countDocuments(query),
      FoodOrder.aggregate<{ _id: FoodOrderStatus; count: number }>([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
    ]);

    const counts = Object.fromEntries(FOOD_ORDER_STATUSES.map((s) => [s, 0])) as Record<FoodOrderStatus, number>;
    let allTotal = 0;
    for (const g of statusGroups) {
      if (g._id in counts) counts[g._id] = g.count;
      allTotal += g.count;
    }

    return NextResponse.json({
      orders,
      total,
      page,
      pages: Math.ceil(total / limit) || 1,
      limit,
      counts,
      allTotal,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[GET /api/food-orders]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
