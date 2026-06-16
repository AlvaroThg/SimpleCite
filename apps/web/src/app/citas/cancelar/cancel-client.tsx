'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cancelAppointment, ApiError, type CancelAppointmentResult } from '@/lib/api';

type Status = 'idle' | 'loading' | 'done' | 'error';

function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat('es-BO', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/La_Paz',
  }).format(new Date(iso));
}

export function CancelClient() {
  const token = useSearchParams().get('token') ?? '';
  const [status, setStatus] = useState<Status>('idle');
  const [result, setResult] = useState<CancelAppointmentResult | null>(null);
  const [error, setError] = useState<string>('');

  // Sin token: enlace incompleto o mal copiado.
  if (!token) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Enlace inválido</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Este enlace de cancelación está incompleto. Abre el enlace completo que te enviamos o
          contacta directamente a la clínica.
        </CardContent>
      </Card>
    );
  }

  async function handleCancel() {
    setStatus('loading');
    setError('');
    try {
      const data = await cancelAppointment(token);
      setResult(data);
      setStatus('done');
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : 'No pudimos procesar la cancelación. Inténtalo de nuevo en un momento.',
      );
      setStatus('error');
    }
  }

  // Confirmación exitosa (o ya estaba cancelada).
  if (status === 'done' && result) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>
            {result.alreadyCancelled ? 'Esta cita ya estaba cancelada' : 'Cita cancelada'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {result.alreadyCancelled
              ? 'No hay nada más que hacer. El horario quedó libre.'
              : 'Listo, liberamos tu horario. Si fue un error, puedes reservar una nueva cita cuando quieras.'}
          </p>
          <dl className="rounded-xl border bg-muted/30 p-4 text-sm">
            <div className="flex justify-between gap-4 py-1">
              <dt className="text-muted-foreground">Clínica</dt>
              <dd className="text-right font-medium">{result.tenantName}</dd>
            </div>
            <div className="flex justify-between gap-4 py-1">
              <dt className="text-muted-foreground">Profesional</dt>
              <dd className="text-right font-medium">{result.doctorName}</dd>
            </div>
            <div className="flex justify-between gap-4 py-1">
              <dt className="text-muted-foreground">Servicio</dt>
              <dd className="text-right font-medium">{result.serviceName}</dd>
            </div>
            <div className="flex justify-between gap-4 py-1">
              <dt className="text-muted-foreground">Era el</dt>
              <dd className="text-right font-medium capitalize">{formatWhen(result.startTime)}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    );
  }

  // Estado inicial / error: pedir confirmación explícita.
  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>¿Estás seguro de cancelar tu cita?</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">
          Si cancelas, liberaremos tu horario para otro paciente. Esta acción no se puede deshacer,
          pero podrás reservar una nueva cita más adelante.
        </p>

        {status === 'error' && (
          <p
            role="alert"
            className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}

        <div className="flex flex-col gap-2">
          <Button
            variant="destructive"
            size="lg"
            onClick={handleCancel}
            disabled={status === 'loading'}
          >
            {status === 'loading' ? 'Cancelando…' : 'Sí, cancelar mi cita'}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Si no querías cancelar, simplemente cierra esta página.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
