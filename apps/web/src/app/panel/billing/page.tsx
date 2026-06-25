'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/panel-auth';
import { getBillingStatus, PanelApiError, type BillingStatus } from '@/lib/panel-api';
import { PanelShell } from '@/components/panel/PanelShell';
import { SkeletonCards } from '@/components/panel/Skeleton';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function BillingPage() {
  return (
    <PanelShell>
      <Billing />
    </PanelShell>
  );
}

function statusBadge(status: string) {
  switch (status) {
    case 'ACTIVE':
      return <Badge variant="success">Activa</Badge>;
    case 'TRIAL':
      return <Badge variant="warning">Prueba</Badge>;
    case 'PAST_DUE':
      return <Badge variant="destructive">Pago pendiente</Badge>;
    case 'CANCELED':
      return <Badge variant="destructive">Cancelada</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

function Billing() {
  const { session } = useAuth();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      setStatus(await getBillingStatus(session.token, session.slug));
    } catch (e) {
      toast.error(e instanceof PanelApiError ? e.message : 'Error al cargar la suscripción');
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-5">
        <h1 className="text-2xl font-bold text-foreground">Suscripción</h1>
        <SkeletonCards count={1} />
      </div>
    );
  }

  const active = status?.subscriptionStatus === 'ACTIVE';
  const endDate = status?.subscriptionEndDate ? new Date(status.subscriptionEndDate) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Suscripción</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Estado del plan de tu clínica. La activación y renovación se gestionan con el equipo de
          SimpleCite.
        </p>
      </div>

      {/* Estado actual */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle>Estado de tu plan</CardTitle>
            {status && statusBadge(status.subscriptionStatus)}
          </div>
          <CardDescription>
            {active && endDate
              ? `Tu suscripción está activa hasta el ${endDate.toLocaleDateString('es-BO', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}.`
              : status?.subscriptionStatus === 'TRIAL'
                ? 'Estás en el período de prueba.'
                : 'Tu suscripción no está activa.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-3">
            {active ? (
              <CheckCircle2 className="size-5 flex-shrink-0 text-green-600" />
            ) : (
              <AlertTriangle className="size-5 flex-shrink-0 text-amber-500" />
            )}
            <span>
              Plan <span className="font-medium text-foreground">{status?.plan ?? '—'}</span>
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Renovación */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageCircle className="size-5 text-brand-600" /> ¿Renovar o cambiar de plan?
          </CardTitle>
          <CardDescription>
            Escríbenos para activar, renovar o ajustar el plan de tu clínica.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Contacta a soporte de SimpleCite y actualizamos tu suscripción en el momento.
        </CardContent>
      </Card>
    </div>
  );
}
