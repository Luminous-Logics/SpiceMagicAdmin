import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/db';
import Product from '@/models/Product';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { productId } = await params;
  const body = await req.json();

  const allowed: Record<string, unknown> = {};
  if (typeof body.discount === 'number') {
    allowed.discount = Math.min(90, Math.max(0, body.discount));
  }
  if (typeof body.isHotDeal === 'boolean') {
    allowed.isHotDeal = body.isHotDeal;
  }
  if (typeof body.description === 'string') {
    allowed.description = body.description.trim();
  }

  await dbConnect();
  const updated = await Product.findOneAndUpdate(
    { productId },
    { $set: allowed },
    { new: true }
  );

  if (!updated) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 });
  }

  return NextResponse.json({ product: updated });
}
