import { Controller, Get, Query } from '@nestjs/common';
import { SlotsQuerySchema, type SlotsQueryDto } from '@simplecite/shared';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe';
import type { SlotsService } from '../../application/services/slots.service';

@Controller('slots')
export class SlotsController {
  constructor(private readonly slotsService: SlotsService) {}

  /**
   * GET /api/slots?doctorId=...&serviceId=...&from=...&to=...
   * Retorna los slots de disponibilidad del doctor en el rango.
   * Usado por staff, doctores y por el Web Booking portal (vía un endpoint público en otra fase).
   */
  @Get()
  async generate(
    @CurrentUser('tenantId') tenantId: string,
    @Query(new ZodValidationPipe(SlotsQuerySchema)) query: SlotsQueryDto,
  ) {
    const slots = await this.slotsService.generate(tenantId, query);
    return { success: true, data: slots };
  }
}
