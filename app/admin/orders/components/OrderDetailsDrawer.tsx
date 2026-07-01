'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  formatMoney,
  getNextStatus,
  isTerminal,
  ORDER_STATUS_META,
  DELIVERY_METHOD_META,
} from '@/lib/orders';
import type { Order } from './types';
import OrderStatusBadge from './OrderStatusBadge';
import PaymentStatusBadge from './PaymentStatusBadge';
import OrderTimeline from './OrderTimeline';

const PLACEHOLDER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 48 48'%3E%3Crect width='48' height='48' fill='%23f0f0f0'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-size='20' fill='%23ccc'%3E🌶%3C/text%3E%3C/svg%3E";

function shortId(id: string): string {
  return '#' + id.slice(-6).toUpperCase();
}

const ADDRESS_LABELS: Record<string, string> = {
  name: 'Name',
  phone: 'Phone',
  email: 'Email',
  line1: 'Address',
  address: 'Address',
  line2: 'Address 2',
  apartment: 'Apartment',
  city: 'City',
  state: 'State',
  zip: 'ZIP',
  postalCode: 'ZIP',
  country: 'Country',
  notes: 'Notes',
};

function Section({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 7 }}>
        <i className={`fas ${icon}`} style={{ color: '#bbb' }} /> {title}
      </div>
      {children}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '3px 0', fontSize: 13 }}>
      <span style={{ color: '#888' }}>{label}</span>
      <span style={{ color: strong ? '#222' : '#444', fontWeight: strong ? 700 : 500, textAlign: 'right' }}>{value}</span>
    </div>
  );
}

