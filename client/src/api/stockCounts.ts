import { apiClient } from './client.ts';

export interface StockCountSessionItem {
  id: number;
  product_id: number;
  product_name: string;
  barcode: string | null;
  unit: string | null;
  system_quantity: number;
  counted_quantity: number;
  difference_quantity: number;
  created_at: string;
  updated_at: string;
}

export interface StockCountSession {
  id: number;
  session_number: string;
  warehouse_id: number;
  warehouse_name: string;
  status: 'draft' | 'posted';
  notes: string | null;
  created_by: number | null;
  posted_by: number | null;
  created_at: string;
  updated_at: string;
  posted_at: string | null;
  items_count: number;
  total_difference_quantity: number;
  items?: StockCountSessionItem[];
}

export const stockCountsApi = {
  getAll: (status?: 'draft' | 'posted') =>
    apiClient.get<{ success: boolean; sessions: StockCountSession[] }>(
      '/stock-count-sessions',
      {
        params: status ? { status } : undefined,
      }
    ),

  getById: (id: number) =>
    apiClient.get<{ success: boolean; session: StockCountSession }>(
      `/stock-count-sessions/${id}`
    ),

  create: (payload: {
    warehouse_id?: number | null;
    notes?: string | null;
  }) =>
    apiClient.post<{ success: boolean; session: StockCountSession }>(
      '/stock-count-sessions',
      payload
    ),

  upsertItem: (
    id: number,
    payload: {
      product_id: number;
      counted_quantity: number;
    }
  ) =>
    apiClient.post<{ success: boolean; session: StockCountSession }>(
      `/stock-count-sessions/${id}/items`,
      payload
    ),

  removeItem: (id: number, productId: number) =>
    apiClient.delete<{ success: boolean; session: StockCountSession }>(
      `/stock-count-sessions/${id}/items/${productId}`
    ),

  post: (id: number) =>
    apiClient.post<{ success: boolean; session: StockCountSession }>(
      `/stock-count-sessions/${id}/post`
    ),
};