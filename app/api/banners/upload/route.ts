import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import cloudinary from '@/lib/cloudinary';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_SIZE = 5 * 1024 * 1024;

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
    const base64  = buffer.toString('base64');
    const dataUri = `data:${file.type};base64,${base64}`;

    const upload = await cloudinary.uploader.upload(dataUri, {
      folder:   'spicemagik/banners',
      overwrite: false,
      transformation: [
        { width: 1600, crop: 'limit', quality: 'auto', fetch_format: 'auto' },
      ],
    });

    return NextResponse.json({ url: upload.secure_url, publicId: upload.public_id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[POST /api/banners/upload]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
