'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import Navbar from '@/app/components/Navbar';
import Breadcrumb from '@/app/components/Breadcrumb';
import Footer from '@/app/components/Footer';
import ConfirmModal from '@/app/components/ConfirmModal';

/* ── constants ──────────────────────────────────────────── */
const BANNER_SECTIONS = [
  'HERO', 'HOT_DEALS', 'LATEST_PRODUCTS', 'BEST_SELLERS', 'CATEGORY_BANNER', 'OFFER_STRIP',
] as const;
type BannerSection = typeof BANNER_SECTIONS[number];

const SECTION_LABELS: Record<BannerSection, string> = {
  HERO:            'Hero Section',
  HOT_DEALS:       'Hot Deals',
  LATEST_PRODUCTS: 'Latest Products',
  BEST_SELLERS:    'Best Sellers',
  CATEGORY_BANNER: 'Category Banner',
  OFFER_STRIP:     'Offer Strip',
};

const SECTION_BADGE_COLORS: Record<BannerSection, string> = {
  HERO:            '#3498db',
  HOT_DEALS:       '#e74c3c',
  LATEST_PRODUCTS: '#2ecc71',
  BEST_SELLERS:    '#f39c12',
  CATEGORY_BANNER: '#9b59b6',
  OFFER_STRIP:     '#1abc9c',
};

/* ── types ───────────────────────────────────────────────── */
interface Banner {
  _id: string;
  title?: string;
  subtitle?: string;
  imageUrl: string;
  publicId?: string;
  section: BannerSection;
  redirectUrl?: string;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
}

interface FormState {
  section: BannerSection | '';
  title: string;
  subtitle: string;
  redirectUrl: string;
  displayOrder: number;
  isActive: boolean;
  existingImageUrl: string;
  existingPublicId: string;
}

