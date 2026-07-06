'use client';

import type { ReactNode } from 'react';
import { StatusBadge, fmtDateTime } from '@/components/panel/ui';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { CalendarCheck, Clock, ShieldCheck } from 'lucide-react';
import type { AppointmentListItem } from '@/lib/panel-api';

// ─── Celdas de tabla compartidas (sistema de diseño) ──────────────────

/** Celda de paciente: avatar de iniciales + nombre + CI (o teléfono), en mono. */
function PatientCell({ a }: { a: AppointmentListItem }) {
  return (
    <div className="flex items-center gap-2.5">
      <Avatar name={a.patient.name} size="sm" />
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-text-primary">{a.patient.name}</div>
        <div className="truncate font-mono text-[11.5px] text-text-muted">
          {a.patient.ci ? `CI ${a.patient.ci}` : a.patient.phone}
        </div>
      </div>
    </div>
  );
}

/** Celda de pago: badge QR + monto, "Efectivo", o el seguro que cubre la cita. */
function PayCell({ a }: { a: AppointmentListItem }) {
  if (a.paymentMethod === 'INSURANCE') {
    // Nombre congelado al crear la cita (snapshot) — nunca el string "INSURANCE".
    return (
      <span className="inline-flex items-center gap-1.5 text-text-secondary">
        <ShieldCheck className="size-4 text-text-muted" />
        {a.insuranceNameSnapshot ?? 'Seguro'}
      </span>
    );
  }
  if (a.paymentMethod === 'CASH') {
    return <span className="text-text-secondary">Efectivo</span>;
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-text-secondary">
      <span className="rounded-md border border-border bg-canvas px-1.5 py-px font-mono text-[11px] text-text-muted">
        QR
      </span>
      {/* Monto congelado de la cita (respeta overrides); legacy → precio actual. */}
      Bs {a.price ?? a.service.price}
    </span>
  );
}

/** Glifo de WhatsApp (mismo trazo que el botón del booking). */
function WhatsAppGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M17.5 14.4c-.3-.15-1.8-.9-2.08-1-.28-.1-.48-.15-.68.15-.2.3-.78 1-.96 1.2-.18.2-.35.22-.65.07-.3-.15-1.27-.47-2.42-1.5-.9-.8-1.5-1.78-1.68-2.08-.17-.3-.02-.46.13-.6.13-.13.3-.35.45-.52.15-.18.2-.3.3-.5.1-.2.05-.38-.02-.53-.08-.15-.68-1.64-.93-2.24-.24-.58-.5-.5-.68-.51h-.58c-.2 0-.53.08-.8.38-.28.3-1.05 1.03-1.05 2.5 0 1.48 1.08 2.9 1.23 3.1.15.2 2.12 3.24 5.14 4.54.72.3 1.28.48 1.72.62.72.23 1.38.2 1.9.12.58-.08 1.8-.73 2.05-1.44.25-.7.25-1.3.18-1.44-.07-.13-.27-.2-.57-.35zM12 2a10 10 0 0 0-8.6 15.06L2 22l5.06-1.33A10 10 0 1 0 12 2z" />
    </svg>
  );
}

const TH =
  'whitespace-nowrap border-b border-border bg-canvas px-4 py-[11px] text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted';
const TD =
  'border-b border-[var(--border-hairline)] px-4 py-3 align-middle text-sm text-text-secondary';

