import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/db';
import Order from '@/models/Order';

/**
 * GET /api/orders/summary
 * Aggregated stats for the dashboard summary cards.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await dbConnect();

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  // Legacy orders may lack `orderStatus`; treat missing as "pending" (open).
  const openMatch = {
    $or: [
      { orderStatus: { $in: ['pending', 'confirmed', 'preparing', 'ready'] } },
      { orderStatus: { $exists: false } },
      { orderStatus: null },
    ],
  };

  const [
    todaysOrders,
    todaysRevenueAgg,
    openOrders,
    completedOrders,
    cancelledOrders,
    pendingPayments,
    avgAgg,
  ] = await Promise.all([
    Order.countDocuments({ createdAt: { $gte: startOfToday } }),
    Order.aggregate([
      { $match: { createdAt: { $gte: startOfToday }, status: 'paid' } },
      { $group: { _id: null, sum: { $sum: '$total' } } },
    ]),
    Order.countDocuments(openMatch),
    Order.countDocuments({ orderStatus: 'completed' }),
    Order.countDocuments({ orderStatus: 'cancelled' }),
    Order.countDocuments({ status: 'pending' }),
    Order.aggregate([
      { $match: { status: 'paid' } },
      { $group: { _id: null, avg: { $avg: '$total' } } },
    ]),
  ]);

  return NextResponse.json({
    todaysOrders,
    todaysRevenue: todaysRevenueAgg[0]?.sum ?? 0,
    openOrders,
    completedOrders,
    cancelledOrders,
    pendingPayments,
    averageOrderValue: Math.round(avgAgg[0]?.avg ?? 0),
  });
}
