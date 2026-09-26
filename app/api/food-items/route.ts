import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/db';
import FoodItem, { FOOD_CATEGORIES, SPICE_LEVELS } from '@/models/FoodItem';

/** GET /api/food-items — every item including unavailable ones, for the admin grid. */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (session?.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await dbConnect();
    const items = await FoodItem.find({})
      .sort({ displayOrder: 1, createdAt: -1 })
      .lean();

    return NextResponse.json(items);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[GET /api/food-items]', err);
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
    const {
      title, description, imageUrl, publicId, price, quantity,
      category, isVeg, spiceLevel, preparationTime, vendorName,
      displayOrder, isAvailable,
    } = body;

    if (!title || typeof title !== 'string' || !title.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }
    if (!imageUrl || typeof imageUrl !== 'string' || !imageUrl.trim()) {
      return NextResponse.json({ error: 'An image is required' }, { status: 400 });
    }
    if (!Number.isFinite(price) || price < 0) {
      return NextResponse.json({ error: 'Price must be a positive amount' }, { status: 400 });
    }
    if (!Number.isInteger(quantity) || quantity < 0) {
      return NextResponse.json({ error: 'Quantity must be a whole number of 0 or more' }, { status: 400 });
    }
    if (category && !FOOD_CATEGORIES.includes(category)) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
    }
    if (spiceLevel && !SPICE_LEVELS.includes(spiceLevel)) {
      return NextResponse.json({ error: 'Invalid spice level' }, { status: 400 });
    }

    await dbConnect();
    const item = await FoodItem.create({
      title:           title.trim(),
      description:     description?.trim() || undefined,
      imageUrl:        imageUrl.trim(),
      publicId:        publicId || undefined,
      price:           Math.round(price),
      quantity,
      category:        category || 'Other',
      isVeg:           isVeg !== undefined ? !!isVeg : true,
      spiceLevel:      spiceLevel || 'none',
      preparationTime: Number.isFinite(preparationTime) ? preparationTime : undefined,
      vendorName:      vendorName?.trim() || undefined,
      displayOrder:    displayOrder ?? 0,
      isAvailable:     isAvailable !== undefined ? !!isAvailable : true,
    });

    return NextResponse.json(item, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[POST /api/food-items]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
