'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import Navbar from '@/app/components/Navbar';
import Breadcrumb from '@/app/components/Breadcrumb';
import Footer from '@/app/components/Footer';
import { ORDER_TABS, type OrderTab } from '@/lib/orders';
import type { Order, OrderSummary, OrderFilterState, BulkAction } from './components/types';
import { EMPTY_FILTERS } from './components/types';
import SummaryCards from './components/SummaryCards';
import OrdersToolbar, { type ExportFormat } from './components/OrdersToolbar';
import OrderFilters from './components/OrderFilters';
import BulkActionsToolbar from './components/BulkActionsToolbar';
import OrdersTable from './components/OrdersTable';
import OrderDetailsDrawer from './components/OrderDetailsDrawer';
import {
  exportOrdersCSV,
  exportOrdersExcel,
  exportOrdersPDF,
  printOrders,
} from './components/exporters';

const LIMIT = 20;

/** dollars → integer cents (empty string → undefined). */
function toCents(dollars: string): string | undefined {
  if (!dollars) return undefined;
  const n = Number(dollars);
  if (!Number.isFinite(n)) return undefined;
  return String(Math.round(n * 100));
}

export default function OrdersPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [tab, setTab] = useState<OrderTab>('open');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filters, setFilters] = useState<OrderFilterState>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<OrderFilterState>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [page, setPage] = useState(1);
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [summary, setSummary] = useState<OrderSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [exporting, setExporting] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  const isAdmin = session?.user?.role === 'admin';

  useEffect(() => {
    if (status === 'loading') return;
    if (!session || !isAdmin) router.replace('/login');
  }, [session, status, isAdmin, router]);

  // Debounce the search box.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Reset to page 1 whenever the query inputs change.
  useEffect(() => {
    setPage(1);
  }, [tab, debouncedSearch, appliedFilters]);

  const buildParams = useCallback(
    (includePagination: boolean): URLSearchParams => {
      const p = new URLSearchParams();
      p.set('tab', tab);
      if (debouncedSearch) p.set('search', debouncedSearch);
      if (appliedFilters.status) p.set('status', appliedFilters.status);
      if (appliedFilters.paymentStatus) p.set('paymentStatus', appliedFilters.paymentStatus);
      if (appliedFilters.deliveryMethod) p.set('deliveryMethod', appliedFilters.deliveryMethod);
      if (appliedFilters.dateFrom) p.set('dateFrom', appliedFilters.dateFrom);
      if (appliedFilters.dateTo) p.set('dateTo', appliedFilters.dateTo);
      const minC = toCents(appliedFilters.minAmount);
      const maxC = toCents(appliedFilters.maxAmount);
      if (minC) p.set('minAmount', minC);
      if (maxC) p.set('maxAmount', maxC);
      if (includePagination) {
        p.set('page', String(page));
        p.set('limit', String(LIMIT));
      }
      return p;
    },
    [tab, debouncedSearch, appliedFilters, page],
  );

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders?${buildParams(true).toString()}`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `Request failed (${res.status})`);
      }
      const data = await res.json();
      setOrders(data.orders || []);
      setTotal(data.total || 0);
      setPages(data.pages || 1);
    } catch (err) {
      setError((err as Error).message);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const res = await fetch('/api/orders/summary');
      const data = await res.json();
      if (res.ok) setSummary(data);
    } catch {
      /* non-fatal — cards just stay at zero */
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) fetchOrders();
  }, [isAdmin, fetchOrders]);

  useEffect(() => {
    if (isAdmin) fetchSummary();
  }, [isAdmin, fetchSummary]);

  // Selection helpers.
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const allOnPage = orders.every((o) => prev.has(o._id));
      const next = new Set(prev);
      if (allOnPage) orders.forEach((o) => next.delete(o._id));
      else orders.forEach((o) => next.add(o._id));
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());

  // Clear selection when switching tabs.
  const changeTab = (next: OrderTab) => {
    setTab(next);
    clearSelection();
  };

  const applyFilters = () => setAppliedFilters(filters);
  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
  };

  const activeFilterCount = useMemo(
    () => Object.values(appliedFilters).filter((v) => v !== '').length,
    [appliedFilters],
  );

  // Refresh list + summary after any mutation.
  const refreshAll = useCallback(() => {
    fetchOrders();
    fetchSummary();
  }, [fetchOrders, fetchSummary]);

  const handleDrawerUpdated = (updated: Order) => {
    setOrders((prev) => prev.map((o) => (o._id === updated._id ? { ...o, ...updated } : o)));
    setSelectedOrder(updated);
    fetchSummary();
  };

  // Fetch the full matching/selected set for export or print.
  const fetchExportRows = useCallback(
    async (ids?: string[]): Promise<Order[]> => {
      const params = ids && ids.length ? new URLSearchParams({ ids: ids.join(',') }) : buildParams(false);
      const res = await fetch(`/api/orders/export?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Export failed');
      return data.orders || [];
    },
    [buildParams],
  );

  const runExport = (rows: Order[], format: ExportFormat) => {
    if (rows.length === 0) {
      toast.error('No orders to export');
      return;
    }
    if (format === 'csv') exportOrdersCSV(rows);
    else if (format === 'excel') exportOrdersExcel(rows);
    else exportOrdersPDF(rows);
  };

  const handleExport = async (format: ExportFormat) => {
    setExporting(true);
    try {
      const rows = await fetchExportRows();
      runExport(rows, format);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const bulkActionRef = useRef<AbortController | null>(null);
  const handleBulkAction = async (action: BulkAction) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    // Client-only actions.
    if (action === 'print' || action === 'export') {
      setBulkBusy(true);
      try {
        const rows = await fetchExportRows(ids);
        if (action === 'print') printOrders(rows);
        else exportOrdersCSV(rows);
      } catch (err) {
        toast.error((err as Error).message);
      } finally {
        setBulkBusy(false);
      }
      return;
    }

    // Server lifecycle actions.
    if (action === 'cancel' && !window.confirm(`Cancel ${ids.length} order(s)? This cannot be undone.`)) {
      return;
    }
    setBulkBusy(true);
    bulkActionRef.current?.abort();
    const controller = new AbortController();
    bulkActionRef.current = controller;
    try {
      const res = await fetch('/api/orders/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, action }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Bulk action failed');
      toast.success(`${data.updated} updated${data.skipped ? `, ${data.skipped} skipped` : ''}`);
      clearSelection();
      refreshAll();
    } catch (err) {
      if ((err as Error).name !== 'AbortError') toast.error((err as Error).message);
    } finally {
      setBulkBusy(false);
    }
  };

  if (status === 'loading' || !session || !isAdmin) return null;

  return (
    <>
      <Navbar />
      <Breadcrumb title="Orders" items={[{ label: 'Home', href: '/' }, { label: 'Admin', href: '/admin' }, { label: 'Orders' }]} />
      <div style={{ minHeight: '60vh', padding: '32px 0 80px' }}>
        <div className="container">
          {/* Header */}
          <div style={{ marginBottom: 22 }}>
            <Link href="/admin" style={{ color: '#999', fontSize: 13, textDecoration: 'none' }}>← Back to Admin</Link>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: '#222', margin: '6px 0 4px' }}>Orders</h1>
            <p style={{ fontSize: 13, color: '#777', margin: 0 }}>Manage customer orders, track fulfillment, and export reports.</p>
          </div>

          {/* Summary cards */}
          <SummaryCards summary={summary} loading={summaryLoading} />

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, borderBottom: '2px solid #eee', marginBottom: 20, overflowX: 'auto' }}>
            {ORDER_TABS.map((t) => {
              const active = t.key === tab;
              return (
                <button
                  key={t.key}
                  onClick={() => changeTab(t.key)}
                  style={{
                    background: 'none',
                    border: 'none',
                    borderBottom: `3px solid ${active ? '#E31E24' : 'transparent'}`,
                    color: active ? '#E31E24' : '#777',
                    fontSize: 14,
                    fontWeight: 700,
                    padding: '10px 16px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    marginBottom: -2,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7,
                  }}
                >
                  <i className={`fas ${t.icon}`} style={{ fontSize: 13 }} />
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* Toolbar */}
          <OrdersToolbar
            search={searchInput}
            onSearchChange={setSearchInput}
            onToggleFilters={() => setFiltersOpen((o) => !o)}
            filtersOpen={filtersOpen}
            activeFilterCount={activeFilterCount}
            onExport={handleExport}
            exporting={exporting}
          />

          {/* Filters */}
          <OrderFilters
            open={filtersOpen}
            value={filters}
            onChange={setFilters}
            onApply={applyFilters}
            onClear={clearFilters}
          />

          {/* Bulk actions */}
          <BulkActionsToolbar
            selectedCount={selectedIds.size}
            onAction={handleBulkAction}
            onClear={clearSelection}
            busy={bulkBusy}
          />

          {/* Table */}
          <OrdersTable
            orders={orders}
            loading={loading}
            error={error}
            page={page}
            pages={pages}
            total={total}
            limit={LIMIT}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onToggleSelectAll={toggleSelectAll}
            onRowClick={setSelectedOrder}
            onPageChange={setPage}
            onRetry={fetchOrders}
          />
        </div>
      </div>
      <Footer />

      {/* Details drawer */}
      <OrderDetailsDrawer
        order={selectedOrder}
        onClose={() => setSelectedOrder(null)}
        onUpdated={handleDrawerUpdated}
      />
    </>
  );
}
