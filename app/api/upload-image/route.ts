import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { v2 as cloudinary } from 'cloudinary';
import dbConnect from '@/lib/db';
import Product from '@/models/Product';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const productId = formData.get('productId') as string | null;

  if (!file || !productId) {
    return NextResponse.json({ error: 'file and productId are required' }, { status: 400 });
  }

  if (file.size > 2 * 1024 * 1024) {
    return NextResponse.json({ error: 'File size exceeds 2MB limit' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  interface CloudinaryResult {
    secure_url: string;
    public_id: string;
  }

  const result = await new Promise<CloudinaryResult>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'spicemagik/products', resource_type: 'image' },
      (err, res) => (err ? reject(err) : resolve(res as CloudinaryResult))
    );
    stream.end(buffer);
  });

  await dbConnect();
  await Product.updateOne(
    { productId },
    { $set: { image: result.secure_url, publicId: result.public_id } }
  );

  return NextResponse.json({ url: result.secure_url, publicId: result.public_id });
}
