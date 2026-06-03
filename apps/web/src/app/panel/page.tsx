'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/panel-auth';

/**
 * Índice del panel: redirige a citas (si hay sesión) o a login.
 */
export default function PanelIndex() {
  const { session, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    router.replace(session ? '/panel/appointments' : '/panel/login');
  }, [session, loading, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <p className="text-gray-400 animate-pulse">Cargando…</p>
    </div>
  );
}
