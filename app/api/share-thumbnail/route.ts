import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/db';
import WhatsAppThumbnail from '@/models/WhatsAppThumbnail';
import cloudinary from '@/lib/cloudinary';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_SIZE = 5 * 1024 * 1024;

/** GET /api/share-thumbnail — every uploaded thumbnail, newest first. */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (session?.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await dbConnect();
    const thumbnails = await WhatsAppThumbnail.find({})
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ thumbnails });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[GET /api/share-thumbnail]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST /api/share-thumbnail — upload a new thumbnail and make it the active one. */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (session?.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Allowed: JPEG, PNG, WebP, GIF' },
        { status: 400 }
      );
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'File size exceeds 5 MB limit' }, { status: 400 });
    }

    const buffer  = Buffer.from(await file.arrayBuffer());
    const dataUri = `data:${file.type};base64,${buffer.toString('base64')}`;

    const upload = await cloudinary.uploader.upload(dataUri, {
      folder:    'spicemagik/whatsapp',
      overwrite: false,
      transformation: [
        // Cap width; WhatsApp/OG previews prefer ~1200px wide at 1200×630.
        { width: 1200, crop: 'limit', quality: 'auto', fetch_format: 'auto' },
      ],
    });

    await dbConnect();

    // A newly uploaded thumbnail becomes the active one — deactivate the rest.
    await WhatsAppThumbnail.updateMany({ isActive: true }, { $set: { isActive: false } });

    const created = await WhatsAppThumbnail.create({
      imageUrl:       upload.secure_url,
      publicId:       upload.public_id,
      isActive:       true,
      uploadedByName: session?.user?.name ?? undefined,
    });

    return NextResponse.json({ thumbnail: created }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[POST /api/share-thumbnail]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
