import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Product from '@/models/Product';
import type { SortOrder } from 'mongoose';

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function GET(req: NextRequest) {
  await dbConnect();
  const { searchParams } = new URL(req.url);
  const rawPage = parseInt(searchParams.get('page') || '1', 10);
  const rawLimit = parseInt(searchParams.get('limit') || '20', 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 20;
  const sort = searchParams.get('sort') || 'newest';
  const search = (searchParams.get('search') || '').trim();
  const category = searchParams.get('category') || '';
  const minPrice = searchParams.get('minPrice');
  const maxPrice = searchParams.get('maxPrice');

  const query: Record<string, unknown> = {};
  if (search) {
    const pattern = escapeRegex(search);
    query.$or = [
      { name: { $regex: pattern, $options: 'i' } },
      { productId: { $regex: pattern, $options: 'i' } },
      { category: { $regex: pattern, $options: 'i' } },
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
  const filtered = Object.keys(query).length > 0;
  const [products, total, totalAll, categoryAgg, priceStats] = await Promise.all([
    Product.find(query).sort(sortObj).skip(skip).limit(limit).lean(),
    Product.countDocuments(query),
    filtered ? Product.countDocuments({}) : Promise.resolve(0),
    Product.aggregate<{ _id: string; count: number }>([
      { $match: { category: { $type: 'string', $ne: '' } } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    Product.aggregate<{ min: number; max: number }>([
      { $match: { price: { $gt: 0 } } },
      { $group: { _id: null, min: { $min: '$price' }, max: { $max: '$price' } } },
    ]),
  ]);

  const catalogTotal = filtered ? totalAll : total;
  const pages = total === 0 ? 0 : Math.ceil(total / limit);
  const categories = categoryAgg.map(({ _id, count }) => ({ name: _id, count }));
  const priceRange = priceStats[0]
    ? { min: priceStats[0].min, max: priceStats[0].max }
    : { min: 0, max: 0 };

  return NextResponse.json({ products, total, totalAll: catalogTotal, pages, categories, priceRange });
}
