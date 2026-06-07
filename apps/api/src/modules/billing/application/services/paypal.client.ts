import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';

interface TokenCache {
  token: string;
  expiresAt: number;
}

export interface PayPalSubscription {
  id: string;
  /// APPROVAL_PENDING | APPROVED | ACTIVE | SUSPENDED | CANCELLED | EXPIRED
  status: string;
  billing_info?: { next_billing_time?: string };
}

export interface VerifyWebhookParams {
  transmissionId?: string;
  transmissionTime?: string;
  transmissionSig?: string;
  certUrl?: string;
  authAlgo?: string;
  event: unknown;
}

/**
 * Cliente HTTP de PayPal. Apunta SIEMPRE a `PAYPAL_API_BASE`, que por defecto
 * es el entorno Sandbox (`https://api-m.sandbox.paypal.com`). No se debe usar
 * la API live salvo en producción con credenciales reales.
 *
 * Responsabilidades:
 *   - OAuth2 (client_credentials) con cache de token.
 *   - Verificación de firma de webhooks (verify-webhook-signature).
 *   - Consulta de una suscripción (para sincronizar estado sin esperar webhook).
 */
@Injectable()
export class PaypalClient {
  private readonly base: string;
  private readonly clientId?: string;
  private readonly secret?: string;
  private readonly webhookId?: string;
  private tokenCache: TokenCache | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly logger: Logger,
  ) {
    this.base = this.config.get<string>('PAYPAL_API_BASE') ?? 'https://api-m.sandbox.paypal.com';
    this.clientId = this.config.get<string>('PAYPAL_CLIENT_ID') || undefined;
    this.secret = this.config.get<string>('PAYPAL_CLIENT_SECRET') || undefined;
    this.webhookId = this.config.get<string>('PAYPAL_WEBHOOK_ID') || undefined;

    if (!this.base.includes('sandbox') && this.config.get<string>('NODE_ENV') !== 'production') {
      this.logger.warn(
        { event: 'paypal.not-sandbox', base: this.base },
        'PAYPAL_API_BASE no es Sandbox en un entorno no-producción',
      );
    }
  }

  /** ¿Hay credenciales para llamar a la API de PayPal? */
  get configured(): boolean {
    return Boolean(this.clientId && this.secret);
  }

  /** ¿Está configurado el webhook id para verificar firmas? */
  get webhookConfigured(): boolean {
    return Boolean(this.webhookId);
  }

  private async getAccessToken(): Promise<string> {
    if (!this.configured) {
      throw new Error('PayPal no configurado (faltan PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET)');
    }
    const now = Date.now();
    if (this.tokenCache && this.tokenCache.expiresAt > now + 60_000) {
      return this.tokenCache.token;
    }

    const auth = Buffer.from(`${this.clientId}:${this.secret}`).toString('base64');
    const res = await fetch(`${this.base}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`PayPal OAuth falló (${res.status}): ${t}`);
    }
    const data = (await res.json()) as { access_token: string; expires_in: number };
    this.tokenCache = { token: data.access_token, expiresAt: now + data.expires_in * 1000 };
    return data.access_token;
  }

  /**
   * Verifica la firma de un webhook consultando la API de PayPal (Sandbox).
   * Devuelve true solo si `verification_status === 'SUCCESS'`.
   */
  async verifyWebhookSignature(params: VerifyWebhookParams): Promise<boolean> {
    if (!this.webhookId) throw new Error('PAYPAL_WEBHOOK_ID no configurado');
    const token = await this.getAccessToken();
    const res = await fetch(`${this.base}/v1/notifications/verify-webhook-signature`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        auth_algo: params.authAlgo,
        cert_url: params.certUrl,
        transmission_id: params.transmissionId,
        transmission_sig: params.transmissionSig,
        transmission_time: params.transmissionTime,
        webhook_id: this.webhookId,
        webhook_event: params.event,
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      this.logger.warn(
        { event: 'paypal.verify.http-error', status: res.status, body: t },
        'PaypalClient',
      );
      return false;
    }
    const data = (await res.json()) as { verification_status: string };
    return data.verification_status === 'SUCCESS';
  }

  /** Consulta una suscripción por id (para sincronizar estado en el link). */
  async getSubscription(id: string): Promise<PayPalSubscription | null> {
    if (!this.configured) return null;
    const token = await this.getAccessToken();
    const res = await fetch(`${this.base}/v1/billing/subscriptions/${id}`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      this.logger.warn(
        { event: 'paypal.getSubscription.failed', id, status: res.status },
        'PaypalClient',
      );
      return null;
    }
    return (await res.json()) as PayPalSubscription;
  }
}
