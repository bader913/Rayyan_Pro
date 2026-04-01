import { apiClient } from './client.ts';

export interface Customer {
  id: number;
  name: string;
  phone: string | null;
  address: string | null;
  customer_type: 'retail' | 'wholesale';
  credit_limit: string;
  balance: string;
  bonus_balance: string;
  total_bonus_earned: string;
  notes: string | null;
  created_at: string;
  sales_count?: string;
  total_sales_amount?: string;
  last_sale_at?: string | null;
}


export interface CustomerTransaction {
  id: number;
  customer_id: number;
  transaction_type: 'sale' | 'payment' | 'return' | 'adjustment';
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
  sale_payment_method?: 'cash' | 'card' | 'credit' | 'mixed' | null;
}

export interface CustomerAccountResponse {
  success: boolean;
  customer: Customer;
  transactions: CustomerTransaction[];
  total: number;
  page: number;
  limit: number;
}

export const customersApi = {
  list: (params?: {
    q?: string;
    type?: string;
    sort?: 'name_asc' | 'name_desc' | 'highest_debt' | 'highest_purchases' | 'most_invoices' | 'newest';
    limit?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params?.q) qs.set('q', params.q);
    if (params?.type) qs.set('type', params.type);
    if (params?.sort) qs.set('sort', params.sort);
    if (params?.limit) qs.set('limit', String(params.limit));

    return apiClient.get<{ success: boolean; customers: Customer[] }>(
      `/customers${qs.toString() ? `?${qs}` : ''}`
    );
  },

  getById: (id: number) =>
    apiClient.get<{ success: boolean; customer: Customer }>(`/customers/${id}`),

  create: (data: { name: string; phone?: string; address?: string; customer_type?: string; credit_limit?: number; notes?: string }) =>
    apiClient.post<{ success: boolean; customer: Customer }>('/customers', data),

  update: (id: number, data: { name: string; phone?: string; address?: string; customer_type?: string; credit_limit?: number; notes?: string }) =>
    apiClient.put<{ success: boolean; customer: Customer }>(`/customers/${id}`, data),

  getAccount: (id: number, page = 1) =>
    apiClient.get<CustomerAccountResponse>(`/customers/${id}/account?page=${page}&limit=30`),

  addPayment: (id: number, data: { amount: number; currency_code?: string; exchange_rate?: number; note?: string }) =>
    apiClient.post<{ success: boolean; message: string; newBalance: number }>(
      `/customers/${id}/payments`, data
    ),
};
