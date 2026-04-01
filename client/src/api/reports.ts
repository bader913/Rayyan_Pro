import { apiClient } from './client.ts';

interface SalesReportResponse {
  success: boolean;
  data: Array<{
    id: number; invoice_number: string; total_amount: string; discount_amount: string;
    paid_amount: string; payment_status: string; payment_method: string;
    created_at: string; customer_id: number | null; customer_name: string | null; cashier_name: string | null;
  }>;
  summary: { totalRevenue: number; totalPaid: number; totalDiscount: number; invoiceCount: number };
  total: number; page: number; limit: number;
}

interface PurchasesReportResponse {
  success: boolean;
  data: Array<{
    id: number; invoice_number: string; total_amount: string; paid_amount: string;
    payment_status: string; created_at: string; supplier_id: number | null; supplier_name: string | null; created_by_name: string | null;
  }>;
  summary: { totalAmount: number; totalPaid: number; totalDebt: number; count: number };
  total: number; page: number; limit: number;
}

interface StockReportResponse {
  success: boolean;
  data: Array<{
    id: number; barcode: string; name: string; stock_quantity: string; min_stock_level: string;
    wholesale_price: string; retail_price: string; purchase_price: string; category_name: string | null;
  }>;
  summary: { totalProducts: number; totalStockValue: number; lowStockCount: number };
}

interface ProfitReportResponse {
  success: boolean;
  data: Array<{
    id: number;
    product_name: string;
    sku: string | null;
    total_sold: string;
    total_returned: string;
    sold_revenue: string;
    returned_revenue: string;
    total_revenue: string;
    sold_cost: string;
    returned_cost: string;
    total_cost: string;
    gross_profit: string;
  }>;
  summary: {
    totalRevenue: number;
    totalCost: number;
    grossProfit: number;
    totalExpenses?: number;
    netProfit?: number;
    margin: number;
  };
  from: string;
  to: string;
}
export const reportsApi = {
  sales: (params: { from: string; to: string; customer_id?: number; page?: number }) => {
    const qs = new URLSearchParams({ from: params.from, to: params.to });
    if (params.customer_id) qs.set('customer_id', String(params.customer_id));
    if (params.page) qs.set('page', String(params.page));
    return apiClient.get<SalesReportResponse>(`/reports/sales?${qs}`);
  },

  purchases: (params: { from: string; to: string; supplier_id?: number; page?: number }) => {
    const qs = new URLSearchParams({ from: params.from, to: params.to });
    if (params.supplier_id) qs.set('supplier_id', String(params.supplier_id));
    if (params.page) qs.set('page', String(params.page));
    return apiClient.get<PurchasesReportResponse>(`/reports/purchases?${qs}`);
  },

  stock: (params?: { q?: string; category_id?: number; low_stock?: boolean }) => {
    const qs = new URLSearchParams();
    if (params?.q) qs.set('q', params.q);
    if (params?.category_id) qs.set('category_id', String(params.category_id));
    if (params?.low_stock) qs.set('low_stock', 'true');
    return apiClient.get<StockReportResponse>(`/reports/stock${qs.toString() ? `?${qs}` : ''}`);
  },

  profit: (params: { from: string; to: string }) =>
    apiClient.get<ProfitReportResponse>(`/reports/profit?from=${params.from}&to=${params.to}`),
};
