import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Decorator para inyectar la sesión del paciente en endpoints públicos
 * protegidos por PatientSessionGuard.
 *
 * Uso:
 *   @Post()
 *   @UseGuards(PatientSessionGuard)
 *   create(@CurrentPatient() patient: { phone: string; tenantId: string }) { ... }
 *
 *   @Post()
 *   @UseGuards(PatientSessionGuard)
 *   create(@CurrentPatient('phone') phone: string) { ... }
 */
export const CurrentPatient = createParamDecorator(
  (data: 'phone' | 'tenantId' | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const patient = request.patient;
    if (data) return patient?.[data];
    return patient;
  },
);
