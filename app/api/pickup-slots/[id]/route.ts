import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/db';
import PickupSlot from '@/models/PickupSlot';

async function adminGuard() {
  const session = await getServerSession(authOptions);
  return session?.user?.role === 'admin';
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!(await adminGuard())) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();

    const allowed: Record<string, unknown> = {};
    if (body.startDate) allowed.startDate = new Date(body.startDate);
    if (body.endDate) allowed.endDate = new Date(body.endDate);
    if (body.slots) allowed.slots = body.slots;
    if (typeof body.isActive === 'boolean') allowed.isActive = body.isActive;

    if (allowed.startDate && allowed.endDate) {
      if ((allowed.endDate as Date) < (allowed.startDate as Date)) {
        return NextResponse.json({ error: 'endDate must be >= startDate' }, { status: 400 });
      }
    }

    await dbConnect();
    const updated = await PickupSlot.findByIdAndUpdate(id, { $set: allowed }, { new: true });
    if (!updated) return NextResponse.json({ error: 'Slot not found' }, { status: 404 });

    return NextResponse.json(updated);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[PUT /api/pickup-slots/:id]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!(await adminGuard())) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    await dbConnect();
    const deleted = await PickupSlot.findByIdAndDelete(id);
    if (!deleted) return NextResponse.json({ error: 'Slot not found' }, { status: 404 });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[DELETE /api/pickup-slots/:id]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
