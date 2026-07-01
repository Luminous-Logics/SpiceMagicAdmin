import { ORDER_STATUS_META, normalizeOrderStatus } from '@/lib/orders';
import type { OrderStatusHistoryEntry } from './types';

function fmt(iso: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function OrderTimeline({
  history,
  createdAt,
}: {
  history: OrderStatusHistoryEntry[];
  createdAt: string;
}) {
  // Synthesize an initial "Order placed" event so even legacy orders with no
  // recorded history still show a starting point.
  const events = [
    {
      to: 'pending',
      label: 'Order placed',
      changedByName: 'Customer',
      changedAt: createdAt,
      note: '',
      synthetic: true,
    },
    ...history.map((h) => ({
      to: h.to,
      label: ORDER_STATUS_META[normalizeOrderStatus(h.to)].label,
      changedByName: h.changedByName || h.changedByEmail || 'System',
      changedAt: h.changedAt,
      note: h.note || '',
      synthetic: false,
    })),
  ];

  return (
    <div style={{ position: 'relative', paddingLeft: 6 }}>
      {events.map((e, i) => {
        const meta = ORDER_STATUS_META[normalizeOrderStatus(e.to)];
        const isLast = i === events.length - 1;
        return (
          <div key={i} style={{ display: 'flex', gap: 12, position: 'relative' }}>
            {/* Rail + dot */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  background: meta.color,
                  border: '2px solid #fff',
                  boxShadow: `0 0 0 2px ${meta.color}40`,
                  flexShrink: 0,
                  marginTop: 3,
                }}
              />
              {!isLast && <div style={{ width: 2, flex: 1, background: '#eee', minHeight: 26 }} />}
            </div>
            {/* Content */}
            <div style={{ paddingBottom: isLast ? 0 : 18, flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#222' }}>{e.label}</div>
              <div style={{ fontSize: 11.5, color: '#999', marginTop: 1 }}>
                {fmt(e.changedAt)} · by {e.changedByName}
              </div>
              {e.note && (
                <div style={{ fontSize: 12, color: '#666', marginTop: 4, background: '#f7f7f7', borderRadius: 6, padding: '5px 9px' }}>
                  “{e.note}”
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
