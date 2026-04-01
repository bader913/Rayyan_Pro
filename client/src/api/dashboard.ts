import { apiClient } from './client.ts';

export interface DashboardStats {
  sales: {
    today: { count: number; total: number };
    week: { count: number; total: number };
    month: { count: number; total: number };
  };
  purchases: {
    month: { count: number; total: number };
  };
  receivables: {
    customerDebt: number;
    supplierBalance: number;
  };
  cashFlow: {
    salesCash: number;
    purchasesCash: number;
    cashRefunds: number;
    net: number;
  };
  profit?: {
    soldRevenue: number;
    returnedRevenue: number;
    netRevenue: number;
    soldCost: number;
    returnedCost: number;
    totalCost: number;
    grossProfit: number;
    totalExpenses?: number;
    netProfit?: number;
  };
  topProducts: Array<{
    product_name: string;
    product_unit?: string | null;
    total_qty: string;
    total_revenue: string;
  }>;
  lowStock: Array<{
    id: number;
    name: string;
    stock_quantity: string;
    min_stock_level: string;
  }>;
  recentSales: Array<{
    id: number;
    invoice_number: string;
    total_amount: string;
    created_at: string;
    customer_name: string | null;
  }>;
}

export interface DashboardSmartSuggestions {
  reorderNow: Array<{
    id: number;
    name: string;
    stock_quantity: number;
    min_stock_level: number;
    net_sold_30: number;
    days_left: number | null;
  }>;
  stockRisk: Array<{
    id: number;
    name: string;
    stock_quantity: number;
    min_stock_level: number;
    net_sold_14: number;
    days_left: number;
  }>;
  slowMoving: Array<{
    id: number;
    name: string;
    stock_quantity: number;
    min_stock_level: number;
    last_sale_at: string | null;
    days_since_last_sale: number | null;
  }>;
  total: number;
}
export interface MorningDecisionSummary {
  badge_count: number;
  urgent_restock_count: number;
  slow_moving_count: number;
  top_selling_count: number;
  pending_orders_count: number;
  attention_count: number;
  generated_at: string;
}

export interface MorningDecisionData {
  urgentRestock: Array<{
    id: number;
    name: string;
    stock_quantity: number;
    min_stock_level: number;
    net_sold_30: number;
    days_left: number | null;
  }>;
  slowMoving: Array<{
    id: number;
    name: string;
    stock_quantity: number;
    min_stock_level: number;
    last_sale_at: string | null;
    days_since_last_sale: number | null;
  }>;
  topSelling: Array<{
    product_id: number;
    product_name: string;
    product_unit: string | null;
    net_qty: number;
    net_revenue: number;
  }>;
  pendingOrders: Array<{
    id: number;
    order_number: string;
    source: string;
    status: string;
    customer_name: string;
    recipient_name: string | null;
    payment_method: string;
    warehouse_name: string | null;
    created_at: string;
  }>;
  attention: Array<{
    key: string;
    type: 'shift_variance' | 'old_pending_order' | 'out_of_stock_top_seller';
    severity: 'high' | 'medium';
    title: string;
    subtitle: string;
    route: string;
    metric_kind: 'money' | 'hours' | 'quantity';
    metric_value: number;
    metric_prefix: string | null;
  }>;
}

export const dashboardApi = {
  getStats: (warehouseId?: number) =>
    apiClient.get<{ success: boolean; stats: DashboardStats }>('/dashboard/stats', {
      params: {
        warehouse_id: warehouseId || undefined,
      },
    }),

  getSmartSuggestions: (warehouseId?: number) =>
    apiClient.get<{ success: boolean; suggestions: DashboardSmartSuggestions }>('/dashboard/smart-suggestions', {
      params: {
        warehouse_id: warehouseId || undefined,
      },
    }),
  getMorningDecisions: () =>
    apiClient.get<{ success: boolean; summary: MorningDecisionSummary; decisions: MorningDecisionData }>(
      '/dashboard/morning-decisions'
    ),
};