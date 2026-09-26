import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/db';
import FoodItemHistory from '@/models/FoodItemHistory';

/** GET /api/food-items/:id/history — the edit trail for one food item (newest first). */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (session?.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    await dbConnect();

    const history = await FoodItemHistory.find({ foodItem: id })
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ history });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[GET /api/food-items/:id/history]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
