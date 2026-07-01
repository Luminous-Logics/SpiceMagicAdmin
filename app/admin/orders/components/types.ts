import type { OrderStatus, PaymentStatus, DeliveryMethod } from '@/lib/orders';

export interface OrderItemModifier {
  name: string;
  price: number;
}

export interface OrderItem {
  productId: string;
  name: string;
  price: number;
  discount: number;
  finalPrice: number;
  quantity: number;
  imageUrl: string;
  modifiers?: OrderItemModifier[];
}

export interface OrderStatusHistoryEntry {
  from: string;
  to: string;
  changedByEmail: string;
  changedByName: string;
  changedAt: string;
  note?: string;
}

/** Order shape returned by the API (enriched + normalized). */
export interface Order {
  _id: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  itemsCount: number;
  items: OrderItem[];
  subtotal: number;
  tax: number;
  deliveryFee: number;
  couponCode: string;
  couponDiscount: number;
  total: number;
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  deliveryMethod: DeliveryMethod;
  deliveryAddress: Record<string, unknown> | null;
  stripePaymentIntentId: string;
  statusHistory: OrderStatusHistoryEntry[];
  cancelReason: string;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderSummary {
  todaysOrders: number;
  todaysRevenue: number;
  openOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  pendingPayments: number;
  averageOrderValue: number;
}

/** Active filter values controlled by OrderFilters. */
export interface OrderFilterState {
  status: string;
  paymentStatus: string;
  deliveryMethod: string;
  dateFrom: string;
  dateTo: string;
  minAmount: string; // dollars, as typed
  maxAmount: string; // dollars, as typed
}

export const EMPTY_FILTERS: OrderFilterState = {
  status: '',
  paymentStatus: '',
  deliveryMethod: '',
  dateFrom: '',
  dateTo: '',
  minAmount: '',
  maxAmount: '',
};

export type BulkAction = 'confirm' | 'complete' | 'cancel' | 'print' | 'export';
