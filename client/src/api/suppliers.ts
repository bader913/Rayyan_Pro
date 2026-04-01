import { apiClient } from './client.ts';

export interface Supplier {
  id: number;
  name: string;
  phone: string | null;
  address: string | null;
  balance: string;
  notes: string | null;
  created_at: string;
  purchases_count?: string;
  total_purchases_amount?: string;
  last_purchase_at?: string | null;
}

export interface SupplierTransaction {
  id: number;
  supplier_id: number;
  transaction_type: 'purchase' | 'payment' | 'adjustment';
  reference_id: number | null;
  reference_type: string | null;
  debit_amount: string;
  credit_amount: string;
  balance_after: string;
  currency_code: string;
  exchange_rate: string;
  amount_original: string | null;
  note: string | null;
  created_by: number | null;
  created_by_name: string | null;
  created_at: string;
}

export interface SupplierAccountResponse {
  success: boolean;
  supplier: Supplier;
  transactions: SupplierTransaction[];
  total: number;
  page: number;
  limit: number;
}

export const suppliersApi = {
  list: (params?: {
    q?: string;
    sort?: 'name_asc' | 'name_desc' | 'highest_balance' | 'highest_purchases' | 'most_invoices' | 'newest';
    limit?: number;
  }) => {
    const qs = new URLSearchParams();

    if (params?.q) qs.set('q', params.q);
    if (params?.sort) qs.set('sort', params.sort);
    if (params?.limit) qs.set('limit', String(params.limit));

    return apiClient.get<{ success: boolean; suppliers: Supplier[] }>(
      `/suppliers${qs.toString() ? `?${qs}` : ''}`
    );
  },

  getById: (id: number) =>
    apiClient.get<{ success: boolean; supplier: Supplier }>(`/suppliers/${id}`),

  create: (data: { name: string; phone?: string; address?: string; notes?: string }) =>
    apiClient.post<{ success: boolean; supplier: Supplier }>('/suppliers', data),

  update: (id: number, data: { name: string; phone?: string; address?: string; notes?: string }) =>
    apiClient.put<{ success: boolean; supplier: Supplier }>(`/suppliers/${id}`, data),

  getAccount: (id: number, page = 1) =>
    apiClient.get<SupplierAccountResponse>(`/suppliers/${id}/account?page=${page}&limit=30`),

  addPayment: (id: number, data: { amount: number; currency_code?: string; exchange_rate?: number; note?: string }) =>
    apiClient.post<{ success: boolean; message: string; newBalance: number }>(
      `/suppliers/${id}/payments`, data
    ),
};
