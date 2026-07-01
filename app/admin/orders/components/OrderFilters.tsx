import {
  ORDER_STATUSES,
  PAYMENT_STATUSES,
  DELIVERY_METHODS,
  ORDER_STATUS_META,
  PAYMENT_STATUS_META,
  DELIVERY_METHOD_META,
} from '@/lib/orders';
import type { OrderFilterState } from './types';

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 11px',
  border: '1px solid #ddd',
  borderRadius: 8,
  fontSize: 13,
  outline: 'none',
  boxSizing: 'border-box',
  background: '#fff',
};
const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: '#555',
  marginBottom: 5,
  display: 'block',
};

export default function OrderFilters({
  open,
  value,
  onChange,
  onApply,
  onClear,
}: {
  open: boolean;
  value: OrderFilterState;
  onChange: (next: OrderFilterState) => void;
  onApply: () => void;
  onClear: () => void;
}) {
  if (!open) return null;

  const set = (key: keyof OrderFilterState, v: string) =>
    onChange({ ...value, [key]: v });

  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #eee',
        borderRadius: 12,
        padding: '18px 20px',
        marginBottom: 18,
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      }}
    >
      <div className="row g-3">
        <div className="col-md-3 col-6">
          <label style={labelStyle}>Order Status</label>
          <select style={inputStyle} value={value.status} onChange={(e) => set('status', e.target.value)}>
            <option value="">All</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>{ORDER_STATUS_META[s].label}</option>
            ))}
          </select>
        </div>
        <div className="col-md-3 col-6">
          <label style={labelStyle}>Payment Status</label>
          <select style={inputStyle} value={value.paymentStatus} onChange={(e) => set('paymentStatus', e.target.value)}>
            <option value="">All</option>
            {PAYMENT_STATUSES.map((s) => (
              <option key={s} value={s}>{PAYMENT_STATUS_META[s].label}</option>
            ))}
          </select>
        </div>
        <div className="col-md-3 col-6">
          <label style={labelStyle}>Delivery Method</label>
          <select style={inputStyle} value={value.deliveryMethod} onChange={(e) => set('deliveryMethod', e.target.value)}>
            <option value="">All</option>
            {DELIVERY_METHODS.map((m) => (
              <option key={m} value={m}>{DELIVERY_METHOD_META[m].label}</option>
            ))}
          </select>
        </div>
        <div className="col-md-3 col-6">
          <label style={labelStyle}>Amount Range ($)</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input type="number" min="0" step="0.01" placeholder="Min" style={inputStyle} value={value.minAmount} onChange={(e) => set('minAmount', e.target.value)} />
            <input type="number" min="0" step="0.01" placeholder="Max" style={inputStyle} value={value.maxAmount} onChange={(e) => set('maxAmount', e.target.value)} />
          </div>
        </div>
        <div className="col-md-3 col-6">
          <label style={labelStyle}>Date From</label>
          <input type="date" style={inputStyle} value={value.dateFrom} onChange={(e) => set('dateFrom', e.target.value)} />
        </div>
        <div className="col-md-3 col-6">
          <label style={labelStyle}>Date To</label>
          <input type="date" style={inputStyle} value={value.dateTo} onChange={(e) => set('dateTo', e.target.value)} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <button
          onClick={onApply}
          style={{
            background: '#76a713', color: '#fff', border: 'none', borderRadius: 8,
            padding: '9px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 7,
          }}
        >
          <i className="fas fa-filter" /> Apply Filters
        </button>
        <button
          onClick={onClear}
          style={{
            background: '#fff', color: '#666', border: '1px solid #ddd', borderRadius: 8,
            padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Clear
        </button>
      </div>
    </div>
  );
}
