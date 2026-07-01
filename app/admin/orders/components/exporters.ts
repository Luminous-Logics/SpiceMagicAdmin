/**
 * Client-side order exporters. Dependency-free:
 *  - CSV   → real text/csv Blob download
 *  - Excel → Excel-openable SpreadsheetML (.xls) via an HTML table (no SheetJS)
 *  - PDF   → opens a styled print window; the browser's "Save as PDF" produces
 *            the file (no jsPDF). Also used for the "Print" bulk action.
 *
 * If you later add `xlsx` / `jspdf`, only this file needs to change.
 */
import {
  ORDER_STATUS_META,
  PAYMENT_STATUS_META,
  DELIVERY_METHOD_META,
  formatMoney,
} from '@/lib/orders';
import type { Order } from './types';

const COLUMNS = [
  'Order ID',
  'Date',
  'Customer',
  'Email',
  'Phone',
  'Items',
  'Total',
  'Payment',
  'Order Status',
  'Delivery',
] as const;

function fmtDate(iso: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function toRow(o: Order): string[] {
  return [
    o._id,
    fmtDate(o.createdAt),
    o.customerName,
    o.customerEmail,
    o.customerPhone,
    String(o.itemsCount),
    formatMoney(o.total),
    PAYMENT_STATUS_META[o.paymentStatus].label,
    ORDER_STATUS_META[o.orderStatus].label,
    DELIVERY_METHOD_META[o.deliveryMethod].label,
  ];
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function downloadBlob(content: BlobPart, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function timestamp(): string {
  return new Date().toISOString().slice(0, 10);
}

export function exportOrdersCSV(orders: Order[]) {
  const escapeCsv = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [
    COLUMNS.map(escapeCsv).join(','),
    ...orders.map((o) => toRow(o).map(escapeCsv).join(',')),
  ];
  // Prepend BOM so Excel reads UTF-8 correctly.
  downloadBlob('\uFEFF' + lines.join('\r\n'), `orders-${timestamp()}.csv`, 'text/csv;charset=utf-8;');
}

export function exportOrdersExcel(orders: Order[]) {
  const header = COLUMNS.map((c) => `<th>${escapeHtml(c)}</th>`).join('');
  const body = orders
    .map((o) => `<tr>${toRow(o).map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`)
    .join('');
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8" /></head><body><table border="1">${`<tr>${header}</tr>`}${body}</table></body></html>`;
  downloadBlob(html, `orders-${timestamp()}.xls`, 'application/vnd.ms-excel');
}

function buildPrintTable(orders: Order[], title: string): string {
  const header = COLUMNS.map((c) => `<th>${escapeHtml(c)}</th>`).join('');
  const body = orders
    .map((o) => `<tr>${toRow(o).map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`)
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8" /><title>${escapeHtml(title)}</title>
    <style>
      body { font-family: 'DM Sans', Arial, sans-serif; color: #222; padding: 24px; }
      h1 { font-size: 20px; margin: 0 0 4px; }
      .meta { color: #888; font-size: 12px; margin-bottom: 18px; }
      table { width: 100%; border-collapse: collapse; font-size: 11px; }
      th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
      th { background: #f5f5f5; }
      tr:nth-child(even) td { background: #fafafa; }
    </style></head>
    <body>
      <h1>SpiceMagik — Orders Export</h1>
      <div class="meta">${orders.length} orders · Generated ${new Date().toLocaleString()}</div>
      <table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>
      <script>window.onload = function () { window.print(); };</script>
    </body></html>`;
}

/** Opens a print window; the user chooses "Save as PDF" in the print dialog. */
export function exportOrdersPDF(orders: Order[]) {
  const w = window.open('', '_blank', 'width=1024,height=768');
  if (!w) return;
  w.document.write(buildPrintTable(orders, 'Orders Export'));
  w.document.close();
}

/** Print action (same rendering as the PDF export). */
export function printOrders(orders: Order[]) {
  exportOrdersPDF(orders);
}
