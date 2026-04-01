import { apiClient } from './client.ts';

export interface PurchaseItem {
  id:            number;
  product_id:    number;
  product_name:  string;
  barcode:       string;
  unit:          string;
  quantity:      number;
  unit_price:    number;
  total_price:   number;
}

export interface Purchase {
  id:                number;
  invoice_number:    string;
  supplier_name:     string | null;
  supplier_id:       number | null;
  created_by:        string;
  total_amount:      number;
  paid_amount:       number;
  due_amount:        number;
  purchase_currency: string;
  exchange_rate:     number;
  notes:             string | null;
  created_at:        string;
  items?:            PurchaseItem[];
}

export interface PurchaseItemInput {
  product_id: number;
  quantity:   number;
  unit_price: number;
}

export interface CreatePurchasePayload {
  supplier_id?:      number | null;
  warehouse_id?:     number | null;
  items:             PurchaseItemInput[];
  paid_amount:       number;
  purchase_currency: string;
  exchange_rate:     number;
  notes?:            string;
}

export const purchasesApi = {
  list: (params?: Record<string, string | number>) =>
    apiClient.get<{ success: boolean; purchases: Purchase[]; total: number }>('/purchases', { params }),

  getById: (id: number) =>
    apiClient.get<{ success: boolean; purchase: Purchase }>(`/purchases/${id}`),

  create: (payload: CreatePurchasePayload) =>
    apiClient.post<{ success: boolean; purchaseId: number; invoiceNumber: string; totalAmount: number }>('/purchases', payload),

  addPayment: (id: number, amount: number) =>
    apiClient.post<{ success: boolean; message: string }>(`/purchases/${id}/payment`, { amount }),
};
