import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/db';
import Coupon from '@/models/Coupon';

async function adminGuard() {
  const session = await getServerSession(authOptions);
  return session?.user?.role === 'admin';
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await adminGuard())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();

  const allowed: Record<string, unknown> = {};
  const fields = ['discountType', 'discountValue', 'minOrderAmount', 'maxDiscountAmount', 'usageLimit', 'userUsageLimit', 'validFrom', 'validTill', 'isActive', 'code'];
  for (const f of fields) {
    if (body[f] !== undefined) allowed[f] = body[f];
  }
  if (allowed.validFrom) allowed.validFrom = new Date(allowed.validFrom as string);
  if (allowed.validTill) allowed.validTill = new Date(allowed.validTill as string);
  if (allowed.code) allowed.code = (allowed.code as string).toUpperCase();

  await dbConnect();
  const updated = await Coupon.findByIdAndUpdate(id, { $set: allowed }, { new: true });
  if (!updated) return NextResponse.json({ error: 'Coupon not found' }, { status: 404 });

  return NextResponse.json({ coupon: updated });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await adminGuard())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  await dbConnect();
  const deleted = await Coupon.findByIdAndDelete(id);
  if (!deleted) return NextResponse.json({ error: 'Coupon not found' }, { status: 404 });

  return NextResponse.json({ success: true });
}
