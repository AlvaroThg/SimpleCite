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
import { EmptyState } from '@/components/ui/empty-state';
import { ClipboardList } from 'lucide-react';
import { SERVICE_ICON_OPTIONS, getServiceIcon } from '@/lib/service-icons';

export default function ServicesPage() {
  return (
    <PanelShell>
      <Services />
    </PanelShell>
  );
}

type Draft = {
  id?: string;
  name: string;
  description: string;
  price: string;
  duration: string;
  icon: string | null;
  color: string | null;
};
const empty: Draft = {
  name: '',
  description: '',
  price: '',
  duration: '30',
  icon: null,
  color: null,
};

/** Paleta sugerida para el color del servicio en el calendario. */
const SERVICE_COLORS = [
  '#0860dd',
  '#0ea5a4',
  '#7c3aed',
  '#db2777',
  '#ea580c',
  '#16a34a',
  '#0891b2',
  '#4f46e5',
];

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
        icon: draft.icon,
        color: draft.color,
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
        <h1 className="text-xl font-bold text-text-primary">Servicios</h1>
        <button
          onClick={() => setDraft({ ...empty })}
          className="px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700"
        >
          + Nuevo
        </button>
      </div>

      {error && <ErrorBox message={error} />}

      {draft && (
        <div className="bg-surface rounded-2xl border border-brand-200 p-4 space-y-3">
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
          <div className="space-y-1">
            <span className="text-sm font-medium text-text-secondary">Ícono (opcional)</span>
            <div className="grid grid-cols-6 gap-2">
              {SERVICE_ICON_OPTIONS.map(({ key, label, Icon }) => {
                const selected = draft.icon === key;
                return (
                  <button
                    key={key}
                    type="button"
                    title={label}
                    aria-label={label}
                    aria-pressed={selected}
                    onClick={() => setDraft({ ...draft, icon: selected ? null : key })}
                    className={`flex items-center justify-center rounded-xl border p-2 transition-colors ${
                      selected
                        ? 'border-brand-500 bg-brand-50 text-brand-700'
                        : 'border-border text-text-muted hover:border-brand-300'
                    }`}
                  >
                    <Icon className="size-5" />
                  </button>
                );
              })}
            </div>
          </div>
          <div className="space-y-1">
            <span className="text-sm font-medium text-text-secondary">
              Color en el calendario (opcional)
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {SERVICE_COLORS.map((c) => {
                const selected = draft.color === c;
                return (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Color ${c}`}
                    aria-pressed={selected}
                    onClick={() => setDraft({ ...draft, color: selected ? null : c })}
                    style={{ backgroundColor: c }}
                    className={`size-7 rounded-full transition ${
                      selected ? 'ring-2 ring-gray-900 ring-offset-2' : 'hover:scale-110'
                    }`}
                  />
                );
              })}
              {draft.color && (
                <button
                  type="button"
                  onClick={() => setDraft({ ...draft, color: null })}
                  className="text-xs text-text-muted hover:text-text-secondary"
                >
                  Quitar
                </button>
              )}
            </div>
            <p className="text-xs text-text-muted">
              Pinta las citas de este servicio (antes de completarse) en el calendario del panel.
            </p>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setDraft(null)} className="px-4 py-2 text-sm text-text-muted">
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
        <EmptyState
          icon={<ClipboardList />}
          title="Aún no hay servicios"
          description="Crea tu primer servicio (consulta, ecografía, etc.) para ofrecerlo en las reservas."
        />
      ) : (
        <ul className="space-y-2">
          {items.map((s, index) => {
            const Icon = getServiceIcon(s.icon, index);
            return (
              <li
                key={s.id}
                className="bg-surface rounded-xl border border-border p-4 flex items-center justify-between gap-4 transition-all hover:border-brand-300 hover:shadow-sm"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700"
                    style={
                      s.color ? { backgroundColor: `${s.color}1a`, color: s.color } : undefined
                    }
                  >
                    <Icon className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-text-primary truncate">{s.name}</p>
                    <p className="mt-1 text-sm text-text-secondary flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="font-medium text-text-primary">
                        Bs {Number(s.price).toFixed(0)}
                      </span>
                      <span className="text-text-disabled">·</span>
                      <span>{s.duration} min</span>
                      {!s.isActive && (
                        <>
                          <span className="text-text-disabled">·</span>
                          <span className="text-red-500">inactivo</span>
                        </>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex gap-3 flex-shrink-0 text-sm">
                  <button
                    onClick={() =>
                      setDraft({
                        id: s.id,
                        name: s.name,
                        description: s.description ?? '',
                        price: String(s.price),
                        duration: String(s.duration),
                        icon: s.icon,
                        color: s.color,
                      })
                    }
                    className="text-brand-600 font-medium transition-colors hover:text-brand-800"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => remove(s.id)}
                    className="text-red-500 transition-colors hover:text-red-700"
                  >
                    Eliminar
                  </button>
                </div>
              </li>
            );
          })}
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
      <span className="text-sm font-medium text-text-secondary">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-border-strong rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
      />
    </label>
  );
}
