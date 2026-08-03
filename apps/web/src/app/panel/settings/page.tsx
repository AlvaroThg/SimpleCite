'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '@/lib/panel-auth';
import {
  getTenantConfig,
  updateTenantBranding,
  uploadTenantAsset,
  getTenantInsurances,
  createTenantInsurance,
  updateTenantInsurance,
  getGallery,
  uploadGalleryItem,
  removeGalleryItem,
  reorderGallery,
  revalidateTenantLanding,
  PanelApiError,
  type TenantConfig,
  type TenantInsurance,
  type GalleryItem,
} from '@/lib/panel-api';
import { PanelShell } from '@/components/panel/PanelShell';
import { Switch } from '@/components/ui/switch';
import { ErrorBox } from '@/components/panel/ui';
import { SkeletonCards } from '@/components/panel/Skeleton';
import { PhoneField } from '@/components/PhoneField';
import { compressImageFile } from '@/lib/compress-image';
import { toast } from 'sonner';

/**
 * Paletas pre-armadas (primario + secundario). Los primarios son suficientemente
 * oscuros para texto blanco sobre botón (contraste AA ≥ ~4.5 sobre blanco) y
 * funcionan como acento tanto en modo claro como oscuro.
 */
const PALETTES: { name: string; primary: string; secondary: string }[] = [
  { name: 'Azul', primary: '#2563EB', secondary: '#0EA5E9' },
  { name: 'Índigo', primary: '#4F46E5', secondary: '#6366F1' },
  { name: 'Violeta', primary: '#7C3AED', secondary: '#A78BFA' },
  { name: 'Esmeralda', primary: '#047857', secondary: '#10B981' },
  { name: 'Teal', primary: '#0F766E', secondary: '#2DD4BF' },
  { name: 'Cian', primary: '#0E7490', secondary: '#06B6D4' },
  { name: 'Rosa', primary: '#BE185D', secondary: '#EC4899' },
  { name: 'Naranja', primary: '#C2410C', secondary: '#F59E0B' },
];

export default function SettingsPage() {
  return (
    <PanelShell>
      <Settings />
    </PanelShell>
  );
}

function Settings() {
  const { session } = useAuth();
  const [cfg, setCfg] = useState<TenantConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      setCfg(await getTenantConfig(session.token, session.slug));
    } catch (err) {
      setError(err instanceof PanelApiError ? err.message : 'Error al cargar la configuración');
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-text-primary">Configuración</h1>
      {error && <ErrorBox message={error} />}
      {loading ? (
        <SkeletonCards count={2} />
      ) : cfg ? (
        session?.user.role === 'ADMIN' ? (
          <>
            <PlanSummary cfg={cfg} />
            <Branding cfg={cfg} onSaved={setCfg} />
            <ContactInfo cfg={cfg} onSaved={setCfg} />
            <Gallery />
            <Insurances />
          </>
        ) : (
          <section className="bg-surface rounded-2xl border border-border p-5">
            <h2 className="text-sm font-semibold text-text-secondary">Marca de tu clínica</h2>
            <p className="text-xs text-text-muted mt-1">
              Solo los administradores pueden editar el nombre, logo, color y QR de pago de la
              clínica.
            </p>
          </section>
        )
      ) : null}
    </div>
  );
}

// ─── Plan y add-ons (solo lectura) ──────────────────────────────────────

const PLAN_LABELS: Record<string, string> = {
  BASIC: 'Básico',
  PRO: 'Profesional',
  ELITE: 'Élite',
};

const PUBLIC_MODE_LABELS: Record<string, string> = {
  BOOKING: 'Reserva en línea desde tu página',
  WHATSAPP: 'Tu página deriva a WhatsApp (sin reserva en línea)',
  LANDING: 'Página informativa (agenda tu equipo desde el panel)',
};

/**
 * Qué incluye el plan contratado. Es informativo a propósito: estos add-ons los
 * activa la plataforma, no el admin de la clínica, así que mostrarlos como
 * switches editables prometería un control que no existe. Sirve para responder
 * "¿tengo el bot activo?" sin escribirnos.
 */
