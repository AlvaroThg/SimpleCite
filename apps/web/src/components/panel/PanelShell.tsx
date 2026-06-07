'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { CreditCard, LogOut } from 'lucide-react';
import { useAuth, useRequireAuth } from '@/lib/panel-auth';
import { getBillingStatus, type BillingStatus } from '@/lib/panel-api';
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

  // Estado de suscripción: si está inactiva, el panel pide renovar.
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  useEffect(() => {
    if (!session) return;
    getBillingStatus(session.token, session.slug)
      .then(setBilling)
      .catch(() => {});
  }, [session]);

  // Mientras carga / redirige a login, no renderizar el contenido protegido.
  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <BrandSpinner size={36} />
      </div>
    );
  }

  const role = session.user.role;
  const subInactive =
    !!billing &&
    (billing.subscriptionStatus === 'PAST_DUE' ||
      billing.subscriptionStatus === 'CANCELED' ||
      (billing.subscriptionEndDate
        ? new Date(billing.subscriptionEndDate).getTime() < Date.now()
        : false));
  const onBilling = pathname.startsWith('/panel/billing');
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
    { href: '/panel/billing', label: 'Suscripción', icon: '💳', roles: ['ADMIN'] },
    { href: '/panel/settings', label: 'Configuración', icon: '⚙️', roles: ['ADMIN'] },
  ].filter((item) => item.roles.includes(role));

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top bar */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Link href="/panel" className="transition-opacity hover:opacity-80">
              <Image
                src="/logo.png"
                alt="SimpleCite"
                width={2031}
                height={774}
                priority
                className="h-10 w-auto"
              />
            </Link>
            <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700">
              {session.user.role}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="hidden font-medium text-gray-600 sm:inline">{session.user.name}</span>
            <button
              onClick={logout}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600 active:scale-95"
            >
              <LogOut className="size-4" />
              <span className="hidden sm:inline">Salir</span>
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
        <main className="flex-1 min-w-0 pb-20 md:pb-0">
          {subInactive && !onBilling ? <RenewPrompt /> : children}
        </main>
      </div>
    </div>
  );
}

/** Prompt que bloquea el panel cuando la suscripción está inactiva. */
function RenewPrompt() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="max-w-md rounded-2xl border border-amber-200 bg-amber-50 p-8">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-600">
          <CreditCard className="size-7" />
        </div>
        <h2 className="text-xl font-bold text-gray-900">Suscripción inactiva</h2>
        <p className="mt-2 text-sm text-gray-600">
          Tu suscripción está vencida o inactiva. Renueva tu plan para volver a gestionar citas,
          pacientes y WhatsApp.
        </p>
        <Link
          href="/panel/billing"
          className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-3 font-semibold text-white transition hover:bg-brand-700 active:scale-95"
        >
          <CreditCard className="size-4" /> Renovar suscripción
        </Link>
      </div>
    </div>
  );
}
