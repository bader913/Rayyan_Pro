import axios from 'axios';
import { useAuthStore } from '../store/authStore.ts';

export const apiClient = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let refreshingPromise: Promise<string> | null = null;

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      const refreshToken = useAuthStore.getState().refreshToken;

      if (refreshToken) {
        try {
          if (!refreshingPromise) {
            refreshingPromise = axios
              .post('/api/auth/refresh', { refresh_token: refreshToken })
              .then((res) => {
                const newToken = res.data.access_token;
                useAuthStore.getState().setAccessToken(newToken);
                return newToken;
              })
              .finally(() => {
                refreshingPromise = null;
              });
          }

          const newToken = await refreshingPromise;
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return apiClient(originalRequest);
        } catch {
          useAuthStore.getState().clearAuth();
          window.location.href = '/login';
        }
      } else {
        useAuthStore.getState().clearAuth();
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  }
);

export const authApi = {
  login: (username: string, password: string) =>
    apiClient.post('/auth/login', { username, password }),
  logout: (refreshToken: string) =>
    apiClient.post('/auth/logout', { refresh_token: refreshToken }),
  refresh: (refreshToken: string) =>
    axios.post('/api/auth/refresh', { refresh_token: refreshToken }),
  me: () => apiClient.get('/auth/me'),
};