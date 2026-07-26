import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import mongoose from 'mongoose';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/db';
import Order, { type ICancellationRequest } from '@/models/Order';
import { processCancellationApproval } from '@/lib/approveCancellation';

type CancellationSubdoc = ICancellationRequest & mongoose.Types.Subdocument;

/**
 * POST /api/admin/cancellations/{orderId}/{requestId}/approve
 *
 * Issues the real Clover refund for a pending cancellation request, then (only
 * on success) updates the order, restores inventory best-effort, and writes an
 * audit log. Idempotent: re-approving an already-processed request is a no-op.
 *
 * The heavy lifting lives in `processCancellationApproval` so the same refund
 * pipeline can be reused by the admin-initiated direct-cancel route.
 */
export async function POST(
  _req: NextRequest,
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

  const adminId =
    (session.user as { email?: string; id?: string }).email ||
    (session.user as { id?: string }).id ||
    'admin';

  await dbConnect();

  const order = await Order.findById(orderId);
  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  // Mongoose DocumentArray lookup by sub-document _id.
  const requests = order.cancellationRequests as unknown as mongoose.Types.DocumentArray<CancellationSubdoc>;
  const request = requests.id(requestId);
  if (!request) {
    return NextResponse.json({ error: 'Cancellation request not found' }, { status: 404 });
  }

  const result = await processCancellationApproval(order, request, adminId);
  return NextResponse.json(result.body, { status: result.status });
}
