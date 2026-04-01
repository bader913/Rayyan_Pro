import { apiClient } from './client.ts';

export interface Expense {
  id:              number;
  title:           string;
  category:        string;
  amount:          string;
  currency:        string;
  exchange_rate:   string;
  amount_usd:      string;
  expense_date:    string;
  notes:           string | null;
  created_by:      number | null;
  created_by_name: string | null;
  created_at:      string;
  updated_at:      string;
}

export interface ExpensesResponse {
  expenses:    Expense[];
  total:       number;
  total_usd:   number;
  by_category: { category: string; total_usd: string; count: string }[];
  page:        number;
  limit:       number;
}

export interface CreateExpenseInput {
  title:         string;
  category:      string;
  amount:        number;
  currency:      string;
  exchange_rate: number;
  expense_date:  string;
  notes?:        string;
}

export const expensesApi = {
  getAll: (params?: Record<string, string>) =>
    apiClient.get<ExpensesResponse>('/expenses', { params }),

  getCategories: () =>
    apiClient.get<{ categories: string[] }>('/expenses/categories'),

  create: (data: CreateExpenseInput) =>
    apiClient.post<{ expense: Expense }>('/expenses', data),

  update: (id: number, data: Partial<CreateExpenseInput>) =>
    apiClient.put<{ expense: Expense }>(`/expenses/${id}`, data),

  delete: (id: number) =>
    apiClient.delete(`/expenses/${id}`),
};