function PlanSummary({ cfg }: { cfg: TenantConfig }) {
  const rows: { label: string; value: string; on: boolean }[] = [
    {
      label: 'Bot de reservas por WhatsApp',
      value: cfg.botEnabled ? 'Activo' : 'No incluido',
      on: !!cfg.botEnabled,
    },
    {
      label: 'Página pública',
      value: PUBLIC_MODE_LABELS[cfg.publicMode ?? 'BOOKING'] ?? '—',
      on: true,
    },
    {
      label: 'Cobros en línea',
      value: cfg.paymentsEnabled ? 'Activos' : 'Se cobra en la clínica',
      on: !!cfg.paymentsEnabled,
    },
  ];

  return (
    <section className="bg-surface rounded-2xl border border-border p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-text-secondary">Tu plan</h2>
          <p className="text-xs text-text-muted mt-1">
            Lo que incluye tu suscripción. Para cambiarlo, escríbenos.
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-brand-50 px-3 py-1 text-sm font-semibold text-brand-700">
          {PLAN_LABELS[cfg.plan] ?? cfg.plan}
        </span>
      </div>

      <ul className="divide-y divide-border rounded-xl border border-border">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center justify-between gap-4 px-3 py-2.5">
            <span className="text-sm text-text-secondary">{r.label}</span>
            <span
              className={`flex items-center gap-1.5 text-xs font-medium ${
                r.on ? 'text-[var(--success)]' : 'text-text-muted'
              }`}
            >
              <span
                aria-hidden
                className={`size-1.5 rounded-full ${r.on ? 'bg-[var(--success)]' : 'bg-text-disabled'}`}
              />
              {r.value}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ─── Branding ───────────────────────────────────────────────────────────

/** Bloques guardables de Configuración: cada uno tiene su propio botón. */
type SettingsSection = 'marca' | 'pagos' | 'sesion' | 'qr' | 'textos';

const SECTION_LABELS: Record<SettingsSection, string> = {
  marca: 'Marca',
  pagos: 'Módulo de pagos',
  sesion: 'Sesión del panel',
  qr: 'QR bancarios',
  textos: 'Textos de la página',
};

/** Campos que acepta el guardado parcial del tenant. */
type TenantBrandingPatch = Parameters<typeof updateTenantBranding>[2];

function Branding({ cfg, onSaved }: { cfg: TenantConfig; onSaved: (c: TenantConfig) => void }) {
  const { session } = useAuth();
  const [name, setName] = useState(cfg.name);
  const [color, setColor] = useState(cfg.primaryColor || '#0a70f8');
  const [secondaryColor, setSecondaryColor] = useState(cfg.secondaryColor || '#0ea5e9');
  const [heroTitle, setHeroTitle] = useState(cfg.heroTitle ?? '');
  const [heroSubtitle, setHeroSubtitle] = useState(cfg.heroSubtitle ?? '');
  const [servicesTitle, setServicesTitle] = useState(cfg.servicesTitle ?? '');
  const [specialistsTitle, setSpecialistsTitle] = useState(cfg.specialistsTitle ?? '');
  const [ctaTitle, setCtaTitle] = useState(cfg.ctaTitle ?? '');
  const [ctaSubtitle, setCtaSubtitle] = useState(cfg.ctaSubtitle ?? '');
  const [qrLabel, setQrLabel] = useState(cfg.staticQrLabel ?? '');
  const [qrLabel2, setQrLabel2] = useState(cfg.staticQrLabel2 ?? '');
  const [qrMode, setQrMode] = useState<'SHARED' | 'PER_DOCTOR'>(cfg.qrAssignmentMode ?? 'SHARED');
  const [paymentsEnabled, setPaymentsEnabled] = useState(cfg.paymentsEnabled ?? true);
  const [extendedSession, setExtendedSession] = useState(cfg.extendedSession ?? false);
  const [extendedSessionAdminOnly, setExtendedSessionAdminOnly] = useState(
    cfg.extendedSessionAdminOnly ?? false,
  );
  // Qué sección se está guardando (null = ninguna). Antes había un único
  // "Guardar marca" que mandaba TODO junto: tocar un switch de pagos obligaba a
  // guardar también textos y colores, y no quedaba claro qué se estaba
  // aplicando. Ahora cada bloque guarda solo lo suyo.
  const [savingSection, setSavingSection] = useState<SettingsSection | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingQr, setUploadingQr] = useState(false);
  const [uploadingQr2, setUploadingQr2] = useState(false);
  const [uploadingHero, setUploadingHero] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const qrInputRef = useRef<HTMLInputElement>(null);
  const qr2InputRef = useRef<HTMLInputElement>(null);
  const heroInputRef = useRef<HTMLInputElement>(null);

  /** Guarda SOLO los campos de una sección, con su propio estado de carga. */
  async function save(section: SettingsSection, patch: TenantBrandingPatch) {
    if (!session) return;
    setSavingSection(section);
    try {
      const updated = await updateTenantBranding(session.token, session.slug, patch);
      onSaved(updated);
      revalidateTenantLanding(session.slug); // la landing refleja el cambio ya
      toast.success(`${SECTION_LABELS[section]}: cambios guardados.`);
    } catch (e) {
      toast.error(e instanceof PanelApiError ? e.message : 'No se pudo guardar');
    } finally {
      setSavingSection(null);
    }
  }

  /** Botón de guardado de una sección. */
  const SaveSection = ({
    section,
    patch,
    disabled,
  }: {
    section: SettingsSection;
    patch: () => TenantBrandingPatch;
    disabled?: boolean;
  }) => (
    <div className="mt-4 flex justify-end">
      <button
        onClick={() => void save(section, patch())}
        disabled={disabled || savingSection !== null}
        className="px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-50"
      >
        {savingSection === section ? 'Guardando…' : 'Guardar'}
      </button>
    </div>
  );

  function handleFileUpload(
    type: 'logo' | 'static-qr' | 'static-qr-2' | 'hero',
    setUploading: (v: boolean) => void,
  ) {
    return async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!session) return;
      const file = e.target.files?.[0];
      if (!file) return;
      setUploading(true);
      try {
        // Redimensiona/comprime en el navegador: sube rápido incluso en 4G.
        const { base64, mimeType } = await compressImageFile(file);
        const updated = await uploadTenantAsset(session.token, session.slug, {
          type,
          imageBase64: base64,
          mimeType,
        });
        onSaved(updated);
        revalidateTenantLanding(session.slug);
        toast.success(
          type === 'logo'
            ? 'Logo actualizado.'
            : type === 'hero'
              ? 'Imagen de portada actualizada.'
              : 'QR bancario actualizado.',
        );
      } catch (e) {
        toast.error(
          e instanceof PanelApiError
            ? `Fallo al subir: ${e.message}`
            : 'Fallo al subir: verifica la configuración de Supabase Storage.',
        );
      } finally {
        setUploading(false);
        e.target.value = '';
      }
    };
  }

  return (
    <section className="bg-surface rounded-2xl border border-border p-5 space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-text-secondary">Marca de tu clínica</h2>
        <p className="text-xs text-text-muted">
          Nombre, logo y color que verán tus pacientes al reservar.
        </p>
      </div>

      {/* Paletas pre-armadas (un clic) — también se pueden ajustar manualmente. */}
      <div className="space-y-1.5">
        <span className="text-sm font-medium text-text-secondary">Paletas</span>
        <div className="flex flex-wrap gap-2">
          {PALETTES.map((p) => {
            const active =
              color.toLowerCase() === p.primary.toLowerCase() &&
              secondaryColor.toLowerCase() === p.secondary.toLowerCase();
            return (
              <button
                key={p.name}
                type="button"
                title={p.name}
                onClick={() => {
                  setColor(p.primary);
                  setSecondaryColor(p.secondary);
                }}
                aria-pressed={active}
                className={`flex items-center gap-1.5 rounded-full border p-1 pr-2.5 transition ${
                  active
                    ? 'border-primary ring-2 ring-primary/30'
                    : 'border-border hover:border-border-strong'
                }`}
              >
                <span className="flex">
                  <span
                    className="size-5 rounded-full border border-white/60"
                    style={{ backgroundColor: p.primary }}
                  />
                  <span
                    className="-ml-2 size-5 rounded-full border border-white/60"
                    style={{ backgroundColor: p.secondary }}
                  />
                </span>
                <span className="text-xs text-text-secondary">{p.name}</span>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-text-muted">
          Elige una paleta o ajusta los colores manualmente abajo.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="block space-y-1">
          <span className="text-sm font-medium text-text-secondary">Nombre de la clínica</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border border-border-strong rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
        </label>

        <div className="space-y-1">
          <span className="text-sm font-medium text-text-secondary">Color principal</span>
          <div className="flex items-center gap-2 mt-1">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-10 h-10 rounded-lg border border-border-strong cursor-pointer"
            />
            <input
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-28 border border-border-strong rounded-xl px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="space-y-1">
          <span className="text-sm font-medium text-text-secondary">Color secundario</span>
          <div className="flex items-center gap-2 mt-1">
            <input
              type="color"
              value={secondaryColor}
              onChange={(e) => setSecondaryColor(e.target.value)}
              className="w-10 h-10 rounded-lg border border-border-strong cursor-pointer"
            />
            <input
              value={secondaryColor}
              onChange={(e) => setSecondaryColor(e.target.value)}
              className="w-28 border border-border-strong rounded-xl px-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>

      {/* Logo upload */}
      <div className="flex items-center gap-4">
        {cfg.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cfg.logoUrl}
            alt="Logo"
            className="h-20 w-auto max-w-[200px] rounded-xl border border-border bg-surface object-contain p-1"
          />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-xl border-2 border-dashed border-border text-xs text-text-disabled">
            Logo
          </div>
        )}
        <div className="space-y-1">
          <p className="text-sm font-medium text-text-secondary">Logo de la clínica</p>
          <button
            type="button"
            onClick={() => logoInputRef.current?.click()}
            disabled={uploadingLogo}
            className="px-3 py-1.5 text-sm border border-border rounded-lg hover:border-brand-300 hover:text-brand-700 disabled:opacity-50 transition"
          >
            {uploadingLogo ? 'Subiendo…' : cfg.logoUrl ? 'Cambiar logo' : 'Subir logo'}
          </button>
          <input
            ref={logoInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={handleFileUpload('logo', setUploadingLogo)}
          />
        </div>
      </div>

      <SaveSection
        section="marca"
        patch={() => ({
          name: name.trim(),
          primaryColor: color,
          secondaryColor: secondaryColor || null,
        })}
        disabled={!name.trim()}
      />

      {/* Módulo de pagos: cobrar en línea (QR + comprobante) o en la clínica */}
      <div className="border-t border-border pt-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-text-secondary mb-1">Módulo de pagos</p>
            <p className="max-w-xl text-xs text-text-muted">
              {paymentsEnabled
                ? 'Al reservar, el paciente elige cómo pagar (efectivo o QR con comprobante).'
                : 'El paciente reserva sin elegir pago: se le avisa que el cobro (efectivo o QR) es en la clínica, antes de cada sesión. El pago se registra desde el detalle de la cita.'}
            </p>
          </div>
          <Switch checked={paymentsEnabled} onCheckedChange={setPaymentsEnabled} />
        </div>
        {!paymentsEnabled && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Con el módulo apagado, el booking no muestra QR ni pide método de pago.
          </p>
        )}
        <SaveSection section="pagos" patch={() => ({ paymentsEnabled })} />
      </div>

      {/* Sesión del panel: mantener la sesión iniciada (30 días) */}
      <div className="border-t border-border pt-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-text-secondary mb-1">
              Mantener sesión iniciada
            </p>
            <p className="max-w-xl text-xs text-text-muted">
              {extendedSession
                ? 'El personal no tendrá que iniciar sesión cada vez: la sesión dura 30 días.'
                : 'Por seguridad, la sesión del panel expira a las 12 horas y hay que volver a iniciar sesión.'}
            </p>
          </div>
          <Switch checked={extendedSession} onCheckedChange={setExtendedSession} />
        </div>

        {/* Sub-opción: acota la sesión larga solo al administrador */}
        {extendedSession && (
          <label className="mt-3 flex items-start justify-between gap-4 rounded-lg border border-border bg-canvas px-3 py-2.5">
            <span>
              <span className="block text-sm font-medium text-text-secondary">
                Solo para el administrador
              </span>
              <span className="block max-w-xl text-xs text-text-muted">
                Si lo activas, la sesión larga aplica solo a tu cuenta de administrador; los
                especialistas seguirán expirando a las 12 horas.
              </span>
            </span>
            <Switch
              checked={extendedSessionAdminOnly}
              onCheckedChange={setExtendedSessionAdminOnly}
            />
          </label>
        )}

        {extendedSession && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            ⚠️ Menos seguro: si alguien accede a un equipo con la sesión abierta, entra sin
            contraseña. El cambio aplica desde el próximo inicio de sesión.
          </p>
        )}
        <SaveSection
          section="sesion"
          patch={() => ({ extendedSession, extendedSessionAdminOnly })}
        />
      </div>

      {/* Static QR upload (hasta 2 bancos) */}
      <div
        className={`border-t border-border pt-4 ${paymentsEnabled ? '' : 'pointer-events-none opacity-40'}`}
      >
        <p className="text-sm font-semibold text-text-secondary mb-1">QR bancarios de pago</p>
        <p className="text-xs text-text-muted mb-3">
          Elige cómo se asigna el QR de cobro: uno compartido para toda la clínica, o el QR propio
          de cada doctor.
        </p>

        {/* Modo de asignación del QR */}
        <div className="mb-4 inline-flex rounded-lg border border-border bg-canvas p-1">
          {(
            [
              ['SHARED', 'Compartido'],
              ['PER_DOCTOR', 'Por doctor'],
            ] as ['SHARED' | 'PER_DOCTOR', string][]
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => setQrMode(mode)}
              aria-pressed={qrMode === mode}
              className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors ${
                qrMode === mode
                  ? 'bg-primary text-white'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {qrMode === 'PER_DOCTOR' && (
          <p className="mb-3 rounded-lg border border-border bg-canvas px-3 py-2 text-xs text-text-muted">
            El QR de cada doctor se configura en <strong>Doctores</strong>. El paciente verá el QR
            del doctor de su cita; si un doctor no tiene QR propio, se usa el QR compartido de
            abajo.
          </p>
        )}

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {/* QR principal */}
          <div className="space-y-3">
            <div className="flex items-center gap-4">
              {cfg.staticQrUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={cfg.staticQrUrl}
                  alt="QR bancario principal"
                  className="h-32 w-32 rounded-xl border border-border bg-surface object-contain p-1"
                />
              ) : (
                <div className="flex h-32 w-32 items-center justify-center rounded-xl border-2 border-dashed border-border p-2 text-center text-xs leading-tight text-text-disabled">
                  Sin QR
                </div>
              )}
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => qrInputRef.current?.click()}
                  disabled={uploadingQr}
                  className="px-3 py-1.5 text-sm border border-border rounded-lg hover:border-brand-300 hover:text-brand-700 disabled:opacity-50 transition"
                >
                  {uploadingQr ? 'Subiendo…' : cfg.staticQrUrl ? 'Cambiar' : 'Subir QR 1'}
                </button>
                <p className="text-xs text-text-muted">PNG, JPG · máx. 2 MB</p>
                <input
                  ref={qrInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={handleFileUpload('static-qr', setUploadingQr)}
                />
              </div>
            </div>
            <input
              value={qrLabel}
              onChange={(e) => setQrLabel(e.target.value)}
              placeholder="Banco del QR 1 (ej. Banco Unión)"
              className="w-full border border-border-strong rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </div>

          {/* QR alternativo */}
          <div className="space-y-3">
            <div className="flex items-center gap-4">
              {cfg.staticQrUrl2 ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={cfg.staticQrUrl2}
                  alt="QR bancario alternativo"
                  className="h-32 w-32 rounded-xl border border-border bg-surface object-contain p-1"
                />
              ) : (
                <div className="flex h-32 w-32 items-center justify-center rounded-xl border-2 border-dashed border-border p-2 text-center text-xs leading-tight text-text-disabled">
                  Opcional
                </div>
              )}
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => qr2InputRef.current?.click()}
                  disabled={uploadingQr2}
                  className="px-3 py-1.5 text-sm border border-border rounded-lg hover:border-brand-300 hover:text-brand-700 disabled:opacity-50 transition"
                >
                  {uploadingQr2 ? 'Subiendo…' : cfg.staticQrUrl2 ? 'Cambiar' : 'Subir QR 2'}
                </button>
                <p className="text-xs text-text-muted">Banco alternativo</p>
                <input
                  ref={qr2InputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={handleFileUpload('static-qr-2', setUploadingQr2)}
                />
              </div>
            </div>
            <input
              value={qrLabel2}
              onChange={(e) => setQrLabel2(e.target.value)}
              placeholder="Banco del QR 2 (ej. Mercantil)"
              className="w-full border border-border-strong rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </div>
        </div>
        <SaveSection
          section="qr"
          patch={() => ({
            staticQrLabel: qrLabel.trim() || null,
            staticQrLabel2: qrLabel2.trim() || null,
            qrAssignmentMode: qrMode,
          })}
        />
      </div>

      {/* Hero image upload */}
      <div className="border-t border-border pt-4">
        <p className="text-sm font-semibold text-text-secondary mb-1">Imagen de portada</p>
        <p className="text-xs text-text-muted mb-3">
          Imagen principal (hero) que verán tus pacientes en la página pública.
        </p>
        <div className="flex items-center gap-4">
          {cfg.heroImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cfg.heroImageUrl}
              alt="Portada"
              className="h-32 w-auto max-w-[320px] rounded-xl border border-border bg-surface object-cover"
            />
          ) : (
            <div className="flex h-32 w-48 items-center justify-center rounded-xl border-2 border-dashed border-border text-xs text-text-disabled">
              Sin portada
            </div>
          )}
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => heroInputRef.current?.click()}
              disabled={uploadingHero}
              className="px-3 py-1.5 text-sm border border-border rounded-lg hover:border-brand-300 hover:text-brand-700 disabled:opacity-50 transition"
            >
              {uploadingHero ? 'Subiendo…' : cfg.heroImageUrl ? 'Cambiar portada' : 'Subir portada'}
            </button>
            <p className="text-xs text-text-muted">PNG, JPG · máx. 2 MB</p>
            <input
              ref={heroInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={handleFileUpload('hero', setUploadingHero)}
            />
          </div>
        </div>
      </div>

      {/* Landing texts */}
      <div className="border-t border-border pt-4 space-y-4">
        <div>
          <p className="text-sm font-semibold text-text-secondary">Textos de la página</p>
          <p className="text-xs text-text-muted">
            Personaliza los títulos y subtítulos de tu página pública. Deja un campo vacío para usar
            el valor por defecto.
          </p>
        </div>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-text-secondary">Título de portada</span>
          <input
            value={heroTitle}
            onChange={(e) => setHeroTitle(e.target.value)}
            placeholder="Reserva tu cita en minutos"
            className="w-full border border-border-strong rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-text-secondary">Subtítulo de portada</span>
          <textarea
            value={heroSubtitle}
            onChange={(e) => setHeroSubtitle(e.target.value)}
            rows={2}
            placeholder="Agenda con tu especialista de confianza de forma rápida y segura."
            className="w-full border border-border-strong rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block space-y-1">
            <span className="text-sm font-medium text-text-secondary">Título de servicios</span>
            <input
              value={servicesTitle}
              onChange={(e) => setServicesTitle(e.target.value)}
              placeholder="Nuestros servicios"
              className="w-full border border-border-strong rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium text-text-secondary">Título de especialistas</span>
            <input
              value={specialistsTitle}
              onChange={(e) => setSpecialistsTitle(e.target.value)}
              placeholder="Nuestros especialistas"
              className="w-full border border-border-strong rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </label>
        </div>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-text-secondary">
            Título de llamada a la acción
          </span>
          <input
            value={ctaTitle}
            onChange={(e) => setCtaTitle(e.target.value)}
            placeholder="¿Listo para tu próxima cita?"
            className="w-full border border-border-strong rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-text-secondary">
            Subtítulo de llamada a la acción
          </span>
          <textarea
            value={ctaSubtitle}
            onChange={(e) => setCtaSubtitle(e.target.value)}
            rows={2}
            placeholder="Reserva ahora y recibe confirmación al instante por WhatsApp."
            className="w-full border border-border-strong rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
        </label>
        <SaveSection
          section="textos"
          patch={() => ({
            heroTitle: heroTitle.trim() || null,
            heroSubtitle: heroSubtitle.trim() || null,
            servicesTitle: servicesTitle.trim() || null,
            specialistsTitle: specialistsTitle.trim() || null,
            ctaTitle: ctaTitle.trim() || null,
            ctaSubtitle: ctaSubtitle.trim() || null,
          })}
        />
      </div>
    </section>
  );
}

