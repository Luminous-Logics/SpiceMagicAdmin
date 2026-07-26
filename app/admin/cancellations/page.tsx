'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import Navbar from '@/app/components/Navbar';
import Breadcrumb from '@/app/components/Breadcrumb';
import Footer from '@/app/components/Footer';
import { formatMoney, PAYMENT_STATUS_META, type PaymentStatus } from '@/lib/orders';

// ---------------------------------------------------------------------------
// Types (mirror the API's CancellationOrderView shape)
// ---------------------------------------------------------------------------

interface RequestItem {
  productId: string;
  name: string;
  quantity: number;
  lineItemIds: string[];
  unitRefundAmount: number;
  refundAmount: number;
}

interface CancellationRequest {
  requestId: string;
  status: 'pending' | 'approved' | 'rejected';
  reason: string;
  refundAmount: number;
  requestedAt: string | null;
  processedAt: string | null;
  processedBy: string;
  adminNote: string;
  cloverRefundId: string;
  items: RequestItem[];
}

interface CancellationOrder {
  orderId: string;
  shortId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  orderTotal: number;
  totalRefunded: number;
  paymentStatus: string;
  orderStatus: string;
  cloverOrderId: string;
  createdAt: string | null;
  requests: CancellationRequest[];
}

type TabKey = 'pending' | 'approved' | 'rejected' | 'all';

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'pending', label: 'Pending', icon: 'fa-hourglass-half' },
  { key: 'approved', label: 'Approved', icon: 'fa-circle-check' },
  { key: 'rejected', label: 'Rejected', icon: 'fa-circle-xmark' },
  { key: 'all', label: 'All', icon: 'fa-list' },
];

const RED = '#E31E24';

const REQUEST_STATUS_META: Record<
  CancellationRequest['status'],
  { label: string; color: string; bg: string; icon: string }
