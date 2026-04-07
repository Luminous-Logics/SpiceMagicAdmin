'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import Navbar from '@/app/components/Navbar';
import Breadcrumb from '@/app/components/Breadcrumb';
import Footer from '@/app/components/Footer';

interface Category {
  _id: string;
  cloverCategoryId: string;
  name: string;
  image: string;
  publicId: string;
  isFeatured: boolean;
  sortOrder: number;
  lastSyncedAt: string | null;
}

const PLACEHOLDER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='56' viewBox='0 0 56 56'%3E%3Crect width='56' height='56' fill='%23f0f0f0'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-size='22' fill='%23ccc'%3E🏷️%3C/text%3E%3C/svg%3E";

function UploadCell({ category, onUploaded }: { category: Category; onUploaded: (id: string, url: string) => void }) {
  const [preview, setPreview] = useState(category.image || PLACEHOLDER);
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
    fd.append('categoryId', category.cloverCategoryId);
    const res = await fetch('/api/categories/upload-image', { method: 'POST', body: fd });
    const data = await res.json();
    setBusy(false);
    if (res.ok) {
      setPreview(data.url);
      onUploaded(category.cloverCategoryId, data.url);
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
        alt={category.name}
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
          {busy ? <i className="fas fa-circle-notch fa-spin" style={{ fontSize: 11 }} /> : <i className="fas fa-camera" style={{ fontSize: 11 }} />}
          {busy ? 'Uploading…' : category.image ? 'Replace' : 'Upload'}
        </button>
        {done && <div style={{ fontSize: 11, color: '#27ae60', marginTop: 3 }}>✓ Image set</div>}
      </div>
    </div>
  );
}

function FeaturedToggle({ category, onToggled }: { category: Category; onToggled: (id: string, val: boolean) => void }) {
  const [featured, setFeatured] = useState(category.isFeatured);
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    setBusy(true);
    const res = await fetch(`/api/categories/${category.cloverCategoryId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isFeatured: !featured }),
    });
    setBusy(false);
    if (res.ok) {
      setFeatured(!featured);
      onToggled(category.cloverCategoryId, !featured);
      toast.success(featured ? 'Removed from featured' : 'Marked as featured!');
    } else {
      toast.error('Failed to update');
    }
  };

  return (
    <button
      onClick={toggle}
      disabled={busy}
      style={{
        background: featured ? '#fffde7' : '#fafafa',
        color: featured ? '#f59c00' : '#aaa',
        border: `1px solid ${featured ? '#ffe082' : '#ddd'}`,
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
      {busy ? <i className="fas fa-circle-notch fa-spin" style={{ fontSize: 11 }} /> : (featured ? '⭐' : '☆')}
      {featured ? 'Featured' : 'Feature'}
    </button>
  );
}

export default function CategoriesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ upserted: number; updated: number; total: number } | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (status === 'loading') return;
    if (!session || session.user?.role !== 'admin') router.replace('/login');
  }, [session, status, router]);

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/categories');
    const data = await res.json();
    setCategories(data.data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (session?.user?.role === 'admin') fetchCategories();
  }, [session, fetchCategories]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    const res = await fetch('/api/categories/sync', { method: 'POST' });
    const data = await res.json();
    setSyncing(false);
    setSyncResult(data);
    await fetchCategories();
    toast.success(`Sync done! ${data.upserted} upserted`);
  };

  const handleUploaded = (id: string, url: string) => {
    setCategories((prev) => prev.map((c) => c.cloverCategoryId === id ? { ...c, image: url } : c));
  };

  const handleToggled = (id: string, val: boolean) => {
    setCategories((prev) => prev.map((c) => c.cloverCategoryId === id ? { ...c, isFeatured: val } : c));
  };

  const filtered = categories.filter((c) => {
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q) || c.cloverCategoryId.toLowerCase().includes(q);
  });

  if (status === 'loading' || !session || session.user?.role !== 'admin') return null;

  return (
    <>
      <Navbar />
      <Breadcrumb title="Categories" items={[{ label: 'Home', href: '/' }, { label: 'Admin', href: '/admin' }, { label: 'Categories' }]} />
      <div style={{ minHeight: '60vh', padding: '50px 0 80px' }}>
        <div className="container">
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 28 }}>
            <div>
              <Link href="/admin" style={{ color: '#999', fontSize: 13, textDecoration: 'none' }}>← Back to Admin</Link>
              <h1 style={{ fontSize: 24, fontWeight: 800, color: '#222', margin: '6px 0 4px' }}>Categories</h1>
              <p style={{ fontSize: 13, color: '#777', margin: 0 }}>
                {loading ? 'Loading…' : `${categories.length} categories`}
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

          {syncResult && (
            <div style={{ background: '#e6f9ee', border: '1px solid #a8e6c3', borderRadius: 8, padding: '12px 16px', color: '#1a7a3c', fontSize: 14, marginBottom: 20, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              <span>✓ Sync complete</span>
              <span>Upserted: <strong>{syncResult.upserted}</strong></span>
              <span>Updated: <strong>{syncResult.updated}</strong></span>
              <span>Total: <strong>{syncResult.total}</strong></span>
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
                placeholder="Search by name or Clover ID…"
                style={{ width: '100%', padding: '10px 12px 10px 36px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
          </div>

          {/* Table */}
          <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid #eee', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
              <thead>
                <tr style={{ background: '#fafafa', borderBottom: '2px solid #eee' }}>
                  {['#', 'Image & Upload', 'Name', 'Clover ID', 'Last Synced', 'Featured'].map((h) => (
                    <th key={h} style={{ padding: '10px 14px', fontWeight: 700, fontSize: 12, color: '#555', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                        {Array.from({ length: 6 }).map((__, j) => (
                          <td key={j} style={{ padding: '12px 14px' }}>
                            <div className="skeleton" style={{ height: 16, width: j === 1 ? 56 : '70%' }} />
                          </td>
                        ))}
                      </tr>
                    ))
                  : filtered.map((c, i) => (
                      <tr key={c._id} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                        <td style={{ padding: '12px 14px', fontSize: 13, color: '#aaa', fontWeight: 600 }}>{i + 1}</td>
                        <td style={{ padding: '12px 14px' }}>
                          <UploadCell category={c} onUploaded={handleUploaded} />
                        </td>
                        <td style={{ padding: '12px 14px', fontSize: 14, fontWeight: 600, color: '#222' }}>{c.name}</td>
                        <td style={{ padding: '12px 14px', fontSize: 12, color: '#888', fontFamily: 'monospace' }}>{c.cloverCategoryId}</td>
                        <td style={{ padding: '12px 14px', fontSize: 12, color: '#aaa' }}>
                          {c.lastSyncedAt ? new Date(c.lastSyncedAt).toLocaleDateString() : 'Never'}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <FeaturedToggle category={c} onToggled={handleToggled} />
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
            {!loading && filtered.length === 0 && (
              <div style={{ padding: '40px', textAlign: 'center', color: '#aaa' }}>
                <i className="fas fa-tags" style={{ fontSize: 32, marginBottom: 12, display: 'block' }} />
                No categories found. Try syncing from Clover.
              </div>
            )}
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}
