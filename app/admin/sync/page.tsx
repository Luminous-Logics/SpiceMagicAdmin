'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import Navbar from '@/app/components/Navbar';
import Breadcrumb from '@/app/components/Breadcrumb';
import Footer from '@/app/components/Footer';

interface Product {
  _id: string;
  productId: string;
  name: string;
  price: number;
  category: string;
  stock: number | null;
  totalSold: number;
  discount: number;
  isHotDeal: boolean;
  image: string;
  publicId: string;
  updatedAt: string;
  description: string;
}

const PLACEHOLDER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='56' viewBox='0 0 56 56'%3E%3Crect width='56' height='56' fill='%23f0f0f0'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-size='22' fill='%23ccc'%3E🌶%3C/text%3E%3C/svg%3E";

function StockBadge({ stock }: { stock: number | null }) {
  if (stock === null) {
    return <span style={{ background: '#f0f0f0', color: '#888', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>N/A</span>;
  }
  if (stock === 0) {
    return <span style={{ background: '#fde8e8', color: '#c0392b', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>Out</span>;
  }
  if (stock <= 5) {
    return <span style={{ background: '#fef3e2', color: '#e67e22', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{stock} left</span>;
  }
  return <span style={{ background: '#e6f9ee', color: '#1a7a3c', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{stock}</span>;
}

function UploadCell({ product, onUploaded }: { product: Product; onUploaded: (productId: string, url: string) => void }) {
  const [preview, setPreview] = useState(product.image || PLACEHOLDER);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Max file size is 2MB');
      return;
    }
    setPreview(URL.createObjectURL(file));
    setBusy(true);
    setDone(false);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('productId', product.productId);
    const res = await fetch('/api/upload-image', { method: 'POST', body: fd });
    const data = await res.json();
    setBusy(false);
    if (res.ok) {
      setPreview(data.url);
      onUploaded(product.productId, data.url);
      setDone(true);
      toast.success('Image uploaded!');
    } else {
      toast.error(data.error || 'Upload failed');
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={preview}
        alt={product.name}
        width={56}
        height={56}
        style={{ borderRadius: 8, objectFit: 'cover', border: '1px solid #eee', background: '#fafafa', flexShrink: 0 }}
        onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER; }}
      />
      <div>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          style={{
            background: '#f0fce8',
            color: busy ? '#aaa' : '#4a7c10',
            border: '1px solid #c5e8a0',
            borderRadius: 7,
            padding: '5px 12px',
            fontSize: 12,
            fontWeight: 600,
            cursor: busy ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
          }}
        >
          {busy ? <i className="fas fa-circle-notch fa-spin" style={{ fontSize: 11 }} /> : <i className="fas fa-cloud-upload-alt" style={{ fontSize: 11 }} />}
          {busy ? 'Uploading…' : product.image ? 'Replace' : 'Upload'}
        </button>
        {done && <div style={{ fontSize: 11, color: '#27ae60', marginTop: 3 }}>✓ Image set</div>}
      </div>
    </div>
  );
}

function DiscountCell({ product, onSaved }: { product: Product; onSaved: (productId: string, discount: number, isHotDeal: boolean) => void }) {
  const [discount, setDiscount] = useState(product.discount);
  const [isHotDeal, setIsHotDeal] = useState(product.isHotDeal);
  const [saving, setSaving] = useState(false);

  const dirty = discount !== product.discount || isHotDeal !== product.isHotDeal;
  const finalPrice = Math.round(product.price * (1 - discount / 100));

  const save = async () => {
    setSaving(true);
    const res = await fetch(`/api/products/${product.productId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ discount, isHotDeal }),
    });
    setSaving(false);
    if (res.ok) {
      onSaved(product.productId, discount, isHotDeal);
      toast.success('Saved!');
    } else {
      toast.error('Save failed');
    }
  };

  return (
    <div style={{ minWidth: 180 }}>
      {/* Price preview */}
      <div style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, color: discount > 0 ? '#E31E24' : '#222', fontSize: 13 }}>
          ${(finalPrice / 100).toFixed(2)}
        </span>
        {discount > 0 && (
          <>
            <span style={{ textDecoration: 'line-through', color: '#bbb', fontSize: 12 }}>
              ${(product.price / 100).toFixed(2)}
            </span>
            <span style={{ background: '#fef3e2', color: '#e67e22', borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>
              -{discount}%
            </span>
          </>
        )}
      </div>
      {/* Discount input */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', border: `1px solid ${dirty ? '#f0c040' : '#ddd'}`, borderRadius: 7, overflow: 'hidden', background: dirty ? '#fffbea' : '#fff' }}>
          <input
            type="number"
            value={discount}
            min={0}
            max={90}
            onChange={(e) => setDiscount(Math.min(90, Math.max(0, Number(e.target.value))))}
            style={{ width: 48, padding: '4px 6px', border: 'none', outline: 'none', fontSize: 13, background: 'transparent' }}
          />
          <span style={{ padding: '4px 8px', background: '#f5f5f5', fontSize: 12, color: '#666', borderLeft: '1px solid #ddd' }}>%</span>
        </div>
        <button
          onClick={() => { setIsHotDeal(!isHotDeal); }}
          title="Toggle Hot Deal"
          style={{
            background: isHotDeal ? '#fde8e8' : '#fafafa',
            color: isHotDeal ? '#E31E24' : '#888',
            border: `1px solid ${isHotDeal ? '#f5c6cb' : '#ddd'}`,
            borderRadius: 7,
            padding: '4px 10px',
            fontSize: 13,
            cursor: 'pointer',
            fontWeight: isHotDeal ? 700 : 400,
          }}
        >
          🔥
        </button>
        {dirty && (
          <button
            onClick={save}
            disabled={saving}
            style={{
              background: '#E31E24',
              color: '#fff',
              border: 'none',
              borderRadius: 7,
              padding: '4px 10px',
              fontSize: 12,
              fontWeight: 700,
              cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? '…' : 'Save'}
          </button>
        )}
      </div>
    </div>
  );
}

function DescriptionCell({ product, onSaved }: { product: Product; onSaved: (productId: string, description: string) => void }) {
  const [localDesc, setLocalDesc] = useState(product.description || '');
  const [editing, setEditing]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setLocalDesc(product.description || '');
    setEditing(false);
  }, [product.description]);

  useEffect(() => {
    if (editing && textareaRef.current) textareaRef.current.focus();
  }, [editing]);

  const save = async () => {
    setSaving(true);
    const res = await fetch(`/api/products/${product.productId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: localDesc }),
    });
    setSaving(false);
    if (res.ok) {
      onSaved(product.productId, localDesc);
      toast.success('Description saved!');
      setEditing(false);
    } else {
      const d = await res.json();
      toast.error(d.error || 'Save failed');
    }
  };

  const GREEN = '#76a713';

  if (editing) {
    return (
      <div style={{ minWidth: 180 }}>
        <textarea
          ref={textareaRef}
          rows={4}
          value={localDesc}
          onChange={e => setLocalDesc(e.target.value)}
          style={{
            width: '100%', fontSize: 12, border: `1.5px solid ${GREEN}`,
            borderRadius: 7, padding: '6px 8px', resize: 'vertical',
            outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
            lineHeight: 1.5,
          }}
        />
        <div style={{ display: 'flex', gap: 6, marginTop: 5 }}>
          <button
            onClick={save} disabled={saving}
            style={{
              background: saving ? '#aaa' : `linear-gradient(135deg, #76a713, #5a8010)`,
              color: '#fff', border: 'none', borderRadius: 6,
              padding: '4px 12px', fontSize: 11, fontWeight: 700,
              cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? <i className="fas fa-circle-notch fa-spin" /> : 'Save'}
          </button>
          <button
            onClick={() => { setLocalDesc(product.description || ''); setEditing(false); }}
            style={{ background: '#f1f5f9', color: '#555', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minWidth: 160, cursor: 'pointer' }} onClick={() => setEditing(true)}>
      {localDesc ? (
        <div style={{
          fontSize: 11, color: '#555', lineHeight: 1.5, marginBottom: 4,
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {localDesc}
        </div>
      ) : (
        <div style={{ fontSize: 11, color: '#bbb', fontStyle: 'italic', marginBottom: 4 }}>
          No description — click to add
        </div>
      )}
      <span style={{ fontSize: 10, color: GREEN, fontWeight: 600 }}>✎ Edit</span>
    </div>
  );
}

export default function SyncPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ upserted: number; unchanged: number; total: number; errors: string[] } | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (status === 'loading') return;
    if (!session || session.user?.role !== 'admin') router.replace('/login');
  }, [session, status, router]);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/products?limit=500');
    const data = await res.json();
    setProducts(data.products || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (session?.user?.role === 'admin') fetchProducts();
  }, [session, fetchProducts]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    const res = await fetch('/api/products/sync', { method: 'POST' });
    const data = await res.json();
    setSyncing(false);
    setSyncResult(data);
    await fetchProducts();
    toast.success(`Sync done! ${data.upserted} upserted, ${data.unchanged} unchanged`);
  };

  const filtered = products.filter((p) => {
    const q = search.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.category?.toLowerCase().includes(q) || p.productId?.toLowerCase().includes(q);
  });

  const handleUploaded = (productId: string, url: string) => {
    setProducts((prev) => prev.map((p) => p.productId === productId ? { ...p, image: url } : p));
  };

  const handleDiscountSaved = (productId: string, discount: number, isHotDeal: boolean) => {
    setProducts((prev) => prev.map((p) => p.productId === productId ? { ...p, discount, isHotDeal } : p));
  };

  const handleDescriptionSaved = (productId: string, description: string) => {
    setProducts((prev) => prev.map((p) => p.productId === productId ? { ...p, description } : p));
  };

  if (status === 'loading' || !session || session.user?.role !== 'admin') return null;

  return (
    <>
      <Navbar />
      <Breadcrumb title="Sync Items & Upload Images" items={[{ label: 'Home', href: '/' }, { label: 'Admin', href: '/admin' }, { label: 'Sync Items' }]} />
      <div style={{ minHeight: '60vh', padding: '50px 0 80px' }}>
        <div className="container">
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 28 }}>
            <div>
              <Link href="/admin" style={{ color: '#999', fontSize: 13, textDecoration: 'none' }}>← Back to Admin</Link>
              <h1 style={{ fontSize: 24, fontWeight: 800, color: '#222', margin: '6px 0 4px' }}>Sync Items & Upload Images</h1>
              <p style={{ fontSize: 13, color: '#777', margin: 0 }}>
                {loading ? 'Loading…' : `${products.length} products in database`}
              </p>
            </div>
            <button
              onClick={handleSync}
              disabled={syncing}
              style={{
                background: syncing ? '#bbb' : '#76a713',
                color: '#fff',
                border: 'none',
                borderRadius: 10,
                padding: '12px 24px',
                fontSize: 14,
                fontWeight: 700,
                cursor: syncing ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                boxShadow: syncing ? 'none' : '0 4px 12px rgba(118,167,19,0.3)',
              }}
            >
              <i className={`fas fa-rotate ${syncing ? 'fa-spin' : ''}`} />
              {syncing ? 'Syncing…' : 'Sync from Clover'}
            </button>
          </div>

          {/* Sync result banner */}
          {syncResult && (
            <div style={{
              background: '#e6f9ee', border: '1px solid #a8e6c3', borderRadius: 8, padding: '12px 16px', color: '#1a7a3c', fontSize: 14, marginBottom: 20,
              display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center',
            }}>
              <span>✓ Sync complete</span>
              <span>Upserted: <strong>{syncResult.upserted}</strong></span>
              <span>Unchanged: <strong>{syncResult.unchanged}</strong></span>
              <span>Total: <strong>{syncResult.total}</strong></span>
              {syncResult.errors?.length > 0 && <span style={{ color: '#c0392b' }}>Errors: {syncResult.errors.length}</span>}
            </div>
          )}

          {/* Search */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ position: 'relative', maxWidth: 380 }}>
              <i className="fas fa-search" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#bbb', fontSize: 14 }} />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, category, or ID…"
                style={{ width: '100%', padding: '10px 12px 10px 36px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
          </div>

          {/* Desktop Table */}
          <div className="d-none d-md-block" style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid #eee', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
              <thead>
                <tr style={{ background: '#fafafa', borderBottom: '2px solid #eee' }}>
                  {['#', 'Image & Upload', 'Name', 'Category', 'Stock', 'Sold', 'Discount / Price / 🔥', 'Description', 'Updated'].map((h) => (
                    <th key={h} style={{ padding: '10px 14px', fontWeight: 700, fontSize: 12, color: '#555', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                        {Array.from({ length: 9 }).map((__, j) => (
                          <td key={j} style={{ padding: '12px 14px' }}>
                            <div className="skeleton" style={{ height: 16, width: j === 1 ? 56 : '70%' }} />
                          </td>
                        ))}
                      </tr>
                    ))
                  : filtered.map((p, i) => (
                      <tr key={p._id} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                        <td style={{ padding: '12px 14px', fontSize: 13, color: '#aaa', fontWeight: 600 }}>{i + 1}</td>
                        <td style={{ padding: '12px 14px' }}>
                          <UploadCell product={p} onUploaded={handleUploaded} />
                        </td>
                        <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 600, color: '#222', maxWidth: 200 }}>
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                          <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{p.productId}</div>
                        </td>
                        <td style={{ padding: '12px 14px', fontSize: 13, color: '#666' }}>{p.category || '—'}</td>
                        <td style={{ padding: '12px 14px' }}><StockBadge stock={p.stock} /></td>
                        <td style={{ padding: '12px 14px', fontSize: 13, color: '#666' }}>{p.totalSold}</td>
                        <td style={{ padding: '12px 14px' }}>
                          <DiscountCell product={p} onSaved={handleDiscountSaved} />
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <DescriptionCell product={p} onSaved={handleDescriptionSaved} />
                        </td>
                        <td style={{ padding: '12px 14px', fontSize: 12, color: '#aaa', whiteSpace: 'nowrap' }}>
                          {p.updatedAt ? new Date(p.updatedAt).toLocaleDateString() : '—'}
                        </td>
                      </tr>
                    ))}
                {!loading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={9} style={{ padding: '40px', textAlign: 'center', color: '#aaa' }}>
                      <i className="fas fa-box-open" style={{ fontSize: 32, marginBottom: 12, display: 'block' }} />
                      No products found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="d-md-none">
            {loading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="skeleton" style={{ height: 120, borderRadius: 12, marginBottom: 12 }} />
                ))
              : filtered.map((p) => (
                  <div key={p._id} style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: 16, marginBottom: 12, boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}>
                    <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.image || PLACEHOLDER} alt={p.name} width={56} height={56} style={{ borderRadius: 8, objectFit: 'cover', border: '1px solid #eee', flexShrink: 0 }} onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER; }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: '#222', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                        <div style={{ fontSize: 11, color: '#aaa' }}>{p.category} · {p.productId}</div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'center' }}>
                          <StockBadge stock={p.stock} />
                          <span style={{ fontSize: 12, color: '#888' }}>Sold: {p.totalSold}</span>
                        </div>
                      </div>
                    </div>
                    <UploadCell product={p} onUploaded={handleUploaded} />
                    <div style={{ marginTop: 12 }}>
                      <DiscountCell product={p} onSaved={handleDiscountSaved} />
                    </div>
                    <div style={{ marginTop: 12, borderTop: '1px solid #f0f0f0', paddingTop: 10 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#444', marginBottom: 5 }}>Description</div>
                      <DescriptionCell product={p} onSaved={handleDescriptionSaved} />
                    </div>
                  </div>
                ))}
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}
