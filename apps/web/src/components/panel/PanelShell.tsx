'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useAuth, useRequireAuth } from '@/lib/panel-auth';
import { BrandSpinner } from '@/components/panel/Skeleton';

/** Activo: exacto para "/panel" (Inicio), prefijo para el resto. */
function isActive(href: string, pathname: string): boolean {
  return href === '/panel' ? pathname === '/panel' : pathname.startsWith(href);
}

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
        <BrandSpinner size={36} />
      </div>
    );
  }

  const role = session.user.role;
  const nav = [
    { href: '/panel', label: 'Inicio', icon: '🏠', roles: ['ADMIN', 'DOCTOR', 'STAFF'] },
    {
      href: '/panel/appointments',
      label: 'Citas',
      icon: '📅',
      roles: ['ADMIN', 'DOCTOR', 'STAFF'],
    },
    {
      href: '/panel/patients',
      label: 'Pacientes',
      icon: '👥',
      roles: ['ADMIN', 'DOCTOR', 'STAFF'],
    },
    { href: '/panel/services', label: 'Servicios', icon: '🩺', roles: ['ADMIN'] },
    { href: '/panel/doctors', label: 'Doctores', icon: '👨‍⚕️', roles: ['ADMIN'] },
    { href: '/panel/schedule', label: 'Horarios', icon: '🗓️', roles: ['ADMIN', 'DOCTOR'] },
    { href: '/panel/settings', label: 'Configuración', icon: '⚙️', roles: ['ADMIN'] },
  ].filter((item) => item.roles.includes(role));

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top bar */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link href="/panel">
              <Image
                src="/logo.png"
                alt="SimpleCite"
                width={2031}
                height={774}
                className="h-7 w-auto"
              />
            </Link>
            <span className="text-xs px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 font-medium">
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
              const active = isActive(item.href, pathname);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition ${
                      active ? 'bg-brand-50 text-brand-700' : 'text-gray-600 hover:bg-gray-100'
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

        {/* Nav móvil (tabs abajo, scroll horizontal si hay muchos) */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex overflow-x-auto z-10">
          {nav.map((item) => {
            const active = isActive(item.href, pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex-shrink-0 min-w-[68px] flex flex-col items-center py-2 text-xs ${
                  active ? 'text-brand-700' : 'text-gray-500'
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
