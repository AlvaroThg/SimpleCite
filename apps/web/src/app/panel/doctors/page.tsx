'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '@/lib/panel-auth';
import {
  getDoctorsAdmin,
  createDoctor,
  updateDoctor,
  uploadDoctorQr,
  archiveDoctor,
  getServices,
  getDoctorServices,
  assignServiceToDoctor,
  unassignServiceFromDoctor,
  updateDoctorService,
  createService,
  getDoctorInsurances,
  setDoctorInsurance,
  uploadDoctorPhoto,
  PanelApiError,
  type Doctor,
  type ServiceItem,
  type DoctorServiceLink,
  type DoctorInsuranceOption,
} from '@/lib/panel-api';
import { PanelShell } from '@/components/panel/PanelShell';
import { ErrorBox } from '@/components/panel/ui';
import { SkeletonList } from '@/components/panel/Skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import { Stethoscope, Upload, Shield } from 'lucide-react';
import { compressImageFile } from '@/lib/compress-image';
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
  qrUrl: string;
  qrLabel: string;
  isActive: boolean;
  insuranceMode: boolean;
};
const empty: Draft = {
  email: '',
  password: '',
  name: '',
  specialty: '',
  licenseNumber: '',
  bio: '',
  qrUrl: '',
  qrLabel: '',
  isActive: true,
  insuranceMode: false,
};