> = {
  pending: { label: 'Pending', color: '#b8860b', bg: '#fef7e0', icon: 'fa-hourglass-half' },
  approved: { label: 'Approved', color: '#1a7a3c', bg: '#e6f9ee', icon: 'fa-circle-check' },
  rejected: { label: 'Rejected', color: '#c0392b', bg: '#fde8e8', icon: 'fa-circle-xmark' },
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function CancellationsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const isAdmin = session?.user?.role === 'admin';

  const [tab, setTab] = useState<TabKey>('pending');
  const [orders, setOrders] = useState<CancellationOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);

  // Action modals
  const [approveTarget, setApproveTarget] = useState<
    { order: CancellationOrder; request: CancellationRequest } | null
  >(null);
  const [rejectTarget, setRejectTarget] = useState<
    { order: CancellationOrder; request: CancellationRequest } | null
  >(null);
  const [rejectNote, setRejectNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === 'loading') return;
    if (!session || !isAdmin) router.replace('/login');
  }, [session, status, isAdmin, router]);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/cancellations?status=${tab}`);
      if (!res.ok) throw new Error('Failed to load cancellation requests');
      const data = await res.json();
      setOrders(data.orders || []);
      setPendingCount(data.pendingCount ?? 0);
    } catch (err) {
      toast.error((err as Error).message || 'Failed to load requests');
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    if (isAdmin) fetchRequests();
  }, [isAdmin, fetchRequests]);

  async function handleApprove() {
    if (!approveTarget) return;
    const { order, request } = approveTarget;
    setSubmitting(true);
    const toastId = toast.loading('Issuing refund via Clover…');
    try {
      const res = await fetch(
        `/api/admin/cancellations/${order.orderId}/${request.requestId}/approve`,
        { method: 'POST' },
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Refund failed');
      }
      toast.success(
        data.alreadyProcessed
          ? `Request already ${data.request?.status}`
          : 'Refund issued and cancellation approved.',
        { id: toastId },
      );
      setApproveTarget(null);
      await fetchRequests();
    } catch (err) {
      toast.error((err as Error).message || 'Refund failed', { id: toastId });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReject() {
    if (!rejectTarget) return;
    const { order, request } = rejectTarget;
    setSubmitting(true);
    const toastId = toast.loading('Rejecting request…');
    try {
      const res = await fetch(
        `/api/admin/cancellations/${order.orderId}/${request.requestId}/reject`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ note: rejectNote.trim() }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Reject failed');
      toast.success('Cancellation request rejected.', { id: toastId });
      setRejectTarget(null);
      setRejectNote('');
      await fetchRequests();
    } catch (err) {
      toast.error((err as Error).message || 'Reject failed', { id: toastId });
    } finally {
      setSubmitting(false);
    }
  }

  if (status === 'loading' || !session || !isAdmin) return null;

  const totalRequests = orders.reduce((sum, o) => sum + o.requests.length, 0);

  return (
    <>
      <Navbar />
      <Breadcrumb
        title="Cancellation Requests"
        items={[{ label: 'Home', href: '/' }, { label: 'Admin', href: '/admin' }, { label: 'Cancellations' }]}
      />

      <div style={{ minHeight: '60vh', padding: '20px 0 60px' }}>
        <div className="container">
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#222' }}>
                Cancellation Requests
              </h1>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: '#777' }}>
                Review and approve or reject customer cancellation requests. Approving issues a real Clover refund.
              </p>
            </div>
            <button
              onClick={fetchRequests}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: '#fff', border: '1.5px solid #e5e7eb', borderRadius: 12,
                padding: '10px 16px', fontSize: 13, fontWeight: 600, color: '#444', cursor: 'pointer',
              }}
            >
              <i className="fas fa-rotate" /> Refresh
            </button>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
            {TABS.map((t) => {
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    background: active ? RED : '#fff',
                    color: active ? '#fff' : '#555',
                    border: `1.5px solid ${active ? RED : '#e5e7eb'}`,
                    borderRadius: 12, padding: '9px 16px',
                    fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  <i className={`fas ${t.icon}`} />
                  {t.label}
                  {t.key === 'pending' && pendingCount > 0 && (
                    <span style={{
                      background: active ? '#fff' : RED,
                      color: active ? RED : '#fff',
                      borderRadius: 20, fontSize: 11, fontWeight: 800,
                      padding: '1px 8px', minWidth: 20, textAlign: 'center',
                    }}>
                      {pendingCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Content */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: '80px 0', color: '#999' }}>
              <i className="fas fa-spinner fa-spin" style={{ fontSize: 28 }} />
              <p style={{ marginTop: 12, fontSize: 14 }}>Loading requests…</p>
            </div>
          ) : totalRequests === 0 ? (
            <div style={{
              textAlign: 'center', padding: '80px 20px', background: '#fff',
              borderRadius: 16, border: '1px solid #eee',
            }}>
              <div style={{
                width: 64, height: 64, borderRadius: '50%', background: '#f3f4f6',
                display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
              }}>
                <i className="fas fa-inbox" style={{ fontSize: 26, color: '#9ca3af' }} />
              </div>
              <h3 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 700, color: '#374151' }}>
                No {tab === 'all' ? '' : tab} cancellation requests
              </h3>
              <p style={{ margin: 0, fontSize: 13, color: '#9ca3af' }}>
                {tab === 'pending'
                  ? 'New customer requests will show up here.'
                  : 'Nothing to display for this filter.'}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {orders.map((order) =>
                order.requests.map((request) => (
                  <RequestCard
                    key={request.requestId}
                    order={order}
                    request={request}
                    onApprove={() => setApproveTarget({ order, request })}
                    onReject={() => { setRejectTarget({ order, request }); setRejectNote(''); }}
                  />
                )),
              )}
            </div>
          )}
        </div>
      </div>

      <Footer />

      {/* Approve confirmation modal */}
      {approveTarget && (
        <ActionModal
          icon="fa-money-bill-transfer"
          accent="#1a7a3c"
          title="Approve & issue refund?"
          onClose={() => !submitting && setApproveTarget(null)}
        >
          <p style={{ margin: '0 0 18px', fontSize: 14, color: '#555', lineHeight: 1.6 }}>
            This will issue a <strong>real Clover refund</strong> of{' '}
            <strong>{formatMoney(approveTarget.request.refundAmount)}</strong> for order{' '}
            <strong>#{approveTarget.order.shortId}</strong> and restore inventory. This cannot be undone.
          </p>
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              onClick={() => setApproveTarget(null)}
              disabled={submitting}
              style={secondaryBtn}
            >
              Cancel
            </button>
            <button
              onClick={handleApprove}
              disabled={submitting}
              style={{ ...primaryBtn, background: '#1a7a3c', boxShadow: '0 4px 14px rgba(26,122,60,0.3)' }}
            >
              {submitting ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-check" />}
              {submitting ? ' Processing…' : ' Approve & Refund'}
            </button>
          </div>
        </ActionModal>
      )}

      {/* Reject modal with note */}
      {rejectTarget && (
        <ActionModal
          icon="fa-ban"
          accent={RED}
          title="Reject this request?"
          onClose={() => !submitting && setRejectTarget(null)}
        >
          <p style={{ margin: '0 0 12px', fontSize: 14, color: '#555', lineHeight: 1.6 }}>
            Rejecting order <strong>#{rejectTarget.order.shortId}</strong>&apos;s request. No refund will be
            issued. Optionally add a note for the record.
          </p>
          <textarea
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
            placeholder="Reason for rejection (optional)…"
            rows={3}
            style={{
              width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 12,
              padding: '10px 12px', fontSize: 14, resize: 'vertical', marginBottom: 18,
              fontFamily: 'inherit', outline: 'none',
            }}
          />
          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={() => setRejectTarget(null)} disabled={submitting} style={secondaryBtn}>
              Cancel
            </button>
            <button
              onClick={handleReject}
              disabled={submitting}
              style={{ ...primaryBtn, background: RED, boxShadow: '0 4px 14px rgba(227,30,36,0.3)' }}
            >
              {submitting ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-ban" />}
              {submitting ? ' Rejecting…' : ' Reject Request'}
            </button>
          </div>
        </ActionModal>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Request card
// ---------------------------------------------------------------------------

function RequestCard({
  order,
  request,
  onApprove,
  onReject,
}: {
  order: CancellationOrder;
  request: CancellationRequest;
  onApprove: () => void;
  onReject: () => void;
}) {
  const meta = REQUEST_STATUS_META[request.status];
  const payMeta = PAYMENT_STATUS_META[order.paymentStatus as PaymentStatus];
  const isPending = request.status === 'pending';

  return (
    <div style={{
      background: '#fff', borderRadius: 16, border: '1px solid #eee',
      boxShadow: '0 2px 12px rgba(0,0,0,0.04)', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 10, padding: '14px 18px', borderBottom: '1px solid #f1f1f1',
        background: '#fafafa',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: '#222' }}>
            #{order.shortId}
          </span>
          <StatusBadge label={meta.label} color={meta.color} bg={meta.bg} icon={meta.icon} />
          {payMeta && (
            <StatusBadge label={payMeta.label} color={payMeta.color} bg={payMeta.bg} icon={payMeta.icon} />
          )}
        </div>
        <span style={{ fontSize: 12, color: '#999' }}>
          <i className="far fa-clock" style={{ marginRight: 5 }} />
          {formatDate(request.requestedAt)}
        </span>
      </div>

      {/* Body */}
      <div style={{ padding: '16px 18px' }}>
        {/* Customer */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 18px', marginBottom: 14, fontSize: 13 }}>
          <span style={{ color: '#444' }}>
            <i className="fas fa-user" style={{ color: '#9ca3af', marginRight: 6 }} />
            {order.customerName || 'Guest'}
          </span>
          {order.customerEmail && (
            <span style={{ color: '#777' }}>
              <i className="fas fa-envelope" style={{ color: '#9ca3af', marginRight: 6 }} />
              {order.customerEmail}
            </span>
          )}
          {order.customerPhone && (
            <span style={{ color: '#777' }}>
              <i className="fas fa-phone" style={{ color: '#9ca3af', marginRight: 6 }} />
              {order.customerPhone}
            </span>
          )}
        </div>

        {/* Items */}
        <div style={{ background: '#fafafa', borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
          {request.items.map((item, i) => (
            <div key={`${item.productId}-${i}`} style={{
              display: 'flex', justifyContent: 'space-between', gap: 10,
              padding: '4px 0', fontSize: 13,
              borderBottom: i < request.items.length - 1 ? '1px dashed #e5e7eb' : 'none',
            }}>
              <span style={{ color: '#333' }}>
                {item.name} <span style={{ color: '#999' }}>× {item.quantity}</span>
              </span>
              <span style={{ color: '#555', fontWeight: 600 }}>{formatMoney(item.refundAmount)}</span>
            </div>
          ))}
        </div>

        {/* Reason + total */}
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10, marginBottom: isPending || request.status !== 'pending' ? 14 : 0 }}>
          <div style={{ fontSize: 13, color: '#666', maxWidth: '60%' }}>
            {request.reason ? (
              <><strong style={{ color: '#444' }}>Reason:</strong> {request.reason}</>
            ) : (
              <span style={{ color: '#aaa', fontStyle: 'italic' }}>No reason provided</span>
            )}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5 }}>Refund amount</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: RED }}>{formatMoney(request.refundAmount)}</div>
          </div>
        </div>

        {/* Processed info (history) */}
        {request.status !== 'pending' && (
          <div style={{
            background: meta.bg, borderRadius: 10, padding: '10px 12px', fontSize: 12.5,
            color: meta.color, display: 'flex', flexWrap: 'wrap', gap: '2px 16px',
          }}>
            <span><strong>{meta.label}</strong> {request.processedAt ? `on ${formatDate(request.processedAt)}` : ''}</span>
            {request.processedBy && <span>by {request.processedBy}</span>}
            {request.cloverRefundId && <span>Clover refund: <code>{request.cloverRefundId}</code></span>}
            {request.adminNote && <span style={{ width: '100%' }}>Note: {request.adminNote}</span>}
          </div>
        )}

        {/* Actions */}
        {isPending && (
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button
              onClick={onReject}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                background: '#fff', color: RED, border: `1.5px solid ${RED}`,
                borderRadius: 10, padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              }}
            >
              <i className="fas fa-ban" /> Reject
            </button>
            <button
              onClick={onApprove}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                background: '#1a7a3c', color: '#fff', border: 'none',
                borderRadius: 10, padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(26,122,60,0.28)',
              }}
            >
              <i className="fas fa-check" /> Approve &amp; Refund
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ label, color, bg, icon }: { label: string; color: string; bg: string; icon: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      background: bg, color, borderRadius: 20, padding: '3px 11px',
      fontSize: 11.5, fontWeight: 700,
    }}>
      <i className={`fas ${icon}`} /> {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Modal shell
// ---------------------------------------------------------------------------

function ActionModal({
  icon,
  accent,
  title,
  children,
  onClose,
}: {
  icon: string;
  accent: string;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        backdropFilter: 'blur(2px)', zIndex: 9000, display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 20, padding: '28px 28px 24px',
          width: '100%', maxWidth: 460, boxShadow: '0 24px 60px rgba(0,0,0,0.18)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
          <div style={{
            width: 52, height: 52, borderRadius: '50%', background: `${accent}15`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <i className={`fas ${icon}`} style={{ fontSize: 21, color: accent }} />
          </div>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#111' }}>{title}</h3>
        </div>
        {children}
      </div>
    </div>
  );
}

const secondaryBtn: React.CSSProperties = {
  flex: 1, background: '#f1f5f9', color: '#444', border: '1.5px solid #e5e7eb',
  borderRadius: 12, padding: '12px 0', fontSize: 14, fontWeight: 600, cursor: 'pointer',
};

const primaryBtn: React.CSSProperties = {
  flex: 1, color: '#fff', border: 'none', borderRadius: 12, padding: '12px 0',
  fontSize: 14, fontWeight: 700, cursor: 'pointer',
};
