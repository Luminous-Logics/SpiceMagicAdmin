'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { HexColorPicker } from 'react-colorful';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import Navbar from '@/app/components/Navbar';
import Breadcrumb from '@/app/components/Breadcrumb';
import Footer from '@/app/components/Footer';
import ConfirmModal from '@/app/components/ConfirmModal';

/* ── constants ──────────────────────────────────────────── */
const BANNER_SECTIONS = ['HERO', 'CATEGORY_BANNER', 'OFFER_STRIP', 'HOT_DEALS'] as const;
type BannerSection = typeof BANNER_SECTIONS[number];

const SECTION_LABELS: Record<BannerSection, string> = {
  HERO:            'Hero Slideshow',
  CATEGORY_BANNER: 'Category Banner',
  OFFER_STRIP:     'Offer Strip',
  HOT_DEALS:       'Hot Deals',
};

const SECTION_BADGE_COLORS: Record<BannerSection, string> = {
  HERO:            '#3498db',
  CATEGORY_BANNER: '#9b59b6',
  OFFER_STRIP:     '#1abc9c',
  HOT_DEALS:       '#e74c3c',
};

/**
 * Per-section configuration that drives the form: which text fields are
 * relevant, what each one maps to on the storefront, the recommended image
 * dimensions, and a short usage note.
 */
type FieldKey = 'title' | 'subtitle' | 'description' | 'redirectUrl';

interface SectionConfig {
  dimensions: string;
  ratio: string;
  note: string;
  count: string;
  fields: Partial<Record<FieldKey, string>>;
  hasText: boolean; // whether overlaid text (and therefore a text color) is shown
}

/* Quick-pick swatches for the text color control */
const COLOR_PRESETS = ['#ffffff', '#000000', '#E31E24', '#f59e0b', '#16a34a', '#1e293b'];
const DEFAULT_TEXT_COLOR = '#ffffff';

const SECTION_CONFIG: Record<BannerSection, SectionConfig> = {
  HERO: {
    dimensions: '1920 × 650 px',
    ratio: 'wide · ~2.95:1',
    note: 'Full-width hero slideshow. Each active banner becomes a slide, ordered by display order.',
    count: 'Supports multiple slides',
    fields: {
      title:       'Big headline — line 1',
      subtitle:    'Big headline — line 2 (optional)',
      description: 'Paragraph under the headline (optional — a default is used if empty)',
      redirectUrl: '“Purchase” button link (defaults to /shop if empty)',
    },
    hasText: true,
  },
  CATEGORY_BANNER: {
    dimensions: '384 × 300 px',
    ratio: '~1.28:1',
    note: '3 small boxes shown in a row.',
    count: 'Expects ~3 active banners',
    fields: {
      title:       'Box title',
      subtitle:    'Box subtitle',
      redirectUrl: '“Shop Now” button link',
    },
    hasText: true,
  },
  OFFER_STRIP: {
    dimensions: '960 × 501 px',
    ratio: '~1.92:1',
    note: '2 wide boxes shown side by side.',
    count: 'Expects ~2 active banners',
    fields: {
      title:       'Box title',
      subtitle:    'Box subtitle',
      redirectUrl: '“Shop Now” button link',
    },
    hasText: true,
  },
  HOT_DEALS: {
    dimensions: '270 × 420 px',
    ratio: 'tall portrait · ~0.64:1',
    note: 'One tall banner beside the Hot Deals carousel. Image only — the first active banner is used.',
    count: 'Uses the first active banner',
    fields: {
      title:       'Used as image alt text',
      redirectUrl: 'Makes the banner clickable (optional)',
    },
    hasText: false,
  },
};

/* ── types ───────────────────────────────────────────────── */
interface Banner {
  _id: string;
  title?: string;
  subtitle?: string;
  description?: string;
  imageUrl: string;
  publicId?: string;
  section: BannerSection;
  redirectUrl?: string;
  textColor?: string;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
}

interface FormState {
  section: BannerSection | '';
  title: string;
  subtitle: string;
  description: string;
  redirectUrl: string;
  textColor: string;
  displayOrder: number;
  isActive: boolean;
  existingImageUrl: string;
  existingPublicId: string;
}

