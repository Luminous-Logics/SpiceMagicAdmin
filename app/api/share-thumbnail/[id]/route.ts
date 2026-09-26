import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/db';
import WhatsAppThumbnail from '@/models/WhatsAppThumbnail';
import cloudinary from '@/lib/cloudinary';

async function adminGuard() {
  const session = await getServerSession(authOptions);
  return session?.user?.role === 'admin';
}

/** PATCH /api/share-thumbnail/:id — activate (or deactivate) a thumbnail. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!(await adminGuard())) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const makeActive = body?.isActive !== false; // default action is to activate

    await dbConnect();

    const target = await WhatsAppThumbnail.findById(id);
    if (!target) return NextResponse.json({ error: 'Thumbnail not found' }, { status: 404 });

    if (makeActive) {
      // Enforce a single active thumbnail: clear everyone else first.
      await WhatsAppThumbnail.updateMany(
        { _id: { $ne: id }, isActive: true },
        { $set: { isActive: false } }
      );
      target.isActive = true;
    } else {
      target.isActive = false;
    }
    await target.save();

    return NextResponse.json({ thumbnail: target });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[PATCH /api/share-thumbnail/:id]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** DELETE /api/share-thumbnail/:id — remove a thumbnail (and its Cloudinary image). */
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

    const item = await WhatsAppThumbnail.findById(id);
    if (!item) return NextResponse.json({ error: 'Thumbnail not found' }, { status: 404 });

    if (item.publicId) {
      try {
        await cloudinary.uploader.destroy(item.publicId);
      } catch {
        console.warn('[DELETE /api/share-thumbnail/:id] Cloudinary delete failed for', item.publicId);
      }
    }

    const wasActive = item.isActive;
    await item.deleteOne();

    // If we removed the active thumbnail, promote the most recent remaining one
    // so the share preview always has an image when any exist.
    if (wasActive) {
      const next = await WhatsAppThumbnail.findOne({}).sort({ createdAt: -1 });
      if (next) {
        next.isActive = true;
        await next.save();
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[DELETE /api/share-thumbnail/:id]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
