import { Controller, Get, Post, Delete, Put, Body, Param, Query } from '@nestjs/common';
import {
  ReplaceScheduleRulesSchema,
  CreateScheduleBlockSchema,
  type ReplaceScheduleRulesDto,
  type CreateScheduleBlockDto,
} from '@simplecite/shared';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../../common/pipes/zod-validation.pipe';
import { ScheduleService } from '../../application/services/schedule.service';

/**
 * Agenda de disponibilidad por especialista.
 *
 * Lectura abierta dentro de la clínica (recepción necesita ver quién atiende
 * cuándo). Escritura scopeada: el `requester` sale del JWT y el service exige
 * que un DOCTOR solo toque su propia agenda — el `:doctorId` de la ruta lo
 * elige el cliente y por sí solo no es autoridad.
 */
@Controller('schedule')
export class ScheduleController {
  constructor(private readonly scheduleService: ScheduleService) {}

  // ───── Reglas semanales ─────

  @Get('doctors/:doctorId/rules')
  async listRules(@CurrentUser('tenantId') tenantId: string, @Param('doctorId') doctorId: string) {
    const rules = await this.scheduleService.listRules(tenantId, doctorId);
    return { success: true, data: rules };
  }

  @Roles('ADMIN', 'DOCTOR')
  @Put('doctors/:doctorId/rules')
  async replaceRules(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser() user: { sub: string; role: string },
    @Param('doctorId') doctorId: string,
    @Body(new ZodValidationPipe(ReplaceScheduleRulesSchema)) dto: ReplaceScheduleRulesDto,
  ) {
    const rules = await this.scheduleService.replaceRules(tenantId, doctorId, dto, {
      userId: user.sub,
      role: user.role,
    });
    return { success: true, data: rules };
  }

  // ───── Bloqueos puntuales ─────

  @Roles('ADMIN', 'DOCTOR')
  @Post('doctors/:doctorId/blocks')
  async createBlock(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser() user: { sub: string; role: string },
    @Param('doctorId') doctorId: string,
    @Body(new ZodValidationPipe(CreateScheduleBlockSchema)) dto: CreateScheduleBlockDto,
  ) {
    const block = await this.scheduleService.createBlock(tenantId, doctorId, dto, {
      userId: user.sub,
      role: user.role,
    });
    return { success: true, data: block };
  }

  @Get('doctors/:doctorId/blocks')
  async listBlocks(
    @CurrentUser('tenantId') tenantId: string,
    @Param('doctorId') doctorId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const blocks = await this.scheduleService.listBlocks(tenantId, doctorId, {
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
    return { success: true, data: blocks };
  }

  @Roles('ADMIN', 'DOCTOR')
  @Delete('blocks/:blockId')
  async deleteBlock(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser() user: { sub: string; role: string },
    @Param('blockId') blockId: string,
  ) {
    return this.scheduleService.deleteBlock(tenantId, blockId, {
      userId: user.sub,
      role: user.role,
    });
  }
}
