'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/panel-auth';
import {
  getServices,
  createService,
  updateService,
  deleteService,
  PanelApiError,
  type ServiceItem,
} from '@/lib/panel-api';
import { PanelShell } from '@/components/panel/PanelShell';
import { ErrorBox } from '@/components/panel/ui';
import { SkeletonList } from '@/components/panel/Skeleton';

export default function ServicesPage() {
  return (
    <PanelShell>
      <Services />
    </PanelShell>
  );
}

type Draft = { id?: string; name: string; description: string; price: string; duration: string };
const empty: Draft = { name: '', description: '', price: '', duration: '30' };

function Services() {
  const { session } = useAuth();
  const [items, setItems] = useState<ServiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      setItems(await getServices(session.token, session.slug));
    } catch (err) {
      setError(err instanceof PanelApiError ? err.message : 'Error al cargar servicios');
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!session || !draft) return;
    setSaving(true);
    setError('');
    try {
      const body = {
        name: draft.name.trim(),
        description: draft.description.trim() || undefined,
        price: Number(draft.price),
        duration: Number(draft.duration),
      };
      if (draft.id) await updateService(session.token, session.slug, draft.id, body);
      else await createService(session.token, session.slug, body);
      setDraft(null);
      await load();
    } catch (err) {
      setError(err instanceof PanelApiError ? err.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!session || !confirm('¿Eliminar este servicio?')) return;
    try {
      await deleteService(session.token, session.slug, id);
      await load();
    } catch (err) {
      setError(err instanceof PanelApiError ? err.message : 'No se pudo eliminar');
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Servicios</h1>
        <button
          onClick={() => setDraft({ ...empty })}
          className="px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700"
        >
          + Nuevo
        </button>
      </div>

      {error && <ErrorBox message={error} />}

      {draft && (
        <div className="bg-white rounded-2xl border border-brand-200 p-4 space-y-3">
          <p className="text-sm font-semibold">{draft.id ? 'Editar servicio' : 'Nuevo servicio'}</p>
          <Input
            label="Nombre"
            value={draft.name}
            onChange={(v) => setDraft({ ...draft, name: v })}
          />
          <Input
            label="Descripción (opcional)"
            value={draft.description}
            onChange={(v) => setDraft({ ...draft, description: v })}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Precio (Bs)"
              type="number"
              value={draft.price}
              onChange={(v) => setDraft({ ...draft, price: v })}
            />
            <Input
              label="Duración (min)"
              type="number"
              value={draft.duration}
              onChange={(v) => setDraft({ ...draft, duration: v })}
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setDraft(null)} className="px-4 py-2 text-sm text-gray-500">
              Cancelar
            </button>
            <button
              onClick={save}
              disabled={saving || !draft.name.trim() || !draft.price || !draft.duration}
              className="px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-semibold disabled:opacity-50"
            >
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <SkeletonList rows={4} />
      ) : items.length === 0 ? (
        <p className="text-gray-500 text-sm py-8 text-center">Aún no hay servicios.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((s) => (
            <li
              key={s.id}
              className="bg-white rounded-xl border border-gray-100 p-4 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="font-semibold text-gray-900 truncate">{s.name}</p>
                <p className="text-sm text-gray-500">
                  Bs {Number(s.price).toFixed(0)} · {s.duration} min
                  {!s.isActive && <span className="text-red-500"> · inactivo</span>}
                </p>
              </div>
              <div className="flex gap-2 flex-shrink-0 text-sm">
                <button
                  onClick={() =>
                    setDraft({
                      id: s.id,
                      name: s.name,
                      description: s.description ?? '',
                      price: String(s.price),
                      duration: String(s.duration),
                    })
                  }
                  className="text-brand-600 hover:text-brand-800 font-medium"
                >
                  Editar
                </button>
                <button onClick={() => remove(s.id)} className="text-red-500 hover:text-red-700">
                  Eliminar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
      />
    </label>
  );
}
