import { apiClient } from './client.ts';

export interface AIAssistantReply {
  intent:
    | 'sales_today'
    | 'sales_week'
    | 'sales_month'
    | 'profit_today'
    | 'low_stock'
    | 'out_of_stock'
    | 'dashboard_summary'
    | 'top_products_today'
    | 'returns_today'
    | 'expenses_today'
    | 'purchases_today'
    | 'customer_balances'
    | 'supplier_balances'
    | 'open_shift'
    | 'product_price'
    | 'product_stock'
    | 'all_products'
    | 'recent_sales'
    | 'slow_moving'
    | 'reorder_suggestions'
    | 'general_ai'
    | 'morning_decisions'
    | 'unsupported';
        
  text: string;
  mode: 'local' | 'gemini' | 'openai' | 'fallback';
}

export const aiApi = {
  ask(message: string) {
    return apiClient.post<{ success: boolean; reply: AIAssistantReply }>(
      '/ai-assistant/chat',
      { message }
    );
  },
};