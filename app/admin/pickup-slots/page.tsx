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

interface TimeSlot {
  startTime: string;
  endTime: string;
}

interface PickupSlotEntry {
  _id: string;
  startDate: string;
  endDate: string;
  slots: TimeSlot[];
  isActive: boolean;
  createdAt: string;
}

interface SlotForm {
  startDate: string;
  endDate: string;
  slot1Start: string;
  slot1End: string;
  slot2Start: string;
  slot2End: string;
  slot3Start: string;
  slot3End: string;
  isActive: boolean;
}

const EMPTY_FORM: SlotForm = {
  startDate: '', endDate: '',
  slot1Start: '', slot1End: '',
  slot2Start: '', slot2End: '',
  slot3Start: '', slot3End: '',
  isActive: true,
};

function fmt12(t: string) {
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${((h % 12) || 12)}:${String(m).padStart(2, '0')} ${ampm}`;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function PickupSlotsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [slots, setSlots] = useState<PickupSlotEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [form, setForm] = useState<SlotForm>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<PickupSlotEntry | null>(null);

  useEffect(() => {
    if (status === 'loading') return;
    if (!session || session.user?.role !== 'admin') router.replace('/login');
  }, [session, status, router]);

  const fetchSlots = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/pickup-slots?all=1');
    const data = await res.json();
    setSlots(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (session?.user?.role === 'admin') fetchSlots();
  }, [session, fetchSlots]);

  const openAddForm = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setFormSuccess('');
    setShowForm(true);
  };

  const openEditForm = (s: PickupSlotEntry) => {
    setEditingId(s._id);
    const toDateInput = (d: string) => new Date(d).toISOString().slice(0, 10);
    setForm({
      startDate: toDateInput(s.startDate),
      endDate: toDateInput(s.endDate),
      slot1Start: s.slots[0]?.startTime || '',
      slot1End: s.slots[0]?.endTime || '',
      slot2Start: s.slots[1]?.startTime || '',
      slot2End: s.slots[1]?.endTime || '',
      slot3Start: s.slots[2]?.startTime || '',
      slot3End: s.slots[2]?.endTime || '',
      isActive: s.isActive,
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

    if (form.endDate < form.startDate) {
      setFormError('End date must be on or after start date.');
      return;
    }
    if (!form.slot1Start || !form.slot1End) {
      setFormError('At least one complete time slot is required.');
      return;
    }

    const builtSlots: TimeSlot[] = [];
    if (form.slot1Start && form.slot1End) builtSlots.push({ startTime: form.slot1Start, endTime: form.slot1End });
    if (form.slot2Start && form.slot2End) builtSlots.push({ startTime: form.slot2Start, endTime: form.slot2End });
    if (form.slot3Start && form.slot3End) builtSlots.push({ startTime: form.slot3Start, endTime: form.slot3End });

    setSaving(true);
    const payload = { startDate: form.startDate, endDate: form.endDate, slots: builtSlots, isActive: form.isActive };
    const url = editingId ? `/api/pickup-slots/${editingId}` : '/api/pickup-slots';
    const method = editingId ? 'PUT' : 'POST';
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json();
    setSaving(false);

    if (res.ok) {
      setFormSuccess(editingId ? 'Slot updated!' : 'Slot created!');
      toast.success(editingId ? 'Slot updated!' : 'Slot created!');
      await fetchSlots();
      setTimeout(cancelForm, 1200);
    } else {
      setFormError(data.error || 'Something went wrong');
    }
  };

  const toggleActive = async (s: PickupSlotEntry) => {
    const res = await fetch(`/api/pickup-slots/${s._id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !s.isActive }),
    });
    if (res.ok) {
      setSlots((prev) => prev.map((x) => x._id === s._id ? { ...x, isActive: !x.isActive } : x));
      toast.success(s.isActive ? 'Deactivated' : 'Activated');
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const res = await fetch(`/api/pickup-slots/${deleteTarget._id}`, { method: 'DELETE' });
    setDeleteTarget(null);
    if (res.ok) {
      setSlots((prev) => prev.filter((x) => x._id !== deleteTarget._id));
      toast.success('Slot deleted');
    }
  };

  const setField = (key: keyof SlotForm, val: string | boolean) => {
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
      <Breadcrumb title="Pickup Time Slots" items={[{ label: 'Home', href: '/' }, { label: 'Admin', href: '/admin' }, { label: 'Pickup Slots' }]} />
      <div style={{ minHeight: '60vh', padding: '50px 0 80px' }}>
        <div className="container">
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 28 }}>
            <div>
              <Link href="/admin" style={{ color: '#999', fontSize: 13, textDecoration: 'none' }}>← Back to Admin</Link>
              <h1 style={{ fontSize: 24, fontWeight: 800, color: '#222', margin: '6px 0 4px' }}>Pickup Time Slots</h1>
              <p style={{ fontSize: 13, color: '#777', margin: 0 }}>{loading ? 'Loading…' : `${slots.length} slot entries`}</p>
            </div>
            {!showForm && (
              <button
                onClick={openAddForm}
                style={{ background: '#E31E24', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 24px', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 4px 12px rgba(227,30,36,0.3)' }}
              >
                <i className="fas fa-plus" />
                Add Slot
              </button>
            )}
          </div>

          {/* Form */}
          {showForm && (
            <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: '28px 24px', marginBottom: 28, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 20px', color: '#222' }}>
                {editingId ? 'Edit Pickup Slot' : 'Add New Pickup Slot'}
              </h3>
              {formError && <div style={{ background: '#fde8e8', border: '1px solid #f5c6cb', borderRadius: 8, padding: '12px 16px', color: '#c0392b', fontSize: 14, marginBottom: 16 }}>{formError}</div>}
              {formSuccess && <div style={{ background: '#e6f9ee', border: '1px solid #a8e6c3', borderRadius: 8, padding: '12px 16px', color: '#1a7a3c', fontSize: 14, marginBottom: 16 }}>{formSuccess}</div>}
              <form onSubmit={handleSubmit}>
                <div className="row g-3">
                  <div className="col-md-3">
                    <label style={labelStyle}>From Date *</label>
                    <input type="date" required value={form.startDate} onChange={(e) => setField('startDate', e.target.value)} style={inputStyle} />
                  </div>
                  <div className="col-md-3">
                    <label style={labelStyle}>To Date *</label>
                    <input type="date" required min={form.startDate} value={form.endDate} onChange={(e) => setField('endDate', e.target.value)} style={inputStyle} />
                  </div>
                  <div className="col-12">
                    <div style={{ borderTop: '1px solid #f0f0f0', margin: '8px 0 12px', paddingTop: 12 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: '#555', margin: '0 0 12px' }}>Time Slots (at least 1 required, max 3)</p>
                      <div className="row g-3">
                        {([1, 2, 3] as const).map((n) => {
                          const startKey = `slot${n}Start` as 'slot1Start' | 'slot2Start' | 'slot3Start';
                          const endKey = `slot${n}End` as 'slot1End' | 'slot2End' | 'slot3End';
                          return (
                            <div key={n} className="col-md-4">
                              <div style={{ background: '#fafafa', border: '1px solid #eee', borderRadius: 8, padding: 14 }}>
                                <p style={{ fontSize: 12, fontWeight: 700, color: '#888', margin: '0 0 10px' }}>Slot {n} {n === 1 ? '(required)' : '(optional)'}</p>
                                <div className="row g-2">
                                  <div className="col-6">
                                    <label style={{ ...labelStyle, fontSize: 11 }}>Start</label>
                                    <input type="time" value={form[startKey]} onChange={(e) => setField(startKey, e.target.value)} style={inputStyle} required={n === 1} />
                                  </div>
                                  <div className="col-6">
                                    <label style={{ ...labelStyle, fontSize: 11 }}>End</label>
                                    <input type="time" value={form[endKey]} onChange={(e) => setField(endKey, e.target.value)} style={inputStyle} required={n === 1} />
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  <div className="col-md-3" style={{ display: 'flex', alignItems: 'center', paddingTop: 8 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#444' }}>
                      <input type="checkbox" checked={form.isActive} onChange={(e) => setField('isActive', e.target.checked)} style={{ width: 18, height: 18, accentColor: '#E31E24' }} />
                      Is Active
                    </label>
                  </div>
                </div>
                <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
                  <button type="submit" disabled={saving} style={{ background: '#E31E24', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 28px', fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                    {saving ? <><i className="fas fa-circle-notch fa-spin" /> Saving…</> : (editingId ? 'Update Slot' : 'Create Slot')}
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
                  {['#', 'Date Range', 'Time Slots', 'Status', 'Actions'].map((h) => (
                    <th key={h} style={{ padding: '10px 14px', fontWeight: 700, fontSize: 12, color: '#555', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 3 }).map((_, i) => (
                      <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                        {Array.from({ length: 5 }).map((__, j) => (
                          <td key={j} style={{ padding: '12px 14px' }}>
                            <div className="skeleton" style={{ height: 16, width: '70%' }} />
                          </td>
                        ))}
                      </tr>
                    ))
                  : slots.map((s, i) => (
                      <tr key={s._id} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                        <td style={{ padding: '12px 14px', fontSize: 13, color: '#aaa', fontWeight: 600 }}>{i + 1}</td>
                        <td style={{ padding: '12px 14px', fontSize: 13, color: '#222', fontWeight: 600 }}>
                          {fmtDate(s.startDate)}
                          <span style={{ color: '#aaa', margin: '0 6px' }}>→</span>
                          {fmtDate(s.endDate)}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {s.slots.map((slot, idx) => (
                              <span key={idx} style={{ background: '#f0f4ff', color: '#3b5998', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
                                {fmt12(slot.startTime)} – {fmt12(slot.endTime)}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          {s.isActive
                            ? <span style={{ background: '#e6f9ee', color: '#1a7a3c', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>Active</span>
                            : <span style={{ background: '#fde8e8', color: '#c0392b', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>Inactive</span>
                          }
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={() => openEditForm(s)} style={{ background: '#fff', border: '1px solid #ddd', borderRadius: 6, padding: '4px 12px', fontSize: 12, cursor: 'pointer' }}>
                              <i className="fas fa-edit" style={{ marginRight: 4 }} />Edit
                            </button>
                            <button onClick={() => toggleActive(s)} style={{ background: '#fff', border: `1px solid ${s.isActive ? '#fcc' : '#c5e8a0'}`, borderRadius: 6, padding: '4px 12px', fontSize: 12, cursor: 'pointer', color: s.isActive ? '#E31E24' : '#4a7c10' }}>
                              <i className={`fas ${s.isActive ? 'fa-toggle-on' : 'fa-toggle-off'}`} style={{ marginRight: 4 }} />
                              {s.isActive ? 'Deactivate' : 'Activate'}
                            </button>
                            <button onClick={() => setDeleteTarget(s)} style={{ background: '#fff5f5', color: '#e74c3c', border: '1px solid #fcc', borderRadius: 6, padding: '4px 12px', fontSize: 12, cursor: 'pointer' }}>
                              <i className="fas fa-trash" style={{ marginRight: 4 }} />Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
            {!loading && slots.length === 0 && (
              <div style={{ padding: '40px', textAlign: 'center', color: '#aaa' }}>
                <i className="fas fa-clock" style={{ fontSize: 32, marginBottom: 12, display: 'block' }} />
                No pickup slots yet. Add your first slot above.
              </div>
            )}
          </div>
        </div>
      </div>
      <Footer />

      <ConfirmModal
        open={!!deleteTarget}
        title="Delete Pickup Slot?"
        message="This pickup slot will be permanently removed. Customers will no longer be able to select this date range. This cannot be undone."
        confirmLabel="Delete Slot"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}
