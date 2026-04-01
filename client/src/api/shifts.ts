import { apiClient } from './client.ts';

export interface Shift {
  id:                       number;
  user_id:                  number;
  pos_terminal_id:          number | null;
  opening_balance:          string;
  opening_note:             string | null;
  closing_note:             string | null;
  opened_at:                string;
  closed_at:                string | null;
  status:                   'open' | 'closed';
  closing_cash_counted:     string;
  expected_cash:            string;
  difference:               string;
  cashier_name:             string;
  terminal_name:            string | null;
  terminal_code:            string | null;
}

export interface ShiftSummary extends Shift {
  sales_count:  number;
  sales_total:  string;
  cash_total:   string;
  card_total:   string;
  credit_total: string;
}

export const shiftsApi = {
  getCurrent: () =>
    apiClient.get<{ success: boolean; shift: Shift | null }>('/shifts/current'),

  getAll: (params?: { status?: string; limit?: number }) =>
    apiClient.get<{ success: boolean; shifts: Shift[] }>('/shifts', { params }),

  getSummary: (id: number) =>
    apiClient.get<{ success: boolean; summary: ShiftSummary }>(`/shifts/${id}/summary`),

  open: (data: { terminal_id?: number | null; opening_balance: number; opening_note?: string }) =>
    apiClient.post<{ success: boolean; shift: Shift }>('/shifts/open', data),

  close: (id: number, data: { closing_cash_counted: number; closing_note?: string }) =>
    apiClient.post<{ success: boolean; summary: ShiftSummary }>(`/shifts/${id}/close`, data),
};
