import { create } from 'zustand';
import type {
  CustomerOrderCurrencyCode,
  CustomerOrderPaymentMethod,
} from '../api/customerOrders.ts';

interface PendingOrderExecutionItem {
  product_id: number;
  quantity: number;
  unit_price_usd: number;
}

export interface PendingOrderExecution {
  order_id: number;
  source_order_id: number;
  sourceOrderId: number;
  order_number: string;
  customer_name: string;
  recipient_name: string | null;
  phone: string | null;
  notes: string | null;
  payment_method: CustomerOrderPaymentMethod;
  currency_code: CustomerOrderCurrencyCode;
  total_usd: number;
  warehouse_id: number | null;
  items: PendingOrderExecutionItem[];
}

interface PosStore {
  cartCount: number;
  setCartCount: (n: number) => void;

  pendingOrderExecution: PendingOrderExecution | null;
  setPendingOrderExecution: (order: PendingOrderExecution) => void;
  clearPendingOrderExecution: () => void;
}

export const usePosStore = create<PosStore>((set) => ({
  cartCount: 0,
  setCartCount: (n) => set({ cartCount: n }),

  pendingOrderExecution: null,
  setPendingOrderExecution: (order) => set({ pendingOrderExecution: order }),
  clearPendingOrderExecution: () => set({ pendingOrderExecution: null }),
}));