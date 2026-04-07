import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/db';
import Category from '@/models/Category';

export async function POST() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const base = process.env.CLOVER_BASE_URL;
  const merchantId = process.env.CLOVER_MERCHANT_ID;
  const token = process.env.CLOVER_ACCESS_TOKEN;

  const url = `${base}/v3/merchants/${merchantId}/categories`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

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
