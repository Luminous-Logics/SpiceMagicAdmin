import { PAYMENT_STATUS_META, type PaymentStatus } from '@/lib/orders';

export default function PaymentStatusBadge({
  status,
  size = 'md',
}: {
  status: PaymentStatus;
  size?: 'sm' | 'md';
}) {
  const meta = PAYMENT_STATUS_META[status];
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
