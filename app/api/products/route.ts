import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Product from '@/models/Product';
import type { SortOrder } from 'mongoose';

export async function GET(req: NextRequest) {
  await dbConnect();
  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '20');
  const sort = searchParams.get('sort') || 'newest';
  const search = searchParams.get('search') || '';
  const category = searchParams.get('category') || '';
  const minPrice = searchParams.get('minPrice');
  const maxPrice = searchParams.get('maxPrice');

  const query: Record<string, unknown> = {};
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { productId: { $regex: search, $options: 'i' } },
    ];
  }
  if (category) query.category = category;
  if (minPrice || maxPrice) {
    query.price = {};
    if (minPrice) (query.price as Record<string, number>).$gte = parseInt(minPrice);
    if (maxPrice) (query.price as Record<string, number>).$lte = parseInt(maxPrice);
  }

  const sortMap: Record<string, Record<string, SortOrder>> = {
    newest: { updatedAt: -1 },
    name_asc: { name: 1 },
    best_sellers: { totalSold: -1 },
    price_asc: { price: 1 },
    price_desc: { price: -1 },
  };
  const sortObj = sortMap[sort] || { updatedAt: -1 as SortOrder };

  const skip = (page - 1) * limit;
  const [products, total] = await Promise.all([
    Product.find(query).sort(sortObj).skip(skip).limit(limit).lean(),
    Product.countDocuments(query),
  ]);

  const pages = Math.ceil(total / limit);

  const allProducts = await Product.find({}).lean();
  const categoryMap: Record<string, number> = {};
  for (const p of allProducts) {
    if (p.category) categoryMap[p.category] = (categoryMap[p.category] || 0) + 1;
  }
  const categories = Object.entries(categoryMap).map(([name, count]) => ({ name, count }));

  const prices = allProducts.map((p) => p.price).filter(Boolean);
  const priceRange = { min: Math.min(...prices), max: Math.max(...prices) };

  return NextResponse.json({ products, total, pages, categories, priceRange });
}
