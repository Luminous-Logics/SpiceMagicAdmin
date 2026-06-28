import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/db';
import Product from '@/models/Product';
import { cloverFetch } from '@/lib/clover';

export async function POST(req: Request) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] POST /api/products/sync - Request started`);

  const session = await getServerSession(authOptions);
  if (session?.user?.role !== 'admin') {
    console.warn(`[${timestamp}] Unauthorized access attempt - user role: ${session?.user?.role}`);
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  console.log(`[${timestamp}] Admin user authenticated: ${session.user?.email}`);

  await dbConnect();

  let allItems: CloverItem[] = [];
  let offset = 0;
  const pageSize = 100;
  let totalFetched = 0;

  console.log(`[${timestamp}] Starting Clover items fetch - Page size: ${pageSize}`);

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
    const path = `/items?expand=categories&limit=${pageSize}&offset=${offset}`;
    console.log(`[${timestamp}] Fetching page - Offset: ${offset}, Path: ${path}`);

    const resp = await cloverFetch(path);

    if (!resp.ok) {
      const errorBody = await resp.text();
      console.error(`[${timestamp}] Clover API error - Status: ${resp.status}, Body: ${errorBody}`);
      return NextResponse.json({ error: 'Clover API error', status: resp.status }, { status: 502 });
    }

    const data = await resp.json();
    const items: CloverItem[] = data.elements || [];
    console.log(`[${timestamp}] Page fetched - Items count: ${items.length}, Offset: ${offset}`);

    allItems = allItems.concat(items);
    totalFetched += items.length;

    if (items.length < pageSize) {
      console.log(`[${timestamp}] Final page reached - Total items fetched: ${totalFetched}`);
      break;
    }
    offset += pageSize;
  }

  let upserted = 0;
  let unchanged = 0;
  const errors: string[] = [];

  console.log(`[${timestamp}] Processing ${allItems.length} items for sync`);

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
        console.log(`[${timestamp}] Product created - ID: ${item.id}, Name: ${item.name}`);
      } else {
        const changed =
          existing.name !== doc.name ||
          existing.price !== doc.price ||
          existing.category !== doc.category ||
          existing.stock !== doc.stock;
        if (changed) {
          await Product.updateOne({ productId: item.id }, { $set: doc });
          upserted++;
          console.log(`[${timestamp}] Product updated - ID: ${item.id}, Name: ${item.name}`);
        } else {
          unchanged++;
        }
      }
    } catch (err) {
      const errorMsg = `${item.id}: ${(err as Error).message}`;
      errors.push(errorMsg);
      console.error(`[${timestamp}] Product sync error - ${errorMsg}`);
    }
  }

  const response = { upserted, unchanged, total: allItems.length, errors };
  console.log(`[${timestamp}] Sync completed - Upserted: ${upserted}, Unchanged: ${unchanged}, Errors: ${errors.length}`);
  console.log(`[${timestamp}] Response payload:`, JSON.stringify(response, null, 2));

  return NextResponse.json(response);
}
