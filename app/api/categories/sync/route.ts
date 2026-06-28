import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/db';
import Category from '@/models/Category';
import { cloverFetch } from '@/lib/clover';

export async function POST() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const resp = await cloverFetch('/categories');

  if (!resp.ok) {
    return NextResponse.json({ error: 'Clover API error', status: resp.status }, { status: 502 });
  }

  const data = await resp.json();
  const elements = data.elements || [];

  await dbConnect();

  let upserted = 0;
  let updated = 0;

  for (const cat of elements) {
    const existing = await Category.findOne({ cloverCategoryId: cat.id });
    if (!existing) {
      await Category.create({
        cloverCategoryId: cat.id,
        name: cat.name,
        lastSyncedAt: new Date(),
      });
      upserted++;
    } else {
      await Category.updateOne(
        { cloverCategoryId: cat.id },
        { $set: { name: cat.name, lastSyncedAt: new Date() } }
      );
      updated++;
    }
  }

  return NextResponse.json({ upserted, updated, total: elements.length });
}
