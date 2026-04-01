export type AssistantIntent =
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
  | 'morning_decisions'
  | 'sale_invoice_lookup'
  | 'last_customer_invoice_lookup'
  | 'last_five_sales_lookup'
  | 'top_customers_month'
  | 'top_customers_debt'
  | 'customer_statement_lookup'
  | 'supplier_statement_lookup'

  | 'general_ai'
  | 'unsupported';

export interface AssistantReply {
  intent: AssistantIntent;
  text: string;
  mode: 'local' | 'gemini' | 'fallback';
}

export type NumericRow = {
  value: string | number | null;
};

export type ProductStockRow = {
  name: string;
  stock_quantity: string | number;
  min_stock_level: string | number | null;
  unit: string | null;
};

export type ProductLookupRow = {
  id: string | number;
  name: string;
  barcode: string | null;
  stock_quantity: string | number | null;
  min_stock_level: string | number | null;
  unit: string | null;
  retail_price: string | number | null;
  wholesale_price: string | number | null;
  wholesale_min_qty: string | number | null;
  purchase_price: string | number | null;
  is_active: boolean | null;
};

export type ProductListRow = {
  name: string;
  barcode: string | null;
  stock_quantity: string | number | null;
  unit: string | null;
  is_active: boolean | null;
};

export type NamedBalanceRow = {
  name: string;
  balance: string | number;
};

export type ShiftRow = {
  id: string | number;
  status?: string | null;
  opened_at?: string | null;
  opening_balance?: string | number | null;
  user_name?: string | null;
  terminal_name?: string | null;
};

export const INTENTS: AssistantIntent[] = [
  'sales_today',
  'sales_week',
  'sales_month',
  'profit_today',
  'low_stock',
  'out_of_stock',
  'dashboard_summary',
  'top_products_today',
  'returns_today',
  'expenses_today',
  'purchases_today',
  'customer_balances',
  'supplier_balances',
  'open_shift',
  'product_price',
  'product_stock',
  'all_products',
  'recent_sales',
  'slow_moving',
  'reorder_suggestions',
  'morning_decisions',
  'sale_invoice_lookup',
  'last_customer_invoice_lookup',
  'last_five_sales_lookup',
  'top_customers_month',
  'top_customers_debt',
  'customer_statement_lookup',
  'supplier_statement_lookup',
  'general_ai',
  'unsupported',
];