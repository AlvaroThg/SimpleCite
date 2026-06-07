'use client';

import { useCallback, useEffect, useState } from 'react';
import { PayPalScriptProvider, PayPalButtons } from '@paypal/react-paypal-js';
import { CreditCard, CheckCircle2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/panel-auth';
import {
  getBillingStatus,
  linkSubscription,
  PanelApiError,
  type BillingStatus,
} from '@/lib/panel-api';
import { PanelShell } from '@/components/panel/PanelShell';
import { SkeletonCards } from '@/components/panel/Skeleton';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

// Variables públicas de Sandbox (las lee Next en build/runtime).
const PAYPAL_CLIENT_ID = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ?? '';
const PAYPAL_PLAN_ID = process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID ?? '';

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
  const isAdmin = session?.user.role === 'ADMIN';

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
        <h1 className="text-2xl font-bold text-gray-900">Suscripción</h1>
        <SkeletonCards count={2} />
      </div>
    );
  }

  const active = status?.subscriptionStatus === 'ACTIVE';
  const endDate = status?.subscriptionEndDate ? new Date(status.subscriptionEndDate) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Suscripción</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gestiona el plan de tu clínica con PayPal (entorno de prueba — Sandbox).
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
              : 'Aún no tienes una suscripción activa.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-3 text-sm text-gray-600">
          {active ? (
            <CheckCircle2 className="size-5 flex-shrink-0 text-green-600" />
          ) : (
            <AlertTriangle className="size-5 flex-shrink-0 text-amber-500" />
          )}
          {status?.paypalSubscriptionId ? (
            <span>
              ID de suscripción:{' '}
              <span className="font-mono text-xs">{status.paypalSubscriptionId}</span>
            </span>
          ) : (
            <span>Suscríbete para asegurar el acceso continuo a todas las funciones.</span>
          )}
        </CardContent>
      </Card>

      {/* Suscribirse (solo admin) */}
      {!isAdmin ? (
        <Card>
          <CardContent className="py-6 text-sm text-gray-500">
            Solo los administradores pueden gestionar la suscripción de la clínica.
          </CardContent>
        </Card>
      ) : !PAYPAL_CLIENT_ID || !PAYPAL_PLAN_ID ? (
        <Card>
          <CardHeader>
            <CardTitle>Configuración pendiente</CardTitle>
            <CardDescription>
              Falta configurar las variables de PayPal Sandbox para mostrar el botón de pago.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-gray-600">
            Define <code className="rounded bg-gray-100 px-1">NEXT_PUBLIC_PAYPAL_CLIENT_ID</code> y{' '}
            <code className="rounded bg-gray-100 px-1">NEXT_PUBLIC_PAYPAL_PLAN_ID</code> (de tu
            cuenta Sandbox) y reinicia el frontend.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="size-5" /> {active ? 'Renovar o cambiar plan' : 'Suscribirse'}
            </CardTitle>
            <CardDescription>
              Pago con PayPal · Sandbox (pagos ficticios de prueba).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-w-sm">
              <PayPalScriptProvider
                options={{
                  clientId: PAYPAL_CLIENT_ID,
                  components: 'buttons',
                  intent: 'subscription',
                  vault: true,
                }}
              >
                <PayPalButtons
                  style={{ layout: 'vertical', label: 'subscribe', color: 'blue', shape: 'pill' }}
                  createSubscription={(_data, actions) =>
                    actions.subscription.create({ plan_id: PAYPAL_PLAN_ID })
                  }
                  onApprove={async (data) => {
                    if (!session || !data.subscriptionID) return;
                    try {
                      const updated = await linkSubscription(
                        session.token,
                        session.slug,
                        data.subscriptionID,
                      );
                      setStatus(updated);
                      toast.success(
                        '¡Suscripción vinculada! Tu plan se activa al confirmarse el pago.',
                      );
                    } catch (e) {
                      toast.error(
                        e instanceof PanelApiError
                          ? e.message
                          : 'No se pudo vincular la suscripción',
                      );
                    }
                  }}
                  onError={() => toast.error('Ocurrió un error con PayPal. Intenta de nuevo.')}
                />
              </PayPalScriptProvider>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
