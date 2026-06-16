import { Controller, Post, Param, BadRequestException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CancellationTokenSchema } from '@simplecite/shared';
import { Public } from '../../../../common/decorators';
import { AppointmentsService } from '../../../appointments/application/services/appointments.service';

/**
 * Cancelación pública de una cita por magic link. Sin autenticación: el token
 * (64 hex chars) ES el secreto y identifica unívocamente la cita.
 *
 *   POST /api/public/appointments/cancel/:token
 *
 * No requiere slug de tenant — el token resuelve la cita en cualquier clínica.
 * Rate limit por IP para evitar fuerza bruta de tokens.
 */
@Public()
@Controller('public/appointments')
export class PublicCancellationController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Post('cancel/:token')
  @Throttle({ default: { limit: 20, ttl: 60 * 60 * 1000 } })
  async cancel(@Param('token') token: string) {
    const parsed = CancellationTokenSchema.safeParse(token);
    if (!parsed.success) {
      // Formato inválido → mismo mensaje que "no encontrado" para no filtrar
      // si un token existe o no.
      throw new BadRequestException('Enlace de cancelación inválido');
    }
    const result = await this.appointments.cancelByToken(parsed.data);
    return { success: true, data: result };
  }
}
