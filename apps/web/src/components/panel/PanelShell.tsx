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
  Package,
  BarChart3,
  LogOut,
  type LucideIcon,
} from 'lucide-react';
import { useAuth, useRequireAuth } from '@/lib/panel-auth';
import { getBillingStatus, getTenantConfig, type BillingStatus } from '@/lib/panel-api';
import { BrandSpinner } from '@/components/panel/Skeleton';
import { Avatar } from '@/components/ui/avatar';
import { ThemeToggle } from '@/components/theme-toggle';

// ─── Marca del tenant en el panel ─────────────────────────────────────
// El panel viste la marca de CADA clínica: su logo en el sidebar y su color
// primario en botones/acentos. Se cachea en sessionStorage para no pedir la
// config en cada navegación.

interface TenantBrand {
  name: string;
  logoUrl: string | null;
  primaryColor: string;
}

function useTenantBrand(session: { token: string; slug: string } | null): TenantBrand | null {
  const [brand, setBrand] = useState<TenantBrand | null>(() => {
    if (typeof window === 'undefined' || !session) return null;
    try {
      const raw = sessionStorage.getItem(`sc-brand-${session.slug}`);
      return raw ? (JSON.parse(raw) as TenantBrand) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (!session) return;
    getTenantConfig(session.token, session.slug)
      .then((cfg) => {
        const next: TenantBrand = {
          name: cfg.name,
          logoUrl: cfg.logoUrl,
          primaryColor: cfg.primaryColor || '#2563eb',
        };
        setBrand(next);
        try {
          sessionStorage.setItem(`sc-brand-${session.slug}`, JSON.stringify(next));
        } catch {
          /* storage lleno: seguimos sin cache */
        }
      })
      .catch(() => {});
  }, [session]);

  return brand;
}

/**
 * Deriva la escala brand-* y los tokens de acción desde el color del tenant.
 * `color-mix` genera los tonos claros/oscuros; las utilidades Tailwind v4
 * (bg-brand-600, text-brand-700, bg-primary…) leen estas variables en cascada,
 * así que basta con setearlas en el contenedor raíz del panel.
 */
function brandVars(primary: string): React.CSSProperties {
  const mix = (pct: number, base: string) => `color-mix(in srgb, ${primary} ${pct}%, ${base})`;
  return {
    ['--primary' as never]: primary,
    ['--primary-hover' as never]: mix(85, 'black'),
    ['--accent' as never]: mix(10, 'white'),
    ['--color-brand-50' as never]: mix(8, 'white'),
    ['--color-brand-100' as never]: mix(15, 'white'),
    ['--color-brand-200' as never]: mix(25, 'white'),
    ['--color-brand-300' as never]: mix(40, 'white'),
    ['--color-brand-400' as never]: mix(60, 'white'),
    ['--color-brand-500' as never]: mix(88, 'white'),
    ['--color-brand-600' as never]: primary,
    ['--color-brand-700' as never]: mix(85, 'black'),
    ['--color-brand-800' as never]: mix(70, 'black'),
    ['--color-brand-900' as never]: mix(55, 'black'),
  };
}

/** Marca del shell oscuro: cuadro azul con punto blanco + wordmark. */
function LogoDot({ className = '' }: { className?: string }) {
  return (
    <span
      className={`relative inline-block size-6 flex-none rounded-[7px] bg-primary ${className}`}
      aria-hidden
    >
      <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-white" />
    </span>
  );
}

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
      { href: '/panel/products', label: 'Productos', icon: Package, roles: ['ADMIN'] },
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
      { href: '/panel/reports', label: 'Reportes', icon: BarChart3, roles: ['ADMIN'] },
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
  const brand = useTenantBrand(session);

  const [billing, setBilling] = useState<BillingStatus | null>(null);
  useEffect(() => {
    if (!session) return;
    getBillingStatus(session.token, session.slug)
      .then(setBilling)
      .catch(() => {});
  }, [session]);

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
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
    <div
      className="flex min-h-screen bg-canvas"
      style={brand ? brandVars(brand.primaryColor) : undefined}
    >
      {/* ── Sidebar oscuro (desktop) ── */}
      <aside className="hidden w-60 flex-shrink-0 flex-col bg-sidebar text-white/70 md:flex">
        {/* Marca de la clínica: su logo y nombre (fallback: SimpleCite). */}
        <Link
          href="/panel"
          className="flex h-16 items-center gap-2.5 px-5 text-base font-bold tracking-[-0.01em] text-white transition-opacity hover:opacity-90"
        >
          {brand?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={brand.logoUrl}
              alt={brand.name}
              className="size-9 flex-none rounded-lg bg-white object-contain p-1"
            />
          ) : (
            <LogoDot />
          )}
          <span className="truncate leading-tight">{brand?.name ?? 'SimpleCite'}</span>
        </Link>

        <nav className="flex-1 overflow-y-auto py-2">
          {groups.map((group) => (
            <div key={group.label} className="mb-4 last:mb-0">
              <p className="px-5 pb-1.5 pt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">
                {group.label}
              </p>
              <ul>
                {group.items.map((item) => {
                  const active = isActive(item.href, pathname);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={`mx-2 flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                          active
                            ? 'border-l-2 border-[var(--blue-400)] bg-white/[0.08] pl-2.5 text-white'
                            : 'text-white/60 hover:bg-white/5 hover:text-white/90'
                        }`}
                      >
                        <Icon className="size-[18px] flex-none opacity-90" />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="flex items-center gap-2.5 border-t border-white/[0.08] px-4 py-3.5">
          <Avatar name={session.user.name} size="sm" className="bg-white/10 !text-white" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] leading-tight text-white/85">{session.user.name}</p>
            <p className="truncate text-[11px] text-white/40">{role}</p>
          </div>
          <button
            onClick={logout}
            aria-label="Cerrar sesión"
            className="flex-shrink-0 rounded-md p-1.5 text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white/85 active:scale-95"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </aside>

      {/* ── Área principal ── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barra superior */}
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-border bg-surface px-4 md:px-6">
          {/* Logo solo en móvil; en desktop el título de la vista */}
          <Link href="/panel" className="md:hidden">
            {brand?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brand.logoUrl} alt={brand.name} className="h-9 w-auto object-contain" />
            ) : (
              <Image
                src="/logo.png"
                alt="SimpleCite"
                width={2031}
                height={774}
                className="h-8 w-auto"
              />
            )}
          </Link>
          <h1 className="hidden text-[22px] font-semibold tracking-[-0.01em] text-text-primary md:block">
            {current?.label ?? 'Panel'}
          </h1>
          <div className="flex items-center gap-2 text-sm">
            <span className="hidden font-medium text-text-secondary sm:inline md:hidden lg:inline">
              {session.user.name}
            </span>
            <ThemeToggle />
            <button
              onClick={logout}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium text-text-muted transition-colors hover:bg-[var(--danger-bg)] hover:text-danger active:scale-95 md:hidden"
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
      <div className="fixed bottom-0 left-0 right-0 z-10 flex overflow-x-auto border-t border-border bg-surface md:hidden">
        {flatNav.map((item) => {
          const active = isActive(item.href, pathname);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-w-[68px] flex-shrink-0 flex-col items-center gap-0.5 py-2 text-[11px] ${
                active ? 'text-primary' : 'text-text-muted'
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
