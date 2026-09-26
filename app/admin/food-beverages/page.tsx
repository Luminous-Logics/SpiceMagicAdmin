'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import Navbar from '@/app/components/Navbar';
import Breadcrumb from '@/app/components/Breadcrumb';
import Footer from '@/app/components/Footer';
import ConfirmModal from '@/app/components/ConfirmModal';

/* ── constants ──────────────────────────────────────────── */
const FOOD_CATEGORIES = [
  'Starters', 'Main Course', 'Breads', 'Rice & Biryani',
  'Snacks', 'Desserts', 'Beverages', 'Combos', 'Other',
] as const;
type FoodCategory = typeof FOOD_CATEGORIES[number];

const SPICE_LEVELS = ['none', 'mild', 'medium', 'hot'] as const;
type SpiceLevel = typeof SPICE_LEVELS[number];

const SPICE_LABELS: Record<SpiceLevel, string> = {
  none:   'Not spicy',
  mild:   'Mild 🌶',
  medium: 'Medium 🌶🌶',
  hot:    'Hot 🌶🌶🌶',
};

const LOW_STOCK_THRESHOLD = 5;

/** Public storefront URL — the shared link points customers to the live preorder page. */
const STOREFRONT_URL = process.env.NEXT_PUBLIC_STOREFRONT_URL || 'https://www.spicemagikwpg.com';

/* ── types ───────────────────────────────────────────────── */
interface FoodItem {
  _id: string;
  title: string;
  description?: string;
  imageUrl: string;
  publicId?: string;
  price: number;          // cents
  quantity: number;
  category: FoodCategory;
  isVeg: boolean;
  spiceLevel: SpiceLevel;
  vendorName?: string;
  displayOrder: number;
  isAvailable: boolean;
  createdAt: string;
}

interface HistoryChange {
  field: string;
  label: string;
  from: unknown;
  to: unknown;
}

interface HistoryEntry {
  _id: string;
  changes: HistoryChange[];
  editedByName?: string;
  editedByEmail?: string;
  createdAt: string;
}

interface FormState {
  title: string;
  description: string;
  price: string;          // dollars, as typed
  quantity: string;
  category: FoodCategory;
  isVeg: boolean;
  spiceLevel: SpiceLevel;
  vendorName: string;
  displayOrder: number;
  isAvailable: boolean;
  existingImageUrl: string;
  existingPublicId: string;
}

const EMPTY_FORM: FormState = {
  title: '', description: '', price: '', quantity: '',
  category: 'Main Course', isVeg: true, spiceLevel: 'none',
  vendorName: '', displayOrder: 0, isAvailable: true,
  existingImageUrl: '', existingPublicId: '',
};

