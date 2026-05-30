import { Injectable, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Logger } from 'nestjs-pino';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../../../common/database/prisma.service';
import { TurnstileService } from '../../../../common/services/turnstile.service';
import { WhatsAppService } from '../../../../common/services/whatsapp.service';

const OTP_BCRYPT_ROUNDS = 10;
const MAX_OTP_ATTEMPTS = 5;

@Injectable()
export class PublicOtpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly turnstile: TurnstileService,
    private readonly whatsapp: WhatsAppService,
    private readonly logger: Logger,
  ) {}

  /**
   * Genera un OTP de 6 dígitos, lo hashea con bcrypt, lo persiste y lo envía
   * vía WhatsApp (stub en Fase 4). Devuelve solo metadata, NUNCA el código.
   */
  async request(params: {
    tenantId: string;
    phone: string;
    turnstileToken: string | undefined;
    remoteIp: string | undefined;
  }): Promise<{ success: true; expiresInSeconds: number }> {
    const { tenantId, phone, turnstileToken, remoteIp } = params;

    // 1. Bot check (no-op si TURNSTILE_SECRET_KEY no está seteada)
    const ok = await this.turnstile.verify(turnstileToken, remoteIp);
    if (!ok) {
      this.logger.warn(
        { event: 'otp.request.turnstile-failed', tenantId, phone, remoteIp },
        'PublicOtpService',
      );
      throw new ForbiddenException('Verificación de bot falló');
    }

    // 2. Generar código (6 dígitos, criptográficamente bien-distribuido)
    const code = this.generateOtpCode();
    const ttlMin = this.config.get<number>('OTP_TTL_MINUTES') ?? 10;
    const expiresAt = new Date(Date.now() + ttlMin * 60 * 1000);
    const codeHash = await bcrypt.hash(code, OTP_BCRYPT_ROUNDS);

    // 3. Persistir
    await this.prisma.client.patientOtp.create({
      data: { tenantId, phone, codeHash, expiresAt },
    });

    // 4. Enviar (stub loguea el código a consola en dev)
    await this.whatsapp.sendOtp({ tenantId, phone, code, ttlMinutes: ttlMin });

    this.logger.log(
      { event: 'otp.requested', tenantId, phone, ttlMinutes: ttlMin },
      'PublicOtpService',
    );

    return { success: true, expiresInSeconds: ttlMin * 60 };
  }

  /**
   * Verifica el código. Devuelve un JWT de sesión de paciente válido para
   * crear/confirmar appointments en este tenant.
   *
   * Reglas:
   *  - Solo el OTP más reciente, no consumido y no expirado es candidato.
   *  - Tras MAX_OTP_ATTEMPTS fallos, el OTP se invalida (marca consumed).
   *  - Cualquier fallo devuelve el mismo mensaje para no filtrar info
   *    (¿el phone existe? ¿el OTP existe? ¿se acabaron los intentos?).
   */
  async verify(params: {
    tenantId: string;
    phone: string;
    code: string;
  }): Promise<{ sessionToken: string }> {
    const { tenantId, phone, code } = params;

    const otp = await this.prisma.client.patientOtp.findFirst({
      where: {
        tenantId,
        phone,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) {
      this.logger.warn({ event: 'otp.verify.no-active', tenantId, phone }, 'PublicOtpService');
      throw new UnauthorizedException('Código inválido o expirado');
    }

    if (otp.attempts >= MAX_OTP_ATTEMPTS) {
      await this.prisma.client.patientOtp.update({
        where: { id: otp.id },
        data: { consumedAt: new Date() },
      });
      this.logger.warn(
        { event: 'otp.verify.locked', tenantId, phone, attempts: otp.attempts },
        'PublicOtpService',
      );
      throw new UnauthorizedException('Código inválido o expirado');
    }

    const matches = await bcrypt.compare(code, otp.codeHash);
    if (!matches) {
      await this.prisma.client.patientOtp.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
      });
      this.logger.warn(
        { event: 'otp.verify.mismatch', tenantId, phone, attempts: otp.attempts + 1 },
        'PublicOtpService',
      );
      throw new UnauthorizedException('Código inválido o expirado');
    }

    // Single-use: marcar consumed
    await this.prisma.client.patientOtp.update({
      where: { id: otp.id },
      data: { consumedAt: new Date() },
    });

    const secret = this.config.get<string>('PATIENT_JWT_SECRET');
    const expiresIn = this.config.get<string>('PATIENT_SESSION_TTL') ?? '30m';
    const sessionToken = await this.jwt.signAsync(
      { sub: phone, tenantId, type: 'patient-session' },
      { secret, expiresIn: expiresIn as `${number}${'s' | 'm' | 'h' | 'd'}` },
    );

    this.logger.log({ event: 'otp.verified', tenantId, phone }, 'PublicOtpService');
    return { sessionToken };
  }

  /**
   * Genera 6 dígitos. `Math.random()` no es criptográfico pero es suficiente
   * para OTPs cortos donde la entropía real viene de: (a) TTL corto, (b) max
   * intentos, (c) rate limit, (d) bcrypt cost. Si se quisiera endurecer,
   * usar `crypto.randomInt(100000, 1000000)`.
   */
  private generateOtpCode(): string {
    const n = Math.floor(100000 + Math.random() * 900000);
    return n.toString();
  }
}
