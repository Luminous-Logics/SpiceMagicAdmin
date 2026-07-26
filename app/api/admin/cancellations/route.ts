import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/db';
import Order from '@/models/Order';
import {
  shapeCancellationOrders,
  type LeanOrder,
} from '@/lib/cancellationsServer';

type RequestStatus = 'pending' | 'approved' | 'rejected';
const VALID_STATUSES: RequestStatus[] = ['pending', 'approved', 'rejected'];

/**
 * GET /api/admin/cancellations
 *
 * Lists orders that have at least one cancellation request. By default only
 * orders with a `pending` request are returned; pass `?status=approved`,
 * `?status=rejected`, or `?status=all` to see history. Requests within each
 * order are sorted newest-first by `requestedAt`.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const statusParam = (searchParams.get('status') || 'pending').toLowerCase();

  const statusFilter: RequestStatus | null =
    statusParam === 'all'
      ? null
      : VALID_STATUSES.includes(statusParam as RequestStatus)
        ? (statusParam as RequestStatus)
        : 'pending';

  await dbConnect();

  // Match orders that have a matching request (or any request when "all").
  const match = statusFilter
    ? { 'cancellationRequests.status': statusFilter }
    : { 'cancellationRequests.0': { $exists: true } };

  const orders = await Order.find(match)
    .sort({ 'cancellationRequests.requestedAt': -1, updatedAt: -1 })
    .lean<LeanOrder[]>();

  const shaped = (await shapeCancellationOrders(orders, statusFilter))
    // Drop orders that have no request left after filtering.
    .filter((o) => o.requests.length > 0)
    // Newest request first across orders.
    .sort((a, b) => {
      const ta = a.requests[0]?.requestedAt ? Date.parse(a.requests[0].requestedAt!) : 0;
      const tb = b.requests[0]?.requestedAt ? Date.parse(b.requests[0].requestedAt!) : 0;
      return tb - ta;
    });

  const pendingCount = shaped.reduce(
    (sum, o) => sum + o.requests.filter((r) => r.status === 'pending').length,
    0,
  );

  return NextResponse.json({ orders: shaped, count: shaped.length, pendingCount });
}