export default function OrderDetailsDrawer({
  order,
  onClose,
  onUpdated,
}: {
  order: Order | null;
  onClose: () => void;
  onUpdated: (updated: Order) => void;
}) {
  const [detail, setDetail] = useState<Order | null>(order);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [note, setNote] = useState('');

  // Seed from the passed row, then fetch the freshest copy by id.
  useEffect(() => {
    setDetail(order);
    setNote('');
    if (!order) return;
    let active = true;
    setLoading(true);
    fetch(`/api/orders/${order._id}`)
      .then((r) => r.json())
      .then((data) => { if (active && data.order) setDetail(data.order); })
      .catch(() => { /* keep the seeded row */ })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [order]);

  // Close on Escape.
  useEffect(() => {
    if (!order) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [order, onClose]);

  if (!order || !detail) return null;

  const next = getNextStatus(detail.orderStatus);
  const terminal = isTerminal(detail.orderStatus);

  const transition = async (target: string, confirmMessage?: string) => {
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    setUpdating(true);
    const res = await fetch(`/api/orders/${detail._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderStatus: target, note: note.trim() }),
    });
    const data = await res.json();
    setUpdating(false);
    if (res.ok && data.order) {
      setDetail(data.order);
      setNote('');
      onUpdated(data.order);
      toast.success(`Order marked ${ORDER_STATUS_META[target as keyof typeof ORDER_STATUS_META]?.label ?? target}`);
    } else {
      toast.error(data.error || 'Update failed');
    }
  };

  const printOrder = () => {
    const w = window.open('', '_blank', 'width=800,height=900');
    if (!w) return;
    const itemsRows = detail.items
      .map(
        (it) =>
          `<tr><td>${it.name}${it.modifiers?.length ? `<br/><small>${it.modifiers.map((m) => m.name).join(', ')}</small>` : ''}</td><td style="text-align:center">${it.quantity}</td><td style="text-align:right">${formatMoney(it.finalPrice * it.quantity)}</td></tr>`,
      )
      .join('');
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>Order ${shortId(detail._id)}</title>
      <style>body{font-family:Arial,sans-serif;padding:28px;color:#222}h1{font-size:20px}table{width:100%;border-collapse:collapse;margin-top:12px}td,th{border-bottom:1px solid #eee;padding:8px;font-size:13px;text-align:left}.totals td{border:none;padding:3px 8px}</style>
      </head><body>
      <h1>SpiceMagik — Order ${shortId(detail._id)}</h1>
      <div>${detail.customerName} · ${detail.customerPhone || detail.customerEmail}</div>
      <div>${new Date(detail.createdAt).toLocaleString()}</div>
      <table><thead><tr><th>Item</th><th>Qty</th><th>Amount</th></tr></thead><tbody>${itemsRows}</tbody></table>
      <table class="totals" style="margin-top:10px;max-width:280px;margin-left:auto">
        <tr><td>Subtotal</td><td style="text-align:right">${formatMoney(detail.subtotal)}</td></tr>
        <tr><td>Discount</td><td style="text-align:right">-${formatMoney(detail.couponDiscount)}</td></tr>
        <tr><td>Tax</td><td style="text-align:right">${formatMoney(detail.tax)}</td></tr>
        <tr><td>Delivery</td><td style="text-align:right">${formatMoney(detail.deliveryFee)}</td></tr>
        <tr><td><strong>Total</strong></td><td style="text-align:right"><strong>${formatMoney(detail.total)}</strong></td></tr>
      </table>
      <script>window.onload=function(){window.print()}</script>
      </body></html>`);
    w.document.close();
  };

  const addr = detail.deliveryAddress || {};
  const addrEntries = Object.entries(addr).filter(
    ([, v]) => v != null && v !== '' && typeof v !== 'object',
  );

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)', zIndex: 9500, display: 'flex', justifyContent: 'flex-end', animation: 'fadeIn 0.15s ease' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 520, height: '100%', background: '#fafafa', boxShadow: '-8px 0 32px rgba(0,0,0,0.18)', overflowY: 'auto', animation: 'slideInRight 0.22s ease' }}
      >
        {/* Header */}
        <div style={{ position: 'sticky', top: 0, zIndex: 2, background: '#fff', borderBottom: '1px solid #eee', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, color: '#999', fontWeight: 600 }}>Order</div>
            <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 18, color: '#222' }}>
              {shortId(detail._id)} {loading && <i className="fas fa-circle-notch fa-spin" style={{ fontSize: 12, color: '#bbb', marginLeft: 6 }} />}
            </div>
          </div>
          <button onClick={onClose} style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, width: 36, height: 36, cursor: 'pointer', color: '#555', fontSize: 16 }} aria-label="Close">
            <i className="fas fa-times" />
          </button>
        </div>

        <div style={{ padding: 20 }}>
          {/* Status row */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
            <OrderStatusBadge status={detail.orderStatus} />
            <PaymentStatusBadge status={detail.paymentStatus} />
            <span style={{ fontSize: 12, color: '#666', background: '#f3f4f6', borderRadius: 20, padding: '4px 12px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <i className={`fas ${DELIVERY_METHOD_META[detail.deliveryMethod].icon}`} />
              {DELIVERY_METHOD_META[detail.deliveryMethod].label}
            </span>
          </div>

          {/* Lifecycle actions */}
          <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: 16, marginBottom: 22 }}>
            {!terminal && (
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Optional note (recorded in the audit log)…"
                rows={2}
                style={{ width: '100%', border: '1px solid #ddd', borderRadius: 8, padding: '8px 10px', fontSize: 13, resize: 'vertical', outline: 'none', boxSizing: 'border-box', marginBottom: 10, fontFamily: 'inherit' }}
              />
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {next && (
                <button
                  onClick={() => transition(next)}
                  disabled={updating}
                  style={{ background: '#76a713', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontSize: 13, fontWeight: 700, cursor: updating ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 7 }}
                >
                  <i className={`fas ${ORDER_STATUS_META[next].icon}`} />
                  Mark {ORDER_STATUS_META[next].label}
                </button>
              )}
              {!terminal && (
                <button
                  onClick={() => transition('cancelled', 'Cancel this order? This cannot be undone.')}
                  disabled={updating}
                  style={{ background: '#fff5f5', color: '#E31E24', border: '1px solid #fcc', borderRadius: 8, padding: '10px 18px', fontSize: 13, fontWeight: 700, cursor: updating ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 7 }}
                >
                  <i className="fas fa-ban" /> Cancel Order
                </button>
              )}
              <button
                onClick={printOrder}
                style={{ background: '#fff', color: '#555', border: '1px solid #ddd', borderRadius: 8, padding: '10px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7 }}
              >
                <i className="fas fa-print" /> Print
              </button>
            </div>
            {terminal && (
              <div style={{ fontSize: 12, color: '#999', marginTop: 10 }}>
                <i className="fas fa-lock" style={{ marginRight: 6 }} />
                This order is {detail.orderStatus} and can no longer be changed.
              </div>
            )}
          </div>

          {/* Customer */}
          <Section icon="fa-user" title="Customer">
            <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontWeight: 700, color: '#222', marginBottom: 3 }}>{detail.customerName}</div>
              {detail.customerEmail && <div style={{ fontSize: 13, color: '#666' }}><i className="fas fa-envelope" style={{ width: 18, color: '#bbb' }} /> {detail.customerEmail}</div>}
              {detail.customerPhone && <div style={{ fontSize: 13, color: '#666' }}><i className="fas fa-phone" style={{ width: 18, color: '#bbb' }} /> {detail.customerPhone}</div>}
            </div>
          </Section>

          {/* Delivery address */}
          {addrEntries.length > 0 && (
            <Section icon="fa-location-dot" title="Delivery Address">
              <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 10, padding: '12px 14px' }}>
                {addrEntries.map(([key, val]) => (
                  <Row key={key} label={ADDRESS_LABELS[key] || key} value={String(val)} />
                ))}
              </div>
            </Section>
          )}

          {/* Items */}
          <Section icon="fa-bag-shopping" title={`Items (${detail.itemsCount})`}>
            <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 10, overflow: 'hidden' }}>
              {detail.items.map((it, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 12, padding: 12, borderBottom: idx < detail.items.length - 1 ? '1px solid #f0f0f0' : 'none' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={it.imageUrl || PLACEHOLDER} alt={it.name} width={48} height={48} style={{ borderRadius: 8, objectFit: 'cover', border: '1px solid #eee', flexShrink: 0 }} onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER; }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#222' }}>{it.name}</div>
                    {it.modifiers && it.modifiers.length > 0 && (
                      <div style={{ fontSize: 11.5, color: '#999', marginTop: 2 }}>
                        {it.modifiers.map((m, i) => (
                          <span key={i}>{m.name}{m.price ? ` (+${formatMoney(m.price)})` : ''}{i < it.modifiers!.length - 1 ? ', ' : ''}</span>
                        ))}
                      </div>
                    )}
                    <div style={{ fontSize: 12, color: '#888', marginTop: 3 }}>
                      {formatMoney(it.finalPrice)} × {it.quantity}
                      {it.discount > 0 && <span style={{ color: '#e67e22', marginLeft: 6 }}>−{it.discount}%</span>}
                    </div>
                  </div>
                  <div style={{ fontWeight: 700, color: '#222', fontSize: 13, whiteSpace: 'nowrap' }}>
                    {formatMoney(it.finalPrice * it.quantity)}
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* Price breakdown */}
          <Section icon="fa-receipt" title="Payment Summary">
            <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 10, padding: '12px 14px' }}>
              <Row label="Subtotal" value={formatMoney(detail.subtotal)} />
              {detail.couponDiscount > 0 && (
                <Row label={`Discount${detail.couponCode ? ` (${detail.couponCode})` : ''}`} value={`−${formatMoney(detail.couponDiscount)}`} />
              )}
              <Row label="Tax" value={formatMoney(detail.tax)} />
              <Row label="Delivery Fee" value={formatMoney(detail.deliveryFee)} />
              <div style={{ borderTop: '1px dashed #e5e5e5', margin: '8px 0' }} />
              <Row label="Grand Total" value={formatMoney(detail.total)} strong />
            </div>
          </Section>

          {/* Payment details */}
          <Section icon="fa-credit-card" title="Payment Details">
            <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 10, padding: '12px 14px' }}>
              <Row label="Payment Status" value={<PaymentStatusBadge status={detail.paymentStatus} size="sm" />} />
              <Row label="Method" value="Card (Stripe)" />
              {detail.stripePaymentIntentId && (
                <Row label="Transaction" value={<span style={{ fontFamily: 'monospace', fontSize: 11 }}>{detail.stripePaymentIntentId}</span>} />
              )}
            </div>
          </Section>

          {/* Timeline */}
          <Section icon="fa-clock-rotate-left" title="Timeline & Audit Log">
            <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 10, padding: '16px 14px' }}>
              <OrderTimeline history={detail.statusHistory} createdAt={detail.createdAt} />
            </div>
          </Section>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideInRight { from { transform: translateX(40px); opacity: 0.4 } to { transform: translateX(0); opacity: 1 } }
      `}</style>
    </div>
  );
}
