import { apiClient } from './client.ts';

export interface Warehouse {
  id: number;
  name: string;
  code: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  products_count: number;
  total_quantity: number;
}

export interface WarehouseProduct {
  id: number;
  name: string;
  barcode: string | null;
  unit: string | null;
  warehouse_quantity: number;
  total_stock_quantity: number;
  min_stock_level: number;
}

export const warehousesApi = {
  getAll: (activeOnly = false) =>
    apiClient.get<{ success: boolean; warehouses: Warehouse[] }>('/warehouses', {
      params: activeOnly ? { active: 'true' } : undefined,
    }),

  getById: (id: number) =>
    apiClient.get<{ success: boolean; warehouse: Warehouse }>(`/warehouses/${id}`),

  getProducts: (id: number) =>
    apiClient.get<{ success: boolean; warehouse: Warehouse; products: WarehouseProduct[] }>(
      `/warehouses/${id}/products`
    ),

  create: (payload: { name: string; code?: string | null; is_active?: boolean }) =>
    apiClient.post<{ success: boolean; warehouse: Warehouse }>('/warehouses', payload),

  update: (id: number, payload: { name?: string; code?: string | null; is_active?: boolean }) =>
    apiClient.put<{ success: boolean; warehouse: Warehouse }>(`/warehouses/${id}`, payload),
};