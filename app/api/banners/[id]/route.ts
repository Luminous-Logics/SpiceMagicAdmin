import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/db';
import Banner, { BANNER_SECTIONS } from '@/models/Banner';
import cloudinary from '@/lib/cloudinary';

async function adminGuard() {
  const session = await getServerSession(authOptions);
  return session?.user?.role === 'admin';
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!(await adminGuard())) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();

    const allowed: Record<string, unknown> = {};
    if (body.imageUrl   !== undefined) allowed.imageUrl   = body.imageUrl;
    if (body.publicId   !== undefined) allowed.publicId   = body.publicId;
    if (body.title      !== undefined) allowed.title      = body.title;
    if (body.subtitle   !== undefined) allowed.subtitle   = body.subtitle;
    if (body.redirectUrl !== undefined) allowed.redirectUrl = body.redirectUrl;
    if (body.displayOrder !== undefined) allowed.displayOrder = body.displayOrder;
    if (typeof body.isActive === 'boolean') allowed.isActive = body.isActive;
    if (body.section !== undefined) {
      if (!BANNER_SECTIONS.includes(body.section)) {
        return NextResponse.json({ error: 'Invalid section' }, { status: 400 });
      }
      allowed.section = body.section;
    }

    await dbConnect();
    const updated = await Banner.findByIdAndUpdate(id, { $set: allowed }, { new: true });
    if (!updated) return NextResponse.json({ error: 'Banner not found' }, { status: 404 });

    return NextResponse.json(updated);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[PUT /api/banners/:id]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!(await adminGuard())) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    await dbConnect();
    const banner = await Banner.findById(id);
    if (!banner) return NextResponse.json({ error: 'Banner not found' }, { status: 404 });

    if (banner.publicId) {
      try {
        await cloudinary.uploader.destroy(banner.publicId);
      } catch {
        console.warn('[DELETE /api/banners/:id] Cloudinary delete failed for', banner.publicId);
      }
    }

    await banner.deleteOne();
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[DELETE /api/banners/:id]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
