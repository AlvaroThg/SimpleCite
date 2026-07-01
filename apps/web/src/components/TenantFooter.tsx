'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { MapPin, MessageCircle, X } from 'lucide-react';
import { accentOn } from '@/lib/tenant-color';

// Número de soporte de SimpleCite (E.164 sin '+').
const SUPPORT_WA = '59161869814';
const SUPPORT_LINK = `https://wa.me/${SUPPORT_WA}?text=${encodeURIComponent('Hola, tengo una consulta sobre SimpleCite.')}`;

interface Props {
  name: string;
  primaryColor: string;
  address: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  whatsappContact: string | null;
}

type IconCmp = React.ComponentType<{ className?: string }>;

// lucide-react removió los íconos de marca (Facebook/Instagram) → SVG inline.
function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.89 3.78-3.89 1.09 0 2.23.2 2.23.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.45 2.89h-2.33v6.99A10 10 0 0 0 22 12z" />
    </svg>
  );
}
function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  );
}

/**
 * Footer público de la clínica en columnas: contacto real de la clínica +
 * bloque "Powered by SimpleCite" con enlaces del producto. Sin formularios de
 * suscripción ni fila de íconos sociales; las redes de la clínica van como
 * enlaces de texto si están configuradas.
 */
export function TenantFooter({
  name,
  primaryColor,
  address,
  facebookUrl,
  instagramUrl,
  whatsappContact,
}: Props) {
  const [mapOpen, setMapOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!mapOpen) return;
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMapOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [mapOpen]);

  const nameColor = accentOn(primaryColor);
  const waLink = whatsappContact ? `https://wa.me/${whatsappContact.replace(/\D/g, '')}` : null;
  const mapsSrc = address
    ? `https://maps.google.com/maps?q=${encodeURIComponent(address)}&z=16&output=embed`
    : null;
  const mapsLink = address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
    : null;

  const linkCls = 'transition-colors hover:text-text-primary';

  const socials = [
    waLink && { href: waLink, label: 'WhatsApp', Icon: MessageCircle as IconCmp },
    facebookUrl && { href: facebookUrl, label: 'Facebook', Icon: FacebookIcon as IconCmp },
    instagramUrl && { href: instagramUrl, label: 'Instagram', Icon: InstagramIcon as IconCmp },
  ].filter(Boolean) as { href: string; label: string; Icon: IconCmp }[];

  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto max-w-4xl px-4 py-10">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {/* La clínica */}
          <div className="lg:col-span-1">
            <p className="text-lg font-bold" style={{ color: nameColor }}>
              {name}
            </p>
            {address && (
              <button
                onClick={() => setMapOpen(true)}
                className="mt-2 inline-flex items-start gap-1.5 text-left text-sm text-text-muted transition-colors hover:text-text-primary"
              >
                <MapPin className="mt-0.5 size-4 flex-none" />
                <span>{address}</span>
              </button>
            )}
          </div>

          {/* Contacto de la clínica */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              Síguenos
            </p>
            {socials.length > 0 ? (
              <div className="mt-3 flex items-center gap-2">
                {socials.map(({ href, label, Icon }) => (
                  <a
                    key={label}
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={label}
                    className="flex size-9 items-center justify-center rounded-full bg-muted text-text-secondary transition-colors hover:text-text-primary"
                  >
                    <Icon className="size-4" />
                  </a>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-text-muted">—</p>
            )}
          </div>

          {/* SimpleCite */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              SimpleCite
            </p>
            <ul className="mt-3 space-y-2 text-sm text-text-secondary">
              <li>
                <Link href="/panel/login" className={linkCls}>
                  Ingresar al panel
                </Link>
              </li>
              <li>
                <a
                  href="https://simplecite.com.bo/#precios"
                  target="_blank"
                  rel="noreferrer"
                  className={linkCls}
                >
                  Precios
                </a>
              </li>
              <li>
                <a
                  href={SUPPORT_LINK}
                  target="_blank"
                  rel="noreferrer"
                  className={`inline-flex items-center gap-1.5 ${linkCls}`}
                >
                  <MessageCircle className="size-4" /> Contacta a soporte
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-2 border-t border-border pt-4 text-xs text-text-muted sm:flex-row sm:items-center sm:justify-between">
          <span>
            © {new Date().getFullYear()} {name}
          </span>
          <span>
            Powered by{' '}
            <a
              href="https://simplecite.com.bo"
              target="_blank"
              rel="noreferrer"
              className="underline transition-colors hover:text-text-secondary"
            >
              SimpleCite
            </a>
          </span>
        </div>
      </div>

      {mapOpen && mapsSrc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setMapOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={`Ubicación de ${name}`}
        >
          <div
            className="w-full max-w-2xl overflow-hidden rounded-2xl bg-surface shadow-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border p-4">
              <p className="font-semibold text-text-primary">Ubicación · {name}</p>
              <button
                ref={closeRef}
                onClick={() => setMapOpen(false)}
                aria-label="Cerrar"
                className="text-text-muted transition hover:text-text-secondary"
              >
                <X className="size-5" />
              </button>
            </div>
            <iframe src={mapsSrc} className="h-80 w-full border-0" loading="lazy" title="Mapa" />
            {mapsLink && (
              <div className="p-3 text-center">
                <a
                  href={mapsLink}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-medium"
                  style={{ color: primaryColor }}
                >
                  Abrir en Google Maps →
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </footer>
  );
}
