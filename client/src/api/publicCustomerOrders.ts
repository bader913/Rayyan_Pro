export type PublicOrderCurrencyCode = 'USD' | 'SYP' | 'TRY' | 'SAR' | 'AED';
export type PublicOrderPaymentMethod = 'cash_on_delivery' | 'sham_cash';

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
    default_currency: PublicOrderCurrencyCode;
    rates: Record<PublicOrderCurrencyCode, number>;
  };
  channels: {
    orders_enabled: boolean;
    web_enabled: boolean;
    telegram_enabled: boolean;
    telegram_link: string | null;
  };
  products: PublicCatalogProduct[];
}

export interface PublicCreateOrderPayload {
  customer_name: string;
  recipient_name?: string | null;
  phone?: string | null;
  notes?: string | null;
  payment_method: PublicOrderPaymentMethod;
  currency_code: PublicOrderCurrencyCode;
  items: Array<{
    product_id: number;
    quantity: number;
  }>;
}

export interface PublicCreateOrderResponse {
  success: boolean;
  order: {
    id: number;
    order_number: string;
    status: string;
    customer_name: string;
    recipient_name: string | null;
    phone: string | null;
    payment_method: PublicOrderPaymentMethod;
    currency_code: PublicOrderCurrencyCode;
    total_usd: string;
    created_at: string;
  };
}

export const publicCustomerOrdersApi = {
  getCatalog: async (): Promise<PublicCatalogResponse> => {
    const res = await fetch('/api/public/customer-orders/catalog');
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.message || 'تعذر تحميل كتالوج الطلب');
    }
    return res.json();
  },

  createOrder: async (
    payload: PublicCreateOrderPayload
  ): Promise<PublicCreateOrderResponse> => {
    const res = await fetch('/api/public/customer-orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      throw new Error(data?.message || 'تعذر إرسال الطلب');
    }

    return data;
  },
};