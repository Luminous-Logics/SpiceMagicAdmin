import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Coupon from '@/models/Coupon';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { code, cartTotal, userId } = body;

  if (!code || !cartTotal) {
    return NextResponse.json({ valid: false, message: 'Invalid request' }, { status: 400 });
  }

  await dbConnect();
  const coupon = await Coupon.findOne({ code: code.toUpperCase() });

  if (!coupon) {
    return NextResponse.json({ valid: false, message: 'Invalid coupon code' });
  }

  if (!coupon.isActive) {
    return NextResponse.json({ valid: false, message: 'Coupon not active' });
  }

  const now = new Date();
  if (now < coupon.validFrom || now > coupon.validTill) {
    return NextResponse.json({ valid: false, message: 'Coupon expired' });
  }

  if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) {
    return NextResponse.json({ valid: false, message: 'Coupon usage limit reached' });
  }

  if (userId && coupon.userUsageLimit > 0) {
    const userUses = coupon.usedBy.filter((u: { userId: string }) => u.userId === userId).length;
    if (userUses >= coupon.userUsageLimit) {
      return NextResponse.json({ valid: false, message: 'You have already used this coupon the maximum number of times' });
    }
  }

  if (coupon.minOrderAmount > 0 && cartTotal < coupon.minOrderAmount) {
    const minFormatted = (coupon.minOrderAmount / 100).toFixed(2);
    return NextResponse.json({ valid: false, message: `Minimum order amount not met. Minimum: $${minFormatted}` });
  }

  let discount = 0;
  if (coupon.discountType === 'percentage') {
    discount = Math.round(cartTotal * coupon.discountValue / 100);
    if (coupon.maxDiscountAmount > 0) {
      discount = Math.min(discount, coupon.maxDiscountAmount);
    }
  } else {
    discount = coupon.discountValue;
  }

  const finalAmount = Math.max(0, cartTotal - discount);

  return NextResponse.json({
    valid: true,
    discount,
    finalAmount,
    message: 'Coupon applied successfully',
  });
}