const EMPTY_FORM: FormState = {
  section: '', title: '', subtitle: '', redirectUrl: '',
  displayOrder: 0, isActive: true, existingImageUrl: '', existingPublicId: '',
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

/* ══════════════════════════════════════════════════════════ */
export default function BannersPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [banners, setBanners]         = useState<Banner[]>([]);
  const [loading, setLoading]         = useState(true);
  const [showForm, setShowForm]       = useState(false);
  const [editingId, setEditingId]     = useState<string | null>(null);
  const [form, setForm]               = useState<FormState>(EMPTY_FORM);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl]   = useState('');
  const [uploading, setUploading]     = useState(false);
  const [saving, setSaving]           = useState(false);
  const [formError, setFormError]     = useState('');
  const [imgHover, setImgHover]       = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Banner | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  /* auth guard */
  useEffect(() => {
    if (status === 'loading') return;
    if (!session || session.user?.role !== 'admin') router.replace('/login');
  }, [session, status, router]);

  /* fetch */
  const fetchBanners = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/banners/all');
      const data = await res.json();
      setBanners(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Failed to load banners');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session?.user?.role === 'admin') fetchBanners();
  }, [session, fetchBanners]);

  /* helpers */
  const setField = <K extends keyof FormState>(key: K, val: FormState[K]) =>
    setForm(prev => ({ ...prev, [key]: val }));

  const openAdd = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setSelectedFile(null);
    setPreviewUrl('');
    setFormError('');
    setShowForm(true);
  };

  const openEdit = (b: Banner) => {
    setEditingId(b._id);
    setForm({
      section:          b.section,
      title:            b.title        || '',
      subtitle:         b.subtitle     || '',
      redirectUrl:      b.redirectUrl  || '',
      displayOrder:     b.displayOrder,
      isActive:         b.isActive,
      existingImageUrl: b.imageUrl,
      existingPublicId: b.publicId     || '',
    });
    setSelectedFile(null);
    setPreviewUrl(b.imageUrl);
    setFormError('');
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setSelectedFile(null);
    setPreviewUrl('');
    setFormError('');
  };

  /* file selection */
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

    if (!form.section) { setFormError('Please select a section.'); return; }
    if (!previewUrl && !form.existingImageUrl) {
      setFormError('Please upload a banner image.'); return;
    }

    let finalImageUrl = form.existingImageUrl;
    let finalPublicId = form.existingPublicId;

    if (selectedFile) {
      setUploading(true);
      const fd = new FormData();
      fd.append('file', selectedFile);
      const upRes = await fetch('/api/banners/upload', { method: 'POST', body: fd });
      const upData = await upRes.json();
      setUploading(false);
      if (!upRes.ok) { setFormError(upData.error || 'Image upload failed.'); return; }
      finalImageUrl = upData.url;
      finalPublicId = upData.publicId;
    }

    setSaving(true);
    const payload = {
      imageUrl:     finalImageUrl,
      publicId:     finalPublicId  || undefined,
      section:      form.section,
      title:        form.title     || undefined,
      subtitle:     form.subtitle  || undefined,
      redirectUrl:  form.redirectUrl || undefined,
      displayOrder: form.displayOrder,
      isActive:     form.isActive,
    };

    const url    = editingId ? `/api/banners/${editingId}` : '/api/banners';
    const method = editingId ? 'PUT' : 'POST';
    const res    = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data   = await res.json();
    setSaving(false);

    if (res.ok) {
      toast.success(editingId ? 'Banner updated!' : 'Banner created!');
      closeForm();
      await fetchBanners();
    } else {
      setFormError(data.error || 'Something went wrong.');
    }
  };

  /* toggle active */
  const toggleActive = async (b: Banner) => {
    const res = await fetch(`/api/banners/${b._id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !b.isActive }),
    });
    if (res.ok) {
      setBanners(prev => prev.map(x => x._id === b._id ? { ...x, isActive: !x.isActive } : x));
      toast.success(b.isActive ? 'Banner hidden' : 'Banner activated');
    }
  };

  /* delete */
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const res = await fetch(`/api/banners/${deleteTarget._id}`, { method: 'DELETE' });
    setDeleteTarget(null);
    if (res.ok) {
      setBanners(prev => prev.filter(x => x._id !== deleteTarget._id));
      toast.success('Banner deleted');
    } else {
      toast.error('Delete failed');
    }
  };

  if (status === 'loading' || !session || session.user?.role !== 'admin') return null;

  const isBusy   = uploading || saving;
  const btnLabel = uploading ? 'Uploading…' : saving ? 'Saving…' : editingId ? 'Update Banner' : 'Save Banner';

  /* ── render ─────────────────────────────────────────────── */
  return (
    <>
      <Navbar />
      <Breadcrumb
        title="Banner Management"
        items={[{ label: 'Home', href: '/' }, { label: 'Admin', href: '/admin' }, { label: 'Banners' }]}
      />

      <div style={{ minHeight: '60vh', background: '#fafafa', padding: '50px 0 80px' }}>
        <div className="container">

          {/* ── Page header ─────────────────────────────── */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 28 }}>
            <div>
              <Link href="/admin" style={{ color: '#999', fontSize: 13, textDecoration: 'none' }}>← Back to Admin</Link>
              <h1 style={{ fontSize: 24, fontWeight: 800, color: '#222', margin: '6px 0 4px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <i className="fas fa-images" style={{ color: '#E31E24', fontSize: 20 }} />
                Banner Management
              </h1>
              <p style={{ fontSize: 13, color: '#777', margin: 0 }}>
                Upload and manage promotional banners for each section of the site.
              </p>
            </div>
            {!showForm && (
              <button
                onClick={openAdd}
                style={{
                  background: 'linear-gradient(135deg, #e74c3c, #E31E24)',
                  color: '#fff', border: 'none', borderRadius: 10,
                  padding: '12px 24px', fontSize: 14, fontWeight: 700,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                  boxShadow: '0 4px 12px rgba(227,30,36,0.3)',
                }}
              >
                <i className="fas fa-plus" /> Add Banner
              </button>
            )}
          </div>

          {/* ── Add / Edit form ─────────────────────────── */}
          {showForm && (
            <div style={{
              background: '#fff', borderRadius: 16, border: '1.5px solid rgba(227,30,36,0.15)',
              boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: '28px 28px 24px', marginBottom: 28,
            }}>
              {/* form header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#222' }}>
                  {editingId ? 'Edit Banner' : 'Add New Banner'}
                </h3>
                <button onClick={closeForm} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#aaa', lineHeight: 1 }}>×</button>
              </div>

              {/* error */}
              {formError && (
                <div style={{ background: '#fff5f5', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', color: '#dc2626', fontSize: 13, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  {formError}
                  <button onClick={() => setFormError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 16, lineHeight: 1 }}>×</button>
                </div>
              )}

              <form onSubmit={handleSubmit}>
                <div className="row g-3">

                  {/* ── Image upload ────────────────────── */}
                  <div className="col-12">
                    <label style={labelStyle}>Banner Image *</label>
                    <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" style={{ display: 'none' }} onChange={handleFileChange} />

                    <div
                      onClick={() => fileRef.current?.click()}
                      onMouseEnter={() => setImgHover(true)}
                      onMouseLeave={() => setImgHover(false)}
                      style={{
                        border: `2px dashed ${previewUrl ? '#c7d2fe' : '#d1d5db'}`,
                        borderRadius: 12, background: previewUrl ? '#f8faff' : '#fafafa',
                        minHeight: previewUrl ? 'auto' : 120, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        position: 'relative', overflow: 'hidden', transition: 'border-color 0.2s',
                      }}
                    >
                      {previewUrl ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={previewUrl}
                            alt="Banner preview"
                            style={{ width: '100%', maxHeight: 200, objectFit: 'contain', display: 'block', borderRadius: 10 }}
                          />
                          {imgHover && (
                            <div style={{
                              position: 'absolute', inset: 0,
                              background: 'rgba(0,0,0,0.55)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              borderRadius: 10,
                            }}>
                              <span style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>
                                <i className="fas fa-camera" style={{ marginRight: 8 }} />Click to change
                              </span>
                            </div>
                          )}
                        </>
                      ) : (
                        <div style={{ textAlign: 'center', color: '#9ca3af', padding: 24 }}>
                          <i className="fas fa-cloud-upload-alt" style={{ fontSize: 32, marginBottom: 10, display: 'block' }} />
                          <span style={{ fontSize: 14, fontWeight: 500 }}>Click to select banner image</span>
                          <p style={{ fontSize: 12, margin: '4px 0 0', color: '#bbb' }}>JPEG · PNG · WebP · GIF · Max 5 MB</p>
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

                  {/* ── Section ─────────────────────────── */}
                  <div className="col-md-4">
                    <label style={labelStyle}>Section *</label>
                    <select
                      value={form.section}
                      onChange={e => setField('section', e.target.value as BannerSection)}
                      required
                      style={{ ...inputStyle, appearance: 'auto' }}
                    >
                      <option value="">— Select section —</option>
                      {BANNER_SECTIONS.map(s => (
                        <option key={s} value={s}>{SECTION_LABELS[s]}</option>
                      ))}
                    </select>
                  </div>

                  {/* ── Display order ────────────────────── */}
                  <div className="col-md-2">
                    <label style={labelStyle}>Display Order</label>
                    <input
                      type="number" min={0}
                      value={form.displayOrder}
                      onChange={e => setField('displayOrder', Number(e.target.value))}
                      style={inputStyle}
                    />
                    <p style={{ fontSize: 11, color: '#9ca3af', margin: '4px 0 0' }}>Lower = shown first</p>
                  </div>

                  {/* ── Title ───────────────────────────── */}
                  <div className="col-md-6">
                    <label style={labelStyle}>Title (optional)</label>
                    <input
                      type="text" placeholder="e.g. Summer Sale"
                      value={form.title}
                      onChange={e => setField('title', e.target.value)}
                      style={inputStyle}
                    />
                  </div>

                  {/* ── Subtitle ────────────────────────── */}
                  <div className="col-md-6">
                    <label style={labelStyle}>Subtitle (optional)</label>
                    <input
                      type="text" placeholder="e.g. Up to 40% off selected spices"
                      value={form.subtitle}
                      onChange={e => setField('subtitle', e.target.value)}
                      style={inputStyle}
                    />
                  </div>

                  {/* ── Redirect URL ────────────────────── */}
                  <div className="col-md-6">
                    <label style={labelStyle}>Redirect URL (optional)</label>
                    <input
                      type="text" placeholder="/shop?category=Vegetables"
                      value={form.redirectUrl}
                      onChange={e => setField('redirectUrl', e.target.value)}
                      style={inputStyle}
                    />
                  </div>

                  {/* ── Active toggle ───────────────────── */}
                  <div className="col-md-6" style={{ display: 'flex', alignItems: 'center' }}>
                    <div style={{ paddingTop: 20 }}>
                      <label style={labelStyle}>Visibility</label>
                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
                        onClick={() => setField('isActive', !form.isActive)}
                      >
                        {/* toggle track */}
                        <div style={{
                          width: 46, height: 24, borderRadius: 12, position: 'relative',
                          background: form.isActive ? '#E31E24' : '#d1d5db',
                          transition: 'background 0.2s', flexShrink: 0,
                        }}>
                          <div style={{
                            position: 'absolute', top: 3,
                            left: form.isActive ? 25 : 3,
                            width: 18, height: 18, borderRadius: '50%',
                            background: '#fff', transition: 'left 0.2s',
                            boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                          }} />
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 600, color: form.isActive ? '#E31E24' : '#9ca3af' }}>
                          {form.isActive ? 'Visible on site' : 'Hidden'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* ── Buttons ─────────────────────────── */}
                  <div className="col-12">
                    <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                      <button
                        type="submit" disabled={isBusy}
                        style={{
                          background: isBusy ? '#f5a0a3' : 'linear-gradient(135deg, #e74c3c, #E31E24)',
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

          {/* ── Table ───────────────────────────────────── */}
          <div style={{
            background: '#fff', borderRadius: 16, border: '1px solid #f0f0f0',
            boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden',
          }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#fafafa', borderBottom: '2px solid #eee' }}>
                    {['Preview', 'Section', 'Title / Redirect', 'Order', 'Status', 'Actions'].map(h => (
                      <th key={h} style={{ padding: '12px 16px', fontWeight: 700, fontSize: 12, color: '#555', textAlign: 'left', whiteSpace: 'nowrap' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading
                    ? Array.from({ length: 4 }).map((_, i) => (
                        <tr key={i}>
                          {Array.from({ length: 6 }).map((__, j) => (
                            <td key={j} style={{ padding: '14px 16px' }}>
                              <div className="skeleton" style={{ height: j === 0 ? 56 : 16, width: j === 0 ? 100 : '70%', borderRadius: j === 0 ? 8 : 4 }} />
                            </td>
                          ))}
                        </tr>
                      ))
                    : banners.map((b, i) => (
                        <tr
                          key={b._id}
                          style={{ background: i % 2 === 0 ? '#fff' : '#fafafa', borderBottom: '1px solid #f0f0f0' }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#fff9f9')}
                          onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? '#fff' : '#fafafa')}
                        >
                          {/* Preview */}
                          <td style={{ padding: '12px 16px' }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={b.imageUrl}
                              alt={b.title || b.section}
                              style={{ width: 100, height: 56, objectFit: 'cover', borderRadius: 8, border: '1px solid #eee', display: 'block' }}
                            />
                          </td>

                          {/* Section badge */}
                          <td style={{ padding: '12px 16px' }}>
                            <span style={{
                              background: SECTION_BADGE_COLORS[b.section] + '18',
                              color: SECTION_BADGE_COLORS[b.section],
                              borderRadius: 20, padding: '4px 12px',
                              fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
                            }}>
                              {SECTION_LABELS[b.section]}
                            </span>
                          </td>

                          {/* Title / Redirect */}
                          <td style={{ padding: '12px 16px', maxWidth: 220 }}>
                            {b.title || b.subtitle || b.redirectUrl ? (
                              <>
                                {b.title && (
                                  <div style={{ fontWeight: 700, fontSize: 13, color: '#222', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {b.title}
                                  </div>
                                )}
                                {b.subtitle && (
                                  <div style={{ fontSize: 12, color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {b.subtitle}
                                  </div>
                                )}
                                {b.redirectUrl && (
                                  <div style={{ fontSize: 11, color: '#3498db', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    <i className="fas fa-link" style={{ marginRight: 4 }} />{b.redirectUrl}
                                  </div>
                                )}
                              </>
                            ) : (
                              <span style={{ color: '#ccc', fontSize: 13 }}>—</span>
                            )}
                          </td>

                          {/* Order */}
                          <td style={{ padding: '12px 16px', fontWeight: 700, fontSize: 14, color: '#444' }}>
                            {b.displayOrder}
                          </td>

                          {/* Status toggle */}
                          <td style={{ padding: '12px 16px' }}>
                            <button
                              onClick={() => toggleActive(b)}
                              style={{
                                background: '#fff',
                                color:      b.isActive ? '#16a34a' : '#dc2626',
                                border:     `1.5px solid ${b.isActive ? '#bbf7d0' : '#fecaca'}`,
                                borderRadius: 20,
                                padding: '4px 14px', fontSize: 12, fontWeight: 700,
                                cursor: 'pointer', whiteSpace: 'nowrap',
                              }}
                            >
                              {b.isActive ? '● Active' : '○ Inactive'}
                            </button>
                          </td>

                          {/* Actions */}
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button
                                onClick={() => openEdit(b)}
                                style={{
                                  background: '#fff', color: '#3498db',
                                  border: '1.5px solid #bfdbfe', borderRadius: 8,
                                  padding: '5px 13px', fontSize: 12, fontWeight: 600,
                                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                                }}
                              >
                                <i className="fas fa-edit" style={{ fontSize: 11 }} /> Edit
                              </button>
                              <button
                                onClick={() => setDeleteTarget(b)}
                                style={{
                                  background: '#fff', color: '#E31E24',
                                  border: '1.5px solid #fecaca', borderRadius: 8,
                                  padding: '5px 13px', fontSize: 12, fontWeight: 600,
                                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                                }}
                              >
                                <i className="fas fa-trash" style={{ fontSize: 11 }} /> Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>

            {/* Empty state */}
            {!loading && banners.length === 0 && (
              <div style={{ padding: '60px 20px', textAlign: 'center', color: '#aaa' }}>
                <i className="fas fa-images" style={{ fontSize: 40, marginBottom: 14, display: 'block', color: '#ddd' }} />
                <div style={{ fontWeight: 700, fontSize: 16, color: '#888', marginBottom: 6 }}>No banners yet</div>
                <div style={{ fontSize: 13 }}>Click <strong>Add Banner</strong> to upload your first one.</div>
              </div>
            )}
          </div>

        </div>
      </div>

      <Footer />

      <ConfirmModal
        open={!!deleteTarget}
        title="Delete Banner?"
        message={`This will permanently remove the banner${deleteTarget?.title ? ` "${deleteTarget.title}"` : ''} and its image from Cloudinary. This cannot be undone.`}
        confirmLabel="Delete Banner"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}
