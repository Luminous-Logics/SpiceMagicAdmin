import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/db';
import Product from '@/models/Product';
import {
  fetchWithRetry,
  sleep,
  CLOVER_THROTTLE_DELAY_MS,
} from '@/lib/clover';

interface CloverItem {
  id: string;
  name: string;
  price: number;
  priceType?: string;
  unitName?: string;
  stockCount?: number | null;
  categories?: { elements?: { id: string; name: string }[] };
}

export async function POST() {
  const timestamp = new Date().toISOString();
  const startedAt = Date.now();
  console.log(`[${timestamp}] POST /api/products/sync - Request started`);

  // Top-level try/catch guarantees we always return a structured JSON response.
  // Without this, an uncaught throw would let Vercel surface a generic 502.
  try {
    const session = await getServerSession(authOptions);
    if (session?.user?.role !== 'admin') {
      console.warn(`[${timestamp}] Unauthorized access attempt - user role: ${session?.user?.role}`);
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    console.log(`[${timestamp}] Admin user authenticated: ${session.user?.email}`);

    await dbConnect();

    let allItems: CloverItem[] = [];
    let offset = 0;
    const pageSize = 100;

    // Networking counters surfaced in the completion summary.
    let totalPages = 0;
    let totalRequests = 0; // every HTTP attempt, including retries
    let totalRetries = 0;

    console.log(`[${timestamp}] Starting Clover items fetch - Page size: ${pageSize}`);

    // Sequential, offset-based pagination. Requests are made one at a time (no
    // parallelism), and we throttle between pages, so concurrency is naturally
    // capped at 1 - well under Clover's rate limit.
    while (true) {
      const path = `/items?expand=categories&limit=${pageSize}&offset=${offset}`;

      console.log(`[${timestamp}] Fetching page...`);
      console.log(`[${timestamp}]   Offset: ${offset}`);
      console.log(`[${timestamp}]   Limit: ${pageSize}`);

      // All retry/backoff logic lives in fetchWithRetry; attempts are logged there.
      const { response, attempts, retries } = await fetchWithRetry(path, {
        label: `items offset=${offset}`,
      });
      totalRequests += attempts;
      totalRetries += retries;

      // Non-OK response after retries are exhausted: return a structured error
      // that preserves Clover's original status code (e.g. 429), never a 502.
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        console.error(
          `[${timestamp}] Clover API error - Status: ${response.status}, Body: ${body}`,
        );
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
      const items: CloverItem[] = data.elements || [];
      totalPages += 1;

      console.log(`[${timestamp}] Fetched page successfully`);
      console.log(`[${timestamp}]   Items received: ${items.length}`);

      allItems = allItems.concat(items);

      if (items.length < pageSize) {
        console.log(`[${timestamp}] Final page reached - Total items fetched: ${allItems.length}`);
        break;
      }

      offset += pageSize;

      // Throttle between paginated requests (applied even on success) to avoid
      // bursting Clover and triggering 429s in the first place.
      await sleep(CLOVER_THROTTLE_DELAY_MS);
    }

    // ----- Business logic below is unchanged (mapping / upsert / Mongo) -----
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

    const durationMs = Date.now() - startedAt;
    const response = {
      success: true,
      upserted,
      unchanged,
      total: allItems.length,
      errors,
    };

    // Completion summary with networking/timing metrics.
    console.log(`[${timestamp}] Sync completed`);
    console.log(`[${timestamp}]   Total pages: ${totalPages}`);
    console.log(`[${timestamp}]   Total items: ${allItems.length}`);
    console.log(`[${timestamp}]   Total requests: ${totalRequests}`);
    console.log(`[${timestamp}]   Total retries: ${totalRetries}`);
    console.log(`[${timestamp}]   Duration: ${durationMs}ms`);
    console.log(
      `[${timestamp}] Result - Upserted: ${upserted}, Unchanged: ${unchanged}, Errors: ${errors.length}`,
    );

    return NextResponse.json(response);
  } catch (err) {
    // Anything unexpected (DB failure, exhausted network retries, config error)
    // is converted into a structured 500 so Vercel never returns a bare 502.
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[${timestamp}] Unhandled sync error: ${message}`);
    return NextResponse.json(
      { success: false, error: 'Product sync failed', details: message },
      { status: 500 },
    );
  }
}
