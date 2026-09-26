'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import Navbar from '@/app/components/Navbar';
import Breadcrumb from '@/app/components/Breadcrumb';
import Footer from '@/app/components/Footer';

/* ── constants ──────────────────────────────────────────── */
const FOOD_ORDER_STATUSES = [
  'pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled',
] as const;
type FoodOrderStatus = typeof FOOD_ORDER_STATUSES[number];

const STATUS_META: Record<FoodOrderStatus, { label: string; color: string; icon: string }> = {
  pending:   { label: 'Pending',   color: '#f59e0b', icon: 'fa-hourglass-half' },
  confirmed: { label: 'Confirmed', color: '#3498db', icon: 'fa-circle-check' },
  preparing: { label: 'Preparing', color: '#8b5cf6', icon: 'fa-fire-burner' },
  ready:     { label: 'Ready',     color: '#0ea5e9', icon: 'fa-bell-concierge' },
  completed: { label: 'Completed', color: '#16a34a', icon: 'fa-check-double' },
  cancelled: { label: 'Cancelled', color: '#E31E24', icon: 'fa-ban' },
};

/** Forward-only lifecycle — cancelling is always allowed until the order is closed. */
const NEXT_STATUSES: Record<FoodOrderStatus, FoodOrderStatus[]> = {
  pending:   ['confirmed', 'preparing', 'ready', 'completed', 'cancelled'],
  confirmed: ['preparing', 'ready', 'completed', 'cancelled'],
  preparing: ['ready', 'completed', 'cancelled'],
  ready:     ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

const LIMIT = 20;

/* ── types ───────────────────────────────────────────────── */
interface FoodOrderItem {
  foodItemId: string;
  title: string;
  price: number;
  quantity: number;
  imageUrl?: string;
}

interface FoodOrder {
  _id: string;
  orderNumber: string;
  userId?: string | null;
  customer: { name: string; phone: string; email?: string };
  items: FoodOrderItem[];
  totalAmount: number;
  notes?: string;
  status: FoodOrderStatus;
  stockRestored: boolean;
  adminNote?: string;
  createdAt: string;
  updatedAt: string;
}

/* ── helpers ─────────────────────────────────────────────── */
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });

const inputStyle: React.CSSProperties = {
  padding: '10px 14px', border: '1.5px solid #e5e7eb', borderRadius: 10,
  fontSize: 14, outline: 'none', boxSizing: 'border-box', background: '#fff',
};

