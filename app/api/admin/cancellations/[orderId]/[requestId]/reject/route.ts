import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import mongoose from 'mongoose';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/db';
import Order, { type ICancellationRequest } from '@/models/Order';
import SystemLog from '@/models/SystemLog';
import { shapeRequest, shortOrderId } from '@/lib/cancellationsServer';

type CancellationSubdoc = ICancellationRequest & mongoose.Types.Subdocument;

/**
 * POST /api/admin/cancellations/{orderId}/{requestId}/reject
 * Body: { note?: string }
 *
 * Marks the request rejected. Does NOT call Clover and does NOT touch inventory
 * or the order's payment status. Idempotent for already-processed requests.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string; requestId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { orderId, requestId } = await params;
  if (!mongoose.isValidObjectId(orderId)) {
    return NextResponse.json({ error: 'Invalid order id' }, { status: 400 });
  }
  if (!mongoose.isValidObjectId(requestId)) {
    return NextResponse.json({ error: 'Invalid request id' }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const note = typeof body.note === 'string' ? body.note.trim() : '';

  const adminId =
    (session.user as { email?: string; id?: string }).email ||
    (session.user as { id?: string }).id ||
    'admin';

  await dbConnect();

  const order = await Order.findById(orderId);
  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  const requests = order.cancellationRequests as unknown as mongoose.Types.DocumentArray<CancellationSubdoc>;
  const request = requests.id(requestId);
  if (!request) {
    return NextResponse.json({ error: 'Cancellation request not found' }, { status: 404 });
  }

  if (request.status !== 'pending') {
    return NextResponse.json(
      {
        message: `Request already ${request.status}`,
        alreadyProcessed: true,
        request: shapeRequest(request),
      },
      { status: 200 },
    );
  }

  const now = new Date();
  request.status = 'rejected';
  request.processedAt = now;
  request.processedBy = adminId;
  request.adminNote = note;

  // Validate only modified fields — storefront-written orders use a different
  // Order schema and may lack fields the admin model marks required.
  await order.save({ validateModifiedOnly: true });

  await SystemLog.create({
    action: 'CANCELLATION_REJECTED',
    actorId: adminId,
    orderId: order._id.toString(),
    requestId,
    meta: {
      shortId: shortOrderId(order._id),
      refundAmount: request.refundAmount,
      note,
    },
  }).catch(() => undefined);

  return NextResponse.json({
    message: 'Cancellation request rejected.',
    request: shapeRequest(request),
  });
}
