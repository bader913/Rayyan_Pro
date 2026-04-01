import { apiClient } from './client.ts';

export interface StockTransferItem {
  id: number;
  product_id: number;
  product_name: string;
  quantity: number;
}

export interface StockTransfer {
  id: number;
  transfer_number: string;
  from_warehouse_id: number;
  from_warehouse_name: string;
  to_warehouse_id: number;
  to_warehouse_name: string;
  status: 'pending' | 'approved' | 'received' | 'cancelled';
  notes: string | null;
  created_by: number | null;
  approved_by: number | null;
  created_at: string;
  updated_at: string;
  approved_at: string | null;
  received_at: string | null;
  items_count: number;
  total_quantity: number;
  items?: StockTransferItem[];
}

export const stockTransfersApi = {
  getAll: (status?: string) =>
    apiClient.get<{ success: boolean; transfers: StockTransfer[] }>('/stock-transfers', {
      params: status ? { status } : undefined,
    }),

  getById: (id: number) =>
    apiClient.get<{ success: boolean; transfer: StockTransfer }>(`/stock-transfers/${id}`),

  create: (payload: {
    from_warehouse_id: number;
    to_warehouse_id: number;
    notes?: string;
    items: Array<{ product_id: number; quantity: number }>;
  }) =>
    apiClient.post<{ success: boolean; transfer: StockTransfer }>('/stock-transfers', payload),

  approve: (id: number) =>
    apiClient.patch<{ success: boolean; transfer: StockTransfer }>(`/stock-transfers/${id}/approve`),
};