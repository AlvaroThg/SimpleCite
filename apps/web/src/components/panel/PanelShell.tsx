'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth, useRequireAuth } from '@/lib/panel-auth';

/**
 * Shell de páginas autenticadas del panel: barra superior + navegación lateral
 * + guard de sesión. Envuelve el contenido de cada página autenticada.
 *
 * Uso:
 *   export default function Page() {
 *     return <PanelShell><...></PanelShell>;
 *   }
 */
export function PanelShell({ children }: { children: React.ReactNode }) {
  const session = useRequireAuth();
  const { logout } = useAuth();
  const pathname = usePathname();

  // Mientras carga / redirige a login, no renderizar el contenido protegido.
  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-400 animate-pulse">Cargando…</p>
      </div>
    );
  }

  const nav = [
    { href: '/panel/appointments', label: 'Citas', icon: '📅' },
    { href: '/panel/patients', label: 'Pacientes', icon: '👥' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top bar */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-bold text-lg text-gray-900">SimpleCite</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">
              {session.user.role}
            </span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-gray-500 hidden sm:inline">{session.user.name}</span>
            <button
              onClick={logout}
              className="text-gray-400 hover:text-red-600 transition font-medium"
            >
              Salir
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 max-w-6xl w-full mx-auto px-4 py-6 flex gap-6">
        {/* Nav lateral */}
        <nav className="w-44 flex-shrink-0 hidden md:block">
          <ul className="space-y-1 sticky top-20">
            {nav.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition ${
                      active ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <span>{item.icon}</span>
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Nav móvil (tabs arriba) */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex z-10">
          {nav.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex-1 flex flex-col items-center py-2 text-xs ${
                  active ? 'text-blue-700' : 'text-gray-500'
                }`}
              >
                <span className="text-lg">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </div>

        {/* Contenido */}
        <main className="flex-1 min-w-0 pb-20 md:pb-0">{children}</main>
      </div>
    </div>
  );
}