/** Tarjeta de cita para móvil (reemplaza la tabla en pantallas chicas). */
function ApptCard({
  a,
  onOpen,
  children,
}: {
  a: AppointmentListItem;
  onOpen?: (id: string) => void;
  children?: ReactNode;
}) {
  return (
    <li
      onClick={onOpen ? () => onOpen(a.id) : undefined}
      className={`rounded-xl border border-border bg-surface p-4 shadow-card ${
        onOpen ? 'cursor-pointer transition-colors hover:border-brand-300' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <PatientCell a={a} />
        <StatusBadge status={a.status} />
      </div>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
        <dt className="text-text-muted">Servicio</dt>
        <dd className="text-right text-text-secondary">{a.service.name}</dd>
        <dt className="text-text-muted">Doctor</dt>
        <dd className="text-right text-text-secondary">{a.doctor.name}</dd>
        <dt className="text-text-muted">Cuándo</dt>
        <dd className="text-right text-text-secondary">{fmtDateTime(a.startTime)}</dd>
        <dt className="text-text-muted">Pago</dt>
        <dd className="text-right">
          <PayCell a={a} />
        </dd>
      </dl>
      {/* Las acciones no deben disparar la navegación de la tarjeta. */}
      {children && (
        <div className="mt-3 flex gap-2" onClick={(e) => e.stopPropagation()}>
          {children}
        </div>
      )}
    </li>
  );
}

// ─── Pending tab ───────────────────────────────────────────────────────

export function PendingTab({
  items,
  approvingId,
  onViewReceipt,
  onApprove,
  qrWaLink,
  onOpen,
}: {
  items: AppointmentListItem[];
  approvingId: string | null;
  onViewReceipt: (a: AppointmentListItem) => void;
  onApprove: (id: string) => void;
  qrWaLink: (a: AppointmentListItem) => string | null;
  onOpen: (id: string) => void;
}) {
  if (!items.length) {
    return (
      <EmptyState
        icon={<Clock />}
        title="No hay pagos pendientes"
        description="Las reservas que esperan comprobante o aprobación aparecerán aquí."
      />
    );
  }
  const actions = (a: AppointmentListItem, block: boolean) => {
    const approving = approvingId === a.id;
    if (a.receiptUrl) {
      return (
        <>
          <Button
            variant="outline"
            size="sm"
            className={block ? 'flex-1' : ''}
            onClick={() => onViewReceipt(a)}
          >
            Comprobante
          </Button>
          <Button
            size="sm"
            className={block ? 'flex-1' : ''}
            disabled={approving}
            onClick={() => onApprove(a.id)}
          >
            {approving ? 'Aprobando…' : 'Aprobar'}
          </Button>
        </>
      );
    }
    // Aún sin comprobante. Si es cita QR, ofrecemos mandarle el QR al WhatsApp del
    // paciente (abre el chat con el mensaje listo). El staff confirma de buena fe
    // el pago (efectivo, o QR revisado en su banco) con "Confirmar pago recibido".
    const waLink = qrWaLink(a);
    return (
      <>
        {waLink && (
          <a
            href={waLink}
            target="_blank"
            rel="noreferrer"
            className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border px-3 text-[13px] font-medium text-text-secondary transition hover:border-border-strong ${block ? 'flex-1' : ''}`}
          >
            <WhatsAppGlyph className="size-4 text-whatsapp" /> Enviar QR
          </a>
        )}
        <Button
          size="sm"
          className={block ? 'flex-1' : ''}
          disabled={approving}
          onClick={() => onApprove(a.id)}
        >
          {approving ? 'Confirmando…' : 'Confirmar pago recibido'}
        </Button>
      </>
    );
  };
  return (
    <>
      {/* Móvil: tarjetas */}
      <ul className="space-y-3 md:hidden">
        {items.map((a) => (
          <ApptCard key={a.id} a={a} onOpen={onOpen}>
            {actions(a, true)}
          </ApptCard>
        ))}
      </ul>

      {/* Desktop: tabla (fila completa clickeable → detalle) */}
      <div className="hidden overflow-hidden rounded-xl border border-border bg-surface shadow-card md:block">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={TH}>Paciente</th>
                <th className={TH}>Servicio</th>
                <th className={TH}>Doctor</th>
                <th className={TH}>Fecha y hora</th>
                <th className={TH}>Pago</th>
                <th className={TH}>Estado</th>
                <th className={TH}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <tr
                  key={a.id}
                  onClick={() => onOpen(a.id)}
                  className="cursor-pointer transition-colors last:[&>td]:border-b-0 hover:bg-canvas"
                >
                  <td className={`${TD} shadow-[inset_2px_0_0_var(--warning)]`}>
                    <PatientCell a={a} />
                  </td>
                  <td className={TD}>{a.service.name}</td>
                  <td className={TD}>{a.doctor.name}</td>
                  <td className={`${TD} whitespace-nowrap`}>{fmtDateTime(a.startTime)}</td>
                  <td className={TD}>
                    <PayCell a={a} />
                  </td>
                  <td className={TD}>
                    <StatusBadge status={a.status} />
                  </td>
                  <td className={`${TD} whitespace-nowrap`}>
                    {/* Los botones no deben disparar la navegación de la fila. */}
                    <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                      {actions(a, false)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ─── Confirmed tab ─────────────────────────────────────────────────────

export function ConfirmedTab({
  items,
  onOpen,
}: {
  items: AppointmentListItem[];
  onOpen: (id: string) => void;
}) {
  if (!items.length) {
    return (
      <EmptyState
        icon={<CalendarCheck />}
        title="Aún no hay citas confirmadas"
        description="Las citas confirmadas (efectivo o QR pagado) se mostrarán aquí."
      />
    );
  }
  return (
    <>
      {/* Móvil: tarjetas */}
      <ul className="space-y-3 md:hidden">
        {items.map((a) => (
          <ApptCard key={a.id} a={a} onOpen={onOpen} />
        ))}
      </ul>

      {/* Desktop: tabla (fila completa clickeable → detalle) */}
      <div className="hidden overflow-hidden rounded-xl border border-border bg-surface shadow-card md:block">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={TH}>Paciente</th>
                <th className={TH}>Servicio</th>
                <th className={TH}>Doctor</th>
                <th className={TH}>Fecha y hora</th>
                <th className={TH}>Pago</th>
                <th className={TH}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <tr
                  key={a.id}
                  onClick={() => onOpen(a.id)}
                  className="cursor-pointer transition-colors last:[&>td]:border-b-0 hover:bg-canvas"
                >
                  <td className={TD}>
                    <PatientCell a={a} />
                  </td>
                  <td className={TD}>{a.service.name}</td>
                  <td className={TD}>{a.doctor.name}</td>
                  <td className={`${TD} whitespace-nowrap`}>{fmtDateTime(a.startTime)}</td>
                  <td className={TD}>
                    <PayCell a={a} />
                  </td>
                  <td className={TD}>
                    <StatusBadge status={a.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
