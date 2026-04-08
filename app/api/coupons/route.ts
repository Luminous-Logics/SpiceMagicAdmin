import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/db';
import Coupon from '@/models/Coupon';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await dbConnect();
  const coupons = await Coupon.find({}).sort({ createdAt: -1 }).lean();
  return NextResponse.json({ coupons });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { code, discountType, discountValue, minOrderAmount, maxDiscountAmount, usageLimit, userUsageLimit, validFrom, validTill, isActive } = body;

  if (!code) return NextResponse.json({ error: 'Coupon code is required' }, { status: 400 });
  if (!['percentage', 'fixed'].includes(discountType)) return NextResponse.json({ error: 'Invalid discount type' }, { status: 400 });
  if (!discountValue || discountValue <= 0) return NextResponse.json({ error: 'Discount value must be > 0' }, { status: 400 });
  if (!validFrom || !validTill) return NextResponse.json({ error: 'validFrom and validTill are required' }, { status: 400 });
  if (new Date(validTill) <= new Date(validFrom)) return NextResponse.json({ error: 'validTill must be after validFrom' }, { status: 400 });

  await dbConnect();

  const existing = await Coupon.findOne({ code: code.toUpperCase() });
  if (existing) return NextResponse.json({ error: 'Coupon code already exists' }, { status: 409 });

  const coupon = await Coupon.create({
    code: code.toUpperCase(),
    discountType,
    discountValue,
    minOrderAmount: minOrderAmount || 0,
    maxDiscountAmount: maxDiscountAmount || 0,
    usageLimit: usageLimit || 0,
    userUsageLimit: userUsageLimit || 0,
    validFrom: new Date(validFrom),
    validTill: new Date(validTill),
    isActive: isActive !== undefined ? isActive : true,
  });

  return NextResponse.json({ coupon }, { status: 201 });
}
