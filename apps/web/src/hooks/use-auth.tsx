'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { AuthUser, Role } from '@/types';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (credential: string) => Promise<void>;
  logout: () => void;
  can: (...roles: Role[]) => boolean;
  updateUser: (partial: Partial<AuthUser>) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function setCookie(name: string, value: string, hours = 8) {
  const expires = new Date(Date.now() + hours * 60 * 60 * 1000).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; samesite=lax`;
}

function clearCookie(name: string) {
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem('knf_user') : null;
    if (stored) {
      try {
        setUser(JSON.parse(stored));
      } catch {
        localStorage.removeItem('knf_user');
      }
    }
    setLoading(false);
  }, []);

  const applySession = useCallback(
    (data: { token: string; user: AuthUser }) => {
      setCookie('knf_token', data.token);
      localStorage.setItem('knf_user', JSON.stringify(data.user));
      setUser(data.user);
      router.push('/dashboard');
    },
    [router],
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const { data } = await api.post('/auth/login', { email, password });
      applySession(data);
    },
    [applySession],
  );

  const loginWithGoogle = useCallback(
    async (credential: string) => {
      const { data } = await api.post('/auth/google', { credential });
      applySession(data);
    },
    [applySession],
  );

  const logout = useCallback(() => {
    clearCookie('knf_token');
    localStorage.removeItem('knf_user');
    setUser(null);
    router.push('/login');
  }, [router]);

  const can = useCallback(
    (...roles: Role[]) => {
      if (!user) return false;
      if (roles.length === 0) return true;
      return roles.includes(user.role);
    },
    [user],
  );

  const updateUser = useCallback((partial: Partial<AuthUser>) => {
    setUser((prev) => {
      const next = { ...(prev as AuthUser), ...partial };
      localStorage.setItem('knf_user', JSON.stringify(next));
      return next;
    });
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, loginWithGoogle, logout, can, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