function Doctors() {
  const { session } = useAuth();
  const [items, setItems] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [uploadingQr, setUploadingQr] = useState(false);
  const qrInputRef = useRef<HTMLInputElement>(null);

  /** Sube el QR del doctor en edición a R2 y refleja la URL en el borrador. */
  async function handleQrUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !session || !draft?.id) return;
    setUploadingQr(true);
    try {
      const { base64, mimeType } = await compressImageFile(file);
      const updated = await uploadDoctorQr(session.token, session.slug, draft.id, {
        imageBase64: base64,
        mimeType,
      });
      setDraft((d) => (d ? { ...d, qrUrl: updated.qrUrl ?? '' } : d));
      await load();
      toast.success('QR del doctor actualizado.');
    } catch (err) {
      toast.error(err instanceof PanelApiError ? err.message : 'No se pudo subir el QR');
    } finally {
      setUploadingQr(false);
      e.target.value = '';
    }
  }

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
          qrUrl: draft.qrUrl.trim() || null,
          qrLabel: draft.qrLabel.trim() || null,
          isActive: draft.isActive,
          insuranceMode: draft.insuranceMode,
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
            <div className="space-y-3 rounded-lg border border-border bg-canvas p-3">
              <div className="text-xs text-text-muted">
                QR de cobro del doctor (solo aplica si la clínica usa el modo{' '}
                <strong>Por doctor</strong> en Configuración).
              </div>
              <div className="flex items-center gap-4">
                <div className="flex size-20 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface">
                  {draft.qrUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={draft.qrUrl}
                      alt="QR del doctor"
                      className="size-full object-contain"
                    />
                  ) : (
                    <span className="text-[10px] text-text-muted">Sin QR</span>
                  )}
                </div>
                <div className="space-y-1.5">
                  <input
                    ref={qrInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleQrUpload}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={uploadingQr}
                    onClick={() => qrInputRef.current?.click()}
                  >
                    <Upload className="size-4" />
                    {uploadingQr ? 'Subiendo…' : draft.qrUrl ? 'Cambiar QR' : 'Subir QR'}
                  </Button>
                  <p className="text-[11px] text-text-muted">PNG o JPG de la imagen del QR.</p>
                </div>
              </div>
              <Input
                label="Banco del QR"
                value={draft.qrLabel}
                onChange={(v) => setDraft({ ...draft, qrLabel: v })}
              />
            </div>
          )}
          {draft.id && (
            <div className="space-y-3 rounded-lg border border-border bg-canvas p-3">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2 font-medium text-text-secondary">
                  <Shield className="size-4 text-text-muted" /> Modo seguro
                </span>
                <Switch
                  checked={draft.insuranceMode}
                  onCheckedChange={(v) => setDraft({ ...draft, insuranceMode: v })}
                  aria-label="Modo seguro"
                />
              </div>
              <p className="text-xs text-text-muted">
                Con el modo seguro activo, las citas de este especialista se cubren por seguro
                médico: el paciente elige su seguro al reservar y no paga en la clínica.
              </p>
              {draft.insuranceMode && <DoctorInsurances doctorId={draft.id} />}
            </div>
          )}
          {draft.id && (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-canvas p-3 text-sm">
              <div>
                <span className="font-medium text-text-secondary">Activo</span>
                <p className="text-xs text-text-muted">
                  Inactivo deja de aparecer en la agenda y el booking.
                </p>
              </div>
              <Switch
                checked={draft.isActive}
                onCheckedChange={(v) => setDraft({ ...draft, isActive: v })}
                aria-label="Doctor activo"
              />
            </div>
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
                  <PhotoAvatar doctor={d} onUploaded={load} />
                  <div className="min-w-0">
                    <p className="font-semibold text-text-primary truncate">
                      {d.name}
                      {!d.isActive && (
                        <span className="text-red-500 font-normal"> · archivado</span>
                      )}
                    </p>
                    <p className="flex items-center gap-1.5 text-sm text-text-muted truncate">
                      <span className="truncate">
                        {d.specialty ?? 'Sin especialidad'} · {d.email}
                      </span>
                      {d.insuranceMode && (
                        <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full border border-border bg-canvas px-2 py-px text-[11px] font-medium text-text-secondary">
                          <Shield className="size-3" /> Seguro
                        </span>
                      )}
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
                        qrUrl: d.qrUrl ?? '',
                        qrLabel: d.qrLabel ?? '',
                        isActive: d.isActive,
                        insuranceMode: d.insuranceMode,
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

/**
 * Avatar del doctor: foto de R2 si existe (fallback a iniciales si no carga)
 * y botón "Cambiar foto" al pasar el mouse. Sube por base64 → API → R2.
 */
function PhotoAvatar({ doctor, onUploaded }: { doctor: Doctor; onUploaded: () => void }) {
  const { session } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [imgError, setImgError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !session) return;
    setUploading(true);
    try {
      const { base64, mimeType } = await compressImageFile(file);
      await uploadDoctorPhoto(session.token, session.slug, doctor.id, {
        imageBase64: base64,
        mimeType,
      });
      setImgError(false);
      onUploaded();
      toast.success('Foto actualizada.');
    } catch (err) {
      toast.error(err instanceof PanelApiError ? err.message : 'No se pudo subir la foto');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  return (
    <div className="group/photo relative flex-shrink-0">
      {doctor.photoUrl && !imgError ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={doctor.photoUrl}
          alt={doctor.name}
          onError={() => setImgError(true)}
          className="size-12 rounded-full border border-border object-cover"
        />
      ) : (
        <Avatar name={doctor.name} size="lg">
          {initials(doctor.name) ? undefined : <Stethoscope className="h-5 w-5" />}
        </Avatar>
      )}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        title="Cambiar foto"
        aria-label={`Cambiar foto de ${doctor.name}`}
        className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition-opacity group-hover/photo:opacity-100 focus-visible:opacity-100 disabled:opacity-60"
      >
        <Upload className="size-4" />
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handleUpload}
      />
    </div>
  );
}

/**
 * Checkboxes de seguros para un doctor en modo seguro: catálogo activo del
 * tenant + estado de asignación. Marcar crea/activa el DoctorInsurance;
 * desmarcar lo desactiva (soft).
 */
function DoctorInsurances({ doctorId }: { doctorId: string }) {
  const { session } = useAuth();
  const [options, setOptions] = useState<DoctorInsuranceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!session) return;
    getDoctorInsurances(session.token, session.slug, doctorId)
      .then(setOptions)
      .catch(() => toast.error('No se pudieron cargar los seguros'))
      .finally(() => setLoading(false));
  }, [session, doctorId]);

  async function toggle(opt: DoctorInsuranceOption) {
    if (!session || busy) return;
    setBusy(true);
    try {
      setOptions(
        await setDoctorInsurance(session.token, session.slug, doctorId, {
          tenantInsuranceId: opt.id,
          isActive: !opt.assigned,
        }),
      );
    } catch (e) {
      toast.error(e instanceof PanelApiError ? e.message : 'No se pudo actualizar');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="text-xs text-text-muted">Cargando seguros…</p>;
  if (options.length === 0) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        No hay seguros en el catálogo. Agrégalos primero en{' '}
        <strong>Configuración → Seguros médicos</strong>.
      </p>
    );
  }
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
        Seguros que acepta
      </p>
      <ul className="divide-y divide-[var(--border-hairline)]">
        {options.map((opt) => (
          <li key={opt.id} className="flex items-center justify-between gap-2 py-2">
            <span
              className={`text-sm ${opt.assigned ? 'font-medium text-text-primary' : 'text-text-secondary'}`}
            >
              {opt.name}
            </span>
            <Switch
              checked={opt.assigned}
              disabled={busy}
              onCheckedChange={() => toggle(opt)}
              aria-label={`Aceptar ${opt.name}`}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Fila de servicio asignado: override opcional de duración/precio para el doctor. */
function DoctorServiceRow({
  link,
  onRemove,
  onSaved,
}: {
  link: DoctorServiceLink;
  onRemove: () => void;
  onSaved: () => void;
}) {
  const { session } = useAuth();
  const initialDur = link.customDuration != null ? String(link.customDuration) : '';
  const initialPrice = link.customPrice != null ? String(link.customPrice) : '';
  const [dur, setDur] = useState(initialDur);
  const [price, setPrice] = useState(initialPrice);
  const [saving, setSaving] = useState(false);
  const dirty = dur !== initialDur || price !== initialPrice;

  async function save() {
    if (!session) return;
    setSaving(true);
    try {
      await updateDoctorService(session.token, session.slug, link.id, {
        customDuration: dur.trim() === '' ? null : Number(dur),
        customPrice: price.trim() === '' ? null : Number(price),
      });
      toast.success('Override guardado.');
      onSaved();
    } catch (e) {
      toast.error(e instanceof PanelApiError ? e.message : 'No se pudo guardar el override');
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="rounded-lg border border-border bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-text-primary">{link.service.name}</span>
        <button
          onClick={onRemove}
          className="text-xs text-red-500 transition-colors hover:text-red-700"
        >
          Quitar
        </button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Input
          label={`Duración (default ${link.service.duration} min)`}
          type="number"
          value={dur}
          onChange={setDur}
        />
        <Input
          label={`Precio Bs (default ${Number(link.service.price).toFixed(0)})`}
          type="number"
          value={price}
          onChange={setPrice}
        />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[11px] text-text-muted">Vacío = usa el valor del servicio.</span>
        <Button size="sm" variant="outline" disabled={!dirty || saving} onClick={save}>
          {saving ? 'Guardando…' : 'Guardar'}
        </Button>
      </div>
    </li>
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
              <ul className="space-y-2">
                {links.map((l) => (
                  <DoctorServiceRow
                    key={l.id}
                    link={l}
                    onRemove={() => remove(l.id)}
                    onSaved={load}
                  />
                ))}
              </ul>
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
