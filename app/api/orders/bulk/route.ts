import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/db';
import mongoose from 'mongoose';
import Order from '@/models/Order';
import { canTransition, normalizeOrderStatus, type OrderStatus } from '@/lib/orders';

/** Maps a bulk action name to the target lifecycle status. */
const ACTION_TO_STATUS: Record<string, OrderStatus> = {
  confirm: 'confirmed',
  complete: 'completed',
  cancel: 'cancelled',
};

/**
 * POST /api/orders/bulk — apply a lifecycle action to many orders at once.
 * Body: { ids: string[], action: 'confirm' | 'complete' | 'cancel', note?: string }
 * Each successful change records an immutable audit entry. Orders whose current
 * status doesn't allow the transition are skipped (reported back), not errored.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body.ids) ? body.ids : [];
  const action = body.action as string;
  const note = typeof body.note === 'string' ? body.note.trim() : '';

  const targetStatus = ACTION_TO_STATUS[action];
  if (!targetStatus) {
    return NextResponse.json({ error: 'Invalid bulk action' }, { status: 400 });
  }
  const validIds = ids.filter((id) => mongoose.isValidObjectId(id));
  if (validIds.length === 0) {
    return NextResponse.json({ error: 'No valid order ids provided' }, { status: 400 });
  }

  await dbConnect();
  const orders = await Order.find({ _id: { $in: validIds } });

  const now = new Date();
  let updated = 0;
  let skipped = 0;

  for (const order of orders) {
    const current = normalizeOrderStatus(order.orderStatus);
    if (!canTransition(current, targetStatus)) {
      skipped++;
      continue;
    }
    order.statusHistory.push({
      from: current,
      to: targetStatus,
      changedByEmail: session.user?.email || '',
      changedByName: session.user?.name || '',
      changedAt: now,
      note: note || `Bulk ${action}`,
    });
    order.orderStatus = targetStatus;
    if (targetStatus === 'completed') order.completedAt = now;
    if (targetStatus === 'cancelled') {
      order.cancelledAt = now;
      if (note) order.cancelReason = note;
    }
    await order.save();
    updated++;
  }

  return NextResponse.json({
    success: true,
    updated,
    skipped,
    requested: validIds.length,
  });
}
