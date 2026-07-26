'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatMoney } from '@/lib/orders';
import type { Order } from './types';

interface CancelOrderModalProps {
  open: boolean;
  order: Order;
  busy: boolean;
  /** null => cancel whole order (unpaid); array => refund the selected units. */
  onConfirm: (items: { productId: string; quantity: number }[] | null) => void;
  onCancel: () => void;
}

/** Units still refundable for an item (never negative). */
function remainingOf(it: Order['items'][number]): number {
  return Math.max(0, (it.quantity ?? 0) - (it.cancelledQuantity ?? 0));
}

/** Per-unit refund in cents (discounted price + per-unit tax). */
function unitRefundOf(it: Order['items'][number]): number {
  return (it.finalPrice ?? 0) + (it.taxPerUnit ?? 0);
}

export default function CancelOrderModal({
  open,
  order,
  busy,
  onConfirm,
  onCancel,
}: CancelOrderModalProps) {
  const willRefund =
    order.paymentStatus === 'paid' || order.paymentStatus === 'partially_refunded';

  // Only items with units left to refund are selectable.
  const refundableItems = useMemo(
    () => order.items.filter((it) => remainingOf(it) > 0),
    [order.items],
  );

  // productId -> chosen quantity. Defaults to "everything" so the common case
  // (cancel the whole order) is a single click.
  const [qty, setQty] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!open) return;
    const initial: Record<string, number> = {};
    refundableItems.forEach((it) => {
      initial[it.productId] = remainingOf(it);
    });
    setQty(initial);
  }, [open, refundableItems]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, busy, onCancel]);

  const selectedUnits = Object.values(qty).reduce((s, n) => s + (n || 0), 0);
  const totalRemaining = refundableItems.reduce((s, it) => s + remainingOf(it), 0);
  const isFull = selectedUnits >= totalRemaining && totalRemaining > 0;
  const refundTotal = refundableItems.reduce(
    (sum, it) => sum + unitRefundOf(it) * (qty[it.productId] ?? 0),
    0,
  );

  if (!open) return null;

  const setItemQty = (productId: string, next: number, max: number) => {
    setQty((prev) => ({ ...prev, [productId]: Math.max(0, Math.min(next, max)) }));
  };

  const confirm = () => {
    if (busy) return;
    if (!willRefund) {
      onConfirm(null);
      return;
    }
    const items = refundableItems
      .map((it) => ({ productId: it.productId, quantity: qty[it.productId] ?? 0 }))
      .filter((x) => x.quantity > 0);
    if (items.length === 0) return;
    onConfirm(items);
  };

  const confirmLabel = !willRefund
    ? 'Cancel Order'
    : isFull
      ? `Cancel & Refund ${formatMoney(refundTotal)}`
      : `Refund ${formatMoney(refundTotal)}`;

  return (
    <div
      onClick={() => !busy && onCancel()}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)',
        zIndex: 9600,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20, animation: 'fadeIn 0.15s ease',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 18, width: '100%', maxWidth: 460,
          maxHeight: '86vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 24px 60px rgba(0,0,0,0.2)', overflow: 'hidden',
          animation: 'slideUp 0.18s ease',
        }}
      >
        {/* Header */}
        <div style={{ padding: '20px 22px 14px', textAlign: 'center' }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%', background: '#fff5f5',
            border: '2px solid #fecaca', display: 'flex', alignItems: 'center',
            justifyContent: 'center', margin: '0 auto 14px',
          }}>
            <i className="fas fa-ban" style={{ fontSize: 22, color: '#E31E24' }} />
          </div>
          <h3 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 800, color: '#111' }}>
            {willRefund ? 'Cancel & Refund' : 'Cancel Order?'}
          </h3>
          <p style={{ margin: 0, fontSize: 13, color: '#666', lineHeight: 1.5 }}>
            {willRefund
              ? 'Choose which items to refund via Clover. Refunding all items cancels the whole order; refunding some keeps it open.'
              : 'This will cancel the order. This cannot be undone.'}
          </p>
        </div>

        {/* Item selection (paid orders only) */}
        {willRefund && (
          <div style={{ overflowY: 'auto', padding: '0 22px', flex: 1 }}>
            {refundableItems.map((it) => {
              const remaining = remainingOf(it);
              const chosen = qty[it.productId] ?? 0;
              const already = it.cancelledQuantity ?? 0;
              return (
                <div
                  key={it.productId}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 0', borderBottom: '1px solid #f1f1f1',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: '#222' }}>{it.name}</div>
                    <div style={{ fontSize: 11.5, color: '#999', marginTop: 2 }}>
                      {formatMoney(unitRefundOf(it))} each · {remaining} refundable
                      {already > 0 && <span style={{ color: '#b45309' }}> · {already} already refunded</span>}
                    </div>
                  </div>

                  {/* Quantity stepper */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 0, border: '1px solid #e5e7eb', borderRadius: 9, overflow: 'hidden' }}>
                    <button
                      type="button"
                      onClick={() => setItemQty(it.productId, chosen - 1, remaining)}
                      disabled={busy || chosen <= 0}
                      style={{ width: 30, height: 30, border: 'none', background: '#f8fafc', color: '#444', cursor: busy || chosen <= 0 ? 'not-allowed' : 'pointer', fontSize: 15 }}
                    >
                      −
                    </button>
                    <span style={{ width: 34, textAlign: 'center', fontSize: 13.5, fontWeight: 700, color: '#222' }}>{chosen}</span>
                    <button
                      type="button"
                      onClick={() => setItemQty(it.productId, chosen + 1, remaining)}
                      disabled={busy || chosen >= remaining}
                      style={{ width: 30, height: 30, border: 'none', background: '#f8fafc', color: '#444', cursor: busy || chosen >= remaining ? 'not-allowed' : 'pointer', fontSize: 15 }}
                    >
                      +
                    </button>
                  </div>

                  <div style={{ width: 66, textAlign: 'right', fontSize: 13, fontWeight: 700, color: '#222' }}>
                    {formatMoney(unitRefundOf(it) * chosen)}
                  </div>
                </div>
              );
            })}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0 4px' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#444' }}>Refund total</span>
              <span style={{ fontSize: 17, fontWeight: 800, color: '#E31E24' }}>{formatMoney(refundTotal)}</span>
            </div>
            {!isFull && selectedUnits > 0 && (
              <div style={{ fontSize: 11.5, color: '#888', paddingBottom: 8 }}>
                <i className="fas fa-circle-info" style={{ marginRight: 5 }} />
                Partial refund — the order stays open for the remaining items.
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 12, padding: '16px 22px 20px', borderTop: '1px solid #f1f1f1' }}>
          <button
            onClick={() => !busy && onCancel()}
            disabled={busy}
            style={{ flex: 1, background: '#f1f5f9', color: '#444', border: '1.5px solid #e5e7eb', borderRadius: 12, padding: '12px 0', fontSize: 14, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer' }}
          >
            Keep Order
          </button>
          <button
            onClick={confirm}
            disabled={busy || (willRefund && selectedUnits <= 0)}
            style={{
              flex: 1.4,
              background: busy || (willRefund && selectedUnits <= 0)
                ? '#f0a5a8'
                : 'linear-gradient(135deg, #e74c3c, #E31E24)',
              color: '#fff', border: 'none', borderRadius: 12, padding: '12px 0',
              fontSize: 14, fontWeight: 700,
              cursor: busy || (willRefund && selectedUnits <= 0) ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 14px rgba(227,30,36,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            }}
          >
            <i className={`fas ${busy ? 'fa-circle-notch fa-spin' : 'fa-ban'}`} />
            {busy ? 'Processing…' : confirmLabel}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn  { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { transform: translateY(16px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
      `}</style>
    </div>
  );
}
