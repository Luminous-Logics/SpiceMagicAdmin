'use client';

import { useEffect } from 'react';

interface ConfirmModalProps {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  open,
  title = 'Are you sure?',
  message,
  confirmLabel = 'Delete',
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  /* close on Escape */
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    /* backdrop */
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.45)',
        backdropFilter: 'blur(2px)',
        zIndex: 9000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
        animation: 'fadeIn 0.15s ease',
      }}
    >
      {/* card */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 20,
          padding: '32px 32px 28px',
          width: '100%',
          maxWidth: 420,
          boxShadow: '0 24px 60px rgba(0,0,0,0.18)',
          textAlign: 'center',
          animation: 'slideUp 0.18s ease',
        }}
      >
        {/* icon */}
        <div style={{
          width: 64, height: 64, borderRadius: '50%',
          background: '#fff5f5',
          border: '2px solid #fecaca',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px',
        }}>
          <i className="fas fa-trash-alt" style={{ fontSize: 24, color: '#E31E24' }} />
        </div>

        {/* title */}
        <h3 style={{ margin: '0 0 10px', fontSize: 19, fontWeight: 800, color: '#111' }}>
          {title}
        </h3>

        {/* message */}
        <p style={{ margin: '0 0 28px', fontSize: 14, color: '#666', lineHeight: 1.6 }}>
          {message}
        </p>

        {/* buttons */}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1,
              background: '#f1f5f9', color: '#444',
              border: '1.5px solid #e5e7eb',
              borderRadius: 12, padding: '12px 0',
              fontSize: 14, fontWeight: 600, cursor: 'pointer',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#e2e8f0')}
            onMouseLeave={e => (e.currentTarget.style.background = '#f1f5f9')}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              flex: 1,
              background: 'linear-gradient(135deg, #e74c3c, #E31E24)',
              color: '#fff', border: 'none',
              borderRadius: 12, padding: '12px 0',
              fontSize: 14, fontWeight: 700, cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(227,30,36,0.35)',
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.88')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
          >
            <i className="fas fa-trash-alt" style={{ marginRight: 7 }} />
            {confirmLabel}
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
