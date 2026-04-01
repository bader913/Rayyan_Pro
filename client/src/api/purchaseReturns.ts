import { apiClient } from './client.ts';

export interface PurchaseReturnItemInput {
  purchase_item_id: number | null;
  product_id: number;
  quantity: number;
  unit_price: number;
}

export interface CreatePurchaseReturnPayload {
  purchase_id: number;
  items: PurchaseReturnItemInput[];
  return_method: 'cash_refund' | 'debt_discount' | 'stock_only';
  reason?: string;
  notes?: string;
}

export interface PurchaseItemForReturn {
  id: number;
  product_id: number;
  quantity: number;
  returned_quantity: number;
  remaining_quantity: number;
  unit_price: number;
  total_price: number;
  product_name: string;
  barcode: string;
  unit: string;
}

export interface PurchaseForReturn {
  id: number;
  invoice_number: string;
  total_amount: number;
  paid_amount: number;
  purchase_currency: string;
  exchange_rate: number;
  created_at: string;
  supplier_id: number | null;
  supplier_name: string | null;
  warehouse_id: number | null;
  warehouse_name: string | null;
  warehouse_code: string | null;
  is_multi_warehouse_enabled: boolean;
  items: PurchaseItemForReturn[];
}

export const purchaseReturnsApi = {
  list: (params?: Record<string, string | number>) =>
    apiClient.get<{ success: boolean; returns: any[]; total: number }>('/purchase-returns', { params }),

  create: (payload: CreatePurchaseReturnPayload) =>
    apiClient.post<{ success: boolean; returnId: number; returnNumber: string; totalAmount: number }>(
      '/purchase-returns',
      payload
    ),

  getPurchaseForReturn: (purchaseId: number) =>
    apiClient.get<{ success: boolean; purchase: PurchaseForReturn }>(`/purchases/${purchaseId}/for-return`),

  listByPurchase: (purchaseId: number) =>
    apiClient.get<{ success: boolean; returns: any[] }>(`/purchases/${purchaseId}/returns`),

  getById: (id: number) =>
    apiClient.get<{ success: boolean; return: any }>(`/purchase-returns/${id}`),
};