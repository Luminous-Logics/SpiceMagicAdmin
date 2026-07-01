import { ORDER_STATUS_META, type OrderStatus } from '@/lib/orders';

export default function OrderStatusBadge({
  status,
  size = 'md',
}: {
  status: OrderStatus;
  size?: 'sm' | 'md';
}) {
  const meta = ORDER_STATUS_META[status];
  const pad = size === 'sm' ? '3px 9px' : '4px 12px';
  const fontSize = size === 'sm' ? 11 : 12;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        background: meta.bg,
        color: meta.color,
        padding: pad,
        borderRadius: 20,
        fontSize,
        fontWeight: 700,
        whiteSpace: 'nowrap',
        lineHeight: 1.2,
      }}
    >
      <i className={`fas ${meta.icon}`} style={{ fontSize: fontSize - 1 }} />
      {meta.label}
    </span>
  );
}
