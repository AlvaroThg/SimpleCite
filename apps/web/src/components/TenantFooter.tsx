'use client';

import { useState } from 'react';
import { MapPin, MessageCircle, X } from 'lucide-react';

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

/** Footer público de la clínica: redes, dirección con modal de Google Maps. */
export function TenantFooter({
  name,
  primaryColor,
  address,
  facebookUrl,
  instagramUrl,
  whatsappContact,
}: Props) {
  const [mapOpen, setMapOpen] = useState(false);

  const waLink = whatsappContact ? `https://wa.me/${whatsappContact.replace(/\D/g, '')}` : null;
  const mapsSrc = address
    ? `https://maps.google.com/maps?q=${encodeURIComponent(address)}&z=16&output=embed`
    : null;
  const mapsLink = address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
    : null;

  const socials = [
    facebookUrl && { href: facebookUrl, label: 'Facebook', Icon: FacebookIcon as IconCmp },
    instagramUrl && { href: instagramUrl, label: 'Instagram', Icon: InstagramIcon as IconCmp },
    waLink && { href: waLink, label: 'WhatsApp', Icon: MessageCircle as IconCmp },
  ].filter(Boolean) as { href: string; label: string; Icon: IconCmp }[];

  return (
    <footer className="border-t border-gray-100 bg-white">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="font-bold" style={{ color: primaryColor }}>
              {name}
            </p>
            {address && (
              <button
                onClick={() => setMapOpen(true)}
                className="mt-1 inline-flex items-center gap-1.5 text-sm text-gray-500 transition hover:text-gray-800"
              >
                <MapPin className="size-4 flex-shrink-0" />
                <span className="text-left">{address}</span>
              </button>
            )}
          </div>

          {socials.length > 0 && (
            <div className="flex items-center gap-3">
              {socials.map(({ href, label, Icon }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={label}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-600 transition hover:bg-gray-200 hover:text-gray-900"
                >
                  <Icon className="size-4" />
                </a>
              ))}
            </div>
          )}
        </div>

        <div className="mt-6 border-t border-gray-100 pt-4 text-center text-xs text-gray-400">
          Powered by{' '}
          <a
            href="https://simplecite.com.bo"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-gray-600"
          >
            SimpleCite
          </a>
        </div>
      </div>

      {mapOpen && mapsSrc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setMapOpen(false)}
        >
          <div
            className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 p-4">
              <p className="font-semibold text-gray-900">Ubicación · {name}</p>
              <button
                onClick={() => setMapOpen(false)}
                aria-label="Cerrar"
                className="text-gray-400 transition hover:text-gray-700"
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
