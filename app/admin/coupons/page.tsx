'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import Navbar from '@/app/components/Navbar';
import Breadcrumb from '@/app/components/Breadcrumb';
import Footer from '@/app/components/Footer';
import ConfirmModal from '@/app/components/ConfirmModal';

interface Coupon {
  _id: string;
  code: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  minOrderAmount: number;
  maxDiscountAmount: number;
  usageLimit: number;
  usedCount: number;
  userUsageLimit: number;
  validFrom: string;
  validTill: string;
  isActive: boolean;
  createdAt: string;
}

interface CouponForm {
  code: string;
  discountType: 'percentage' | 'fixed';
  discountValue: string;
  minOrderAmount: string;
  maxDiscountAmount: string;
  usageLimit: string;
  userUsageLimit: string;
  validFrom: string;
  validTill: string;
  isActive: boolean;
}

const EMPTY_FORM: CouponForm = {
  code: '', discountType: 'percentage', discountValue: '',
  minOrderAmount: '', maxDiscountAmount: '', usageLimit: '',
  userUsageLimit: '', validFrom: '', validTill: '', isActive: true,
};

function isCouponActive(c: Coupon) {
  return c.isActive && new Date(c.validTill) > new Date();
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function CouponsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [form, setForm] = useState<CouponForm>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<Coupon | null>(null);

  useEffect(() => {
    if (status === 'loading') return;
    if (!session || session.user?.role !== 'admin') router.replace('/login');
  }, [session, status, router]);

  const fetchCoupons = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/coupons');
    const data = await res.json();
    setCoupons(data.coupons || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (session?.user?.role === 'admin') fetchCoupons();
  }, [session, fetchCoupons]);

  const openAddForm = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setFormSuccess('');
    setShowForm(true);
  };

  const openEditForm = (c: Coupon) => {
    setEditingId(c._id);
    setForm({
      code: c.code,
      discountType: c.discountType,
      discountValue: String(c.discountValue),
      minOrderAmount: c.minOrderAmount ? String(c.minOrderAmount / 100) : '',
      maxDiscountAmount: c.maxDiscountAmount ? String(c.maxDiscountAmount / 100) : '',
      usageLimit: String(c.usageLimit),
      userUsageLimit: String(c.userUsageLimit),
      validFrom: c.validFrom ? new Date(c.validFrom).toISOString().slice(0, 16) : '',
      validTill: c.validTill ? new Date(c.validTill).toISOString().slice(0, 16) : '',
      isActive: c.isActive,
    });
    setFormError('');
    setFormSuccess('');
    setShowForm(true);
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setFormSuccess('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');
    setSaving(true);

    const payload = {
      code: form.code.toUpperCase(),
      discountType: form.discountType,
      discountValue: Number(form.discountValue),
      minOrderAmount: form.minOrderAmount ? Math.round(Number(form.minOrderAmount) * 100) : 0,
      maxDiscountAmount: form.maxDiscountAmount ? Math.round(Number(form.maxDiscountAmount) * 100) : 0,
      usageLimit: Number(form.usageLimit) || 0,
      userUsageLimit: Number(form.userUsageLimit) || 0,
      validFrom: form.validFrom,
      validTill: form.validTill,
      isActive: form.isActive,
    };

    const url = editingId ? `/api/coupons/${editingId}` : '/api/coupons';
    const method = editingId ? 'PUT' : 'POST';
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json();
    setSaving(false);

    if (res.ok) {
      setFormSuccess(editingId ? 'Coupon updated!' : 'Coupon created!');
      toast.success(editingId ? 'Coupon updated!' : 'Coupon created!');
      await fetchCoupons();
      setTimeout(cancelForm, 1200);
    } else {
      setFormError(data.error || 'Something went wrong');
    }
  };

  const toggleActive = async (c: Coupon) => {
    const res = await fetch(`/api/coupons/${c._id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !c.isActive }),
    });
    if (res.ok) {
      setCoupons((prev) => prev.map((x) => x._id === c._id ? { ...x, isActive: !x.isActive } : x));
      toast.success(c.isActive ? 'Deactivated' : 'Activated');
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const res = await fetch(`/api/coupons/${deleteTarget._id}`, { method: 'DELETE' });
    setDeleteTarget(null);
    if (res.ok) {
      setCoupons((prev) => prev.filter((x) => x._id !== deleteTarget._id));
      toast.success('Coupon deleted');
    }
  };

  const setField = (key: keyof CouponForm, val: string | boolean) => {
    setForm((prev) => ({ ...prev, [key]: val }));
  };

  if (status === 'loading' || !session || session.user?.role !== 'admin') return null;

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: 8,
    fontSize: 14, outline: 'none', boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: '#444', marginBottom: 6, display: 'block' };

  return (
    <>
      <Navbar />
      <Breadcrumb title="Coupons" items={[{ label: 'Home', href: '/' }, { label: 'Admin', href: '/admin' }, { label: 'Coupons' }]} />
      <div style={{ minHeight: '60vh', padding: '50px 0 80px' }}>
        <div className="container">
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 28 }}>
            <div>
              <Link href="/admin" style={{ color: '#999', fontSize: 13, textDecoration: 'none' }}>← Back to Admin</Link>
              <h1 style={{ fontSize: 24, fontWeight: 800, color: '#222', margin: '6px 0 4px' }}>Coupons</h1>
              <p style={{ fontSize: 13, color: '#777', margin: 0 }}>{loading ? 'Loading…' : `${coupons.length} coupons`}</p>
            </div>
            {!showForm && (
              <button
                onClick={openAddForm}
                style={{ background: '#E31E24', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 24px', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 4px 12px rgba(227,30,36,0.3)' }}
              >
                <i className="fas fa-plus" />
                Add Coupon
              </button>
            )}
          </div>

          {/* Form */}
          {showForm && (
            <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: '28px 24px', marginBottom: 28, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 20px', color: '#222' }}>
                {editingId ? 'Edit Coupon' : 'Add New Coupon'}
              </h3>
              {formError && <div style={{ background: '#fde8e8', border: '1px solid #f5c6cb', borderRadius: 8, padding: '12px 16px', color: '#c0392b', fontSize: 14, marginBottom: 16 }}>{formError}</div>}
              {formSuccess && <div style={{ background: '#e6f9ee', border: '1px solid #a8e6c3', borderRadius: 8, padding: '12px 16px', color: '#1a7a3c', fontSize: 14, marginBottom: 16 }}>{formSuccess}</div>}
              <form onSubmit={handleSubmit}>
                <div className="row g-3">
                  <div className="col-md-4">
                    <label style={labelStyle}>Coupon Code *</label>
                    <input type="text" required value={form.code} onChange={(e) => setField('code', e.target.value.toUpperCase())} placeholder="SAVE20" style={{ ...inputStyle, textTransform: 'uppercase', fontFamily: 'monospace', fontWeight: 700 }} />
                  </div>
                  <div className="col-md-4">
                    <label style={labelStyle}>Discount Type *</label>
                    <select required value={form.discountType} onChange={(e) => setField('discountType', e.target.value)} style={inputStyle}>
                      <option value="percentage">Percentage (%)</option>
                      <option value="fixed">Fixed Amount ($)</option>
                    </select>
                  </div>
                  <div className="col-md-4">
                    <label style={labelStyle}>Discount Value * {form.discountType === 'percentage' ? '(%)' : '($)'}</label>
                    <input type="number" required min="0.01" step="0.01" value={form.discountValue} onChange={(e) => setField('discountValue', e.target.value)} placeholder={form.discountType === 'percentage' ? '20' : '5.00'} style={inputStyle} />
                  </div>
                  <div className="col-md-4">
                    <label style={labelStyle}>Minimum Order Amount ($)</label>
                    <input type="number" min="0" step="0.01" value={form.minOrderAmount} onChange={(e) => setField('minOrderAmount', e.target.value)} placeholder="0.00 (no minimum)" style={inputStyle} />
                  </div>
                  {form.discountType === 'percentage' && (
                    <div className="col-md-4">
                      <label style={labelStyle}>Max Discount Amount ($)</label>
                      <input type="number" min="0" step="0.01" value={form.maxDiscountAmount} onChange={(e) => setField('maxDiscountAmount', e.target.value)} placeholder="0.00 (no cap)" style={inputStyle} />
                    </div>
                  )}
                  <div className="col-md-4">
                    <label style={labelStyle}>Usage Limit (0 = unlimited)</label>
                    <input type="number" min="0" value={form.usageLimit} onChange={(e) => setField('usageLimit', e.target.value)} placeholder="0" style={inputStyle} />
                  </div>
                  <div className="col-md-4">
                    <label style={labelStyle}>Per User Limit (0 = unlimited)</label>
                    <input type="number" min="0" value={form.userUsageLimit} onChange={(e) => setField('userUsageLimit', e.target.value)} placeholder="0" style={inputStyle} />
                  </div>
                  <div className="col-md-4">
                    <label style={labelStyle}>Valid From *</label>
                    <input type="datetime-local" required value={form.validFrom} onChange={(e) => setField('validFrom', e.target.value)} style={inputStyle} />
                  </div>
                  <div className="col-md-4">
                    <label style={labelStyle}>Valid Till *</label>
                    <input type="datetime-local" required value={form.validTill} onChange={(e) => setField('validTill', e.target.value)} style={inputStyle} />
                  </div>
                  <div className="col-md-4" style={{ display: 'flex', alignItems: 'center', paddingTop: 28 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#444' }}>
                      <input type="checkbox" checked={form.isActive} onChange={(e) => setField('isActive', e.target.checked)} style={{ width: 18, height: 18, accentColor: '#E31E24' }} />
                      Is Active
                    </label>
                  </div>
                </div>
                <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
                  <button type="submit" disabled={saving} style={{ background: '#E31E24', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 28px', fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                    {saving ? <><i className="fas fa-circle-notch fa-spin" /> Saving…</> : (editingId ? 'Update Coupon' : 'Create Coupon')}
                  </button>
                  <button type="button" onClick={cancelForm} style={{ background: '#fff', border: '1px solid #ddd', borderRadius: 10, padding: '11px 24px', fontSize: 14, fontWeight: 600, cursor: 'pointer', color: '#666' }}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Table */}
          <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid #eee', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
              <thead>
                <tr style={{ background: '#fafafa', borderBottom: '2px solid #eee' }}>
                  {['Code', 'Discount', 'Min Order', 'Usage', 'Validity', 'Status', 'Actions'].map((h) => (
                    <th key={h} style={{ padding: '10px 14px', fontWeight: 700, fontSize: 12, color: '#555', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 4 }).map((_, i) => (
                      <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                        {Array.from({ length: 7 }).map((__, j) => (
                          <td key={j} style={{ padding: '12px 14px' }}>
                            <div className="skeleton" style={{ height: 16, width: '70%' }} />
                          </td>
                        ))}
                      </tr>
                    ))
                  : coupons.map((c, i) => (
                      <tr key={c._id} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                        <td style={{ padding: '12px 14px' }}>
                          <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 14, color: '#222', background: '#f5f5f5', padding: '3px 8px', borderRadius: 6 }}>{c.code}</span>
                        </td>
                        <td style={{ padding: '12px 14px', fontSize: 13 }}>
                          {c.discountType === 'percentage' ? `${c.discountValue}%` : `$${(c.discountValue / 100).toFixed(2)}`}
                          {c.discountType === 'percentage' && c.maxDiscountAmount > 0 && (
                            <div style={{ fontSize: 11, color: '#aaa' }}>max ${(c.maxDiscountAmount / 100).toFixed(2)}</div>
                          )}
                        </td>
                        <td style={{ padding: '12px 14px', fontSize: 13, color: '#666' }}>
                          {c.minOrderAmount > 0 ? `$${(c.minOrderAmount / 100).toFixed(2)}` : '—'}
                        </td>
                        <td style={{ padding: '12px 14px', fontSize: 13, color: '#666' }}>
                          {c.usedCount} / {c.usageLimit === 0 ? '∞' : c.usageLimit}
                        </td>
                        <td style={{ padding: '12px 14px', fontSize: 12, color: '#666' }}>
                          <div>{fmtDate(c.validFrom)}</div>
                          <div style={{ color: '#aaa' }}>→ {fmtDate(c.validTill)}</div>
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          {isCouponActive(c)
                            ? <span style={{ background: '#e6f9ee', color: '#1a7a3c', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>Active</span>
                            : <span style={{ background: '#fde8e8', color: '#c0392b', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>Inactive</span>
                          }
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <button onClick={() => openEditForm(c)} style={{ background: '#fff', border: '1px solid #ddd', borderRadius: 6, padding: '4px 12px', fontSize: 12, cursor: 'pointer' }}>
                              <i className="fas fa-edit" style={{ marginRight: 4 }} />Edit
                            </button>
                            <button onClick={() => toggleActive(c)} style={{ background: '#fff', border: `1px solid ${c.isActive ? '#fcc' : '#c5e8a0'}`, borderRadius: 6, padding: '4px 12px', fontSize: 12, cursor: 'pointer', color: c.isActive ? '#E31E24' : '#4a7c10' }}>
                              <i className={`fas ${c.isActive ? 'fa-toggle-on' : 'fa-toggle-off'}`} style={{ marginRight: 4 }} />
                              {c.isActive ? 'Deactivate' : 'Activate'}
                            </button>
                            <button onClick={() => setDeleteTarget(c)} style={{ background: '#fff5f5', color: '#e74c3c', border: '1px solid #fcc', borderRadius: 6, padding: '4px 12px', fontSize: 12, cursor: 'pointer' }}>
                              <i className="fas fa-trash" style={{ marginRight: 4 }} />Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
            {!loading && coupons.length === 0 && (
              <div style={{ padding: '40px', textAlign: 'center', color: '#aaa' }}>
                <i className="fas fa-ticket" style={{ fontSize: 32, marginBottom: 12, display: 'block' }} />
                No coupons yet. Create your first coupon above.
              </div>
            )}
          </div>
        </div>
      </div>
      <Footer />

      <ConfirmModal
        open={!!deleteTarget}
        title="Delete Coupon?"
        message={deleteTarget ? `Coupon "${deleteTarget.code}" will be permanently deleted. This cannot be undone.` : ''}
        confirmLabel="Delete Coupon"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}
