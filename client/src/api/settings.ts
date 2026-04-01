import { apiClient } from './client.ts';

export const settingsApi = {
  getAll: () =>
    apiClient.get<{ success: boolean; settings: Record<string, string> }>('/settings/all'),

  update: (key: string, value: string) =>
    apiClient.put<{ success: boolean; key: string; value: string }>(`/settings/${key}`, { value }),

  bulkUpdate: (updates: Record<string, string>) =>
    apiClient.put<{ success: boolean }>('/settings', updates),
};
