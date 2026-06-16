'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  ClipboardList,
  Stethoscope,
  CalendarClock,
  CreditCard,
  Settings,
  LogOut,
  type LucideIcon,
} from 'lucide-react';
import { useAuth, useRequireAuth } from '@/lib/panel-auth';
import { getBillingStatus, type BillingStatus } from '@/lib/panel-api';
import { BrandSpinner } from '@/components/panel/Skeleton';

type Role = 'ADMIN' | 'DOCTOR' | 'STAFF';
interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles: Role[];
}
const ALL: Role[] = ['ADMIN', 'DOCTOR', 'STAFF'];

/** Navegación agrupada por secciones (estilo dashboard). */
const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Principal',
    items: [
      { href: '/panel', label: 'Inicio', icon: LayoutDashboard, roles: ALL },
      { href: '/panel/appointments', label: 'Citas', icon: CalendarDays, roles: ALL },
      { href: '/panel/patients', label: 'Pacientes', icon: Users, roles: ALL },
    ],
  },
  {
    label: 'Gestión',
    items: [
      { href: '/panel/services', label: 'Servicios', icon: ClipboardList, roles: ['ADMIN'] },
      { href: '/panel/doctors', label: 'Doctores', icon: Stethoscope, roles: ['ADMIN'] },
      {
        href: '/panel/schedule',
        label: 'Horarios',
        icon: CalendarClock,
        roles: ['ADMIN', 'DOCTOR'],
      },
    ],
  },
  {
    label: 'Cuenta',
    items: [
      { href: '/panel/billing', label: 'Suscripción', icon: CreditCard, roles: ['ADMIN'] },
      { href: '/panel/settings', label: 'Configuración', icon: Settings, roles: ['ADMIN'] },
    ],
  },
];

/** Activo: exacto para "/panel" (Inicio), prefijo para el resto. */
function isActive(href: string, pathname: string): boolean {
  return href === '/panel' ? pathname === '/panel' : pathname.startsWith(href);
}

/**
 * Shell del panel autenticado. Layout de dashboard: sidebar full-height con
 * secciones + barra superior con el título de la vista. Identidad SimpleCite
 * (claro, azul de marca). En móvil el sidebar se reemplaza por tabs inferiores.
 */
export function PanelShell({ children }: { children: React.ReactNode }) {
  const session = useRequireAuth();
  const { logout } = useAuth();
  const pathname = usePathname();

  const [billing, setBilling] = useState<BillingStatus | null>(null);
  useEffect(() => {
    if (!session) return;
    getBillingStatus(session.token, session.slug)
      .then(setBilling)
      .catch(() => {});
  }, [session]);

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <BrandSpinner size={36} />
      </div>
    );
  }

  const role = session.user.role;
  const groups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => i.roles.includes(role)),
  })).filter((g) => g.items.length > 0);
  const flatNav = groups.flatMap((g) => g.items);
  const current = flatNav.find((i) => isActive(i.href, pathname));

  const subInactive =
    !!billing &&
    (billing.subscriptionStatus === 'PAST_DUE' ||
      billing.subscriptionStatus === 'CANCELED' ||
      (billing.subscriptionEndDate
        ? new Date(billing.subscriptionEndDate).getTime() < Date.now()
        : false));
  const onBilling = pathname.startsWith('/panel/billing');

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* ── Sidebar (desktop) ── */}
      <aside className="hidden w-60 flex-shrink-0 flex-col border-r border-gray-200 bg-white md:flex">
        <div className="flex h-16 items-center gap-2.5 border-b border-gray-100 px-5">
          <Link href="/panel" className="transition-opacity hover:opacity-80">
            <Image
              src="/logo.png"
              alt="SimpleCite"
              width={2031}
              height={774}
              priority
              className="h-8 w-auto"
            />
          </Link>
          <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700">
            {role}
          </span>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
          {groups.map((group) => (
            <div key={group.label}>
              <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active = isActive(item.href, pathname);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                          active
                            ? 'bg-brand-50 text-brand-700'
                            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                        }`}
                      >
                        <Icon
                          className={`size-[18px] ${active ? 'text-brand-600' : 'text-gray-400'}`}
                        />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-gray-100 p-3">
          <div className="flex items-center justify-between gap-2 rounded-lg px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-800">{session.user.name}</p>
              <p className="truncate text-xs text-gray-400">{session.user.email}</p>
            </div>
            <button
              onClick={logout}
              aria-label="Cerrar sesión"
              className="flex-shrink-0 rounded-lg p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 active:scale-95"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Área principal ── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barra superior */}
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4 md:px-6">
          {/* Logo solo en móvil; en desktop el título de la vista */}
          <Link href="/panel" className="md:hidden">
            <Image
              src="/logo.png"
              alt="SimpleCite"
              width={2031}
              height={774}
              className="h-8 w-auto"
            />
          </Link>
          <h1 className="hidden text-base font-semibold text-gray-900 md:block">
            {current?.label ?? 'Panel'}
          </h1>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden font-medium text-gray-600 sm:inline md:hidden lg:inline">
              {session.user.name}
            </span>
            <button
              onClick={logout}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600 active:scale-95 md:hidden"
            >
              <LogOut className="size-4" />
              <span className="hidden sm:inline">Salir</span>
            </button>
          </div>
        </header>

        {/* Contenido */}
        <main className="flex-1 px-4 py-6 pb-24 md:px-6 md:pb-6">
          {subInactive && !onBilling ? <RenewPrompt /> : children}
        </main>
      </div>

      {/* ── Tabs inferiores (móvil) ── */}
      <div className="fixed bottom-0 left-0 right-0 z-10 flex overflow-x-auto border-t border-gray-200 bg-white md:hidden">
        {flatNav.map((item) => {
          const active = isActive(item.href, pathname);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-w-[68px] flex-shrink-0 flex-col items-center gap-0.5 py-2 text-[11px] ${
                active ? 'text-brand-700' : 'text-gray-500'
              }`}
            >
              <Icon className="size-5" />
              {item.label}
            </Link>
          );
        })}
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
