import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/db';
import Category from '@/models/Category';
import { fetchWithRetry } from '@/lib/clover';

export async function POST() {
  // Top-level try/catch guarantees a structured JSON response (never a 502).
  try {
    const session = await getServerSession(authOptions);
    if (session?.user?.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    // Single Clover request, routed through the shared retry helper so 429s are
    // retried with exponential backoff just like the product sync.
    const { response } = await fetchWithRetry('/categories', { label: 'categories' });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.error(`Clover API error - Status: ${response.status}, Body: ${body}`);
      const isRateLimit = response.status === 429;
      return NextResponse.json(
        {
          success: false,
          error: isRateLimit ? 'Clover rate limit exceeded' : 'Clover API error',
          details: body,
        },
        { status: response.status },
      );
    }

    const data = await response.json();
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

    return NextResponse.json({ success: true, upserted, updated, total: elements.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`Unhandled category sync error: ${message}`);
    return NextResponse.json(
      { success: false, error: 'Category sync failed', details: message },
      { status: 500 },
    );
  }
}
