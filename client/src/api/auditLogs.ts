import { apiClient } from './client.ts';

export interface AuditLogRow {
  id:          number;
  action:      string;
  entity_type: string;
  entity_id:   number | null;
  old_data:    object | null;
  new_data:    object | null;
  ip_address:  string | null;
  created_at:  string;
  user_name:   string | null;
  username:    string | null;
  user_role:   string | null;
}

export const auditLogsApi = {
  list: (params?: { page?: number; from?: string; to?: string; user_id?: number; action?: string; entity_type?: string }) => {
    const qs = new URLSearchParams();
    if (params?.page)        qs.set('page',        String(params.page));
    if (params?.from)        qs.set('from',        params.from);
    if (params?.to)          qs.set('to',          params.to);
    if (params?.user_id)     qs.set('user_id',     String(params.user_id));
    if (params?.action)      qs.set('action',      params.action);
    if (params?.entity_type) qs.set('entity_type', params.entity_type);
    return apiClient.get<{ success: boolean; data: AuditLogRow[]; total: number; page: number; limit: number }>(
      `/audit-logs?${qs}`
    );
  },
  meta: () =>
    apiClient.get<{ success: boolean; actions: string[]; entityTypes: string[] }>('/audit-logs/meta'),
};