// ─── Contacto y ubicación ─────────────────────────────────────────────────
function ContactInfo({ cfg, onSaved }: { cfg: TenantConfig; onSaved: (c: TenantConfig) => void }) {
  const { session } = useAuth();
  const [address, setAddress] = useState(cfg.address ?? '');
  const [mapsUrl, setMapsUrl] = useState(cfg.mapsUrl ?? '');
  const [facebookUrl, setFacebookUrl] = useState(cfg.facebookUrl ?? '');
  const [instagramUrl, setInstagramUrl] = useState(cfg.instagramUrl ?? '');
  const [whatsappContact, setWhatsappContact] = useState(cfg.whatsappContact ?? '');
  const [saving, setSaving] = useState(false);
  const [uploadingLocation, setUploadingLocation] = useState(false);
  const locationInputRef = useRef<HTMLInputElement>(null);

  /** Sube la foto de la fachada (referencia física para el paciente). */
  async function handleLocationUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!session) return;
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLocation(true);
    try {
      const { base64, mimeType } = await compressImageFile(file);
      const updated = await uploadTenantAsset(session.token, session.slug, {
        type: 'location',
        imageBase64: base64,
        mimeType,
      });
      onSaved(updated);
      revalidateTenantLanding(session.slug);
      toast.success('Foto de la fachada actualizada.');
    } catch (err) {
      toast.error(
        err instanceof PanelApiError ? `Fallo al subir: ${err.message}` : 'Fallo al subir',
      );
    } finally {
      setUploadingLocation(false);
      e.target.value = '';
    }
  }

  async function save() {
    if (!session) return;
    setSaving(true);
    try {
      const updated = await updateTenantBranding(session.token, session.slug, {
        address: address.trim() || null,
        mapsUrl: mapsUrl.trim() || null,
        facebookUrl: facebookUrl.trim() || null,
        instagramUrl: instagramUrl.trim() || null,
        whatsappContact: whatsappContact.trim() || null,
      });
      onSaved(updated);
      revalidateTenantLanding(session.slug); // la landing refleja el cambio ya
      toast.success('Cambios guardados.');
    } catch (e) {
      toast.error(e instanceof PanelApiError ? e.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="bg-surface rounded-2xl border border-border p-5 space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-text-secondary">Contacto y ubicación</h2>
        <p className="text-xs text-text-muted">
          Dirección, foto de la fachada y enlaces que verán tus pacientes en la página pública.
        </p>
      </div>

      <label className="block space-y-1">
        <span className="text-sm font-medium text-text-secondary">Dirección</span>
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Av. Las Américas #123, Tarija"
          className="w-full border border-border-strong rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium text-text-secondary">
          Link de Google Maps (opcional)
        </span>
        <input
          type="url"
          value={mapsUrl}
          onChange={(e) => setMapsUrl(e.target.value)}
          placeholder="https://maps.app.goo.gl/…"
          className="w-full border border-border-strong rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
        />
        <span className="text-xs text-text-muted">
          Pega cualquier enlace de Google Maps de tu clínica (el de Compartir o el de la barra del
          navegador): el sistema extrae la ubicación exacta para el mapa de tu página. Si lo dejas
          vacío, se busca por la dirección de arriba y puede ser impreciso.
        </span>
      </label>

      {/* Foto de la fachada: se muestra al paciente al confirmar su reserva. */}
      <div className="flex items-center gap-4">
        {cfg.locationPhotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cfg.locationPhotoUrl}
            alt="Fachada del consultorio"
            className="h-28 w-auto max-w-[280px] rounded-xl border border-border bg-surface object-cover"
          />
        ) : (
          <div className="flex h-28 w-44 items-center justify-center rounded-xl border-2 border-dashed border-border p-2 text-center text-xs leading-tight text-text-disabled">
            Sin foto de fachada
          </div>
        )}
        <div className="space-y-1">
          <p className="text-sm font-medium text-text-secondary">Foto de la fachada</p>
          <button
            type="button"
            onClick={() => locationInputRef.current?.click()}
            disabled={uploadingLocation}
            className="px-3 py-1.5 text-sm border border-border rounded-lg hover:border-brand-300 hover:text-brand-700 disabled:opacity-50 transition"
          >
            {uploadingLocation ? 'Subiendo…' : cfg.locationPhotoUrl ? 'Cambiar foto' : 'Subir foto'}
          </button>
          <p className="text-xs text-text-muted">
            Ayuda al paciente a ubicar el consultorio al confirmar su cita.
          </p>
          <input
            ref={locationInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={handleLocationUpload}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="block space-y-1">
          <span className="text-sm font-medium text-text-secondary">Facebook</span>
          <input
            type="url"
            value={facebookUrl}
            onChange={(e) => setFacebookUrl(e.target.value)}
            placeholder="https://facebook.com/tu-clinica"
            className="w-full border border-border-strong rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-text-secondary">Instagram</span>
          <input
            type="url"
            value={instagramUrl}
            onChange={(e) => setInstagramUrl(e.target.value)}
            placeholder="https://instagram.com/tu-clinica"
            className="w-full border border-border-strong rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
        </label>
      </div>

      <div className="block space-y-1">
        <span className="text-sm font-medium text-text-secondary">WhatsApp de contacto</span>
        <PhoneField value={whatsappContact} onChange={setWhatsappContact} />
        <span className="text-xs text-text-muted">
          A este número llegan los comprobantes y avisos de reserva de tus pacientes.
        </span>
      </div>

      <div className="flex justify-end">
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-50"
        >
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </section>
  );
}

