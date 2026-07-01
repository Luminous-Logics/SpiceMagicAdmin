'use client';

import { useEffect, useRef, useState } from 'react';

export type ExportFormat = 'csv' | 'excel' | 'pdf';

export default function OrdersToolbar({
  search,
  onSearchChange,
  onToggleFilters,
  filtersOpen,
  activeFilterCount,
  onExport,
  exporting,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  onToggleFilters: () => void;
  filtersOpen: boolean;
  activeFilterCount: number;
  onExport: (format: ExportFormat) => void;
  exporting: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const btnBase: React.CSSProperties = {
    border: '1px solid #ddd',
    background: '#fff',
    borderRadius: 8,
    padding: '10px 16px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    color: '#444',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    whiteSpace: 'nowrap',
  };

  const exportOptions: { key: ExportFormat; label: string; icon: string }[] = [
    { key: 'csv', label: 'Export as CSV', icon: 'fa-file-csv' },
    { key: 'excel', label: 'Export as Excel', icon: 'fa-file-excel' },
    { key: 'pdf', label: 'Export as PDF', icon: 'fa-file-pdf' },
  ];

  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
      {/* Search */}
      <div style={{ position: 'relative', flex: '1 1 280px', minWidth: 220 }}>
        <i className="fas fa-search" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#bbb', fontSize: 14 }} />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search by Order ID, name, email, or phone…"
          style={{ width: '100%', padding: '10px 12px 10px 36px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
        />
      </div>

      {/* Filter toggle */}
      <button
        onClick={onToggleFilters}
        style={{
          ...btnBase,
          background: filtersOpen ? '#f0fce8' : '#fff',
          borderColor: filtersOpen ? '#c5e8a0' : '#ddd',
          color: filtersOpen ? '#4a7c10' : '#444',
        }}
      >
        <i className="fas fa-sliders" />
        Filters
        {activeFilterCount > 0 && (
          <span style={{ background: '#E31E24', color: '#fff', borderRadius: 20, fontSize: 11, fontWeight: 700, padding: '1px 7px' }}>
            {activeFilterCount}
          </span>
        )}
      </button>

      {/* Export dropdown */}
      <div style={{ position: 'relative' }} ref={menuRef}>
        <button onClick={() => setMenuOpen((o) => !o)} disabled={exporting} style={{ ...btnBase, cursor: exporting ? 'wait' : 'pointer' }}>
          <i className={`fas ${exporting ? 'fa-circle-notch fa-spin' : 'fa-file-export'}`} />
          Export
          <i className="fas fa-chevron-down" style={{ fontSize: 10, color: '#999' }} />
        </button>
        {menuOpen && (
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              right: 0,
              background: '#fff',
              border: '1px solid #eee',
              borderRadius: 10,
              boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
              zIndex: 50,
              minWidth: 180,
              overflow: 'hidden',
            }}
          >
            {exportOptions.map((opt) => (
              <button
                key={opt.key}
                onClick={() => { setMenuOpen(false); onExport(opt.key); }}
                style={{
                  width: '100%', textAlign: 'left', background: '#fff', border: 'none',
                  padding: '10px 14px', fontSize: 13, color: '#444', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 10,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#f7f7f7')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}
              >
                <i className={`fas ${opt.icon}`} style={{ width: 16, color: '#76a713' }} />
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