/* ── shared styles ───────────────────────────────────────── */
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 14px', border: '1.5px solid #e5e7eb',
  borderRadius: 10, fontSize: 14, outline: 'none', boxSizing: 'border-box',
  background: '#fff',
};
const labelStyle: React.CSSProperties = {
  fontSize: 13, fontWeight: 600, color: '#444', marginBottom: 6, display: 'block',
};
const helperStyle: React.CSSProperties = {
  fontSize: 11, color: '#9ca3af', margin: '4px 0 0',
};

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/* ══════════════════════════════════════════════════════════ */
export default function FoodBeveragesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [items, setItems]               = useState<FoodItem[]>([]);
  const [loading, setLoading]           = useState(true);
  const [showForm, setShowForm]         = useState(false);
  const [editingId, setEditingId]       = useState<string | null>(null);
  const [form, setForm]                 = useState<FormState>(EMPTY_FORM);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl]     = useState('');
  const [uploading, setUploading]       = useState(false);
  const [saving, setSaving]             = useState(false);
  const [formError, setFormError]       = useState('');
  const [imgHover, setImgHover]         = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<FoodItem | null>(null);
  const [search, setSearch]             = useState('');
  const [categoryFilter, setCategoryFilter] = useState<FoodCategory | ''>('');
  const [historyTarget, setHistoryTarget]   = useState<FoodItem | null>(null);
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  /* auth guard */
  useEffect(() => {
    if (status === 'loading') return;
    if (!session || session.user?.role !== 'admin') router.replace('/login');
  }, [session, status, router]);

  /* fetch */
  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/food-items');
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Failed to load food items');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session?.user?.role === 'admin') fetchItems();
  }, [session, fetchItems]);

  /* derived */
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      if (categoryFilter && i.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        i.title.toLowerCase().includes(q) ||
        (i.description ?? '').toLowerCase().includes(q) ||
        (i.vendorName ?? '').toLowerCase().includes(q)
      );
    });
  }, [items, search, categoryFilter]);

  const stats = useMemo(() => ({
    total:     items.length,
    available: items.filter((i) => i.isAvailable).length,
    outOfStock: items.filter((i) => i.quantity === 0).length,
    lowStock:  items.filter((i) => i.quantity > 0 && i.quantity <= LOW_STOCK_THRESHOLD).length,
  }), [items]);

  /* helpers */
  const setField = <K extends keyof FormState>(key: K, val: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: val }));

  const openAdd = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setSelectedFile(null);
    setPreviewUrl('');
    setFormError('');
    setShowForm(true);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openEdit = (item: FoodItem) => {
    setEditingId(item._id);
    setForm({
      title:            item.title,
      description:      item.description ?? '',
      price:            (item.price / 100).toFixed(2),
      quantity:         String(item.quantity),
      category:         item.category,
      isVeg:            item.isVeg,
      spiceLevel:       item.spiceLevel ?? 'none',
      vendorName:       item.vendorName ?? '',
      displayOrder:     item.displayOrder,
      isAvailable:      item.isAvailable,
      existingImageUrl: item.imageUrl,
      existingPublicId: item.publicId ?? '',
    });
    setSelectedFile(null);
    setPreviewUrl(item.imageUrl);
    setFormError('');
    setShowForm(true);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setSelectedFile(null);
    setPreviewUrl('');
    setFormError('');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setFormError('File size exceeds 5 MB');
      return;
    }
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setFormError('');
    if (fileRef.current) fileRef.current.value = '';
  };

  /* save */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!form.title.trim()) { setFormError('Please enter a food title.'); return; }
    if (!previewUrl && !form.existingImageUrl) { setFormError('Please upload a food image.'); return; }

    const priceDollars = Number(form.price);
    if (!Number.isFinite(priceDollars) || priceDollars < 0) {
      setFormError('Please enter a valid price.'); return;
    }
    const quantity = Number(form.quantity);
    if (!Number.isInteger(quantity) || quantity < 0) {
      setFormError('Quantity must be a whole number of 0 or more.'); return;
    }

    let finalImageUrl = form.existingImageUrl;
    let finalPublicId = form.existingPublicId;

    if (selectedFile) {
      setUploading(true);
      const fd = new FormData();
      fd.append('file', selectedFile);
      const upRes = await fetch('/api/food-items/upload', { method: 'POST', body: fd });
      const upData = await upRes.json();
      setUploading(false);
      if (!upRes.ok) { setFormError(upData.error || 'Image upload failed.'); return; }
      finalImageUrl = upData.url;
      finalPublicId = upData.publicId;
    }

    setSaving(true);
    const payload = {
      title:           form.title.trim(),
      description:     form.description.trim() || undefined,
      imageUrl:        finalImageUrl,
      publicId:        finalPublicId || undefined,
      price:           Math.round(priceDollars * 100),
      quantity,
      category:        form.category,
      isVeg:           form.isVeg,
      spiceLevel:      form.spiceLevel,
      vendorName:      form.vendorName.trim() || undefined,
      displayOrder:    form.displayOrder,
      isAvailable:     form.isAvailable,
    };

    const url    = editingId ? `/api/food-items/${editingId}` : '/api/food-items';
    const method = editingId ? 'PUT' : 'POST';
    const res    = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setSaving(false);

    if (res.ok) {
      toast.success(editingId ? 'Food item updated!' : 'Food item added!');
      closeForm();
      await fetchItems();
    } else {
      setFormError(data.error || 'Something went wrong.');
    }
  };

  /* quick actions */
  const toggleAvailable = async (item: FoodItem) => {
    const res = await fetch(`/api/food-items/${item._id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isAvailable: !item.isAvailable }),
    });
    if (res.ok) {
      setItems((prev) => prev.map((x) => (x._id === item._id ? { ...x, isAvailable: !x.isAvailable } : x)));
      toast.success(item.isAvailable ? 'Hidden from storefront' : 'Now live on the storefront');
    } else {
      toast.error('Update failed');
    }
  };

  const changeQuantity = async (item: FoodItem, quantity: number) => {
    if (!Number.isInteger(quantity) || quantity < 0) return;
    setItems((prev) => prev.map((x) => (x._id === item._id ? { ...x, quantity } : x)));
    const res = await fetch(`/api/food-items/${item._id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity }),
    });
    if (!res.ok) {
      toast.error('Could not save the new quantity');
      fetchItems();
    }
  };

  const openHistory = async (item: FoodItem) => {
    setHistoryTarget(item);
    setHistoryEntries([]);
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/food-items/${item._id}/history`);
      const data = await res.json();
      setHistoryEntries(Array.isArray(data.history) ? data.history : []);
    } catch {
      toast.error('Could not load edit history');
    } finally {
      setHistoryLoading(false);
    }
  };

  /* Share the storefront menu link via the native share sheet (WhatsApp, email, etc.). */
  const shareMenu = async () => {
    const url = `${STOREFRONT_URL}/preorder-food`;
    const text = "Check out Spice Magik's fresh food menu and preorder yours for weekend pickup!";
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: 'Spice Magik — Preorder Food', text, url });
        return;
      }
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return; // admin dismissed the share sheet
    }
    // Fallback (desktop / no Web Share support): copy the link so it can be pasted anywhere.
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Menu link copied to clipboard');
    } catch {
      window.prompt('Copy the menu link:', url);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const res = await fetch(`/api/food-items/${deleteTarget._id}`, { method: 'DELETE' });
    setDeleteTarget(null);
    if (res.ok) {
      setItems((prev) => prev.filter((x) => x._id !== deleteTarget._id));
      toast.success('Food item deleted');
    } else {
      toast.error('Delete failed');
    }
  };

  if (status === 'loading' || !session || session.user?.role !== 'admin') return null;

  const isBusy   = uploading || saving;
  const btnLabel = uploading ? 'Uploading…' : saving ? 'Saving…' : editingId ? 'Update Food Item' : 'Save Food Item';

  /* ── render ─────────────────────────────────────────────── */
  return (
    <>
      <Navbar />
      <Breadcrumb
        title="Food & Beverages"
        items={[{ label: 'Home', href: '/' }, { label: 'Admin', href: '/admin' }, { label: 'Food & Beverages' }]}
      />

      <div style={{ minHeight: '60vh', background: '#fafafa', padding: '50px 0 80px' }}>
        <div className="container">

          {/* ── Page header ─────────────────────────────── */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
            <div>
              <Link href="/admin" style={{ color: '#999', fontSize: 13, textDecoration: 'none' }}>← Back to Admin</Link>
              <h1 style={{ fontSize: 24, fontWeight: 800, color: '#222', margin: '6px 0 4px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <i className="fas fa-utensils" style={{ color: '#f59e0b', fontSize: 20 }} />
                Food &amp; Beverages
              </h1>
              <p style={{ fontSize: 13, color: '#777', margin: 0, maxWidth: 640 }}>
                Menu items vendors sell outside Clover. Customers preorder these from the storefront without paying —
                each booking reduces the quantity you set here.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                onClick={shareMenu}
                title="Share the customer menu link (WhatsApp, email, etc.)"
                style={{
                  background: '#fff', color: '#374151', border: '1.5px solid #d1d5db',
                  borderRadius: 10, padding: '12px 20px', fontSize: 14, fontWeight: 700,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                }}
              >
                <i className="fas fa-share-nodes" style={{ color: '#16a34a' }} /> Share menu link
              </button>
              {!showForm && (
                <button
                  onClick={openAdd}
                  style={{
                    background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                    color: '#fff', border: 'none', borderRadius: 10,
                    padding: '12px 24px', fontSize: 14, fontWeight: 700,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                    boxShadow: '0 4px 12px rgba(245,158,11,0.3)',
                  }}
                >
                  <i className="fas fa-plus" /> Add Food Item
                </button>
              )}
            </div>
          </div>

          {/* ── Stat strip ──────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 26 }}>
            <StatCard label="Total items"  value={stats.total}      color="#3498db" icon="fa-bowl-food" />
            <StatCard label="Live on site" value={stats.available}  color="#16a34a" icon="fa-circle-check" />
            <StatCard label="Low stock"    value={stats.lowStock}   color="#f59e0b" icon="fa-triangle-exclamation" />
            <StatCard label="Out of stock" value={stats.outOfStock} color="#E31E24" icon="fa-ban" />
          </div>

          {/* ── Add / Edit form ─────────────────────────── */}
          {showForm && (
            <div style={{
              background: '#fff', borderRadius: 16, border: '1.5px solid rgba(245,158,11,0.25)',
              boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: '28px 28px 24px', marginBottom: 28,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#222' }}>
                  {editingId ? 'Edit Food Item' : 'Add New Food Item'}
                </h3>
                <button onClick={closeForm} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#aaa', lineHeight: 1 }}>×</button>
              </div>

              {formError && (
                <div style={{ background: '#fff5f5', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', color: '#dc2626', fontSize: 13, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  {formError}
                  <button onClick={() => setFormError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 16, lineHeight: 1 }}>×</button>
                </div>
              )}

              <form onSubmit={handleSubmit}>
                <div className="row g-3">

                  {/* Image */}
                  <div className="col-12">
                    <label style={labelStyle}>Food Image *</label>
                    <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" style={{ display: 'none' }} onChange={handleFileChange} />
                    <div
                      onClick={() => fileRef.current?.click()}
                      onMouseEnter={() => setImgHover(true)}
                      onMouseLeave={() => setImgHover(false)}
                      style={{
                        border: `2px dashed ${previewUrl ? '#fcd34d' : '#d1d5db'}`,
                        borderRadius: 12, background: previewUrl ? '#fffbeb' : '#fafafa',
                        minHeight: previewUrl ? 'auto' : 120, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        position: 'relative', overflow: 'hidden', transition: 'border-color 0.2s',
                      }}
                    >
                      {previewUrl ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={previewUrl} alt="Food preview" style={{ width: '100%', maxHeight: 220, objectFit: 'contain', display: 'block', borderRadius: 10 }} />
                          {imgHover && (
                            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10 }}>
                              <span style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>
                                <i className="fas fa-camera" style={{ marginRight: 8 }} />Click to change
                              </span>
                            </div>
                          )}
                        </>
                      ) : (
                        <div style={{ textAlign: 'center', color: '#9ca3af', padding: 24 }}>
                          <i className="fas fa-cloud-upload-alt" style={{ fontSize: 32, marginBottom: 10, display: 'block' }} />
                          <span style={{ fontSize: 14, fontWeight: 500 }}>Click to select a food photo</span>
                          <p style={{ fontSize: 12, margin: '4px 0 0', color: '#bbb' }}>JPEG · PNG · WebP · GIF · Max 5 MB · Square images look best</p>
                        </div>
                      )}
                    </div>
                    {selectedFile && (
                      <p style={{ fontSize: 12, color: '#6b7280', marginTop: 6 }}>
                        <i className="fas fa-file-image" style={{ marginRight: 5 }} />
                        {selectedFile.name} ({(selectedFile.size / 1024).toFixed(0)} KB)
                        <span style={{ color: '#9ca3af', marginLeft: 6 }}>— will upload on save</span>
                      </p>
                    )}
                  </div>

                  {/* Title */}
                  <div className="col-md-6">
                    <label style={labelStyle}>Food Title *</label>
                    <input
                      type="text" placeholder="e.g. Chicken Biryani"
                      value={form.title}
                      onChange={(e) => setField('title', e.target.value)}
                      required
                      style={inputStyle}
                    />
                  </div>

                  {/* Category */}
                  <div className="col-md-6">
                    <label style={labelStyle}>Category</label>
                    <select
                      value={form.category}
                      onChange={(e) => setField('category', e.target.value as FoodCategory)}
                      style={{ ...inputStyle, appearance: 'auto' }}
                    >
                      {FOOD_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>

                  {/* Description */}
                  <div className="col-12">
                    <label style={labelStyle}>Description</label>
                    <textarea
                      rows={2}
                      placeholder="Ingredients, portion size, or anything the customer should know"
                      value={form.description}
                      onChange={(e) => setField('description', e.target.value)}
                      style={{ ...inputStyle, resize: 'vertical' }}
                    />
                  </div>

                  {/* Price */}
                  <div className="col-md-4">
                    <label style={labelStyle}>Price *</label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', fontSize: 14 }}>$</span>
                      <input
                        type="number" step="0.01" min="0" placeholder="0.00"
                        value={form.price}
                        onChange={(e) => setField('price', e.target.value)}
                        onWheel={(e) => e.currentTarget.blur()}
                        required
                        style={{ ...inputStyle, paddingLeft: 28 }}
                      />
                    </div>
                    <p style={helperStyle}>Shown to customers for reference — no payment is collected.</p>
                  </div>

                  {/* Quantity */}
                  <div className="col-md-4">
                    <label style={labelStyle}>Available Quantity *</label>
                    <input
                      type="number" min="0" step="1" placeholder="e.g. 25"
                      value={form.quantity}
                      onChange={(e) => setField('quantity', e.target.value)}
                      onWheel={(e) => e.currentTarget.blur()}
                      required
                      style={inputStyle}
                    />
                    <p style={helperStyle}>Drops automatically with every preorder. At 0 the item shows as sold out.</p>
                  </div>

                  {/* Vendor */}
                  <div className="col-md-4">
                    <label style={labelStyle}>Vendor / Kitchen</label>
                    <input
                      type="text" placeholder="e.g. Spice Magik Kitchen"
                      value={form.vendorName}
                      onChange={(e) => setField('vendorName', e.target.value)}
                      style={inputStyle}
                    />
                  </div>

                  {/* Spice level */}
                  <div className="col-md-4">
                    <label style={labelStyle}>Spice Level</label>
                    <select
                      value={form.spiceLevel}
                      onChange={(e) => setField('spiceLevel', e.target.value as SpiceLevel)}
                      style={{ ...inputStyle, appearance: 'auto' }}
                    >
                      {SPICE_LEVELS.map((s) => <option key={s} value={s}>{SPICE_LABELS[s]}</option>)}
                    </select>
                  </div>

                  {/* Display order */}
                  <div className="col-md-4">
                    <label style={labelStyle}>Display Order</label>
                    <input
                      type="number" min={0}
                      value={form.displayOrder}
                      onChange={(e) => setField('displayOrder', Number(e.target.value))}
                      onWheel={(e) => e.currentTarget.blur()}
                      style={inputStyle}
                    />
                    <p style={helperStyle}>Lower numbers appear first on the storefront.</p>
                  </div>

                  {/* Veg toggle */}
                  <div className="col-md-6">
                    <label style={labelStyle}>Diet</label>
                    <div style={{ display: 'flex', gap: 10 }}>
                      {[{ veg: true, label: 'Vegetarian', color: '#16a34a' }, { veg: false, label: 'Non-vegetarian', color: '#b91c1c' }].map((opt) => (
                        <button
                          key={opt.label}
                          type="button"
                          onClick={() => setField('isVeg', opt.veg)}
                          style={{
                            flex: 1,
                            background: form.isVeg === opt.veg ? opt.color + '14' : '#fff',
                            border: `1.5px solid ${form.isVeg === opt.veg ? opt.color : '#e5e7eb'}`,
                            color: form.isVeg === opt.veg ? opt.color : '#888',
                            borderRadius: 10, padding: '10px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                          }}
                        >
                          <i className="fas fa-circle" style={{ fontSize: 9, marginRight: 7 }} />
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Availability toggle */}
                  <div className="col-md-6">
                    <label style={labelStyle}>Visibility</label>
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', paddingTop: 8 }}
                      onClick={() => setField('isAvailable', !form.isAvailable)}
                    >
                      <div style={{
                        width: 46, height: 24, borderRadius: 12, position: 'relative',
                        background: form.isAvailable ? '#f59e0b' : '#d1d5db',
                        transition: 'background 0.2s', flexShrink: 0,
                      }}>
                        <div style={{
                          position: 'absolute', top: 3, left: form.isAvailable ? 25 : 3,
                          width: 18, height: 18, borderRadius: '50%', background: '#fff',
                          transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                        }} />
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: form.isAvailable ? '#f59e0b' : '#9ca3af' }}>
                        {form.isAvailable ? 'Available to preorder' : 'Hidden from storefront'}
                      </span>
                    </div>
                  </div>

                  {/* Buttons */}
                  <div className="col-12">
                    <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                      <button
                        type="submit" disabled={isBusy}
                        style={{
                          background: isBusy ? '#fcd34d' : 'linear-gradient(135deg, #f59e0b, #d97706)',
                          color: '#fff', border: 'none', borderRadius: 10,
                          padding: '11px 28px', fontSize: 14, fontWeight: 700,
                          cursor: isBusy ? 'not-allowed' : 'pointer',
                          display: 'flex', alignItems: 'center', gap: 8,
                        }}
                      >
                        {isBusy && <i className="fas fa-circle-notch fa-spin" />}
                        {btnLabel}
                      </button>
                      <button
                        type="button" onClick={closeForm} disabled={isBusy}
                        style={{
                          background: '#f1f5f9', color: '#555', border: 'none',
                          borderRadius: 10, padding: '11px 22px', fontSize: 14,
                          fontWeight: 600, cursor: 'pointer',
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              </form>
            </div>
          )}

          {/* ── Filters ─────────────────────────────────── */}
          {!loading && items.length > 0 && (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
              <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: 380 }}>
                <i className="fas fa-search" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#bbb', fontSize: 13 }} />
                <input
                  type="text"
                  placeholder="Search by name, description or vendor"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ ...inputStyle, paddingLeft: 38 }}
                />
              </div>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value as FoodCategory | '')}
                style={{ ...inputStyle, appearance: 'auto', width: 'auto', minWidth: 180 }}
              >
                <option value="">All categories</option>
                {FOOD_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}

          {/* ── Grid ────────────────────────────────────── */}
          {loading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 18 }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="skeleton" style={{ height: 300, borderRadius: 16 }} />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #f0f0f0', padding: '60px 20px', textAlign: 'center', color: '#aaa' }}>
              <i className="fas fa-utensils" style={{ fontSize: 40, marginBottom: 14, display: 'block', color: '#ddd' }} />
              <div style={{ fontWeight: 700, fontSize: 16, color: '#888', marginBottom: 6 }}>No food items yet</div>
              <div style={{ fontSize: 13 }}>Click <strong>Add Food Item</strong> to publish your first dish.</div>
            </div>
          ) : visible.length === 0 ? (
            <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #f0f0f0', padding: '48px 20px', textAlign: 'center', color: '#aaa', fontSize: 14 }}>
              No food items match this search.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 18 }}>
              {visible.map((item) => (
                <FoodCard
                  key={item._id}
                  item={item}
                  onEdit={() => openEdit(item)}
                  onDelete={() => setDeleteTarget(item)}
                  onToggle={() => toggleAvailable(item)}
                  onQuantityChange={(q) => changeQuantity(item, q)}
                  onHistory={() => openHistory(item)}
                />
              ))}
            </div>
          )}

        </div>
      </div>

      <Footer />

      <ConfirmModal
        open={!!deleteTarget}
        title="Delete Food Item?"
        message={`This will permanently remove "${deleteTarget?.title ?? ''}" and its image from Cloudinary. Existing preorders keep their own copy of the details. This cannot be undone.`}
        confirmLabel="Delete Item"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {historyTarget && (
        <HistoryModal
          item={historyTarget}
          entries={historyEntries}
          loading={historyLoading}
          onClose={() => setHistoryTarget(null)}
        />
      )}
    </>
  );
}

/* ══════════════════════════════════════════════════════════ */
function StatCard({ label, value, color, icon }: { label: string; value: number; color: string; icon: string }) {
  return (
    <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f0f0f0', padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ width: 42, height: 42, borderRadius: 12, background: color + '14', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <i className={`fas ${icon}`} style={{ color, fontSize: 17 }} />
      </div>
      <div>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#222', lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 12, color: '#888' }}>{label}</div>
      </div>
    </div>
  );
}

interface FoodCardProps {
  item: FoodItem;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  onQuantityChange: (quantity: number) => void;
  onHistory: () => void;
}

function FoodCard({ item, onEdit, onDelete, onToggle, onQuantityChange, onHistory }: FoodCardProps) {
  const soldOut = item.quantity === 0;
  const lowStock = !soldOut && item.quantity <= LOW_STOCK_THRESHOLD;

  return (
    <div style={{
      background: '#fff', borderRadius: 16, border: '1px solid #f0f0f0',
      boxShadow: '0 2px 12px rgba(0,0,0,0.05)', overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
      opacity: item.isAvailable ? 1 : 0.68,
    }}>
      {/* image */}
      <div style={{ position: 'relative', height: 170, background: '#f8f8f8' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.imageUrl} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        <span style={{
          position: 'absolute', top: 10, left: 10,
          background: 'rgba(255,255,255,0.94)', borderRadius: 6, padding: '3px 8px',
          fontSize: 11, fontWeight: 700, color: item.isVeg ? '#16a34a' : '#b91c1c',
          display: 'flex', alignItems: 'center', gap: 5,
        }}>
          <i className="fas fa-circle" style={{ fontSize: 8 }} />
          {item.isVeg ? 'Veg' : 'Non-veg'}
        </span>
        {soldOut && (
          <span style={{ position: 'absolute', top: 10, right: 10, background: '#E31E24', color: '#fff', borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 700 }}>
            Sold out
          </span>
        )}
        {lowStock && (
          <span style={{ position: 'absolute', top: 10, right: 10, background: '#f59e0b', color: '#fff', borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 700 }}>
            Only {item.quantity} left
          </span>
        )}
      </div>

      {/* body */}
      <div style={{ padding: '14px 16px 0', flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#222' }}>{item.title}</h3>
          <span style={{ fontSize: 16, fontWeight: 800, color: '#f59e0b', whiteSpace: 'nowrap' }}>{money(item.price)}</span>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0 0' }}>
          <Chip label={item.category} color="#3498db" />
          {item.spiceLevel !== 'none' && <Chip label={SPICE_LABELS[item.spiceLevel]} color="#e74c3c" />}
        </div>

        {item.description && (
          <p style={{ fontSize: 12.5, color: '#777', margin: '10px 0 0', lineHeight: 1.55 }}>
            {item.description.length > 110 ? `${item.description.slice(0, 110)}…` : item.description}
          </p>
        )}
        {item.vendorName && (
          <p style={{ fontSize: 11.5, color: '#999', margin: '8px 0 0' }}>
            <i className="fas fa-store" style={{ marginRight: 5 }} />{item.vendorName}
          </p>
        )}
      </div>

      {/* footer */}
      <div style={{ padding: '14px 16px', marginTop: 12, borderTop: '1px solid #f5f5f5' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <label style={{ fontSize: 12, color: '#888', fontWeight: 600 }}>Qty</label>
          <input
            type="number" min={0} step={1}
            value={item.quantity}
            onChange={(e) => onQuantityChange(Number(e.target.value))}
            onWheel={(e) => e.currentTarget.blur()}
            style={{ width: 72, padding: '6px 8px', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: 13, textAlign: 'center' }}
          />
          <button
            onClick={onToggle}
            style={{
              marginLeft: 'auto',
              background: '#fff',
              color: item.isAvailable ? '#16a34a' : '#dc2626',
              border: `1.5px solid ${item.isAvailable ? '#bbf7d0' : '#fecaca'}`,
              borderRadius: 20, padding: '4px 13px', fontSize: 11.5, fontWeight: 700,
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            {item.isAvailable ? '● Live' : '○ Hidden'}
          </button>
          <button
            onClick={onHistory}
            title="View edit history"
            style={{
              background: '#fff', color: '#8b5cf6',
              border: '1.5px solid #ede9fe', borderRadius: 8,
              width: 30, height: 26, fontSize: 12, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}
          >
            <i className="fas fa-clock-rotate-left" />
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onEdit}
            style={{ flex: 1, background: '#fff', color: '#3498db', border: '1.5px solid #bfdbfe', borderRadius: 8, padding: '7px 0', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
          >
            <i className="fas fa-edit" style={{ fontSize: 11, marginRight: 5 }} /> Edit
          </button>
          <button
            onClick={onDelete}
            style={{ flex: 1, background: '#fff', color: '#E31E24', border: '1.5px solid #fecaca', borderRadius: 8, padding: '7px 0', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
          >
            <i className="fas fa-trash" style={{ fontSize: 11, marginRight: 5 }} /> Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function Chip({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ background: color + '14', color, borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>
      {label}
    </span>
  );
}

/* ══════════════════════════════════════════════════════════ */
const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });

/** Turn a raw stored value into something readable for the history table. */
function formatHistoryValue(field: string, value: unknown): string {
  if (value === '' || value === null || value === undefined) return '—';
  switch (field) {
    case 'price':       return money(Number(value));
    case 'isVeg':       return value ? 'Vegetarian' : 'Non-vegetarian';
    case 'isAvailable': return value ? 'Available (Live)' : 'Hidden';
    case 'spiceLevel':  return SPICE_LABELS[value as SpiceLevel] ?? String(value);
    default:            return String(value);
  }
}

function HistoryValueCell({ field, value, tone }: { field: string; value: unknown; tone: 'from' | 'to' }) {
  const isEmpty = value === '' || value === null || value === undefined;
  const c = tone === 'from'
    ? { bg: '#fef2f2', border: '#fecaca', text: '#b91c1c' }
    : { bg: '#f0fdf4', border: '#bbf7d0', text: '#15803d' };

  const boxStyle: React.CSSProperties = {
    background: c.bg, border: `1px solid ${c.border}`, borderRadius: 8,
    padding: '6px 10px', fontSize: 12.5, color: c.text, wordBreak: 'break-word',
    minHeight: 32, display: 'flex', alignItems: 'center',
  };

  if (field === 'imageUrl' && !isEmpty) {
    return (
      <div style={boxStyle}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={String(value)} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6 }} />
        <span style={{ marginLeft: 8, fontSize: 11.5 }}>Image</span>
      </div>
    );
  }

  return <div style={boxStyle}>{formatHistoryValue(field, value)}</div>;
}

function HistoryModal({ item, entries, loading, onClose }: {
  item: FoodItem;
  entries: HistoryEntry[];
  loading: boolean;
  onClose: () => void;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 16, width: '100%', maxWidth: 640, maxHeight: '85vh',
          display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        {/* header */}
        <div style={{ padding: '18px 22px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#222', display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="fas fa-clock-rotate-left" style={{ color: '#8b5cf6' }} /> Edit History
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#888' }}>{item.title}</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#aaa', lineHeight: 1 }}>×</button>
        </div>

        {/* body */}
        <div style={{ padding: '18px 22px', overflowY: 'auto' }}>
          {loading ? (
            <p style={{ textAlign: 'center', color: '#aaa', fontSize: 13, padding: '30px 0' }}>
              <i className="fas fa-circle-notch fa-spin" style={{ marginRight: 8 }} />Loading history…
            </p>
          ) : entries.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#aaa', padding: '40px 0' }}>
              <i className="fas fa-clock-rotate-left" style={{ fontSize: 34, color: '#e5e7eb', display: 'block', marginBottom: 12 }} />
              <div style={{ fontSize: 14, fontWeight: 600, color: '#999' }}>No edits recorded yet</div>
              <div style={{ fontSize: 12.5, marginTop: 4 }}>Changes to this item&apos;s details will show up here.</div>
            </div>
          ) : (
            entries.map((entry) => (
              <div key={entry._id} style={{ border: '1px solid #eee', borderRadius: 12, marginBottom: 14, overflow: 'hidden' }}>
                <div style={{ padding: '10px 14px', background: '#faf9ff', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: '#555' }}>
                    <i className="fas fa-user" style={{ marginRight: 6, color: '#8b5cf6' }} />
                    {entry.editedByName || entry.editedByEmail || 'Admin'}
                  </span>
                  <span style={{ fontSize: 12, color: '#999' }}>{formatDateTime(entry.createdAt)}</span>
                </div>
                <div style={{ padding: '6px 14px 12px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 1fr', gap: 10, padding: '8px 0', fontSize: 10.5, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.3 }}>
                    <span>Field</span><span>Previous</span><span>Current</span>
                  </div>
                  {entry.changes.map((chg, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 1fr', gap: 10, alignItems: 'center', padding: '9px 0', borderTop: '1px solid #f4f4f4' }}>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: '#444' }}>{chg.label}</span>
                      <HistoryValueCell field={chg.field} value={chg.from} tone="from" />
                      <HistoryValueCell field={chg.field} value={chg.to} tone="to" />
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
