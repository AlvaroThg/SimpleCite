'use client';

import Script from 'next/script';
import { ArrowUpRight } from 'lucide-react';

/** Glifo de Instagram (lucide quitó los íconos de marca en v1). */
function IgGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

interface InstagramFeedProps {
  /** Título de la sección. */
  title?: string;
  /** URL del perfil de Instagram (encabezado + fallback). */
  profileUrl?: string | null;
  /**
   * ID del widget de LightWidget (lightwidget.com). Es la vía recomendada:
   * embebe un iframe, sin que scripts de terceros corran en tu página.
   */
  lightWidgetId?: string;
  /** Alternativa: ID de app de Elfsight (requiere cargar su script). */
  elfsightAppId?: string;
}

/**
 * Feed de Instagram para la landing del tenant SIN usar la API oficial de Meta
 * ni scraping: se apoya en un generador de widgets gratuito (LightWidget o
 * Elfsight). Si no hay widget configurado, degrada a un CTA al perfil.
 */
export function InstagramFeed({
  title = 'Síguenos en Instagram',
  profileUrl,
  lightWidgetId,
  elfsightAppId,
}: InstagramFeedProps) {
  const hasWidget = Boolean(lightWidgetId || elfsightAppId);
  // Sin widget ni perfil no hay nada que mostrar.
  if (!hasWidget && !profileUrl) return null;

  return (
    <section id="instagram" className="bg-white">
      <div className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="inline-flex size-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <IgGlyph className="size-6" />
          </span>
          <h2 className="text-3xl font-bold text-balance">{title}</h2>
          <p className="max-w-md text-gray-500">
            Mirá nuestro día a día, casos y novedades antes de reservar.
          </p>
          {profileUrl && (
            <a
              href={profileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-700"
            >
              Ver perfil <ArrowUpRight className="size-4" />
            </a>
          )}
        </div>

        <div className="mt-10">
          {lightWidgetId ? (
            <LightWidget id={lightWidgetId} />
          ) : elfsightAppId ? (
            <Elfsight appId={elfsightAppId} />
          ) : (
            <ProfileFallback profileUrl={profileUrl!} />
          )}
        </div>
      </div>
    </section>
  );
}

/** LightWidget: iframe + script oficial (solo redimensiona el iframe). */
function LightWidget({ id }: { id: string }) {
  return (
    <>
      <iframe
        src={`https://lightwidget.com/widgets/${id}.html`}
        title="Instagram"
        scrolling="no"
        allowTransparency
        className="lightwidget-widget w-full overflow-hidden rounded-2xl border-0"
        style={{ width: '100%', border: 0, minHeight: 320 }}
      />
      <Script src="https://lightwidget.com/widgets/lightwidget.js" strategy="lazyOnload" />
    </>
  );
}

/** Elfsight: requiere su script de plataforma + un div con la clase de la app. */
function Elfsight({ appId }: { appId: string }) {
  return (
    <>
      <Script src="https://elfsightcdn.com/platform.js" strategy="lazyOnload" />
      <div className={`elfsight-app-${appId}`} data-elfsight-app-lazy />
    </>
  );
}

/** Sin widget configurado: tarjeta-CTA al perfil. */
function ProfileFallback({ profileUrl }: { profileUrl: string }) {
  return (
    <a
      href={profileUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-2xl border border-gray-100 bg-gray-50 px-6 py-10 text-center transition hover:border-brand-200 hover:bg-white"
    >
      <IgGlyph className="size-8 text-brand-600" />
      <span className="font-semibold text-gray-900">Visitá nuestro Instagram</span>
      <span className="text-sm text-gray-500">Fotos, novedades y testimonios reales.</span>
    </a>
  );
}
