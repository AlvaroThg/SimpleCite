'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/panel-auth';
import {
  getAppointment,
  getMedicalRecord,
  saveMedicalRecord,
  createPrescription,
  downloadPrescriptionPdf,
  transitionAppointment,
  PanelApiError,
  type AppointmentDetail,
  type MedicalRecord,
  type MedicationItem,
} from '@/lib/panel-api';
import { ArrowLeft, Lock, X } from 'lucide-react';
import { PanelShell } from '@/components/panel/PanelShell';
import { fmtDate, fmtTime, ErrorBox } from '@/components/panel/ui';
import { SkeletonDetail } from '@/components/panel/Skeleton';

type RecordForm = {
  symptoms: string;
  diagnosis: string;
  treatment: string;
  privateNotes: string;
};

const EMPTY_MED: MedicationItem = { name: '', dose: '', frequency: '', duration: '' };

export default function ConsultaPage() {
  return (
    <PanelShell>
      <ConsultaView />
    </PanelShell>
  );
}

function ConsultaView() {
  const { id } = useParams<{ id: string }>();
  const { session } = useAuth();
  const router = useRouter();

  const [appt, setAppt] = useState<AppointmentDetail | null>(null);
  const [record, setRecord] = useState<MedicalRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [form, setForm] = useState<RecordForm>({
    symptoms: '',
    diagnosis: '',
    treatment: '',
    privateNotes: '',
  });
  const [meds, setMeds] = useState<MedicationItem[]>([{ ...EMPTY_MED }]);
  const [instructions, setInstructions] = useState('');

  const [savedAt, setSavedAt] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const role = session?.user.role;
  const readOnly = appt?.status === 'COMPLETED' || appt?.status === 'CANCELLED';

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError('');
    try {
      const [a, r] = await Promise.all([
        getAppointment(session.token, session.slug, id),
        getMedicalRecord(session.token, session.slug, id).catch(() => null),
      ]);
      setAppt(a);
      setRecord(r);
      if (r) {
        setForm({
          symptoms: r.symptoms ?? '',
          diagnosis: r.diagnosis ?? '',
          treatment: r.treatment ?? '',
          privateNotes: r.privateNotes ?? '',
        });
      }
    } catch (err) {
      setError(err instanceof PanelApiError ? err.message : 'No se pudo cargar la consulta');
    } finally {
      setLoading(false);
    }
  }, [session, id]);

  useEffect(() => {
    void load();
  }, [load]);

  function setField(key: keyof RecordForm, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function setMed(i: number, key: keyof MedicationItem, value: string) {
    setMeds((list) => list.map((m, idx) => (idx === i ? { ...m, [key]: value } : m)));
  }
  const addMed = () => setMeds((list) => [...list, { ...EMPTY_MED }]);
  const removeMed = (i: number) => setMeds((list) => list.filter((_, idx) => idx !== i));

  /** Filas con algún contenido; valida que estén completas antes de enviar. */
  function collectMedications(): { meds: MedicationItem[]; invalid: boolean } {
    const filled = meds.filter((m) => m.name || m.dose || m.frequency || m.duration);
    const invalid = filled.some((m) => !m.name || !m.dose || !m.frequency || !m.duration);
    return { meds: filled, invalid };
  }

  async function handleSaveDraft() {
    if (!session) return;
    setSaving(true);
    setError('');
    try {
      const saved = await saveMedicalRecord(session.token, session.slug, id, form);
      setRecord(saved);
      setSavedAt(new Date().toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' }));
    } catch (err) {
      setError(err instanceof PanelApiError ? err.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  }

  async function handleFinish() {
    if (!session) return;
    const { meds: validMeds, invalid } = collectMedications();
    if (invalid) {
      setError('Completa todos los campos de cada medicamento (o elimina las filas vacías).');
      return;
    }
    setFinishing(true);
    setError('');
    try {
      const saved = await saveMedicalRecord(session.token, session.slug, id, form);

      let prescriptionId: string | null = null;
      if (validMeds.length > 0) {
        const p = await createPrescription(session.token, session.slug, saved.id, {
          medications: validMeds,
          instructions: instructions.trim() || undefined,
        });
        prescriptionId = p.id;
      }

      // CONFIRMED → COMPLETED (cierra la cita).
      if (appt?.status === 'CONFIRMED') {
        await transitionAppointment(session.token, session.slug, id, 'COMPLETED');
      }

      if (prescriptionId) {
        await downloadPrescriptionPdf(session.token, session.slug, prescriptionId);
      }

      router.push(`/panel/appointments/${id}`);
    } catch (err) {
      setError(err instanceof PanelApiError ? err.message : 'No se pudo finalizar la consulta');
      setFinishing(false);
    }
  }

  if (loading) return <SkeletonDetail />;
  if (error && !appt) return <ErrorBox message={error} />;
  if (!appt) return null;

  if (role === 'STAFF') {
    return <ErrorBox message="No tienes acceso al historial clínico." />;
  }

  const { meds: filledMeds } = collectMedications();
  const finishLabel =
    filledMeds.length > 0 ? 'Finalizar y generar receta PDF' : 'Finalizar consulta';

  return (
    <div className="space-y-5">
      <button
        onClick={() => router.push(`/panel/appointments/${id}`)}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
      >
        <ArrowLeft className="size-4" /> Volver a la cita
      </button>

      <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
        {/* ── Contexto del paciente (sticky en desktop) ── */}
        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-gray-400">Consulta</p>
            <h1 className="mt-1 text-lg font-bold text-gray-900">{appt.patient.name}</h1>
            <p className="text-sm text-gray-500">{appt.patient.phone}</p>
            {appt.patient.ci && <p className="text-sm text-gray-500">CI: {appt.patient.ci}</p>}

            <dl className="mt-4 space-y-2 border-t border-gray-100 pt-4 text-sm">
              <Row label="Fecha" value={fmtDate(appt.startTime)} />
              <Row label="Hora" value={`${fmtTime(appt.startTime)} – ${fmtTime(appt.endTime)}`} />
              <Row label="Servicio" value={appt.service.name} />
              <Row label="Doctor" value={appt.doctor.name} />
            </dl>
          </div>

          {readOnly && (
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-700">
              Esta cita está{' '}
              <strong>{appt.status === 'COMPLETED' ? 'completada' : 'cancelada'}</strong>. La
              consulta es de solo lectura.
            </p>
          )}
        </aside>

        {/* ── Formulario de la consulta ── */}
        <div className="space-y-5">
          {error && <ErrorBox message={error} />}

          {/* ① Historia clínica */}
          <section className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
            <h2 className="text-sm font-semibold text-gray-900">Historia clínica</h2>
            <Field
              label="Síntomas / motivo de consulta"
              value={form.symptoms}
              onChange={(v) => setField('symptoms', v)}
              disabled={readOnly}
              placeholder="Motivo de la visita, síntomas referidos…"
            />
            <Field
              label="Diagnóstico"
              value={form.diagnosis}
              onChange={(v) => setField('diagnosis', v)}
              disabled={readOnly}
            />
            <Field
              label="Tratamiento"
              value={form.treatment}
              onChange={(v) => setField('treatment', v)}
              disabled={readOnly}
            />
            <Field
              label="Notas privadas (no se imprimen en la receta)"
              labelIcon={Lock}
              value={form.privateNotes}
              onChange={(v) => setField('privateNotes', v)}
              disabled={readOnly}
            />
          </section>

          {/* ② Receta */}
          <section className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Receta — medicamentos</h2>
            </div>

            {/* Recetas ya emitidas en esta consulta */}
            {record?.prescriptions?.length ? (
              <div className="space-y-2">
                {record.prescriptions.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 px-4 py-2 text-sm"
                  >
                    <span className="text-gray-600">
                      Receta · {p.medications.length} medicamento(s)
                    </span>
                    <button
                      onClick={() =>
                        session && downloadPrescriptionPdf(session.token, session.slug, p.id)
                      }
                      className="font-medium text-blue-600 hover:text-blue-800"
                    >
                      Descargar PDF
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            {!readOnly && (
              <>
                <div className="space-y-3">
                  {meds.map((m, i) => (
                    <div
                      key={i}
                      className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_120px_140px_120px_auto]"
                    >
                      <MedInput
                        placeholder="Medicamento"
                        value={m.name}
                        onChange={(v) => setMed(i, 'name', v)}
                      />
                      <MedInput
                        placeholder="Dosis"
                        value={m.dose}
                        onChange={(v) => setMed(i, 'dose', v)}
                      />
                      <MedInput
                        placeholder="Frecuencia"
                        value={m.frequency}
                        onChange={(v) => setMed(i, 'frequency', v)}
                      />
                      <MedInput
                        placeholder="Duración"
                        value={m.duration}
                        onChange={(v) => setMed(i, 'duration', v)}
                      />
                      <button
                        type="button"
                        onClick={() => removeMed(i)}
                        disabled={meds.length === 1}
                        className="flex items-center justify-center rounded-lg px-2 text-gray-400 hover:text-red-600 disabled:opacity-30"
                        aria-label="Eliminar medicamento"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={addMed}
                  className="text-sm font-medium text-blue-600 hover:text-blue-800"
                >
                  + Agregar medicamento
                </button>

                <Field
                  label="Indicaciones generales"
                  value={instructions}
                  onChange={setInstructions}
                  placeholder="Reposo, hidratación, control en 7 días…"
                />
              </>
            )}
          </section>

          {/* Acciones */}
          {!readOnly && (
            <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
              {savedAt && (
                <span className="text-xs text-gray-400 sm:mr-auto">
                  Borrador guardado {savedAt}
                </span>
              )}
              <button
                onClick={handleSaveDraft}
                disabled={saving || finishing}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {saving ? 'Guardando…' : 'Guardar borrador'}
              </button>
              <button
                onClick={handleFinish}
                disabled={finishing || saving}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {finishing ? 'Procesando…' : finishLabel}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Subcomponentes ────────────────────────────────────────────────────

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-gray-400">{label}</dt>
      <dd className="text-right font-medium text-gray-800">{value}</dd>
    </div>
  );
}

function Field({
  label,
  labelIcon: LabelIcon,
  value,
  onChange,
  disabled,
  placeholder,
}: {
  label: string;
  labelIcon?: import('lucide-react').LucideIcon;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-gray-500">
        {LabelIcon && <LabelIcon className="size-3.5" />}
        {label}
      </span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        rows={3}
        className="w-full resize-y rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
      />
    </label>
  );
}

function MedInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
    />
  );
}
