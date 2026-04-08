import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/db';
import Banner, { BANNER_SECTIONS } from '@/models/Banner';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const section = searchParams.get('section');

    if (section && !BANNER_SECTIONS.includes(section as typeof BANNER_SECTIONS[number])) {
      return NextResponse.json({ error: 'Invalid section' }, { status: 400 });
    }

    await dbConnect();

    const query: Record<string, unknown> = { isActive: true };
    if (section) query.section = section;

    const banners = await Banner.find(query)
      .sort({ displayOrder: 1, createdAt: -1 })
      .lean();

    return NextResponse.json(banners);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[GET /api/banners]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (session?.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { imageUrl, publicId, section, title, subtitle, redirectUrl, displayOrder, isActive } = body;

    if (!imageUrl) {
      return NextResponse.json({ error: 'imageUrl is required' }, { status: 400 });
    }
    if (!section || !BANNER_SECTIONS.includes(section)) {
      return NextResponse.json({ error: 'Valid section is required' }, { status: 400 });
    }

    await dbConnect();
    const banner = await Banner.create({
      imageUrl,
      publicId:     publicId     || undefined,
      section,
      title:        title        || undefined,
      subtitle:     subtitle     || undefined,
      redirectUrl:  redirectUrl  || undefined,
      displayOrder: displayOrder ?? 0,
      isActive:     isActive     !== undefined ? isActive : true,
    });

    return NextResponse.json(banner, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[POST /api/banners]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
