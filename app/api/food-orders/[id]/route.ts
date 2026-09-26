import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/db';
import FoodItem from '@/models/FoodItem';
import FoodOrder, { FOOD_ORDER_STATUSES, type FoodOrderStatus } from '@/models/FoodOrder';

async function adminGuard() {
  const session = await getServerSession(authOptions);
  return session?.user?.role === 'admin';
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!(await adminGuard())) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    await dbConnect();
    const order = await FoodOrder.findById(id).lean();
    if (!order) return NextResponse.json({ error: 'Food order not found' }, { status: 404 });

    return NextResponse.json(order);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[GET /api/food-orders/:id]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/food-orders/:id — move an order through its lifecycle.
 * Cancelling credits the booked units back to each food item exactly once.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!(await adminGuard())) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();
    const status = body.status as FoodOrderStatus | undefined;

    if (!status || !FOOD_ORDER_STATUSES.includes(status)) {
      return NextResponse.json({ error: 'A valid status is required' }, { status: 400 });
    }

    await dbConnect();
    const order = await FoodOrder.findById(id);
    if (!order) return NextResponse.json({ error: 'Food order not found' }, { status: 404 });

    if (order.status === 'cancelled' && status !== 'cancelled') {
      return NextResponse.json(
        { error: 'A cancelled order cannot be reopened — ask the customer to preorder again.' },
        { status: 409 }
      );
    }

    const isNewCancellation = status === 'cancelled' && !order.stockRestored;

    if (isNewCancellation && order.items.length > 0) {
      await FoodItem.bulkWrite(
        order.items.map((item) => ({
          updateOne: {
            filter: { _id: item.foodItemId },
            update: { $inc: { quantity: item.quantity } },
          },
        }))
      );
      order.stockRestored = true;
    }

    order.status = status;
    if (typeof body.adminNote === 'string') order.adminNote = body.adminNote.trim();
    await order.save();

    return NextResponse.json({ order, stockRestored: isNewCancellation });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[PATCH /api/food-orders/:id]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
