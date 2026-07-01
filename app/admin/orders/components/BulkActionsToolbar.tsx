import type { BulkAction } from './types';

const ACTIONS: { key: BulkAction; label: string; icon: string; color: string; bg: string; border: string }[] = [
  { key: 'confirm', label: 'Confirm', icon: 'fa-circle-check', color: '#2563eb', bg: '#e8f0fe', border: '#bcd3fb' },
  { key: 'complete', label: 'Mark Completed', icon: 'fa-flag-checkered', color: '#1a7a3c', bg: '#e6f9ee', border: '#a8e6c3' },
  { key: 'print', label: 'Print', icon: 'fa-print', color: '#555', bg: '#f3f4f6', border: '#e0e0e0' },
  { key: 'export', label: 'Export', icon: 'fa-file-export', color: '#7c3aed', bg: '#f3e8fd', border: '#e0ccf8' },
];

export default function BulkActionsToolbar({
  selectedCount,
  onAction,
  onClear,
  busy,
}: {
  selectedCount: number;
  onAction: (action: BulkAction) => void;
  onClear: () => void;
  busy: boolean;
}) {
  if (selectedCount === 0) return null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
        background: '#fff8e6',
        border: '1px solid #ffe2a8',
        borderRadius: 10,
        padding: '10px 16px',
        marginBottom: 16,
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 700, color: '#8a6d1a' }}>
        <i className="fas fa-check-double" style={{ marginRight: 7 }} />
        {selectedCount} selected
      </span>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flex: 1 }}>
        {ACTIONS.map((a) => (
          <button
            key={a.key}
            disabled={busy}
            onClick={() => onAction(a.key)}
            style={{
              background: a.bg, color: a.color, border: `1px solid ${a.border}`,
              borderRadius: 8, padding: '7px 14px', fontSize: 12.5, fontWeight: 700,
              cursor: busy ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <i className={`fas ${a.icon}`} />
            {a.label}
          </button>
        ))}
      </div>
      <button
        onClick={onClear}
        style={{ background: 'none', border: 'none', color: '#999', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}
      >
        Clear
      </button>
    </div>
  );
}
