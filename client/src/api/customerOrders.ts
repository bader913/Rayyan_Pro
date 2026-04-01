import { apiClient } from './client.ts';

export type CustomerOrderStatus = 'new' | 'reviewed' | 'converted' | 'cancelled';
export type CustomerOrderPaymentMethod = 'cash_on_delivery' | 'sham_cash';
export type CustomerOrderCurrencyCode = 'USD' | 'SYP' | 'TRY' | 'SAR' | 'AED';

export interface CustomerOrderListItem {
  id: number;
  order_number: string;
  source: string;
  status: CustomerOrderStatus;
  customer_name: string;
  recipient_name: string | null;
  phone: string | null;
  payment_method: CustomerOrderPaymentMethod;
  currency_code: CustomerOrderCurrencyCode;
  exchange_rate: string;
  subtotal_usd: string;
  total_usd: string;
  warehouse_id: number | null;
  warehouse_name: string | null;
  converted_to_sale_id: number | null;
  items_count: string;
  created_at: string;
  reviewed_at: string | null;
  converted_at: string | null;
}

export interface CustomerOrderItem {
  id: number;
  order_id: number;
  product_id: number;
  product_name_snapshot: string;
  unit_snapshot: string;
  image_url_snapshot: string | null;
  quantity: string;
  unit_price_usd: string;
  line_total_usd: string;
  created_at: string;
}

export interface CustomerOrder {
  id: number;
  order_number: string;
  source: string;
  status: CustomerOrderStatus;
  customer_name: string;
  recipient_name: string | null;
  phone: string | null;
  notes: string | null;
  payment_method: CustomerOrderPaymentMethod;
  currency_code: CustomerOrderCurrencyCode;
  exchange_rate: string;
  subtotal_usd: string;
  total_usd: string;
  customer_id: number | null;
  warehouse_id: number | null;
  warehouse_name: string | null;
  converted_to_sale_id: number | null;
  cancel_reason: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
  converted_at: string | null;
  telegram_chat_id?: string | null;
  delivered_at?: string | null;
  delivery_notified_at?: string | null;
  cancel_notified_at?: string | null;
  last_manual_message_at?: string | null;
  converted_sale_invoice_number?: string | null;
  items: CustomerOrderItem[];
}

export interface CustomerOrdersPagination {
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export const customerOrdersApi = {
  getAll: (params?: {
    q?: string;
    status?: CustomerOrderStatus | 'all';
    source?: 'all' | 'web' | 'telegram';
    page?: number;
    limit?: number;
  }) =>
    apiClient.get<{
      success: boolean;
      orders: CustomerOrderListItem[];
      pagination: CustomerOrdersPagination;
    }>('/customer-orders', { params }),

  getById: (id: number) =>
    apiClient.get<{ success: boolean; order: CustomerOrder }>(`/customer-orders/${id}`),
    notifyDelivered: (id: number) =>
    apiClient.post<{ success: boolean; order: CustomerOrder }>(
      `/customer-orders/${id}/notify-delivered`,
      {}
    ),
      sendTelegramNote: (
    id: number,
    payload: {
      message: string;
    }
  ) =>
    apiClient.post<{ success: boolean; order: CustomerOrder }>(
      `/customer-orders/${id}/send-telegram-note`,
      payload
    ),

  updateStatus: (
    id: number,
    payload: {
      status: 'new' | 'reviewed' | 'cancelled';
      cancel_reason?: string | null;
    }
  ) =>
    apiClient.patch<{ success: boolean; order: CustomerOrder }>(
      `/customer-orders/${id}/status`,
      payload
    ),
      getPendingCount: async () => {
    const [newRes, reviewedRes] = await Promise.all([
      apiClient.get<{
        success: boolean;
        orders: CustomerOrderListItem[];
        pagination: CustomerOrdersPagination;
      }>('/customer-orders', {
        params: { status: 'new', page: 1, limit: 1 },
      }),
      apiClient.get<{
        success: boolean;
        orders: CustomerOrderListItem[];
        pagination: CustomerOrdersPagination;
      }>('/customer-orders', {
        params: { status: 'reviewed', page: 1, limit: 1 },
      }),
    ]);

    return {
      success: true,
      count:
        Number(newRes.data.pagination?.total ?? 0) +
        Number(reviewedRes.data.pagination?.total ?? 0),
    };
  },
};

export function getCustomerOrderStatusLabel(status: CustomerOrderStatus) {
  switch (status) {
    case 'new':
      return 'جديد';
    case 'reviewed':
      return 'مُراجع';
    case 'converted':
      return 'تم تحويله';
    case 'cancelled':
      return 'ملغي';
    default:
      return status;
  }
}

export function getCustomerOrderPaymentLabel(method: CustomerOrderPaymentMethod) {
  switch (method) {
    case 'cash_on_delivery':
      return 'نقدًا عند الاستلام';
    case 'sham_cash':
      return 'شام كاش';
    default:
      return method;
  }
}
export interface PublicCatalogProduct {
  id: number;
  name: string;
  unit: string;
  retail_price: string;
  image_url: string | null;
  available_quantity: string;
}

export interface PublicCatalogResponse {
  success: boolean;
  warehouse: {
    id: number;
    name: string;
    code: string | null;
  };
  currency: {
    default_currency: CustomerOrderCurrencyCode;
    rates: Record<CustomerOrderCurrencyCode, number>;
  };
  products: PublicCatalogProduct[];
}

export interface PublicCreateOrderPayload {
  customer_name: string;
  recipient_name?: string | null;
  phone?: string | null;
  notes?: string | null;
  payment_method: CustomerOrderPaymentMethod;
  currency_code: CustomerOrderCurrencyCode;
  items: Array<{
    product_id: number;
    quantity: number;
  }>;
}

export const publicCustomerOrdersApi = {
  getCatalog: () =>
    apiClient.get<PublicCatalogResponse>('/public/customer-orders/catalog'),

  createOrder: (payload: PublicCreateOrderPayload) =>
    apiClient.post<{ success: boolean; order: CustomerOrder }>('/public/customer-orders', payload),
};