// ─── Galería pública (carrusel de la landing) ─────────────────────────────
function Gallery() {
  const { session } = useAuth();
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Reordenamiento por arrastre (HTML5 DnD): índice del elemento en vuelo.
  const dragIndex = useRef<number | null>(null);

  /** Al soltar: persiste el orden actual en el backend (best-effort). */
  async function persistOrder(next: GalleryItem[]) {
    if (!session) return;
    try {
      await reorderGallery(
        session.token,
        session.slug,
        next.map((m) => m.id),
      );
      revalidateTenantLanding(session.slug);
    } catch {
      toast.error('No se pudo guardar el orden');
    }
  }

  function handleDragStart(index: number) {
    dragIndex.current = index;
  }
  /** Reordena en vivo mientras se arrastra sobre otro elemento. */
  function handleDragOver(e: React.DragEvent, overIndex: number) {
    e.preventDefault();
    const from = dragIndex.current;
    if (from === null || from === overIndex) return;
    setItems((list) => {
      const next = [...list];
      const [moved] = next.splice(from, 1);
      next.splice(overIndex, 0, moved);
      return next;
    });
    dragIndex.current = overIndex;
  }
  function handleDragEnd() {
    if (dragIndex.current === null) return;
    dragIndex.current = null;
    setItems((list) => {
      void persistOrder(list);
      return list;
    });
  }

  useEffect(() => {
    if (!session) return;
    getGallery(session.token, session.slug)
      .then(setItems)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [session]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!session) return;
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      let payload: { base64: string; mimeType: string };
      if (file.type.startsWith('video/')) {
        // Videos: sin compresión en el navegador; límite duro del API ~8mb.
        if (file.size > 6 * 1024 * 1024) {
          toast.error('El video supera 6 MB. Usa un clip más corto o comprímelo.');
          return;
        }
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve((reader.result as string).split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        payload = { base64, mimeType: file.type };
      } else {
        payload = await compressImageFile(file);
      }
      const updated = await uploadGalleryItem(session.token, session.slug, {
        fileBase64: payload.base64,
        mimeType: payload.mimeType,
      });
      setItems(updated);
      revalidateTenantLanding(session.slug);
      toast.success('Agregado a la galería.');
    } catch (err) {
      toast.error(err instanceof PanelApiError ? err.message : 'No se pudo subir');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function remove(id: string) {
    if (!session) return;
    try {
      setItems(await removeGalleryItem(session.token, session.slug, id));
      revalidateTenantLanding(session.slug);
      toast.success('Eliminado de la galería.');
    } catch (err) {
      toast.error(err instanceof PanelApiError ? err.message : 'No se pudo eliminar');
    }
  }

  return (
    <section className="bg-surface rounded-2xl border border-border p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-text-secondary">Galería de la página</h2>
          <p className="text-xs text-text-muted">
            Fotos y videos cortos que aparecen en el carrusel de tu página pública. Arrastra para
            reordenarlos. Videos MP4 de hasta 6 MB.
          </p>
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex-shrink-0 px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-50"
        >
          {uploading ? 'Subiendo…' : '+ Agregar'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm"
          className="hidden"
          onChange={handleUpload}
        />
      </div>

      {loading ? (
        <p className="text-sm text-text-muted">Cargando…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-text-muted">
          Aún no hay fotos ni videos. Lo que subas aquí se mostrará en el carrusel de tu página.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {items.map((m, index) => (
            <li
              key={m.id}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
              className="group relative aspect-video cursor-grab overflow-hidden rounded-xl border border-border bg-canvas active:cursor-grabbing"
            >
              {m.type === 'VIDEO' ? (
                <video src={m.url} muted loop playsInline className="h-full w-full object-cover" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.url} alt="" className="h-full w-full object-cover" />
              )}
              <button
                type="button"
                onClick={() => remove(m.id)}
                aria-label="Eliminar de la galería"
                className="absolute right-1.5 top-1.5 rounded-md bg-black/55 px-2 py-1 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
              >
                Eliminar
              </button>
              {m.type === 'VIDEO' && (
                <span className="absolute bottom-1.5 left-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  VIDEO
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ─── Seguros médicos (Addendum G) ─────────────────────────────────────────
function Insurances() {
  const { session } = useAuth();
  const [items, setItems] = useState<TenantInsurance[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  // Edición inline del nombre: id en edición + valor del borrador.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      setItems(await getTenantInsurances(session.token, session.slug));
    } catch (e) {
      toast.error(e instanceof PanelApiError ? e.message : 'Error al cargar seguros');
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  async function add() {
    if (!session || !newName.trim()) return;
    setBusy(true);
    try {
      await createTenantInsurance(session.token, session.slug, { name: newName.trim() });
      setNewName('');
      await load();
      toast.success('Seguro agregado.');
    } catch (e) {
      toast.error(e instanceof PanelApiError ? e.message : 'No se pudo agregar');
    } finally {
      setBusy(false);
    }
  }

  async function saveName(id: string) {
    if (!session || !editName.trim()) return;
    setBusy(true);
    try {
      await updateTenantInsurance(session.token, session.slug, id, { name: editName.trim() });
      setEditingId(null);
      await load();
      toast.success('Seguro actualizado.');
    } catch (e) {
      toast.error(e instanceof PanelApiError ? e.message : 'No se pudo actualizar');
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(ins: TenantInsurance) {
    if (!session) return;
    setBusy(true);
    try {
      await updateTenantInsurance(session.token, session.slug, ins.id, {
        isActive: !ins.isActive,
      });
      await load();
      toast.success(ins.isActive ? 'Seguro archivado.' : 'Seguro reactivado.');
    } catch (e) {
      toast.error(e instanceof PanelApiError ? e.message : 'No se pudo actualizar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="bg-surface rounded-2xl border border-border p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-text-secondary">Seguros médicos</h2>
        <p className="text-xs text-text-muted">
          Catálogo de seguros que acepta tu clínica. Después de agregar un seguro, ve a{' '}
          <strong>Doctores</strong> para asignárselo individualmente a cada especialista.
        </p>
      </div>

      <div className="flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void add();
          }}
          placeholder="Ej: Univida, COSSMIL, Universitario…"
          className="flex-1 border border-border-strong rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
        />
        <button
          onClick={add}
          disabled={busy || !newName.trim()}
          className="px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-50"
        >
          Agregar
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-text-muted">Cargando…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-text-muted">Aún no agregaste ningún seguro.</p>
      ) : (
        <ul className="divide-y divide-[var(--border-hairline)]">
          {items.map((ins) => (
            <li key={ins.id} className="flex items-center justify-between gap-3 py-2.5">
              {editingId === ins.id ? (
                <div className="flex flex-1 items-center gap-2">
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void saveName(ins.id);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    autoFocus
                    className="flex-1 border border-border-strong rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                  />
                  <button
                    onClick={() => saveName(ins.id)}
                    disabled={busy}
                    className="text-sm font-medium text-brand-600 hover:text-brand-800"
                  >
                    Guardar
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="text-sm text-text-muted hover:text-text-primary"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={`truncate text-sm font-medium ${
                        ins.isActive ? 'text-text-primary' : 'text-text-muted line-through'
                      }`}
                    >
                      {ins.name}
                    </span>
                    {!ins.isActive && (
                      <span className="rounded-full border border-border bg-canvas px-2 py-px text-[11px] text-text-muted">
                        Archivado
                      </span>
                    )}
                  </div>
                  <div className="flex flex-shrink-0 gap-3 text-sm">
                    {ins.isActive && (
                      <button
                        onClick={() => {
                          setEditingId(ins.id);
                          setEditName(ins.name);
                        }}
                        className="font-medium text-brand-600 hover:text-brand-800"
                      >
                        Editar
                      </button>
                    )}
                    <button
                      onClick={() => toggleActive(ins)}
                      disabled={busy}
                      className={
                        ins.isActive
                          ? 'text-text-muted hover:text-text-primary'
                          : 'font-medium text-brand-600 hover:text-brand-800'
                      }
                    >
                      {ins.isActive ? 'Archivar' : 'Reactivar'}
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
