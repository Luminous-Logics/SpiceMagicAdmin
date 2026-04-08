import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/db';
import Banner from '@/models/Banner';

export async function GET(_req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (session?.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await dbConnect();
    const banners = await Banner.find({})
      .sort({ section: 1, displayOrder: 1, createdAt: -1 })
      .lean();

    return NextResponse.json(banners);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[GET /api/banners/all]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
