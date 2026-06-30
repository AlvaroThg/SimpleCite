'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/panel-auth';
import {
  getDoctorsAdmin,
  createDoctor,
  updateDoctor,
  archiveDoctor,
  getServices,
  getDoctorServices,
  assignServiceToDoctor,
  unassignServiceFromDoctor,
  createService,
  PanelApiError,
  type Doctor,
  type ServiceItem,
  type DoctorServiceLink,
} from '@/lib/panel-api';
import { PanelShell } from '@/components/panel/PanelShell';
import { ErrorBox } from '@/components/panel/ui';
import { SkeletonList } from '@/components/panel/Skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { Stethoscope } from 'lucide-react';
import { toast } from 'sonner';

/** Iniciales (máx. 2) a partir del nombre del doctor, para el avatar. */
function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

export default function DoctorsPage() {
  return (
    <PanelShell>
      <Doctors />
    </PanelShell>
  );
}

type Draft = {
  id?: string;
  email: string;
  password: string;
  name: string;
  specialty: string;
  licenseNumber: string;
  bio: string;
  isActive: boolean;
};
const empty: Draft = {
  email: '',
  password: '',
  name: '',
  specialty: '',
  licenseNumber: '',
  bio: '',
  isActive: true,
};

function Doctors() {
  const { session } = useAuth();
  const [items, setItems] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      setItems(await getDoctorsAdmin(session.token, session.slug));
    } catch (err) {
      setError(err instanceof PanelApiError ? err.message : 'Error al cargar doctores');
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
      if (draft.id) {
        await updateDoctor(session.token, session.slug, draft.id, {
          name: draft.name.trim(),
          specialty: draft.specialty.trim(),
          licenseNumber: draft.licenseNumber.trim() || null,
          bio: draft.bio.trim() || null,
          isActive: draft.isActive,
        });
      } else {
        await createDoctor(session.token, session.slug, {
          email: draft.email.trim(),
          password: draft.password,
          name: draft.name.trim(),
          specialty: draft.specialty.trim(),
          licenseNumber: draft.licenseNumber.trim() || undefined,
          bio: draft.bio.trim() || undefined,
        });
      }
      setDraft(null);
      await load();
    } catch (err) {
      setError(err instanceof PanelApiError ? err.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  }

  async function archive(id: string) {
    if (!session || !confirm('¿Archivar este doctor? Dejará de aparecer en la agenda.')) return;
    try {
      await archiveDoctor(session.token, session.slug, id);
      await load();
    } catch (err) {
      setError(err instanceof PanelApiError ? err.message : 'No se pudo archivar');
    }
  }

  const canSave = draft
    ? draft.id
      ? draft.name.trim() && draft.specialty.trim()
      : draft.email.trim() &&
        draft.password.length >= 8 &&
        draft.name.trim() &&
        draft.specialty.trim()
    : false;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-text-primary">Doctores</h1>
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
          <p className="text-sm font-semibold">{draft.id ? 'Editar doctor' : 'Nuevo doctor'}</p>
          {!draft.id && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="Correo (login)"
                type="email"
                value={draft.email}
                onChange={(v) => setDraft({ ...draft, email: v })}
              />
              <Input
                label="Contraseña (mín. 8)"
                type="password"
                value={draft.password}
                onChange={(v) => setDraft({ ...draft, password: v })}
              />
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Nombre"
              value={draft.name}
              onChange={(v) => setDraft({ ...draft, name: v })}
            />
            <Input
              label="Especialidad"
              value={draft.specialty}
              onChange={(v) => setDraft({ ...draft, specialty: v })}
            />
          </div>
          <Input
            label="N° de matrícula (opcional)"
            value={draft.licenseNumber}
            onChange={(v) => setDraft({ ...draft, licenseNumber: v })}
          />
          <Input
            label="Biografía (opcional)"
            value={draft.bio}
            onChange={(v) => setDraft({ ...draft, bio: v })}
          />
          {draft.id && (
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              <input
                type="checkbox"
                checked={draft.isActive}
                onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })}
              />
              Activo
            </label>
          )}
          <div className="flex gap-2 justify-end">
            <button onClick={() => setDraft(null)} className="px-4 py-2 text-sm text-text-muted">
              Cancelar
            </button>
            <button
              onClick={save}
              disabled={saving || !canSave}
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
          icon={<Stethoscope />}
          title="Aún no hay doctores"
          description="Agrega el primer doctor de tu clínica para empezar a recibir reservas."
        />
      ) : (
        <ul className="space-y-2">
          {items.map((d) => (
            <li
              key={d.id}
              className="bg-surface rounded-xl border border-border overflow-hidden transition-all hover:border-brand-300 hover:shadow-sm"
            >
              <div className="p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar name={d.name} size="lg">
                    {initials(d.name) ? undefined : <Stethoscope className="h-5 w-5" />}
                  </Avatar>
                  <div className="min-w-0">
                    <p className="font-semibold text-text-primary truncate">
                      {d.name}
                      {!d.isActive && (
                        <span className="text-red-500 font-normal"> · archivado</span>
                      )}
                    </p>
                    <p className="text-sm text-text-muted truncate">
                      {d.specialty ?? 'Sin especialidad'} · {d.email}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0 text-sm">
                  <button
                    onClick={() => setExpanded(expanded === d.id ? null : d.id)}
                    className="text-text-muted hover:text-text-primary font-medium transition-colors"
                  >
                    Servicios
                  </button>
                  <button
                    onClick={() =>
                      setDraft({
                        id: d.id,
                        email: d.email,
                        password: '',
                        name: d.name,
                        specialty: d.specialty ?? '',
                        licenseNumber: d.licenseNumber ?? '',
                        bio: d.bio ?? '',
                        isActive: d.isActive,
                      })
                    }
                    className="text-brand-600 hover:text-brand-800 font-medium transition-colors"
                  >
                    Editar
                  </button>
                  {d.isActive && (
                    <button
                      onClick={() => archive(d.id)}
                      className="text-red-500 hover:text-red-700 transition-colors"
                    >
                      Archivar
                    </button>
                  )}
                </div>
              </div>
              {expanded === d.id && <DoctorServices doctorId={d.id} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Sub-panel: servicios asignados a un doctor + añadir/quitar del catálogo. */
function DoctorServices({ doctorId }: { doctorId: string }) {
  const { session } = useAuth();
  const [links, setLinks] = useState<DoctorServiceLink[]>([]);
  const [catalog, setCatalog] = useState<ServiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  // Formulario inline "Crear servicio nuevo".
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newDuration, setNewDuration] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      const [l, c] = await Promise.all([
        getDoctorServices(session.token, session.slug, doctorId),
        getServices(session.token, session.slug),
      ]);
      setLinks(l);
      setCatalog(c);
    } catch (e) {
      setErr(e instanceof PanelApiError ? e.message : 'Error al cargar servicios del doctor');
    } finally {
      setLoading(false);
    }
  }, [session, doctorId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function add(serviceId: string) {
    if (!session) return;
    try {
      await assignServiceToDoctor(session.token, session.slug, doctorId, { serviceId });
      await load();
    } catch (e) {
      setErr(e instanceof PanelApiError ? e.message : 'No se pudo asignar');
    }
  }
  async function remove(linkId: string) {
    if (!session) return;
    try {
      await unassignServiceFromDoctor(session.token, session.slug, linkId);
      await load();
    } catch (e) {
      setErr(e instanceof PanelApiError ? e.message : 'No se pudo quitar');
    }
  }

  async function createAndAssign() {
    if (!session) return;
    const price = Number(newPrice);
    const duration = Number(newDuration);
    setCreating(true);
    setErr('');
    try {
      const created = await createService(session.token, session.slug, {
        name: newName.trim(),
        price,
        duration,
      });
      await assignServiceToDoctor(session.token, session.slug, doctorId, {
        serviceId: created.id,
      });
      setNewName('');
      setNewPrice('');
      setNewDuration('');
      await load();
      toast.success('Servicio creado y asignado');
    } catch (e) {
      const msg = e instanceof PanelApiError ? e.message : 'No se pudo crear el servicio';
      setErr(msg);
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  }

  const canCreate =
    newName.trim().length > 0 &&
    Number.isFinite(Number(newPrice)) &&
    newPrice.trim() !== '' &&
    Number(newPrice) >= 0 &&
    Number.isFinite(Number(newDuration)) &&
    newDuration.trim() !== '' &&
    Number(newDuration) > 0;

  const assignedIds = new Set(links.map((l) => l.serviceId));
  const available = catalog.filter((c) => !assignedIds.has(c.id));

  return (
    <div className="border-t border-border bg-canvas px-4 py-3 space-y-3">
      {err && <ErrorBox message={err} />}
      {loading ? (
        <p className="text-xs text-text-muted">Cargando servicios…</p>
      ) : (
        <>
          <div>
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">
              Asignados
            </p>
            {links.length === 0 ? (
              <p className="text-sm text-text-muted">Ninguno todavía.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {links.map((l) => (
                  <span
                    key={l.id}
                    className="inline-flex items-center gap-1.5 bg-brand-50 text-brand-700 text-sm rounded-full pl-3 pr-1.5 py-1"
                  >
                    {l.service.name}
                    <button
                      onClick={() => remove(l.id)}
                      className="w-5 h-5 rounded-full hover:bg-brand-100 text-brand-500"
                      aria-label="Quitar"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
          {available.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">
                Disponibles
              </p>
              <div className="flex flex-wrap gap-2">
                {available.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => add(c.id)}
                    className="inline-flex items-center gap-1 border border-border-strong text-text-secondary text-sm rounded-full px-3 py-1 transition-all hover:border-brand-400 hover:text-brand-700"
                  >
                    + {c.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="rounded-xl border border-border bg-surface p-3">
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
              Crear servicio nuevo
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nombre"
                className="w-full border border-border-strong rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
              <input
                type="number"
                min={0}
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
                placeholder="Precio (Bs)"
                className="w-full border border-border-strong rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
              <input
                type="number"
                min={1}
                value={newDuration}
                onChange={(e) => setNewDuration(e.target.value)}
                placeholder="Duración (min)"
                className="w-full border border-border-strong rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </div>
            <div className="mt-2 flex justify-end">
              <Button
                size="sm"
                onClick={createAndAssign}
                disabled={creating || !canCreate}
                className="bg-brand-600 hover:bg-brand-700"
              >
                {creating ? 'Creando…' : 'Crear y asignar'}
              </Button>
            </div>
          </div>
        </>
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
