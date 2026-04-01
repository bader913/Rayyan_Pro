import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './client.ts';

export interface UserPublic {
  id: string;
  username: string;
  full_name: string;
  role: string;
  is_active: boolean;
  is_protected: boolean;
  avatar_url: string | null;
  last_login_at: string | null;
  created_at: string;
}

export interface CreateUserInput {
  username: string;
  password: string;
  full_name: string;
  role: 'admin' | 'manager' | 'cashier' | 'warehouse';
}

export interface UpdateUserInput {
  full_name?: string;
  role?: 'admin' | 'manager' | 'cashier' | 'warehouse';
}

// Queries
export const useUsers = () =>
  useQuery({
    queryKey: ['users'],
    queryFn: async (): Promise<UserPublic[]> => {
      const res = await apiClient.get('/users');
      return res.data.users;
    },
  });

// Mutations
export const useCreateUser = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateUserInput) => {
      const res = await apiClient.post('/users', data);
      return res.data.user as UserPublic;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
};

export const useUpdateUser = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateUserInput }) => {
      const res = await apiClient.put(`/users/${id}`, data);
      return res.data.user as UserPublic;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
};

export const useChangePassword = () =>
  useMutation({
    mutationFn: async ({ id, newPassword }: { id: string; newPassword: string }) => {
      const res = await apiClient.patch(`/users/${id}/password`, { new_password: newPassword });
      return res.data;
    },
  });

export const useToggleActive = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiClient.patch(`/users/${id}/active`);
      return res.data.user as UserPublic;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
};
