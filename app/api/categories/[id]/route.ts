import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/db';
import Category from '@/models/Category';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();

  const allowed: Record<string, unknown> = {};
  if (typeof body.isFeatured === 'boolean') allowed.isFeatured = body.isFeatured;
  if (typeof body.sortOrder === 'number') allowed.sortOrder = body.sortOrder;

  await dbConnect();
  const updated = await Category.findOneAndUpdate(
    { cloverCategoryId: id },
    { $set: allowed },
    { new: true }
  );

  if (!updated) {
    return NextResponse.json({ error: 'Category not found' }, { status: 404 });
  }

  return NextResponse.json({ category: updated });
}
