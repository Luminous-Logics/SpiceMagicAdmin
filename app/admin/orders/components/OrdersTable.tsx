'use client';

import {
  formatMoney,
  DELIVERY_METHOD_META,
} from '@/lib/orders';
import type { Order } from './types';
import OrderStatusBadge from './OrderStatusBadge';
import PaymentStatusBadge from './PaymentStatusBadge';

const COLS = 11;

function shortId(id: string): string {
  return '#' + id.slice(-6).toUpperCase();
}

function fmtDateTime(iso: string): { date: string; time: string } {
  if (!iso) return { date: '—', time: '' };
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
  };
}

export default function OrdersTable({
  orders,
  loading,
  error,
  page,
  pages,
  total,
  limit,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onRowClick,
  onPageChange,
  onRetry,
}: {
  orders: Order[];
  loading: boolean;
  error: string | null;
  page: number;
  pages: number;
  total: number;
  limit: number;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onRowClick: (order: Order) => void;
  onPageChange: (page: number) => void;
  onRetry: () => void;
}) {
  const allSelected = orders.length > 0 && orders.every((o) => selectedIds.has(o._id));

  // ----- Error state -----
  if (error) {
    return (
      <div style={{ background: '#fde8e8', border: '1px solid #f5c6cb', borderRadius: 12, padding: '32px 24px', textAlign: 'center', color: '#c0392b' }}>
        <i className="fas fa-triangle-exclamation" style={{ fontSize: 30, marginBottom: 12, display: 'block' }} />
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Failed to load orders</div>
        <div style={{ fontSize: 13, color: '#a5595e', marginBottom: 16 }}>{error}</div>
        <button onClick={onRetry} style={{ background: '#E31E24', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          <i className="fas fa-rotate-right" style={{ marginRight: 7 }} /> Retry
        </button>
      </div>
    );
  }

  const headerCellStyle: React.CSSProperties = { padding: '11px 14px', fontWeight: 700, fontSize: 12, color: '#555', textAlign: 'left', whiteSpace: 'nowrap' };
  const cellStyle: React.CSSProperties = { padding: '12px 14px', fontSize: 13, color: '#444', verticalAlign: 'middle' };

  return (
    <>
      {/* Desktop table */}
      <div className="d-none d-lg-block" style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid #eee', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
          <thead>
            <tr style={{ background: '#fafafa', borderBottom: '2px solid #eee' }}>
              <th style={{ ...headerCellStyle, width: 40 }}>
                <input type="checkbox" checked={allSelected} onChange={onToggleSelectAll} style={{ width: 16, height: 16, accentColor: '#76a713', cursor: 'pointer' }} aria-label="Select all" />
              </th>
              {['Order ID', 'Customer', 'Phone', 'Date & Time', 'Items', 'Total', 'Payment', 'Status', 'Delivery', 'Actions'].map((h) => (
                <th key={h} style={headerCellStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    {Array.from({ length: COLS }).map((__, j) => (
                      <td key={j} style={{ padding: '12px 14px' }}>
                        <div className="skeleton" style={{ height: 16, width: j === 0 ? 16 : '75%' }} />
                      </td>
                    ))}
                  </tr>
                ))
              : orders.map((o, i) => {
                  const dt = fmtDateTime(o.createdAt);
                  const selected = selectedIds.has(o._id);
                  return (
                    <tr
                      key={o._id}
                      onClick={() => onRowClick(o)}
                      style={{ background: selected ? '#f0fce8' : i % 2 === 0 ? '#fff' : '#fafafa', borderBottom: '1px solid #f0f0f0', cursor: 'pointer' }}
                    >
                      <td style={cellStyle} onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={selected} onChange={() => onToggleSelect(o._id)} style={{ width: 16, height: 16, accentColor: '#76a713', cursor: 'pointer' }} aria-label={`Select order ${shortId(o._id)}`} />
                      </td>
                      <td style={cellStyle}>
                        <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#222' }}>{shortId(o._id)}</span>
                      </td>
                      <td style={cellStyle}>
                        <div style={{ fontWeight: 600, color: '#222' }}>{o.customerName}</div>
                        <div style={{ fontSize: 11, color: '#aaa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>{o.customerEmail || '—'}</div>
                      </td>
                      <td style={cellStyle}>{o.customerPhone || '—'}</td>
                      <td style={cellStyle}>
                        <div>{dt.date}</div>
                        <div style={{ fontSize: 11, color: '#aaa' }}>{dt.time}</div>
                      </td>
                      <td style={{ ...cellStyle, textAlign: 'center' }}>{o.itemsCount}</td>
                      <td style={{ ...cellStyle, fontWeight: 700, color: '#222' }}>{formatMoney(o.total)}</td>
                      <td style={cellStyle}><PaymentStatusBadge status={o.paymentStatus} size="sm" /></td>
                      <td style={cellStyle}><OrderStatusBadge status={o.orderStatus} size="sm" /></td>
                      <td style={cellStyle}>
                        <span style={{ fontSize: 12, color: '#666' }}>
                          <i className={`fas ${DELIVERY_METHOD_META[o.deliveryMethod].icon}`} style={{ marginRight: 5, color: '#999' }} />
                          {DELIVERY_METHOD_META[o.deliveryMethod].label}
                        </span>
                      </td>
                      <td style={cellStyle} onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => onRowClick(o)}
                          style={{ background: '#fff', border: '1px solid #ddd', borderRadius: 6, padding: '5px 12px', fontSize: 12, cursor: 'pointer', color: '#444', fontWeight: 600, whiteSpace: 'nowrap' }}
                        >
                          <i className="fas fa-eye" style={{ marginRight: 5 }} /> View
                        </button>
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
        {!loading && orders.length === 0 && <EmptyState />}
      </div>

      {/* Mobile / tablet cards */}
      <div className="d-lg-none">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 128, borderRadius: 12, marginBottom: 12 }} />
            ))
          : orders.length === 0
          ? <EmptyState />
          : orders.map((o) => {
              const dt = fmtDateTime(o.createdAt);
              const selected = selectedIds.has(o._id);
              return (
                <div
                  key={o._id}
                  onClick={() => onRowClick(o)}
                  style={{ background: selected ? '#f0fce8' : '#fff', border: `1px solid ${selected ? '#c5e8a0' : '#eee'}`, borderRadius: 12, padding: 14, marginBottom: 12, boxShadow: '0 2px 6px rgba(0,0,0,0.04)', cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <input type="checkbox" checked={selected} onClick={(e) => e.stopPropagation()} onChange={() => onToggleSelect(o._id)} style={{ width: 16, height: 16, accentColor: '#76a713', marginTop: 3, cursor: 'pointer' }} aria-label={`Select order ${shortId(o._id)}`} />
                      <div>
                        <div style={{ fontFamily: 'monospace', fontWeight: 700, color: '#222', fontSize: 14 }}>{shortId(o._id)}</div>
                        <div style={{ fontSize: 12, color: '#888' }}>{dt.date} · {dt.time}</div>
                      </div>
                    </div>
                    <div style={{ fontWeight: 800, color: '#222', fontSize: 15 }}>{formatMoney(o.total)}</div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>{o.customerName}</div>
                  <div style={{ fontSize: 12, color: '#999', marginBottom: 10 }}>{o.customerPhone || o.customerEmail || '—'} · {o.itemsCount} item(s)</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <PaymentStatusBadge status={o.paymentStatus} size="sm" />
                    <OrderStatusBadge status={o.orderStatus} size="sm" />
                    <span style={{ fontSize: 11, color: '#666', background: '#f3f4f6', borderRadius: 20, padding: '3px 10px', fontWeight: 600 }}>
                      <i className={`fas ${DELIVERY_METHOD_META[o.deliveryMethod].icon}`} style={{ marginRight: 5 }} />
                      {DELIVERY_METHOD_META[o.deliveryMethod].label}
                    </span>
                  </div>
                </div>
              );
            })}
      </div>

      {/* Pagination */}
      {!loading && orders.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginTop: 18 }}>
          <div style={{ fontSize: 13, color: '#888' }}>
            Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <PageBtn disabled={page <= 1} onClick={() => onPageChange(page - 1)}><i className="fas fa-chevron-left" /></PageBtn>
            <span style={{ fontSize: 13, color: '#555', fontWeight: 600, padding: '0 8px' }}>Page {page} of {pages}</span>
            <PageBtn disabled={page >= pages} onClick={() => onPageChange(page + 1)}><i className="fas fa-chevron-right" /></PageBtn>
          </div>
        </div>
      )}
    </>
  );
}

function PageBtn({ children, disabled, onClick }: { children: React.ReactNode; disabled: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: '#fff', border: '1px solid #ddd', borderRadius: 8, padding: '7px 12px',
        fontSize: 13, cursor: disabled ? 'not-allowed' : 'pointer', color: disabled ? '#ccc' : '#444',
      }}
    >
      {children}
    </button>
  );
}

function EmptyState() {
  return (
    <div style={{ padding: '48px 24px', textAlign: 'center', color: '#aaa', background: '#fff', borderRadius: 12 }}>
      <i className="fas fa-receipt" style={{ fontSize: 34, marginBottom: 12, display: 'block' }} />
      <div style={{ fontWeight: 600, color: '#888' }}>No orders found</div>
      <div style={{ fontSize: 13, marginTop: 4 }}>Try adjusting your search or filters.</div>
    </div>
  );
}
