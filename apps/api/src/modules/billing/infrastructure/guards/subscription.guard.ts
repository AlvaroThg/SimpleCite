import {
  CanActivate,
  ExecutionContext,
  Injectable,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../../../../common/database/prisma.service';

/**
 * Protege rutas que requieren una suscripción vigente.
 *
 * Lanza 402 Payment Required si:
 *   - el usuario no tiene tenant asociado,
 *   - el `subscriptionStatus` es PAST_DUE o CANCELED, o
 *   - `subscriptionEndDate` ya pasó (vencida).
 *
 * NO se registra como guard global: se aplica con `@UseGuards(SubscriptionGuard)`
 * sobre los controllers/rutas "premium" que se quieran bloquear sin pago.
 * (TRIAL con endDate nulo se permite — el período de prueba sigue activo.)
 */
@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: { tenantId?: string }; tenantId?: string }>();
    const tenantId = req.user?.tenantId ?? req.tenantId;

    if (!tenantId) {
      throw new HttpException('No hay tenant asociado al usuario', HttpStatus.PAYMENT_REQUIRED);
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { subscriptionStatus: true, subscriptionEndDate: true },
    });
    if (!tenant) {
      throw new HttpException('Tenant no encontrado', HttpStatus.PAYMENT_REQUIRED);
    }

    const expired = tenant.subscriptionEndDate
      ? tenant.subscriptionEndDate.getTime() < Date.now()
      : false;

    if (
      tenant.subscriptionStatus === 'PAST_DUE' ||
      tenant.subscriptionStatus === 'CANCELED' ||
      expired
    ) {
      throw new HttpException(
        {
          statusCode: HttpStatus.PAYMENT_REQUIRED,
          error: 'Payment Required',
          message: 'Tu suscripción está vencida o inactiva. Renueva tu plan para continuar.',
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    return true;
  }
}
