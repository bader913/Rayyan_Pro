import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './client.ts';
import type { Product } from './products.ts';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  customer_type: 'retail' | 'wholesale';
  credit_limit: string;
  balance: string;
  bonus_balance: string;
  total_bonus_earned?: string;
  notes: string | null;
  created_at: string;
}

export interface Terminal {
  id: string;
  code: string;
  name: string;
  location: string | null;
  is_active: boolean;
  active_shift_id: string | null;
  shift_status: string | null;
  shift_cashier: string | null;
}

export interface Shift {
  id: string;
  user_id: string;
  pos_terminal_id: string | null;
  opening_balance: string;
  opening_note: string | null;
  closing_note: string | null;
  opened_at: string;
  closed_at: string | null;
  status: 'open' | 'closed';
  cashier_name: string;
  terminal_name: string | null;
  terminal_code: string | null;
}

export interface ShiftSummary extends Shift {
  sales_count: number;
  sales_total: string;
  cash_total: string;
  card_total: string;
  credit_total: string;
  closing_cash_counted: string;
  expected_cash: string;
  difference: string;
}

export interface SaleItem {
  id: string;
  product_id: string;
  product_name: string;
  unit: string;
  is_weighted: boolean;
  quantity: string;
  unit_price: string;
  discount: string;
  total_price: string;
  price_type: 'retail' | 'wholesale' | 'custom';
}

export interface Sale {
  id: string;
  invoice_number: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_type: string | null;
  cashier_name: string;
  terminal_name: string | null;
  terminal_code: string | null;
  sale_type: 'retail' | 'wholesale';
  subtotal: string;
  discount: string;
  total_amount: string;
  paid_amount: string;
  payment_method: 'cash' | 'card' | 'credit' | 'mixed';
  bonus_used_amount: string;
  bonus_earned_amount: string;
  notes: string | null;
  created_at: string;
  items: SaleItem[];
}

// ─── Cart Item (local state, not from API) ───────────────────────────────────

export interface CartItem {
  _id:           string;        // UUID للـ React key
  product:       Product;
  quantity:      number;        // كغ للموزون، وحدات للعادي
  unit_price:    number;        // السعر المُطبَّق
  price_type:    'retail' | 'wholesale' | 'custom';
  item_discount: number;
  total:         number;        // (qty * unit_price) - item_discount
}

// ─── Pricing ──────────────────────────────────────────────────────────────────

export function resolveProductPrice(
  product: Product,
  quantity: number,
  saleType: 'retail' | 'wholesale',
  customerType?: string
): { price: number; type: 'retail' | 'wholesale' } {
  const isWholesaleCtx = saleType === 'wholesale' || customerType === 'wholesale';

  if (isWholesaleCtx && product.wholesale_price) {
    const wPrice  = parseFloat(product.wholesale_price);
    const wMinQty = parseFloat(product.wholesale_min_qty);
    if (wPrice > 0 && quantity >= wMinQty) {
      return { price: wPrice, type: 'wholesale' };
    }
  }

  return { price: parseFloat(product.retail_price), type: 'retail' };
}

export function calcCartItem(
  product: Product,
  quantity: number,
  saleType: 'retail' | 'wholesale',
  customerType?: string,
  overridePrice?: number
): CartItem {
  let unit_price: number;
  let price_type: CartItem['price_type'];

  if (overridePrice !== undefined) {
    unit_price = overridePrice;
    price_type = 'custom';
  } else {
    const resolved = resolveProductPrice(product, quantity, saleType, customerType);
    unit_price = resolved.price;
    price_type = resolved.type;
  }

  return {
    _id:           crypto.randomUUID(),
    product,
    quantity,
    unit_price,
    price_type,
    item_discount: 0,
    total:         quantity * unit_price,
  };
}

export function reCalcItem(item: CartItem): CartItem {
  return {
    ...item,
    total: item.quantity * item.unit_price - item.item_discount,
  };
}

// ─── Customers ────────────────────────────────────────────────────────────────

export function useCustomerSearch(q: string) {
  return useQuery({
    queryKey: ['customers-search', q],
    queryFn: async () => {
      const res = await apiClient.get<{ customers: Customer[] }>('/customers', {
        params: { q, limit: 10 },
      });
      return res.data.customers;
    },
    enabled: q.trim().length > 0,
    staleTime: 10_000,
  });
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      name: string;
      phone?: string;
      customer_type: 'retail' | 'wholesale';
    }) => {
      const res = await apiClient.post<{ customer: Customer }>('/customers', data);
      return res.data.customer;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers-search'] }),
  });
}

// ─── Terminals ────────────────────────────────────────────────────────────────

export function useTerminals() {
  return useQuery({
    queryKey: ['terminals'],
    queryFn: async () => {
      const res = await apiClient.get<{ terminals: Terminal[] }>('/terminals');
      return res.data.terminals;
    },
    staleTime: 60_000,
  });
}

// ─── Shifts ───────────────────────────────────────────────────────────────────

export function useCurrentShift() {
  return useQuery({
    queryKey: ['shift-current'],
    queryFn: async () => {
      const res = await apiClient.get<{ shift: Shift | null }>('/shifts/current');
      return res.data.shift;
    },
    refetchInterval: 60_000,
  });
}

export function useOpenShift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      terminal_id?: number | null;
      opening_balance: number;
      opening_note?: string;
    }) => {
      const res = await apiClient.post<{ shift: Shift }>('/shifts/open', data);
      return res.data.shift;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shift-current'] }),
  });
}

export function useCloseShift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      id: number;
      closing_cash_counted: number;
      closing_note?: string;
    }) => {
      const res = await apiClient.post<{ summary: ShiftSummary }>(
        `/shifts/${data.id}/close`,
        { closing_cash_counted: data.closing_cash_counted, closing_note: data.closing_note }
      );
      return res.data.summary;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shift-current'] }),
  });
}

// ─── Sales ────────────────────────────────────────────────────────────────────

export interface CreateSalePayload {
  shift_id:          number | null;
  pos_terminal_id:   number | null;
  customer_id:       number | null;
  warehouse_id?:     number | null;
  source_order_id?:  number | null;
  sale_type:         'retail' | 'wholesale';
  items: Array<{
    product_id:    number;
    quantity:      number;
    unit_price:    number;
    price_type:    'retail' | 'wholesale' | 'custom';
    item_discount: number;
  }>;
  sale_discount:     number;
  payment_method:    'cash' | 'card' | 'credit' | 'mixed';
  paid_amount:       number;
  use_customer_bonus?: boolean;
  notes?:            string;
}

export function useCreateSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateSalePayload) => {
      const res = await apiClient.post<{ sale: Sale }>('/sales', payload);
      return res.data.sale;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shift-current'] });
      qc.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

export function useSaleById(id: number | null) {
  return useQuery({
    queryKey: ['sale', id],
    queryFn: async () => {
      const res = await apiClient.get<{ sale: Sale }>(`/sales/${id}`);
      return res.data.sale;
    },
    enabled: id !== null,
  });
}
