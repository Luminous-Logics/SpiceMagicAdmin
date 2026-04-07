import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/db';
import Product from '@/models/Product';

export async function POST() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const base = process.env.CLOVER_BASE_URL;
  const merchantId = process.env.CLOVER_MERCHANT_ID;
  const token = process.env.CLOVER_ACCESS_TOKEN;

  let allItems: CloverItem[] = [];
  let offset = 0;
  const pageSize = 100;

  interface CloverItem {
    id: string;
    name: string;
    price: number;
    priceType?: string;
    unitName?: string;
    stockCount?: number | null;
    categories?: { elements?: { id: string; name: string }[] };
  }

  while (true) {
    const url = `${base}/v3/merchants/${merchantId}/items?expand=categories&limit=${pageSize}&offset=${offset}`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) {
      return NextResponse.json({ error: 'Clover API error', status: resp.status }, { status: 502 });
    }
    const data = await resp.json();
    const items: CloverItem[] = data.elements || [];
    allItems = allItems.concat(items);
    if (items.length < pageSize) break;
    offset += pageSize;
  }

  await dbConnect();

  let upserted = 0;
  let unchanged = 0;
  const errors: string[] = [];

  for (const item of allItems) {
    try {
      const category = item.categories?.elements?.[0]?.name || '';
      const existing = await Product.findOne({ productId: item.id });

      const doc = {
        productId: item.id,
        name: item.name,
        price: item.price || 0,
        category,
        priceType: item.priceType === 'PER_UNIT' ? 'PER_UNIT' : 'FIXED',
        unitLabel: item.unitName || '',
        stock: item.stockCount ?? null,
        updatedAt: new Date(),
      };

      if (!existing) {
        await Product.create(doc);
        upserted++;
      } else {
        const changed =
          existing.name !== doc.name ||
          existing.price !== doc.price ||
          existing.category !== doc.category ||
          existing.stock !== doc.stock;
        if (changed) {
          await Product.updateOne({ productId: item.id }, { $set: doc });
          upserted++;
        } else {
          unchanged++;
        }
      }
    } catch (err) {
      errors.push(`${item.id}: ${(err as Error).message}`);
    }
  }

  return NextResponse.json({ upserted, unchanged, total: allItems.length, errors });
}
