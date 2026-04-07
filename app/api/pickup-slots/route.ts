import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/db';
import PickupSlot from '@/models/PickupSlot';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const all = searchParams.get('all');

    await dbConnect();

    if (all === '1') {
      const session = await getServerSession(authOptions);
      if (session?.user?.role !== 'admin') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      const slots = await PickupSlot.find({}).sort({ startDate: 1 }).lean();
      return NextResponse.json(slots);
    }

    // Public: return active slot for today or next available
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    let slots = await PickupSlot.find({
      isActive: true,
      startDate: { $lte: today },
      endDate: { $gte: today },
    }).lean();

    if (slots.length === 0) {
      slots = await PickupSlot.find({
        isActive: true,
        endDate: { $gte: today },
      })
        .sort({ startDate: 1 })
        .limit(1)
        .lean();
    }

    return NextResponse.json(slots);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[GET /api/pickup-slots]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (session?.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { startDate, endDate, slots, isActive } = body;

    if (!startDate || !endDate) {
      return NextResponse.json({ error: 'startDate and endDate are required' }, { status: 400 });
    }
    if (new Date(endDate) < new Date(startDate)) {
      return NextResponse.json({ error: 'endDate must be >= startDate' }, { status: 400 });
    }
    if (!slots || !Array.isArray(slots) || slots.length === 0 || slots.length > 3) {
      return NextResponse.json({ error: '1 to 3 time slots are required' }, { status: 400 });
    }
    for (const s of slots) {
      if (!s.startTime || !s.endTime) {
        return NextResponse.json({ error: 'Each slot must have startTime and endTime' }, { status: 400 });
      }
    }

    await dbConnect();
    const entry = await PickupSlot.create({
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      slots,
      isActive: isActive !== undefined ? isActive : true,
    });

    return NextResponse.json(entry, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[POST /api/pickup-slots]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
