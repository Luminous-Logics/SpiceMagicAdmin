import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/db';
import mongoose from 'mongoose';
import Order, { type IOrder } from '@/models/Order';
import { enrichOrders } from '@/lib/ordersServer';
import {
  canTransition,
  normalizeOrderStatus,
  ORDER_STATUSES,
  type OrderStatus,
} from '@/lib/orders';

type LeanOrder = IOrder & { _id: mongoose.Types.ObjectId };

/** GET /api/orders/:orderId — full order details (enriched). */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { orderId } = await params;
  if (!mongoose.isValidObjectId(orderId)) {
    return NextResponse.json({ error: 'Invalid order id' }, { status: 400 });
  }

  await dbConnect();
  const raw = await Order.findById(orderId).lean<LeanOrder>();
  if (!raw) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  const [order] = await enrichOrders([raw]);
  return NextResponse.json({ order });
}

/**
 * PATCH /api/orders/:orderId — transition the order to a new lifecycle status.
 * Body: { orderStatus: OrderStatus, note?: string }
 * Every change appends an immutable audit entry to statusHistory.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { orderId } = await params;
  if (!mongoose.isValidObjectId(orderId)) {
    return NextResponse.json({ error: 'Invalid order id' }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const nextStatus = body.orderStatus as OrderStatus;
  const note = typeof body.note === 'string' ? body.note.trim() : '';

  if (!ORDER_STATUSES.includes(nextStatus)) {
    return NextResponse.json({ error: 'Invalid order status' }, { status: 400 });
  }

  await dbConnect();
  const order = await Order.findById(orderId);
  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  const current = normalizeOrderStatus(order.orderStatus);
  if (!canTransition(current, nextStatus)) {
    return NextResponse.json(
      { error: `Cannot change order from "${current}" to "${nextStatus}"` },
      { status: 409 },
    );
  }

  const now = new Date();
  order.statusHistory.push({
    from: current,
    to: nextStatus,
    changedByEmail: session.user?.email || '',
    changedByName: session.user?.name || '',
    changedAt: now,
    note,
  });
  order.orderStatus = nextStatus;
  if (nextStatus === 'completed') order.completedAt = now;
  if (nextStatus === 'cancelled') {
    order.cancelledAt = now;
    if (note) order.cancelReason = note;
  }
  await order.save();

  const raw = order.toObject() as LeanOrder;
  const [enriched] = await enrichOrders([raw]);
  return NextResponse.json({ order: enriched });
}
