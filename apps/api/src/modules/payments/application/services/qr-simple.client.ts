import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { randomUUID, createHmac } from 'crypto';

/**
 * Resultado de crear un cobro en el proveedor.
 */
export interface CreateChargeResult {
  providerPaymentId: string;
  qrPayload: string; /// Texto EMV o URL para renderizar el QR
  expiresAt: Date;
}

export interface CreateChargeParams {
  amount: number;
  currency: string;
  reference: string; /// Referencia interna (ej: paymentIntentId) para conciliar
  description: string;
  expiresInMinutes: number;
}

/**
 * Cliente para la pasarela de pagos "QR Simple" (Bolivia).
 *
 * Modo stub (cuando QR_SIMPLE_API_URL no está configurada): genera un
 * providerPaymentId y un qrPayload falsos para desarrollo/testing. Permite
 * probar todo el flujo de pago sin la pasarela real.
 *
 * Modo real (cuando hay credenciales): llama a la API HTTP con firma HMAC,
 * timeout, reintentos y circuit breaker. La implementación real se completa
 * cuando tengamos la documentación de QR Simple.
 *
 * Resiliencia (modo real):
 *   - Timeout por request (default 8s)
 *   - Reintento con back-off exponencial (hasta 3 intentos)
 *   - Circuit breaker: tras N fallos consecutivos abre el circuito por un
 *     cooldown, devolviendo 503 sin golpear al proveedor caído.
 */
@Injectable()
export class QrSimpleClient {
  private readonly apiUrl: string | undefined;
  private readonly apiKey: string | undefined;
  private readonly isStub: boolean;

  // ── Circuit breaker (in-memory, suficiente para single-VPS) ──
  private consecutiveFailures = 0;
  private circuitOpenUntil = 0;
  private readonly failureThreshold = 5;
  private readonly cooldownMs = 30_000;

  private readonly maxAttempts = 3;
  private readonly timeoutMs = 8_000;

  constructor(
    private readonly config: ConfigService,
    private readonly logger: Logger,
  ) {
    this.apiUrl = this.config.get<string>('QR_SIMPLE_API_URL');
    this.apiKey = this.config.get<string>('QR_SIMPLE_API_KEY');
    this.isStub = !this.apiUrl || !this.apiKey;

    if (this.isStub) {
      this.logger.warn(
        { event: 'qrsimple.stub-mode' },
        'QrSimpleClient en modo STUB — sin pasarela real (dev/test)',
      );
    }
  }

  /**
   * Crea un cobro y devuelve el payload del QR.
   */
  async createCharge(params: CreateChargeParams): Promise<CreateChargeResult> {
    if (this.isStub) {
      return this.createChargeStub(params);
    }
    return this.createChargeReal(params);
  }

  // ─── Modo STUB ─────────────────────────────────────────────────────

  private createChargeStub(params: CreateChargeParams): CreateChargeResult {
    const providerPaymentId = `stub_${randomUUID()}`;
    // Payload tipo EMV simulado — en real sería el string EMVCo del QR.
    const qrPayload =
      `00020101021126580014BO.QRSIMPLE.STUB0136${providerPaymentId}` +
      `5204000053033685802BO5910SimpleCite6004Tarija` +
      `54${params.amount.toFixed(2)}6304STUB`;

    this.logger.log(
      {
        event: 'qrsimple.stub.charge',
        providerPaymentId,
        amount: params.amount,
        reference: params.reference,
      },
      'QrSimpleClient',
    );

    return {
      providerPaymentId,
      qrPayload,
      expiresAt: new Date(Date.now() + params.expiresInMinutes * 60_000),
    };
  }

  // ─── Modo REAL (con resiliencia) ───────────────────────────────────

  private async createChargeReal(params: CreateChargeParams): Promise<CreateChargeResult> {
    this.assertCircuitClosed();

    let lastErr: Error | undefined;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        const result = await this.doCreateChargeRequest(params);
        this.recordSuccess();
        return result;
      } catch (err) {
        lastErr = err as Error;
        this.logger.warn(
          { event: 'qrsimple.charge.attempt-failed', attempt, err: lastErr.message },
          'QrSimpleClient',
        );
        this.recordFailure();
        if (attempt < this.maxAttempts) {
          // Back-off exponencial: 500ms, 1s, 2s
          await this.sleep(500 * 2 ** (attempt - 1));
        }
      }
    }

    throw new ServiceUnavailableException(
      `No se pudo crear el cobro tras ${this.maxAttempts} intentos: ${lastErr?.message}`,
    );
  }

  private async doCreateChargeRequest(params: CreateChargeParams): Promise<CreateChargeResult> {
    const body = JSON.stringify({
      amount: params.amount,
      currency: params.currency,
      reference: params.reference,
      description: params.description,
      expiresInMinutes: params.expiresInMinutes,
    });

    // Firma HMAC del body con la API key (esquema típico; ajustar al real).
    const signature = createHmac('sha256', this.apiKey!).update(body).digest('hex');

    const res = await fetch(`${this.apiUrl}/charges`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        'X-Signature': signature,
      },
      body,
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!res.ok) {
      throw new Error(`QR Simple respondió ${res.status}`);
    }

    const data = (await res.json()) as {
      id: string;
      qr: string;
      expiresAt: string;
    };

    return {
      providerPaymentId: data.id,
      qrPayload: data.qr,
      expiresAt: new Date(data.expiresAt),
    };
  }

  // ─── Circuit breaker ───────────────────────────────────────────────

  private assertCircuitClosed() {
    if (Date.now() < this.circuitOpenUntil) {
      throw new ServiceUnavailableException(
        'Pasarela de pagos temporalmente no disponible (circuit breaker abierto)',
      );
    }
  }

  private recordSuccess() {
    this.consecutiveFailures = 0;
    this.circuitOpenUntil = 0;
  }

  private recordFailure() {
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= this.failureThreshold) {
      this.circuitOpenUntil = Date.now() + this.cooldownMs;
      this.logger.error(
        { event: 'qrsimple.circuit.open', cooldownMs: this.cooldownMs },
        'QrSimpleClient: circuit breaker ABIERTO',
      );
    }
  }

  private sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }
}
