'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '@/lib/panel-auth';
import {
  getTenantConfig,
  updateTenantBranding,
  uploadTenantAsset,
  getWaInstances,
  createWaInstance,
  restartWaInstance,
  deleteWaInstance,
  PanelApiError,
  type TenantConfig,
  type WaInstance,
} from '@/lib/panel-api';
import { PanelShell } from '@/components/panel/PanelShell';
import { ErrorBox } from '@/components/panel/ui';
import { SkeletonCards } from '@/components/panel/Skeleton';
import { toast } from 'sonner';
import { apiBase } from '@/lib/api-base';

const BASE = apiBase();

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
      <h1 className="text-xl font-bold text-gray-900">Configuración</h1>
      {error && <ErrorBox message={error} />}
      {loading ? (
        <SkeletonCards count={2} />
      ) : cfg ? (
        session?.user.role === 'ADMIN' ? (
          <>
            <Branding cfg={cfg} onSaved={setCfg} />
            <ContactInfo cfg={cfg} onSaved={setCfg} />
          </>
        ) : (
          <section className="bg-white rounded-2xl border border-gray-100 p-5">
            <h2 className="text-sm font-semibold text-gray-700">Marca de tu clínica</h2>
            <p className="text-xs text-gray-400 mt-1">
              Solo los administradores pueden editar el nombre, logo, color y QR de pago de la
              clínica.
            </p>
          </section>
        )
      ) : null}
      <WhatsApp />
    </div>
  );
}

