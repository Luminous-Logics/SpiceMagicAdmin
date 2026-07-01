import { formatMoney } from '@/lib/orders';
import type { OrderSummary } from './types';

interface CardDef {
  key: keyof OrderSummary;
  label: string;
  icon: string;
  color: string;
  money?: boolean;
}

const CARDS: CardDef[] = [
  { key: 'todaysOrders', label: "Today's Orders", icon: 'fa-cart-shopping', color: '#E31E24' },
  { key: 'todaysRevenue', label: "Today's Revenue", icon: 'fa-sack-dollar', color: '#76a713', money: true },
  { key: 'openOrders', label: 'Open Orders', icon: 'fa-bolt', color: '#2563eb' },
  { key: 'completedOrders', label: 'Completed', icon: 'fa-circle-check', color: '#1a7a3c' },
  { key: 'cancelledOrders', label: 'Cancelled', icon: 'fa-ban', color: '#c0392b' },
  { key: 'pendingPayments', label: 'Pending Payments', icon: 'fa-clock', color: '#d97706' },
  { key: 'averageOrderValue', label: 'Avg Order Value', icon: 'fa-chart-line', color: '#7c3aed', money: true },
];

export default function SummaryCards({
  summary,
  loading,
}: {
  summary: OrderSummary | null;
  loading: boolean;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
        gap: 14,
        marginBottom: 24,
      }}
    >
      {CARDS.map((card) => {
        const value = summary ? summary[card.key] : 0;
        const display = card.money ? formatMoney(value) : String(value);
        return (
          <div
            key={card.key}
            style={{
              background: '#fff',
              border: '1px solid #eee',
              borderRadius: 14,
              padding: '16px 18px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: card.color + '14',
                color: card.color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <i className={`fas ${card.icon}`} style={{ fontSize: 18 }} />
            </div>
            <div style={{ minWidth: 0 }}>
              {loading ? (
                <div className="skeleton" style={{ height: 22, width: 60, marginBottom: 6 }} />
              ) : (
                <div style={{ fontSize: 22, fontWeight: 800, color: '#222', lineHeight: 1.1 }}>
                  {display}
                </div>
              )}
              <div style={{ fontSize: 12, color: '#888', fontWeight: 600, whiteSpace: 'nowrap' }}>
                {card.label}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
