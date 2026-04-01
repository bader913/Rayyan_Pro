import { apiClient } from './client.ts';

export interface ReturnItem {
  id: number;
  product_id: number;
  product_name: string;
  barcode: string;
  unit: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface SaleReturn {
  id: number;
  return_number: string;
  sale_id: number;
  sale_invoice: string;
  customer_id: number | null;
  customer_name: string | null;
  created_by: string;
  return_method: 'cash_refund' | 'debt_discount' | 'stock_only';
  total_amount: number;
  reason: string | null;
  notes: string | null;
  created_at: string;
  items?: ReturnItem[];
}

export interface SaleForReturn {
  id: number;
  invoice_number: string;
  customer_id: number | null;
  sale_type: string;
  total_amount: number;
  paid_amount: number;
  customer_name: string | null;
  created_at: string;
  warehouse_id: number | null;
  warehouse_name: string | null;
  warehouse_code: string | null;
  is_multi_warehouse_enabled: boolean;
  items: {
    id: number;
    product_id: number;
    product_name: string;
    barcode: string;
    unit: string;
    quantity: number;
    unit_price: number;
    total_price: number;
    price_type: string;
    returned_quantity?: number;
    remaining_quantity?: number;
  }[];
}

export interface CreateReturnPayload {
  sale_id: number;
  items: {
    sale_item_id?: number | null;
    product_id: number;
    quantity: number;
    unit_price: number;
  }[];
  return_method: 'cash_refund' | 'debt_discount' | 'stock_only';
  reason?: string;
  notes?: string;
  shift_id?: number | null;
}

export const returnsApi = {
  list: (params?: Record<string, string | number>) =>
    apiClient.get<{ success: boolean; returns: SaleReturn[]; total: number }>('/returns', { params }),

  getById: (id: number) =>
    apiClient.get<{ success: boolean; return: SaleReturn }>(`/returns/${id}`),

  create: (payload: CreateReturnPayload) =>
    apiClient.post<{ success: boolean; returnId: number; returnNumber: string; totalAmount: number }>(
      '/returns',
      payload
    ),

  getSaleForReturn: (saleId: number) =>
    apiClient.get<{ success: boolean; sale: SaleForReturn }>(`/sales/${saleId}/for-return`),
};