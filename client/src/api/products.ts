import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './client.ts';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Product {
  id: string;
  barcode: string | null;
  name: string;
  category_id: string | null;
  category_name: string | null;
  unit: string;
  is_weighted: boolean;
  purchase_price: string;
  retail_price: string;
  wholesale_price: string | null;
  wholesale_min_qty: string;
  stock_quantity: string;
  min_stock_level: string;
  expiry_date: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  name: string;
  parent_id: string | null;
  parent_name: string | null;
  products_count: number;
}

export interface Supplier {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  balance: string;
  notes: string | null;
}

export interface Pagination {
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface ProductFilters {
  q?: string;
  category_id?: string;
  warehouse_id?: string;
  is_active?: 'true' | 'false' | 'all';
  low_stock?: boolean;
  page?: number;
  limit?: number;
}

export interface CreateProductData {
  barcode?: string | null;
  name: string;
  category_id?: number | null;
  unit: string;
  is_weighted: boolean;
  purchase_price: number;
  retail_price: number;
  wholesale_price?: number | null;
  wholesale_min_qty: number;
  initial_stock: number;
  initial_warehouse_id?: number | null;
  min_stock_level: number;
  expiry_date?: string | null;
  supplier_id?: number | null;
  notes?: string | null;
}

// ─── Categories ──────────────────────────────────────────────────────────────

export const useCategories = () =>
  useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: () => apiClient.get('/categories').then((r) => r.data.categories),
  });

export const useCreateCategory = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; parent_id?: number | null }) =>
      apiClient.post('/categories', data).then((r) => r.data.category),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  });
};

export const useUpdateCategory = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name: string }) =>
      apiClient.put(`/categories/${id}`, data).then((r) => r.data.category),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  });
};

export const useDeleteCategory = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/categories/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  });
};

// ─── Suppliers ────────────────────────────────────────────────────────────────

export const useSuppliers = () =>
  useQuery<Supplier[]>({
    queryKey: ['suppliers'],
    queryFn: () => apiClient.get('/suppliers').then((r) => r.data.suppliers),
  });

export const useCreateSupplier = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; phone?: string | null; notes?: string | null }) =>
      apiClient.post('/suppliers', data).then((r) => r.data.supplier),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suppliers'] }),
  });
};

// ─── Products ─────────────────────────────────────────────────────────────────

export const useProducts = (filters: ProductFilters) =>
  useQuery<{ products: Product[]; pagination: Pagination }>({
    queryKey: ['products', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.q) params.set('q', filters.q);
      if (filters.category_id) params.set('category_id', filters.category_id);
      if (filters.warehouse_id) params.set('warehouse_id', filters.warehouse_id);
      params.set('is_active', filters.is_active ?? 'true');
      if (filters.low_stock) params.set('low_stock', 'true');
      params.set('page', String(filters.page ?? 1));
      params.set('limit', String(filters.limit ?? 20));

      const r = await apiClient.get(`/products?${params}`);
      return { products: r.data.products, pagination: r.data.pagination };
    },
    placeholderData: (prev) => prev,
  });

export const useCreateProduct = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateProductData) =>
      apiClient.post('/products', data).then((r) => r.data.product),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  });
};

export const useUpdateProduct = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Omit<CreateProductData, 'initial_stock'> & { id: string }) =>
      apiClient.put(`/products/${id}`, data).then((r) => r.data.product),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  });
};

export const useToggleProductActive = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.patch(`/products/${id}/active`).then((r) => r.data.product),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  });
};

export const useAdjustStock = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      new_quantity,
      warehouse_id,
      note,
    }: {
      id: string;
      new_quantity: number;
      warehouse_id?: number | null;
      note?: string;
    }) =>
      apiClient
        .patch(`/products/${id}/stock`, {
          new_quantity,
          warehouse_id: warehouse_id ?? undefined,
          note,
        })
        .then((r) => r.data.product),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  });
};