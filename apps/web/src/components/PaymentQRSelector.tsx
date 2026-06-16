'use client';

import { useState } from 'react';
import { QrCode } from 'lucide-react';

export interface BankQr {
  id: string;
  /** Nombre mostrado en la pill (ej: "Banco Unión"). */
  name: string;
  /** URL de la imagen del QR (R2 / dominio del tenant). */
  qrUrl: string;
  /** Texto opcional bajo el QR (titular, nº de cuenta, etc.). */
  accountInfo?: string;
}

interface PaymentQRSelectorProps {
  banks: BankQr[];
  /** Banco seleccionado por defecto (id). Si no, el primero. */
  defaultBankId?: string;
}

/**
 * Selector de QR de pago con pills por banco. El paciente elige el banco y se
 * muestra el QR correspondiente para escanear. Responsivo (móvil primero).
 */
export function PaymentQRSelector({ banks, defaultBankId }: PaymentQRSelectorProps) {
  const [active, setActive] = useState<string>(defaultBankId ?? banks[0]?.id ?? '');
  const selected = banks.find((b) => b.id === active) ?? banks[0];

  if (!selected) return null;

  return (
    <div className="mx-auto w-full max-w-sm">
      {/* Pills */}
      <div
        role="tablist"
        aria-label="Banco para el pago"
        className="flex gap-1.5 rounded-xl bg-gray-100 p-1"
      >
        {banks.map((bank) => {
          const isActive = bank.id === selected.id;
          return (
            <button
              key={bank.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(bank.id)}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
                isActive ? 'bg-white text-brand-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {bank.name}
            </button>
          );
        })}
      </div>

      {/* QR */}
      <div className="mt-4 flex flex-col items-center rounded-2xl border border-gray-100 bg-white p-5">
        <div className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium text-gray-400">
          <QrCode className="size-4" /> Escanea con la app de {selected.name}
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={selected.qrUrl}
          alt={`QR de pago — ${selected.name}`}
          className="h-auto w-full max-w-[260px] rounded-xl border border-gray-100"
        />
        {selected.accountInfo && (
          <p className="mt-3 text-center text-sm text-gray-600">{selected.accountInfo}</p>
        )}
      </div>

      <p className="mt-3 text-center text-xs text-gray-400">
        Tras pagar, envía la foto del comprobante para confirmar tu cita.
      </p>
    </div>
  );
}