/* ══════════════════════════════════════════════════════════ */
export default function FoodOrdersPage() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();

  const [orders, setOrders]   = useState<FoodOrder[]>([]);
  const [counts, setCounts]   = useState<Record<FoodOrderStatus, number> | null>(null);
  const [allTotal, setAllTotal] = useState(0);
  const [total, setTotal]     = useState(0);
  const [pages, setPages]     = useState(1);
  const [page, setPage]       = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<FoodOrderStatus | ''>('');
  const [searchInput, setSearchInput]   = useState('');
  const [search, setSearch]             = useState('');

  const [selected, setSelected] = useState<FoodOrder | null>(null);
  const [updating, setUpdating] = useState(false);

  const isAdmin = session?.user?.role === 'admin';

  useEffect(() => {
    if (authStatus === 'loading') return;
    if (!session || !isAdmin) router.replace('/login');
  }, [session, authStatus, isAdmin, router]);

  /* debounce the search box */
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => { setPage(1); }, [statusFilter, search]);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
      if (statusFilter) params.set('status', statusFilter);
      if (search) params.set('search', search);

      const res = await fetch(`/api/food-orders?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);

      setOrders(data.orders || []);
      setTotal(data.total || 0);
      setPages(data.pages || 1);
      setCounts(data.counts || null);
      setAllTotal(data.allTotal || 0);
    } catch (err) {
      setError((err as Error).message);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, search]);

  useEffect(() => {
    if (isAdmin) fetchOrders();
  }, [isAdmin, fetchOrders]);

  const updateStatus = async (order: FoodOrder, next: FoodOrderStatus) => {
    if (next === 'cancelled' && !window.confirm(
      `Cancel ${order.orderNumber}? The booked quantities go back to the food items.`
    )) return;

    setUpdating(true);
    try {
      const res = await fetch(`/api/food-orders/${order._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Update failed');

      toast.success(
        data.stockRestored
          ? 'Order cancelled — quantities returned to stock'
          : `Order marked ${STATUS_META[next].label.toLowerCase()}`
      );
      setSelected(data.order);
      await fetchOrders();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUpdating(false);
    }
  };

  if (authStatus === 'loading' || !session || !isAdmin) return null;

  return (
    <>
      <Navbar />
      <Breadcrumb
        title="Food Orders"
        items={[{ label: 'Home', href: '/' }, { label: 'Admin', href: '/admin' }, { label: 'Food Orders' }]}
      />

      <div style={{ minHeight: '60vh', background: '#fafafa', padding: '40px 0 80px' }}>
        <div className="container">

          {/* Header */}
          <div style={{ marginBottom: 22 }}>
            <Link href="/admin" style={{ color: '#999', fontSize: 13, textDecoration: 'none' }}>← Back to Admin</Link>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: '#222', margin: '6px 0 4px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <i className="fas fa-bell-concierge" style={{ color: '#8b5cf6', fontSize: 20 }} />
              Food Orders
            </h1>
            <p style={{ fontSize: 13, color: '#777', margin: 0, maxWidth: 640 }}>
              Preorders placed from the storefront. No payment is taken — contact the customer on the phone number
              they left to arrange collection.
            </p>
          </div>

          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 24 }}>
            <SummaryCard
              label="All orders" value={allTotal} color="#64748b" icon="fa-list"
              active={statusFilter === ''} onClick={() => setStatusFilter('')}
            />
            {FOOD_ORDER_STATUSES.map((s) => (
              <SummaryCard
                key={s}
                label={STATUS_META[s].label}
                value={counts?.[s] ?? 0}
                color={STATUS_META[s].color}
                icon={STATUS_META[s].icon}
                active={statusFilter === s}
                onClick={() => setStatusFilter(statusFilter === s ? '' : s)}
              />
            ))}
          </div>

          {/* Search */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
            <div style={{ position: 'relative', flex: '1 1 280px', maxWidth: 420 }}>
              <i className="fas fa-search" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#bbb', fontSize: 13 }} />
              <input
                type="text"
                placeholder="Search order number, customer, phone or dish"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                style={{ ...inputStyle, width: '100%', paddingLeft: 38 }}
              />
            </div>
            <button
              onClick={fetchOrders}
              style={{ ...inputStyle, cursor: 'pointer', fontWeight: 600, color: '#555', display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <i className={`fas fa-rotate${loading ? ' fa-spin' : ''}`} style={{ fontSize: 13 }} />
              Refresh
            </button>
          </div>

          {/* Table */}
          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #f0f0f0', boxShadow: '0 2px 12px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
            {loading ? (
              <div style={{ padding: 24 }}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="skeleton" style={{ height: 56, borderRadius: 10, marginBottom: 12 }} />
                ))}
              </div>
            ) : error ? (
              <div style={{ padding: '50px 20px', textAlign: 'center' }}>
                <i className="fas fa-triangle-exclamation" style={{ fontSize: 32, color: '#fca5a5', marginBottom: 12, display: 'block' }} />
                <p style={{ color: '#dc2626', fontSize: 14, marginBottom: 14 }}>{error}</p>
                <button onClick={fetchOrders} style={{ ...inputStyle, cursor: 'pointer', fontWeight: 600, color: '#555' }}>Try again</button>
              </div>
            ) : orders.length === 0 ? (
              <div style={{ padding: '60px 20px', textAlign: 'center', color: '#aaa' }}>
                <i className="fas fa-bell-concierge" style={{ fontSize: 40, marginBottom: 14, display: 'block', color: '#ddd' }} />
                <div style={{ fontWeight: 700, fontSize: 16, color: '#888', marginBottom: 6 }}>No food orders yet</div>
                <div style={{ fontSize: 13 }}>Preorders placed on the storefront will appear here.</div>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 880 }}>
                  <thead>
                    <tr style={{ background: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                      {['Order', 'Customer', 'Items', 'Qty', 'Total', 'Placed', 'Status', ''].map((h) => (
                        <th key={h} style={{ textAlign: 'left', padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#888', whiteSpace: 'nowrap' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => {
                      const totalQty = o.items.reduce((sum, i) => sum + i.quantity, 0);
                      const meta = STATUS_META[o.status];
                      return (
                        <tr
                          key={o._id}
                          onClick={() => setSelected(o)}
                          style={{ borderBottom: '1px solid #f5f5f5', cursor: 'pointer' }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = '#fafafa')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}
                        >
                          <td style={{ padding: '13px 16px', fontSize: 13, fontWeight: 700, color: '#222', whiteSpace: 'nowrap' }}>
                            {o.orderNumber}
                          </td>
                          <td style={{ padding: '13px 16px', fontSize: 13, color: '#444' }}>
                            <div style={{ fontWeight: 600 }}>{o.customer.name}</div>
                            <div style={{ fontSize: 11.5, color: '#999' }}>{o.customer.phone}</div>
                          </td>
                          <td style={{ padding: '13px 16px', fontSize: 13, color: '#555', maxWidth: 260 }}>
                            {o.items.map((i) => `${i.title} ×${i.quantity}`).join(', ')}
                          </td>
                          <td style={{ padding: '13px 16px', fontSize: 13, color: '#555', fontWeight: 600 }}>{totalQty}</td>
                          <td style={{ padding: '13px 16px', fontSize: 13, fontWeight: 700, color: '#f59e0b', whiteSpace: 'nowrap' }}>
                            {money(o.totalAmount)}
                          </td>
                          <td style={{ padding: '13px 16px', fontSize: 12.5, color: '#888', whiteSpace: 'nowrap' }}>
                            {formatDateTime(o.createdAt)}
                          </td>
                          <td style={{ padding: '13px 16px' }}>
                            <span style={{
                              background: meta.color + '18', color: meta.color, borderRadius: 20,
                              padding: '4px 12px', fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap',
                              display: 'inline-flex', alignItems: 'center', gap: 6,
                            }}>
                              <i className={`fas ${meta.icon}`} style={{ fontSize: 10 }} />
                              {meta.label}
                            </span>
                          </td>
                          <td style={{ padding: '13px 16px', textAlign: 'right' }}>
                            <i className="fas fa-chevron-right" style={{ color: '#ccc', fontSize: 12 }} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {!loading && !error && orders.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, padding: '14px 18px', borderTop: '1px solid #f0f0f0' }}>
                <span style={{ fontSize: 12.5, color: '#888' }}>
                  Showing {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} of {total}
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    style={{ ...inputStyle, padding: '7px 14px', fontSize: 13, fontWeight: 600, color: page <= 1 ? '#ccc' : '#555', cursor: page <= 1 ? 'not-allowed' : 'pointer' }}
                  >
                    Previous
                  </button>
                  <span style={{ fontSize: 13, color: '#888', alignSelf: 'center' }}>Page {page} / {pages}</span>
                  <button
                    onClick={() => setPage((p) => Math.min(pages, p + 1))}
                    disabled={page >= pages}
                    style={{ ...inputStyle, padding: '7px 14px', fontSize: 13, fontWeight: 600, color: page >= pages ? '#ccc' : '#555', cursor: page >= pages ? 'not-allowed' : 'pointer' }}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>

      <Footer />

      <OrderDetailsModal
        order={selected}
        updating={updating}
        onClose={() => setSelected(null)}
        onStatusChange={(next) => selected && updateStatus(selected, next)}
      />
    </>
  );
}

/* ══════════════════════════════════════════════════════════ */
interface SummaryCardProps {
  label: string;
  value: number;
  color: string;
  icon: string;
  active: boolean;
  onClick: () => void;
}

function SummaryCard({ label, value, color, icon, active, onClick }: SummaryCardProps) {
  return (
    <button
      onClick={onClick}
      style={{
        background: '#fff', textAlign: 'left',
        border: `1.5px solid ${active ? color : '#f0f0f0'}`,
        borderRadius: 14, padding: '14px 16px', cursor: 'pointer',
        boxShadow: active ? `0 4px 14px ${color}22` : 'none',
        display: 'flex', alignItems: 'center', gap: 12,
      }}
    >
      <div style={{ width: 36, height: 36, borderRadius: 10, background: color + '14', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <i className={`fas ${icon}`} style={{ color, fontSize: 15 }} />
      </div>
      <div>
        <div style={{ fontSize: 20, fontWeight: 800, color: '#222', lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 11.5, color: '#888' }}>{label}</div>
      </div>
    </button>
  );
}

interface ModalProps {
  order: FoodOrder | null;
  updating: boolean;
  onClose: () => void;
  onStatusChange: (next: FoodOrderStatus) => void;
}

function OrderDetailsModal({ order, updating, onClose, onStatusChange }: ModalProps) {
  useEffect(() => {
    if (!order) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [order, onClose]);

  if (!order) return null;

  const meta = STATUS_META[order.status];
  const nextOptions = NEXT_STATUSES[order.status];

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)',
        zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 20, width: '100%', maxWidth: 620,
          maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 24px 60px rgba(0,0,0,0.2)',
        }}
      >
        {/* header */}
        <div style={{ padding: '22px 26px 18px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14 }}>
          <div>
            <h3 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 800, color: '#111' }}>{order.orderNumber}</h3>
            <span style={{ fontSize: 12.5, color: '#999' }}>Placed {formatDateTime(order.createdAt)}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              background: meta.color + '18', color: meta.color, borderRadius: 20,
              padding: '5px 14px', fontSize: 12, fontWeight: 700,
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              <i className={`fas ${meta.icon}`} style={{ fontSize: 11 }} />
              {meta.label}
            </span>
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#bbb', lineHeight: 1 }}>×</button>
          </div>
        </div>

        {/* customer */}
        <div style={{ padding: '18px 26px', borderBottom: '1px solid #f5f5f5' }}>
          <h4 style={{ fontSize: 12, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 10px' }}>Customer</h4>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#222', marginBottom: 6 }}>{order.customer.name}</div>
          <div style={{ fontSize: 13, color: '#555', display: 'flex', flexWrap: 'wrap', gap: 16 }}>
            <a href={`tel:${order.customer.phone}`} style={{ color: '#3498db', textDecoration: 'none' }}>
              <i className="fas fa-phone" style={{ marginRight: 6, fontSize: 11 }} />{order.customer.phone}
            </a>
            {order.customer.email && (
              <a href={`mailto:${order.customer.email}`} style={{ color: '#3498db', textDecoration: 'none' }}>
                <i className="fas fa-envelope" style={{ marginRight: 6, fontSize: 11 }} />{order.customer.email}
              </a>
            )}
          </div>
          {order.notes && (
            <div style={{ marginTop: 12, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#78350f' }}>
              <strong style={{ display: 'block', marginBottom: 3, fontSize: 12 }}>Customer note</strong>
              {order.notes}
            </div>
          )}
        </div>

        {/* items */}
        <div style={{ padding: '18px 26px', borderBottom: '1px solid #f5f5f5' }}>
          <h4 style={{ fontSize: 12, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 12px' }}>
            Items ({order.items.reduce((s, i) => s + i.quantity, 0)})
          </h4>
          {order.items.map((item, idx) => (
            <div key={`${item.foodItemId}-${idx}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderBottom: idx < order.items.length - 1 ? '1px solid #f8f8f8' : 'none' }}>
              {item.imageUrl && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={item.imageUrl} alt={item.title} style={{ width: 46, height: 46, objectFit: 'cover', borderRadius: 10, border: '1px solid #eee', flexShrink: 0 }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: '#222' }}>{item.title}</div>
                <div style={{ fontSize: 12, color: '#999' }}>{money(item.price)} each</div>
              </div>
              <div style={{ fontSize: 13, color: '#555', fontWeight: 600, whiteSpace: 'nowrap' }}>×{item.quantity}</div>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: '#222', minWidth: 68, textAlign: 'right' }}>
                {money(item.price * item.quantity)}
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, paddingTop: 12, borderTop: '1.5px solid #f0f0f0' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#555' }}>Order value</span>
            <span style={{ fontSize: 18, fontWeight: 800, color: '#f59e0b' }}>{money(order.totalAmount)}</span>
          </div>
          <p style={{ fontSize: 11.5, color: '#aaa', margin: '6px 0 0', textAlign: 'right' }}>
            Reference only — this preorder was not paid online.
          </p>
        </div>

        {/* status actions */}
        <div style={{ padding: '18px 26px 24px' }}>
          <h4 style={{ fontSize: 12, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 12px' }}>Update status</h4>
          {nextOptions.length === 0 ? (
            <p style={{ fontSize: 13, color: '#888', margin: 0 }}>
              This order is {meta.label.toLowerCase()} and can no longer be changed.
              {order.status === 'cancelled' && order.stockRestored && ' The booked quantities were returned to stock.'}
            </p>
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {nextOptions.map((s) => {
                const m = STATUS_META[s];
                return (
                  <button
                    key={s}
                    onClick={() => onStatusChange(s)}
                    disabled={updating}
                    style={{
                      background: '#fff', color: m.color,
                      border: `1.5px solid ${m.color}55`, borderRadius: 10,
                      padding: '9px 16px', fontSize: 13, fontWeight: 700,
                      cursor: updating ? 'not-allowed' : 'pointer',
                      opacity: updating ? 0.6 : 1,
                      display: 'flex', alignItems: 'center', gap: 7,
                    }}
                  >
                    <i className={`fas ${m.icon}`} style={{ fontSize: 12 }} />
                    Mark {m.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
