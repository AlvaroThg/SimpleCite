'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '@/lib/panel-auth';
import {
  getTenantConfig,
  updateTenantBranding,
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

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

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
      {loading ? <SkeletonCards count={2} /> : cfg && <Branding cfg={cfg} onSaved={setCfg} />}
      <WhatsApp />
    </div>
  );
}

// ─── Branding ───────────────────────────────────────────────────────────
function Branding({ cfg, onSaved }: { cfg: TenantConfig; onSaved: (c: TenantConfig) => void }) {
  const { session } = useAuth();
  const [name, setName] = useState(cfg.name);
  const [logoUrl, setLogoUrl] = useState(cfg.logoUrl ?? '');
  const [color, setColor] = useState(cfg.primaryColor || '#0a70f8');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  async function save() {
    if (!session) return;
    setSaving(true);
    setMsg('');
    setErr('');
    try {
      const updated = await updateTenantBranding(session.token, session.slug, {
        name: name.trim(),
        logoUrl: logoUrl.trim() || null,
        primaryColor: color,
      });
      onSaved(updated);
      setMsg('Cambios guardados. Se reflejan en tu página pública de reservas.');
    } catch (e) {
      setErr(e instanceof PanelApiError ? e.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
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
        <label className="block space-y-1">
          <span className="text-sm font-medium text-gray-700">URL del logo (opcional)</span>
          <input
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="https://…/logo.png"
            className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
        </label>
      </div>

      <div className="flex items-center gap-4">
        <label className="block space-y-1">
          <span className="text-sm font-medium text-gray-700">Color principal</span>
          <div className="flex items-center gap-2">
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
        </label>
        {logoUrl.trim() && (
          <img
            src={logoUrl}
            alt="Vista previa del logo"
            className="h-10 w-auto rounded border border-gray-100"
          />
        )}
      </div>

      {err && <ErrorBox message={err} />}
      {msg && (
        <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 text-sm">
          {msg}
        </div>
      )}

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
