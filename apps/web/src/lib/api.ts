import axios, { AxiosError } from 'axios';

const baseURL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3334/api';

export const api = axios.create({ baseURL });

export function getToken(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)knf_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (error: AxiosError) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      document.cookie = 'knf_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
      localStorage.removeItem('knf_user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);

export function apiError(e: unknown): string {
  if (axios.isAxiosError(e)) {
    const data = e.response?.data as any;
    if (Array.isArray(data?.message)) return data.message.join(', ');
    return data?.message || e.message || 'Erro de comunicação';
  }
  if (e instanceof Error) return e.message;
  return 'Erro desconhecido';
}
