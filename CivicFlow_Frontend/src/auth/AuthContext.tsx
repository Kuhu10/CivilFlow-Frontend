import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../api/client';
import type { User } from '../api/types';

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (full_name: string, email: string, password: string) => Promise<void>;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const saved = sessionStorage.getItem('civicflow_user');
    try { return saved ? JSON.parse(saved) as User : null; } catch { return null; }
  });
  const [loading, setLoading] = useState(Boolean(sessionStorage.getItem('civicflow_access_token')));

  const signOut = useCallback(() => {
    sessionStorage.removeItem('civicflow_access_token');
    sessionStorage.removeItem('civicflow_user');
    setUser(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    const unauthorized = () => signOut();
    window.addEventListener('civicflow:unauthorized', unauthorized);
    return () => window.removeEventListener('civicflow:unauthorized', unauthorized);
  }, [signOut]);

  useEffect(() => {
    if (!sessionStorage.getItem('civicflow_access_token')) { setLoading(false); return; }
    let cancelled = false;
    api.me().then((freshUser) => {
      if (cancelled) return;
      setUser(freshUser);
      sessionStorage.setItem('civicflow_user', JSON.stringify(freshUser));
    }).catch(() => { if (!cancelled) signOut(); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [signOut]);

  const signIn = useCallback(async (email: string, password: string) => {
    const result = await api.login({ email, password });
    sessionStorage.setItem('civicflow_access_token', result.access_token);
    sessionStorage.setItem('civicflow_user', JSON.stringify(result.user));
    setUser(result.user);
  }, []);

  const signUp = useCallback(async (full_name: string, email: string, password: string) => {
    await api.register({ full_name, email, password });
    await signIn(email, password);
  }, [signIn]);

  const value = useMemo(() => ({ user, loading, signIn, signUp, signOut }), [user, loading, signIn, signUp, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
