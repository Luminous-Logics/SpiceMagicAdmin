import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/db';
import FoodItem, { FOOD_CATEGORIES, SPICE_LEVELS } from '@/models/FoodItem';
import FoodItemHistory from '@/models/FoodItemHistory';
import cloudinary from '@/lib/cloudinary';

async function adminGuard() {
  const session = await getServerSession(authOptions);
  return session?.user?.role === 'admin';
}

/** Fields we track in the edit history, with the label shown to the admin. */
const TRACKED_FIELDS: { field: string; label: string }[] = [
  { field: 'title',        label: 'Title' },
  { field: 'description',  label: 'Description' },
  { field: 'price',        label: 'Price' },
  { field: 'quantity',     label: 'Quantity' },
  { field: 'category',     label: 'Category' },
  { field: 'spiceLevel',   label: 'Spice Level' },
  { field: 'isVeg',        label: 'Diet' },
  { field: 'vendorName',   label: 'Vendor' },
  { field: 'displayOrder', label: 'Display Order' },
  { field: 'isAvailable',  label: 'Visibility' },
  { field: 'imageUrl',     label: 'Image' },
];

/** Treat null/undefined/whitespace as an empty string so blanks don't look like edits. */
function normalizeValue(v: unknown): unknown {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string') return v.trim();
  return v;
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (session?.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();
    const allowed: Record<string, unknown> = {};

    if (body.title !== undefined) {
      if (typeof body.title !== 'string' || !body.title.trim()) {
        return NextResponse.json({ error: 'Title cannot be empty' }, { status: 400 });
      }
      allowed.title = body.title.trim();
    }
    if (body.imageUrl !== undefined) {
      if (typeof body.imageUrl !== 'string' || !body.imageUrl.trim()) {
        return NextResponse.json({ error: 'Image cannot be empty' }, { status: 400 });
      }
      allowed.imageUrl = body.imageUrl.trim();
    }
    if (body.price !== undefined) {
      if (!Number.isFinite(body.price) || body.price < 0) {
        return NextResponse.json({ error: 'Price must be a positive amount' }, { status: 400 });
      }
      allowed.price = Math.round(body.price);
    }
    if (body.quantity !== undefined) {
      if (!Number.isInteger(body.quantity) || body.quantity < 0) {
        return NextResponse.json({ error: 'Quantity must be a whole number of 0 or more' }, { status: 400 });
      }
      allowed.quantity = body.quantity;
    }
    if (body.category !== undefined) {
      if (!FOOD_CATEGORIES.includes(body.category)) {
        return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
      }
      allowed.category = body.category;
    }
    if (body.spiceLevel !== undefined) {
      if (!SPICE_LEVELS.includes(body.spiceLevel)) {
        return NextResponse.json({ error: 'Invalid spice level' }, { status: 400 });
      }
      allowed.spiceLevel = body.spiceLevel;
    }
    if (body.description     !== undefined) allowed.description     = body.description;
    if (body.publicId        !== undefined) allowed.publicId        = body.publicId;
    if (body.preparationTime !== undefined) allowed.preparationTime = body.preparationTime;
    if (body.vendorName      !== undefined) allowed.vendorName      = body.vendorName;
    if (body.displayOrder    !== undefined) allowed.displayOrder    = body.displayOrder;
    if (typeof body.isVeg       === 'boolean') allowed.isVeg       = body.isVeg;
    if (typeof body.isAvailable === 'boolean') allowed.isAvailable = body.isAvailable;

    await dbConnect();

    const existing = await FoodItem.findById(id);
    if (!existing) return NextResponse.json({ error: 'Food item not found' }, { status: 404 });

    // Diff the incoming values against what's stored so we can record an edit trail.
    const changes = TRACKED_FIELDS.reduce<{ field: string; label: string; from: unknown; to: unknown }[]>(
      (acc, { field, label }) => {
        if (!(field in allowed)) return acc;
        const from = normalizeValue(existing.get(field));
        const to = normalizeValue(allowed[field]);
        if (from !== to) acc.push({ field, label, from, to });
        return acc;
      },
      []
    );

    const updated = await FoodItem.findByIdAndUpdate(id, { $set: allowed }, { new: true });

    if (changes.length > 0) {
      try {
        await FoodItemHistory.create({
          foodItem:      id,
          changes,
          editedByName:  session?.user?.name ?? undefined,
          editedByEmail: session?.user?.email ?? undefined,
        });
      } catch (histErr) {
        // History is best-effort — never fail the actual save because logging broke.
        console.warn('[PUT /api/food-items/:id] history write failed', histErr);
      }
    }

    return NextResponse.json(updated);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[PUT /api/food-items/:id]', err);
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
    const item = await FoodItem.findById(id);
    if (!item) return NextResponse.json({ error: 'Food item not found' }, { status: 404 });

    if (item.publicId) {
      try {
        await cloudinary.uploader.destroy(item.publicId);
      } catch {
        console.warn('[DELETE /api/food-items/:id] Cloudinary delete failed for', item.publicId);
      }
    }

    await item.deleteOne();
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[DELETE /api/food-items/:id]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
