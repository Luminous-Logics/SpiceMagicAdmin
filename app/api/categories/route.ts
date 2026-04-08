import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Category from '@/models/Category';

export async function GET() {
  await dbConnect();
  const data = await Category.find({}).sort({ sortOrder: 1, name: 1 }).lean();
  return NextResponse.json({ data });
}
