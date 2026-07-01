/**
 * Shared, framework-agnostic order domain logic.
 *
 * Imported by the Mongoose model, the API routes, and the client components so
 * status names, colors, tab definitions, and lifecycle transition rules live in
 * exactly one place. Keep this file free of server-only imports (no mongoose,
 * no next/server) so it is safe to bundle into the browser.
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Fulfillment lifecycle of an order (distinct from payment status). */
export const ORDER_STATUSES = [
  'pending',
  'confirmed',
  'preparing',
  'ready',
  'completed',
  'cancelled',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Payment state. Mirrors the legacy `Order.status` field values. */
export const PAYMENT_STATUSES = ['pending', 'paid', 'failed'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** How the customer receives the order. */
export const DELIVERY_METHODS = ['pickup', 'delivery'] as const;
export type DeliveryMethod = (typeof DELIVERY_METHODS)[number];

// ---------------------------------------------------------------------------
// Lifecycle transitions
// ---------------------------------------------------------------------------

/**
 * The happy-path fulfillment flow. `cancelled` is intentionally excluded — it is
 * reachable from any non-terminal status via the cancel action, not the flow.
 */
export const ORDER_FLOW: OrderStatus[] = [
  'pending',
  'confirmed',
  'preparing',
  'ready',
  'completed',
];

/** Completed and cancelled orders are immutable — no further transitions. */
export function isTerminal(status: OrderStatus): boolean {
  return status === 'completed' || status === 'cancelled';
}

/** The immediate next status in the flow, or null if none (terminal/unknown). */
export function getNextStatus(current: OrderStatus): OrderStatus | null {
  const idx = ORDER_FLOW.indexOf(current);
  if (idx === -1 || idx >= ORDER_FLOW.length - 1) return null;
  return ORDER_FLOW[idx + 1];
}

/**
 * Whether a transition from → to is allowed.
 *  - No self-transitions.
 *  - Terminal statuses can never change.
 *  - Cancel is allowed from any non-terminal status.
 *  - Otherwise only forward moves along the flow are allowed (skipping ahead is
 *    permitted so bulk "Mark Completed" works from any open stage; going
 *    backwards is not).
 */
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  if (from === to) return false;
  if (isTerminal(from)) return false;
  if (to === 'cancelled') return true;
  const fromIdx = ORDER_FLOW.indexOf(from);
  const toIdx = ORDER_FLOW.indexOf(to);
  if (fromIdx === -1 || toIdx === -1) return false;
  return toIdx > fromIdx;
}

/** Normalize a possibly-missing legacy value into a valid OrderStatus. */
export function normalizeOrderStatus(value: unknown): OrderStatus {
  return ORDER_STATUSES.includes(value as OrderStatus)
    ? (value as OrderStatus)
    : 'pending';
}

/** Normalize a possibly-missing payment status. */
export function normalizePaymentStatus(value: unknown): PaymentStatus {
  return PAYMENT_STATUSES.includes(value as PaymentStatus)
    ? (value as PaymentStatus)
    : 'pending';
}

/** Normalize a possibly-missing delivery method (legacy orders default pickup). */
export function normalizeDeliveryMethod(value: unknown): DeliveryMethod {
  return DELIVERY_METHODS.includes(value as DeliveryMethod)
    ? (value as DeliveryMethod)
    : 'pickup';
}

// ---------------------------------------------------------------------------
// Presentation metadata (color-coded badges)
// ---------------------------------------------------------------------------

export interface StatusMeta {
  label: string;
  /** Text/foreground color. */
  color: string;
  /** Badge background. */
  bg: string;
  /** Font Awesome icon class (without the `fas` prefix). */
  icon: string;
}

export const ORDER_STATUS_META: Record<OrderStatus, StatusMeta> = {
  pending: { label: 'Pending', color: '#b8860b', bg: '#fef7e0', icon: 'fa-hourglass-half' },
  confirmed: { label: 'Confirmed', color: '#2563eb', bg: '#e8f0fe', icon: 'fa-circle-check' },
  preparing: { label: 'Preparing', color: '#d97706', bg: '#fff3e0', icon: 'fa-fire-burner' },
  ready: { label: 'Ready', color: '#7c3aed', bg: '#f3e8fd', icon: 'fa-box-open' },
  completed: { label: 'Completed', color: '#1a7a3c', bg: '#e6f9ee', icon: 'fa-circle-check' },
  cancelled: { label: 'Cancelled', color: '#c0392b', bg: '#fde8e8', icon: 'fa-ban' },
};

export const PAYMENT_STATUS_META: Record<PaymentStatus, StatusMeta> = {
  pending: { label: 'Pending', color: '#b8860b', bg: '#fef7e0', icon: 'fa-clock' },
  paid: { label: 'Paid', color: '#1a7a3c', bg: '#e6f9ee', icon: 'fa-circle-check' },
  failed: { label: 'Failed', color: '#c0392b', bg: '#fde8e8', icon: 'fa-circle-xmark' },
};

export const DELIVERY_METHOD_META: Record<DeliveryMethod, { label: string; icon: string }> = {
  pickup: { label: 'Pickup', icon: 'fa-store' },
  delivery: { label: 'Delivery', icon: 'fa-truck' },
};

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

export type OrderTab = 'open' | 'closed' | 'cancelled' | 'history';

export interface TabConfig {
  key: OrderTab;
  label: string;
  icon: string;
  /** Statuses included in this tab, or null for "all" (history). */
  statuses: OrderStatus[] | null;
}

export const ORDER_TABS: TabConfig[] = [
  { key: 'open', label: 'Open Orders', icon: 'fa-bolt', statuses: ['pending', 'confirmed', 'preparing', 'ready'] },
  { key: 'closed', label: 'Closed Orders', icon: 'fa-circle-check', statuses: ['completed'] },
  { key: 'cancelled', label: 'Cancelled Orders', icon: 'fa-ban', statuses: ['cancelled'] },
  { key: 'history', label: 'Order History', icon: 'fa-clock-rotate-left', statuses: null },
];

export function getTabStatuses(tab: OrderTab): OrderStatus[] | null {
  return ORDER_TABS.find((t) => t.key === tab)?.statuses ?? null;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/** Format an integer cents amount as a USD string. */
export function formatMoney(cents: number | null | undefined): string {
  const value = (cents ?? 0) / 100;
  return `$${value.toFixed(2)}`;
}