const EMPTY_FORM: FormState = {
  section: '', title: '', subtitle: '', description: '', redirectUrl: '',
  textColor: DEFAULT_TEXT_COLOR,
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
const helperStyle: React.CSSProperties = {
  fontSize: 11, color: '#9ca3af', margin: '4px 0 0',
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
  const [dragId, setDragId]           = useState<string | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const colorPickerRef = useRef<HTMLDivElement>(null);

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

  /* close color popover on outside click */
  useEffect(() => {
    if (!showColorPicker) return;
    const onClick = (e: MouseEvent) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) {
        setShowColorPicker(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [showColorPicker]);

  /* group banners by section (only the known sections), sorted by order */
  const grouped = useMemo(() => {
    const map: Record<string, Banner[]> = {};
    for (const s of BANNER_SECTIONS) map[s] = [];
    const legacy: Banner[] = [];
    for (const b of banners) {
      if ((BANNER_SECTIONS as readonly string[]).includes(b.section)) map[b.section].push(b);
      else legacy.push(b);
    }
    for (const s of BANNER_SECTIONS) {
      map[s].sort((a, b) => a.displayOrder - b.displayOrder || a.createdAt.localeCompare(b.createdAt));
    }
    return { map, legacy };
  }, [banners]);

  /* helpers */
  const setField = <K extends keyof FormState>(key: K, val: FormState[K]) =>
    setForm(prev => ({ ...prev, [key]: val }));

  const openAdd = (section?: BannerSection) => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, section: section ?? '' });
    setSelectedFile(null);
    setPreviewUrl('');
    setFormError('');
    setShowForm(true);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openEdit = (b: Banner) => {
    setEditingId(b._id);
    setForm({
      section:          b.section,
      title:            b.title        || '',
      subtitle:         b.subtitle     || '',
      description:      b.description   || '',
      redirectUrl:      b.redirectUrl  || '',
      textColor:        b.textColor    || DEFAULT_TEXT_COLOR,
      displayOrder:     b.displayOrder,
      isActive:         b.isActive,
      existingImageUrl: b.imageUrl,
      existingPublicId: b.publicId     || '',
    });
    setSelectedFile(null);
    setPreviewUrl(b.imageUrl);
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
    setShowColorPicker(false);
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

    if (!finalImageUrl) { setFormError('Please upload a banner image.'); return; }

    const cfg = SECTION_CONFIG[form.section];
    setSaving(true);
    const payload = {
      imageUrl:     finalImageUrl,
      publicId:     finalPublicId  || undefined,
      section:      form.section,
      title:        'title'       in cfg.fields ? (form.title       || undefined) : undefined,
      subtitle:     'subtitle'    in cfg.fields ? (form.subtitle    || undefined) : undefined,
      description:  'description' in cfg.fields ? (form.description || undefined) : undefined,
      redirectUrl:  'redirectUrl' in cfg.fields ? (form.redirectUrl || undefined) : undefined,
      textColor:    cfg.hasText ? (form.textColor || undefined) : undefined,
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
    } else {
      toast.error('Update failed');
    }
  };

  /* update a single banner's displayOrder */
  const persistOrder = async (id: string, displayOrder: number) => {
    await fetch(`/api/banners/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayOrder }),
    });
  };

  /* number-input order change */
  const changeOrder = async (b: Banner, value: number) => {
    const displayOrder = Number.isFinite(value) ? value : 0;
    setBanners(prev => prev.map(x => x._id === b._id ? { ...x, displayOrder } : x));
    await persistOrder(b._id, displayOrder);
  };

  /* drag-to-reorder within a section */
  const handleDrop = async (section: BannerSection, targetId: string) => {
    if (!dragId || dragId === targetId) { setDragId(null); return; }
    const list = [...grouped.map[section]];
    const from = list.findIndex(b => b._id === dragId);
    const to   = list.findIndex(b => b._id === targetId);
    if (from === -1 || to === -1) { setDragId(null); return; }

    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);

    /* reassign sequential displayOrder and persist only the changed ones */
    const updates: { id: string; displayOrder: number }[] = [];
    list.forEach((b, idx) => {
      if (b.displayOrder !== idx) updates.push({ id: b._id, displayOrder: idx });
    });

    const orderById = new Map(list.map((b, idx) => [b._id, idx]));
    setBanners(prev => prev.map(x =>
      orderById.has(x._id) ? { ...x, displayOrder: orderById.get(x._id)! } : x
    ));
    setDragId(null);

    try {
      await Promise.all(updates.map(u => persistOrder(u.id, u.displayOrder)));
      toast.success('Order updated');
    } catch {
      toast.error('Could not save new order');
      fetchBanners();
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
  const activeCfg = form.section ? SECTION_CONFIG[form.section] : null;

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
              <p style={{ fontSize: 13, color: '#777', margin: 0, maxWidth: 620 }}>
                Upload and manage promotional banners for each section of the storefront. Any section with no
                active banners falls back to the built-in default images, so partial setup is safe.
              </p>
            </div>
            {!showForm && (
              <button
                onClick={() => openAdd()}
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

                  {/* ── Section ─────────────────────────── */}
                  <div className="col-md-6">
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
                  <div className="col-md-6">
                    <label style={labelStyle}>Display Order</label>
                    <input
                      type="number" min={0}
                      value={form.displayOrder}
                      onChange={e => setField('displayOrder', Number(e.target.value))}
                      style={inputStyle}
                    />
                    <p style={helperStyle}>Lower numbers appear first. You can also drag rows in the list below to reorder.</p>
                  </div>

                  {/* ── Section guidance ─────────────────── */}
                  {activeCfg && (
                    <div className="col-12">
                      <div style={{
                        background: SECTION_BADGE_COLORS[form.section as BannerSection] + '10',
                        border: `1px solid ${SECTION_BADGE_COLORS[form.section as BannerSection]}33`,
                        borderRadius: 10, padding: '12px 16px',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <i className="fas fa-circle-info" style={{ color: SECTION_BADGE_COLORS[form.section as BannerSection] }} />
                          <strong style={{ fontSize: 13, color: '#333' }}>{SECTION_LABELS[form.section as BannerSection]}</strong>
                          <span style={{ fontSize: 12, color: '#666' }}>{activeCfg.note}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 8, fontSize: 12, color: '#555' }}>
                          <span><i className="fas fa-ruler-combined" style={{ marginRight: 5, color: '#999' }} />
                            Recommended <strong>{activeCfg.dimensions}</strong> ({activeCfg.ratio})
                          </span>
                          <span><i className="fas fa-layer-group" style={{ marginRight: 5, color: '#999' }} />{activeCfg.count}</span>
                        </div>
                        <p style={{ ...helperStyle, marginTop: 8, color: '#8a8a8a' }}>
                          Any image size works — the storefront crops to a fixed ratio using object-fit: cover. Keep the key subject centered.
                        </p>
                      </div>
                    </div>
                  )}

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

                  {/* ── Title ───────────────────────────── */}
                  {(!activeCfg || 'title' in activeCfg.fields) && (
                    <div className="col-md-6">
                      <label style={labelStyle}>Title{form.section === 'HOT_DEALS' ? ' (alt text)' : ' (optional)'}</label>
                      <input
                        type="text" placeholder="e.g. Summer Sale"
                        value={form.title}
                        onChange={e => setField('title', e.target.value)}
                        style={inputStyle}
                      />
                      {activeCfg?.fields.title && <p style={helperStyle}>{activeCfg.fields.title}</p>}
                    </div>
                  )}

                  {/* ── Subtitle ────────────────────────── */}
                  {(!activeCfg || 'subtitle' in activeCfg.fields) && (
                    <div className="col-md-6">
                      <label style={labelStyle}>Subtitle (optional)</label>
                      <input
                        type="text" placeholder="e.g. Up to 40% off selected spices"
                        value={form.subtitle}
                        onChange={e => setField('subtitle', e.target.value)}
                        style={inputStyle}
                      />
                      {activeCfg?.fields.subtitle && <p style={helperStyle}>{activeCfg.fields.subtitle}</p>}
                    </div>
                  )}

                  {/* ── Description ─────────────────────── */}
                  {(!activeCfg || 'description' in activeCfg.fields) && (
                    <div className="col-12">
                      <label style={labelStyle}>Description (optional)</label>
                      <textarea
                        rows={2}
                        placeholder="Short paragraph shown under the hero headline"
                        value={form.description}
                        onChange={e => setField('description', e.target.value)}
                        style={{ ...inputStyle, resize: 'vertical' }}
                      />
                      {activeCfg?.fields.description && <p style={helperStyle}>{activeCfg.fields.description}</p>}
                    </div>
                  )}

                  {/* ── Redirect URL ────────────────────── */}
                  {(!activeCfg || 'redirectUrl' in activeCfg.fields) && (
                    <div className="col-md-6">
                      <label style={labelStyle}>Redirect URL (optional)</label>
                      <input
                        type="text" placeholder="/shop?category=Vegetables"
                        value={form.redirectUrl}
                        onChange={e => setField('redirectUrl', e.target.value)}
                        style={inputStyle}
                      />
                      {activeCfg?.fields.redirectUrl && <p style={helperStyle}>{activeCfg.fields.redirectUrl}</p>}
                    </div>
                  )}

                  {/* ── Text color ──────────────────────── */}
                  {(!activeCfg || activeCfg.hasText) && (
                    <div className="col-12">
                      <label style={labelStyle}>Text Color</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        {/* gradient color picker (opens on click) */}
                        <div ref={colorPickerRef} style={{ position: 'relative' }}>
                          <button
                            type="button"
                            onClick={() => setShowColorPicker(v => !v)}
                            title="Open color picker"
                            style={{
                              width: 46, height: 40, padding: 0, borderRadius: 10, cursor: 'pointer',
                              border: '1.5px solid #e5e7eb',
                              background: /^#[0-9a-fA-F]{6}$/.test(form.textColor) ? form.textColor : DEFAULT_TEXT_COLOR,
                              boxShadow: 'inset 0 0 0 2px #fff',
                            }}
                          />
                          {showColorPicker && (
                            <div style={{
                              position: 'absolute', top: 48, left: 0, zIndex: 50,
                              background: '#fff', borderRadius: 12, padding: 12,
                              border: '1px solid #eee', boxShadow: '0 8px 28px rgba(0,0,0,0.18)',
                            }}>
                              <HexColorPicker
                                color={/^#[0-9a-fA-F]{6}$/.test(form.textColor) ? form.textColor : DEFAULT_TEXT_COLOR}
                                onChange={c => setField('textColor', c)}
                              />
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                                <span style={{ fontSize: 12, color: '#888', fontWeight: 600 }}>HEX</span>
                                <input
                                  type="text"
                                  value={form.textColor}
                                  onChange={e => setField('textColor', e.target.value)}
                                  placeholder="#ffffff"
                                  style={{ ...inputStyle, padding: '6px 10px', fontFamily: 'monospace', fontSize: 13 }}
                                />
                                <button
                                  type="button"
                                  onClick={() => setShowColorPicker(false)}
                                  style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#555' }}
                                >
                                  Done
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                        {/* hex input */}
                        <input
                          type="text"
                          value={form.textColor}
                          onChange={e => setField('textColor', e.target.value)}
                          placeholder="#ffffff"
                          style={{ ...inputStyle, width: 130, fontFamily: 'monospace' }}
                        />
                        {/* preset swatches */}
                        <div style={{ display: 'flex', gap: 6 }}>
                          {COLOR_PRESETS.map(c => (
                            <button
                              key={c}
                              type="button"
                              onClick={() => setField('textColor', c)}
                              title={c}
                              style={{
                                width: 26, height: 26, borderRadius: '50%', cursor: 'pointer',
                                background: c,
                                border: form.textColor.toLowerCase() === c.toLowerCase()
                                  ? '2px solid #E31E24' : '1.5px solid #e5e7eb',
                                boxShadow: c.toLowerCase() === '#ffffff' ? 'inset 0 0 0 1px #eee' : 'none',
                              }}
                            />
                          ))}
                        </div>
                        {/* live preview */}
                        <div style={{
                          marginLeft: 'auto',
                          background: 'linear-gradient(135deg, #64748b, #334155)',
                          borderRadius: 8, padding: '8px 16px', minWidth: 150, textAlign: 'center',
                        }}>
                          <span style={{ color: form.textColor || DEFAULT_TEXT_COLOR, fontWeight: 700, fontSize: 15 }}>
                            {form.title || 'Sample Title'}
                          </span>
                        </div>
                      </div>
                      <p style={helperStyle}>
                        Color applied to the banner’s title, subtitle and description on the storefront. Leave as-is for the default.
                      </p>
                    </div>
                  )}

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

          {/* ── Grouped list ────────────────────────────── */}
          {loading ? (
            <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #f0f0f0', padding: 24 }}>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="skeleton" style={{ height: 64, borderRadius: 10, marginBottom: 12 }} />
              ))}
            </div>
          ) : banners.length === 0 ? (
            <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #f0f0f0', padding: '60px 20px', textAlign: 'center', color: '#aaa' }}>
              <i className="fas fa-images" style={{ fontSize: 40, marginBottom: 14, display: 'block', color: '#ddd' }} />
              <div style={{ fontWeight: 700, fontSize: 16, color: '#888', marginBottom: 6 }}>No banners yet</div>
              <div style={{ fontSize: 13 }}>Click <strong>Add Banner</strong> to upload your first one.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {BANNER_SECTIONS.map(section => {
                const list = grouped.map[section];
                const cfg = SECTION_CONFIG[section];
                const color = SECTION_BADGE_COLORS[section];
                return (
                  <SectionGroup
                    key={section}
                    section={section}
                    label={SECTION_LABELS[section]}
                    color={color}
                    dimensions={`${cfg.dimensions} · ${cfg.ratio}`}
                    hint={cfg.count}
                    list={list}
                    dragId={dragId}
                    onAdd={() => openAdd(section)}
                    onEdit={openEdit}
                    onDelete={setDeleteTarget}
                    onToggle={toggleActive}
                    onChangeOrder={changeOrder}
                    onDragStart={setDragId}
                    onDragEnd={() => setDragId(null)}
                    onDrop={targetId => handleDrop(section, targetId)}
                  />
                );
              })}

              {/* Legacy / unknown sections, if any exist in the DB */}
              {grouped.legacy.length > 0 && (
                <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #f0f0f0', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                  <div style={{ padding: '14px 20px', borderBottom: '1px solid #f0f0f0', fontWeight: 700, fontSize: 14, color: '#92400e', background: '#fffbeb' }}>
                    <i className="fas fa-triangle-exclamation" style={{ marginRight: 8 }} />
                    Other / Legacy sections ({grouped.legacy.length})
                    <span style={{ fontWeight: 500, fontSize: 12, color: '#b45309', marginLeft: 8 }}>
                      These use a section value no longer supported. Edit to reassign or delete them.
                    </span>
                  </div>
                  {grouped.legacy.map(b => (
                    <div key={b._id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 20px', borderBottom: '1px solid #f5f5f5' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={b.imageUrl} alt={b.title || b.section} style={{ width: 80, height: 46, objectFit: 'cover', borderRadius: 8, border: '1px solid #eee' }} />
                      <div style={{ flex: 1, fontSize: 13, color: '#555' }}>
                        <strong>{b.section}</strong>{b.title ? ` — ${b.title}` : ''}
                      </div>
                      <button onClick={() => openEdit(b)} style={{ background: '#fff', color: '#3498db', border: '1.5px solid #bfdbfe', borderRadius: 8, padding: '5px 13px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Edit</button>
                      <button onClick={() => setDeleteTarget(b)} style={{ background: '#fff', color: '#E31E24', border: '1.5px solid #fecaca', borderRadius: 8, padding: '5px 13px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Delete</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

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

/* ══════════════════════════════════════════════════════════ */
/* Section group with drag-to-reorder rows                     */
interface SectionGroupProps {
  section: BannerSection;
  label: string;
  color: string;
  dimensions: string;
  hint: string;
  list: Banner[];
  dragId: string | null;
  onAdd: () => void;
  onEdit: (b: Banner) => void;
  onDelete: (b: Banner) => void;
  onToggle: (b: Banner) => void;
  onChangeOrder: (b: Banner, value: number) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDrop: (targetId: string) => void;
}

function SectionGroup({
  label, color, dimensions, hint, list, dragId,
  onAdd, onEdit, onDelete, onToggle, onChangeOrder,
  onDragStart, onDragEnd, onDrop,
}: SectionGroupProps) {
  const activeCount = list.filter(b => b.isActive).length;
  return (
    <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #f0f0f0', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
      {/* group header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, padding: '14px 20px', borderBottom: '1px solid #f0f0f0', background: color + '08' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ background: color + '20', color, borderRadius: 20, padding: '4px 14px', fontSize: 13, fontWeight: 800 }}>{label}</span>
          <span style={{ fontSize: 12, color: '#888' }}>
            <i className="fas fa-ruler-combined" style={{ marginRight: 5, color: '#bbb' }} />{dimensions}
          </span>
          <span style={{ fontSize: 12, color: '#aaa' }}>·</span>
          <span style={{ fontSize: 12, color: '#888' }}>{hint}</span>
          <span style={{ fontSize: 12, color: activeCount > 0 ? '#16a34a' : '#f59e0b', fontWeight: 600 }}>
            · {activeCount} active
          </span>
        </div>
        <button
          onClick={onAdd}
          style={{ background: '#fff', color, border: `1.5px solid ${color}55`, borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <i className="fas fa-plus" style={{ fontSize: 11 }} /> Add
        </button>
      </div>

      {/* rows */}
      {list.length === 0 ? (
        <div style={{ padding: '22px 20px', textAlign: 'center', color: '#bbb', fontSize: 13 }}>
          No banners — the storefront shows its built-in default for this section.
        </div>
      ) : (
        <div>
          {list.map(b => (
            <div
              key={b._id}
              draggable
              onDragStart={() => onDragStart(b._id)}
              onDragEnd={onDragEnd}
              onDragOver={e => e.preventDefault()}
              onDrop={() => onDrop(b._id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '12px 20px', borderBottom: '1px solid #f5f5f5',
                background: dragId === b._id ? '#fff9f9' : '#fff',
                opacity: dragId === b._id ? 0.6 : 1,
                cursor: 'grab',
              }}
            >
              {/* drag handle */}
              <i className="fas fa-grip-vertical" style={{ color: '#cbd5e1', fontSize: 14, cursor: 'grab' }} title="Drag to reorder" />

              {/* preview */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={b.imageUrl}
                alt={b.title || b.section}
                style={{ width: 90, height: 50, objectFit: 'cover', borderRadius: 8, border: '1px solid #eee', flexShrink: 0 }}
              />

              {/* text */}
              <div style={{ flex: 1, minWidth: 140 }}>
                {b.title || b.subtitle || b.redirectUrl ? (
                  <>
                    {b.title && (
                      <div style={{ fontWeight: 700, fontSize: 13, color: '#222', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {b.textColor && (
                          <span
                            title={`Text color ${b.textColor}`}
                            style={{ width: 12, height: 12, borderRadius: '50%', background: b.textColor, border: '1px solid #ddd', flexShrink: 0 }}
                          />
                        )}
                        {b.title}
                      </div>
                    )}
                    {b.subtitle && <div style={{ fontSize: 12, color: '#888' }}>{b.subtitle}</div>}
                    {b.redirectUrl && (
                      <div style={{ fontSize: 11, color: '#3498db', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>
                        <i className="fas fa-link" style={{ marginRight: 4 }} />{b.redirectUrl}
                      </div>
                    )}
                  </>
                ) : (
                  <span style={{ color: '#ccc', fontSize: 13 }}>Image only</span>
                )}
              </div>

              {/* order number input */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <input
                  type="number" min={0}
                  value={b.displayOrder}
                  onChange={e => onChangeOrder(b, Number(e.target.value))}
                  onClick={e => e.stopPropagation()}
                  style={{ width: 60, padding: '6px 8px', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: 13, textAlign: 'center' }}
                  title="Display order"
                />
                <span style={{ fontSize: 10, color: '#bbb', marginTop: 2 }}>order</span>
              </div>

              {/* status toggle */}
              <button
                onClick={() => onToggle(b)}
                style={{
                  background: '#fff',
                  color: b.isActive ? '#16a34a' : '#dc2626',
                  border: `1.5px solid ${b.isActive ? '#bbf7d0' : '#fecaca'}`,
                  borderRadius: 20, padding: '4px 14px', fontSize: 12, fontWeight: 700,
                  cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >
                {b.isActive ? '● Active' : '○ Inactive'}
              </button>

              {/* actions */}
              <button
                onClick={() => onEdit(b)}
                style={{ background: '#fff', color: '#3498db', border: '1.5px solid #bfdbfe', borderRadius: 8, padding: '5px 13px', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
              >
                <i className="fas fa-edit" style={{ fontSize: 11 }} /> Edit
              </button>
              <button
                onClick={() => onDelete(b)}
                style={{ background: '#fff', color: '#E31E24', border: '1.5px solid #fecaca', borderRadius: 8, padding: '5px 13px', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
              >
                <i className="fas fa-trash" style={{ fontSize: 11 }} /> Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