// ─── Branding ───────────────────────────────────────────────────────────
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
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingQr, setUploadingQr] = useState(false);
  const [uploadingHero, setUploadingHero] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const qrInputRef = useRef<HTMLInputElement>(null);
  const heroInputRef = useRef<HTMLInputElement>(null);

  async function save() {
    if (!session) return;
    setSaving(true);
    try {
      const updated = await updateTenantBranding(session.token, session.slug, {
        name: name.trim(),
        primaryColor: color,
        secondaryColor: secondaryColor || null,
        heroTitle: heroTitle.trim() || null,
        heroSubtitle: heroSubtitle.trim() || null,
        servicesTitle: servicesTitle.trim() || null,
        specialistsTitle: specialistsTitle.trim() || null,
        ctaTitle: ctaTitle.trim() || null,
        ctaSubtitle: ctaSubtitle.trim() || null,
      });
      onSaved(updated);
      toast.success('Cambios guardados.');
    } catch (e) {
      toast.error(e instanceof PanelApiError ? e.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  }

  function handleFileUpload(
    type: 'logo' | 'static-qr' | 'hero',
    setUploading: (v: boolean) => void,
  ) {
    return async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!session) return;
      const file = e.target.files?.[0];
      if (!file) return;
      setUploading(true);
      try {
        const reader = new FileReader();
        const base64 = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve((reader.result as string).split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        const updated = await uploadTenantAsset(session.token, session.slug, {
          type,
          imageBase64: base64,
          mimeType: file.type,
        });
        onSaved(updated);
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
    <section className="bg-white rounded-2xl border border-gray-100 p-5 space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-gray-700">Marca de tu clínica</h2>
        <p className="text-xs text-gray-400">
          Nombre, logo y color que verán tus pacientes al reservar.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="block space-y-1">
          <span className="text-sm font-medium text-gray-700">Nombre de la clínica</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
        </label>

        <div className="space-y-1">
          <span className="text-sm font-medium text-gray-700">Color principal</span>
          <div className="flex items-center gap-2 mt-1">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-10 h-10 rounded-lg border border-gray-300 cursor-pointer"
            />
            <input
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-28 border border-gray-300 rounded-xl px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="space-y-1">
          <span className="text-sm font-medium text-gray-700">Color secundario</span>
          <div className="flex items-center gap-2 mt-1">
            <input
              type="color"
              value={secondaryColor}
              onChange={(e) => setSecondaryColor(e.target.value)}
              className="w-10 h-10 rounded-lg border border-gray-300 cursor-pointer"
            />
            <input
              value={secondaryColor}
              onChange={(e) => setSecondaryColor(e.target.value)}
              className="w-28 border border-gray-300 rounded-xl px-3 py-2 text-sm"
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
            className="h-20 w-auto max-w-[200px] rounded-xl border border-gray-100 bg-white object-contain p-1"
          />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-xl border-2 border-dashed border-gray-200 text-xs text-gray-300">
            Logo
          </div>
        )}
        <div className="space-y-1">
          <p className="text-sm font-medium text-gray-700">Logo de la clínica</p>
          <button
            type="button"
            onClick={() => logoInputRef.current?.click()}
            disabled={uploadingLogo}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:border-blue-300 hover:text-blue-700 disabled:opacity-50 transition"
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

      {/* Static QR upload */}
      <div className="border-t border-gray-50 pt-4">
        <p className="text-sm font-semibold text-gray-700 mb-1">QR bancario de pago</p>
        <p className="text-xs text-gray-400 mb-3">
          El bot enviará esta imagen al paciente cuando elija pagar con QR. Debe ser el QR de tu
          cuenta bancaria.
        </p>
        <div className="flex items-center gap-4">
          {cfg.staticQrUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cfg.staticQrUrl}
              alt="QR bancario"
              className="h-40 w-40 rounded-xl border border-gray-100 bg-white object-contain p-1"
            />
          ) : (
            <div className="flex h-40 w-40 items-center justify-center rounded-xl border-2 border-dashed border-gray-200 p-2 text-center text-xs leading-tight text-gray-300">
              Sin QR
            </div>
          )}
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => qrInputRef.current?.click()}
              disabled={uploadingQr}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:border-blue-300 hover:text-blue-700 disabled:opacity-50 transition"
            >
              {uploadingQr ? 'Subiendo…' : cfg.staticQrUrl ? 'Cambiar QR' : 'Subir QR bancario'}
            </button>
            <p className="text-xs text-gray-400">PNG, JPG · máx. 2 MB</p>
            <input
              ref={qrInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={handleFileUpload('static-qr', setUploadingQr)}
            />
          </div>
        </div>
      </div>

      {/* Hero image upload */}
      <div className="border-t border-gray-50 pt-4">
        <p className="text-sm font-semibold text-gray-700 mb-1">Imagen de portada</p>
        <p className="text-xs text-gray-400 mb-3">
          Imagen principal (hero) que verán tus pacientes en la página pública.
        </p>
        <div className="flex items-center gap-4">
          {cfg.heroImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cfg.heroImageUrl}
              alt="Portada"
              className="h-32 w-auto max-w-[320px] rounded-xl border border-gray-100 bg-white object-cover"
            />
          ) : (
            <div className="flex h-32 w-48 items-center justify-center rounded-xl border-2 border-dashed border-gray-200 text-xs text-gray-300">
              Sin portada
            </div>
          )}
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => heroInputRef.current?.click()}
              disabled={uploadingHero}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:border-blue-300 hover:text-blue-700 disabled:opacity-50 transition"
            >
              {uploadingHero ? 'Subiendo…' : cfg.heroImageUrl ? 'Cambiar portada' : 'Subir portada'}
            </button>
            <p className="text-xs text-gray-400">PNG, JPG · máx. 2 MB</p>
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
      <div className="border-t border-gray-50 pt-4 space-y-4">
        <div>
          <p className="text-sm font-semibold text-gray-700">Textos de la página</p>
          <p className="text-xs text-gray-400">
            Personaliza los títulos y subtítulos de tu página pública. Deja un campo vacío para usar
            el valor por defecto.
          </p>
        </div>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-gray-700">Título de portada</span>
          <input
            value={heroTitle}
            onChange={(e) => setHeroTitle(e.target.value)}
            placeholder="Reserva tu cita en minutos"
            className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-gray-700">Subtítulo de portada</span>
          <textarea
            value={heroSubtitle}
            onChange={(e) => setHeroSubtitle(e.target.value)}
            rows={2}
            placeholder="Agenda con tu especialista de confianza de forma rápida y segura."
            className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block space-y-1">
            <span className="text-sm font-medium text-gray-700">Título de servicios</span>
            <input
              value={servicesTitle}
              onChange={(e) => setServicesTitle(e.target.value)}
              placeholder="Nuestros servicios"
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium text-gray-700">Título de especialistas</span>
            <input
              value={specialistsTitle}
              onChange={(e) => setSpecialistsTitle(e.target.value)}
              placeholder="Nuestros especialistas"
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </label>
        </div>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-gray-700">Título de llamada a la acción</span>
          <input
            value={ctaTitle}
            onChange={(e) => setCtaTitle(e.target.value)}
            placeholder="¿Listo para tu próxima cita?"
            className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-gray-700">
            Subtítulo de llamada a la acción
          </span>
          <textarea
            value={ctaSubtitle}
            onChange={(e) => setCtaSubtitle(e.target.value)}
            rows={2}
            placeholder="Reserva ahora y recibe confirmación al instante por WhatsApp."
            className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
        </label>
      </div>

      <div className="flex justify-end">
        <button
          onClick={save}
          disabled={saving || !name.trim()}
          className="px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-50"
        >
          {saving ? 'Guardando…' : 'Guardar marca'}
        </button>
      </div>
    </section>
  );
}

