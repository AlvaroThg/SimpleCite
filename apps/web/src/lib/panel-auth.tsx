'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { panelLogin, type PanelUser } from './panel-api';

const STORAGE_KEY = 'simplecite_panel_session';

interface Session {
  token: string;
  slug: string;
  user: PanelUser;
}

interface AuthState {
  session: Session | null;
  loading: boolean;
  login: (slug: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Cargar sesión desde localStorage al montar.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setSession(JSON.parse(raw) as Session);
    } catch {
      // ignore
    }
    setLoading(false);
  }, []);

  const login = useCallback(async (slug: string, email: string, password: string) => {
    const { accessToken, user } = await panelLogin(slug, email, password);
    const next: Session = { token: accessToken, slug, user };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setSession(next);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setSession(null);
  }, []);

  return (
    <AuthContext.Provider value={{ session, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}

/**
 * Hook que exige sesión: redirige a /panel/login si no hay sesión.
 * Devuelve la sesión (o null mientras carga/redirige).
 */
export function useRequireAuth(): Session | null {
  const { session, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !session) {
      router.replace('/panel/login');
    }
  }, [loading, session, router]);

  return session;
}
