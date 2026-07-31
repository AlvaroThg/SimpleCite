'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { panelLogin, panelLogout, type PanelUser } from './panel-api';
import { PANEL_SESSION_KEY, clearPanelSession } from './panel-session-key';

interface Session {
  /**
   * Vacío en sesiones nuevas: el JWT vive en una cookie httpOnly que el
   * navegador adjunta solo (credentials: 'include'), fuera del alcance de XSS.
   * Sesiones antiguas pueden traer un token persistido — sigue funcionando
   * como Bearer hasta que expire.
   */
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
      const raw = localStorage.getItem(PANEL_SESSION_KEY);
      if (raw) setSession(JSON.parse(raw) as Session);
    } catch {
      // ignore
    }
    setLoading(false);
  }, []);

  const login = useCallback(async (slug: string, email: string, password: string) => {
    const { user } = await panelLogin(slug, email, password);
    // token: '' — el JWT quedó en la cookie httpOnly; NO se persiste en
    // localStorage (un XSS ya no puede robarlo).
    const next: Session = { token: '', slug, user };
    localStorage.setItem(PANEL_SESSION_KEY, JSON.stringify(next));
    setSession(next);
  }, []);

  const logout = useCallback(() => {
    const slug = session?.slug;
    clearPanelSession();
    setSession(null);
    // Borra la cookie httpOnly en el API (best-effort, no bloquea el logout).
    if (slug) void panelLogout(slug);
  }, [session?.slug]);

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