// ─── Contacto y redes ─────────────────────────────────────────────────────
function ContactInfo({ cfg, onSaved }: { cfg: TenantConfig; onSaved: (c: TenantConfig) => void }) {
  const { session } = useAuth();
  const [address, setAddress] = useState(cfg.address ?? '');
  const [facebookUrl, setFacebookUrl] = useState(cfg.facebookUrl ?? '');
  const [instagramUrl, setInstagramUrl] = useState(cfg.instagramUrl ?? '');
  const [whatsappContact, setWhatsappContact] = useState(cfg.whatsappContact ?? '');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!session) return;
    setSaving(true);
    try {
      const updated = await updateTenantBranding(session.token, session.slug, {
        address: address.trim() || null,
        facebookUrl: facebookUrl.trim() || null,
        instagramUrl: instagramUrl.trim() || null,
        whatsappContact: whatsappContact.trim() || null,
      });
      onSaved(updated);
      toast.success('Cambios guardados.');
    } catch (e) {
      toast.error(e instanceof PanelApiError ? e.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-5 space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-gray-700">Contacto y redes</h2>
        <p className="text-xs text-gray-400">
          Dirección y enlaces que verán tus pacientes en la página pública.
        </p>
      </div>

      <label className="block space-y-1">
        <span className="text-sm font-medium text-gray-700">Dirección</span>
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Av. Las Américas #123, Tarija"
          className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
        />
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="block space-y-1">
          <span className="text-sm font-medium text-gray-700">Facebook</span>
          <input
            type="url"
            value={facebookUrl}
            onChange={(e) => setFacebookUrl(e.target.value)}
            placeholder="https://facebook.com/tu-clinica"
            className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-gray-700">Instagram</span>
          <input
            type="url"
            value={instagramUrl}
            onChange={(e) => setInstagramUrl(e.target.value)}
            placeholder="https://instagram.com/tu-clinica"
            className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-sm font-medium text-gray-700">WhatsApp de contacto</span>
        <input
          type="tel"
          value={whatsappContact}
          onChange={(e) => setWhatsappContact(e.target.value)}
          placeholder="59170000000"
          className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
        />
        <span className="text-xs text-gray-400">Número con código de país, sin el signo +.</span>
      </label>

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

// ─── WhatsApp ─────────────────────────────────────────────────────────────
function WhatsApp() {
  const { session } = useAuth();
  const [instances, setInstances] = useState<WaInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [qrFor, setQrFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      setInstances(await getWaInstances(session.token, session.slug));
    } catch (e) {
      setErr(e instanceof PanelApiError ? e.message : 'Error al cargar instancias');
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    if (!session) return;
    setBusy(true);
    setErr('');
    try {
      const inst = await createWaInstance(session.token, session.slug);
      await load();
      setQrFor(inst.id);
    } catch (e) {
      setErr(e instanceof PanelApiError ? e.message : 'No se pudo crear la instancia');
    } finally {
      setBusy(false);
    }
  }

  async function restart(id: string) {
    if (!session) return;
    setBusy(true);
    try {
      await restartWaInstance(session.token, session.slug, id);
      await load();
      setQrFor(id);
    } catch (e) {
      setErr(e instanceof PanelApiError ? e.message : 'No se pudo reiniciar');
    } finally {
      setBusy(false);
    }
  }

  async function destroy(id: string) {
    if (!session || !confirm('¿Eliminar esta instancia de WhatsApp?')) return;
    setBusy(true);
    try {
      await deleteWaInstance(session.token, session.slug, id);
      if (qrFor === id) setQrFor(null);
      await load();
    } catch (e) {
      setErr(e instanceof PanelApiError ? e.message : 'No se pudo eliminar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">WhatsApp</h2>
          <p className="text-xs text-gray-400">
            Conecta el número desde el que tu bot atiende y envía recordatorios.
          </p>
        </div>
        {instances.length === 0 && (
          <button
            onClick={create}
            disabled={busy}
            className="px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-50"
          >
            + Conectar WhatsApp
          </button>
        )}
      </div>

      {err && <ErrorBox message={err} />}

      {loading ? (
        <p className="text-sm text-gray-400">Cargando…</p>
      ) : instances.length === 0 ? (
        <p className="text-sm text-gray-400">Aún no has conectado ningún número.</p>
      ) : (
        <ul className="space-y-3">
          {instances.map((i) => (
            <li key={i.id} className="border border-gray-100 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900">{i.phone ?? 'Sin vincular'}</p>
                  <p className="text-xs text-gray-400 truncate">{i.containerName}</p>
                </div>
                <div className="flex items-center gap-3 text-sm flex-shrink-0">
                  <StatusPill status={i.status} />
                  <button
                    onClick={() => setQrFor(qrFor === i.id ? null : i.id)}
                    className="text-brand-600 hover:text-brand-800 font-medium"
                  >
                    {qrFor === i.id ? 'Ocultar QR' : 'Ver QR'}
                  </button>
                  <button
                    onClick={() => restart(i.id)}
                    disabled={busy}
                    className="text-gray-500 hover:text-gray-800"
                  >
                    Reiniciar
                  </button>
                  <button
                    onClick={() => destroy(i.id)}
                    disabled={busy}
                    className="text-red-500 hover:text-red-700"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
              {qrFor === i.id && <QrPanel instanceId={i.id} onConnected={load} />}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    CONNECTED: 'bg-green-100 text-green-700',
    PAIRING: 'bg-amber-100 text-amber-700',
    DISCONNECTED: 'bg-red-100 text-red-600',
  };
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[status] ?? 'bg-gray-100 text-gray-600'}`}
    >
      {status}
    </span>
  );
}

/**
 * Panel del QR: consume el SSE de /admin/whatsapp/instances/:id/qr.
 * Usamos fetch+ReadableStream (no EventSource) porque necesitamos enviar el
 * header Authorization y x-tenant-slug, que EventSource no soporta.
 */
function QrPanel({ instanceId, onConnected }: { instanceId: string; onConnected: () => void }) {
  const { session } = useAuth();
  const [qr, setQr] = useState<string | null>(null);
  const [state, setState] = useState<'pairing' | 'qr' | 'connected' | 'error'>('pairing');
  const onConnectedRef = useRef(onConnected);
  onConnectedRef.current = onConnected;

  useEffect(() => {
    if (!session) return;
    const ctrl = new AbortController();

    (async () => {
      try {
        const res = await fetch(`${BASE}/api/admin/whatsapp/instances/${instanceId}/qr`, {
          headers: {
            Accept: 'text/event-stream',
            Authorization: `Bearer ${session.token}`,
            'x-tenant-slug': session.slug,
          },
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) {
          setState('error');
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            try {
              const data = JSON.parse(line.slice(5).trim()) as { type: string; qr?: string };
              if (data.type === 'qr' && data.qr) {
                setQr(data.qr);
                setState('qr');
              } else if (data.type === 'connected') {
                setState('connected');
                onConnectedRef.current();
                return;
              } else if (data.type === 'disconnected') {
                setState('error');
              }
            } catch {
              // ignorar líneas malformadas
            }
          }
        }
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setState('error');
      }
    })();

    return () => ctrl.abort();
  }, [instanceId, session]);

  return (
    <div className="bg-gray-50 rounded-xl p-4 flex flex-col items-center text-center">
      {state === 'connected' ? (
        <p className="text-sm text-green-700 font-medium">✅ WhatsApp conectado.</p>
      ) : state === 'error' ? (
        <p className="text-sm text-red-600">
          No se pudo obtener el QR. Intenta reiniciar la instancia.
        </p>
      ) : qr ? (
        <>
          {/* El QR llega como data URL base64; <img> evita configurar dominios en next/image. */}
          <img src={qr} alt="QR de WhatsApp" width={224} height={224} className="rounded-lg" />
          <p className="mt-3 text-sm text-gray-600">
            Abre WhatsApp → <b>Dispositivos vinculados</b> → <b>Vincular dispositivo</b> y escanea.
          </p>
        </>
      ) : (
        <p className="text-sm text-gray-500">Generando código QR…</p>
      )}
    </div>
  );
}
