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

@Controller('schedule')
export class ScheduleController {
  constructor(private readonly scheduleService: ScheduleService) {}

  // â”€â”€â”€â”€â”€ Reglas semanales â”€â”€â”€â”€â”€

  @Get('doctors/:doctorId/rules')
  async listRules(@CurrentUser('tenantId') tenantId: string, @Param('doctorId') doctorId: string) {
    const rules = await this.scheduleService.listRules(tenantId, doctorId);
    return { success: true, data: rules };
  }

  @Roles('ADMIN', 'DOCTOR')
  @Put('doctors/:doctorId/rules')
  async replaceRules(
    @CurrentUser('tenantId') tenantId: string,
    @Param('doctorId') doctorId: string,
    @Body(new ZodValidationPipe(ReplaceScheduleRulesSchema)) dto: ReplaceScheduleRulesDto,
  ) {
    const rules = await this.scheduleService.replaceRules(tenantId, doctorId, dto);
    return { success: true, data: rules };
  }

  // â”€â”€â”€â”€â”€ Bloqueos puntuales â”€â”€â”€â”€â”€

  @Roles('ADMIN', 'DOCTOR')
  @Post('doctors/:doctorId/blocks')
  async createBlock(
    @CurrentUser('tenantId') tenantId: string,
    @Param('doctorId') doctorId: string,
    @Body(new ZodValidationPipe(CreateScheduleBlockSchema)) dto: CreateScheduleBlockDto,
  ) {
    const block = await this.scheduleService.createBlock(tenantId, doctorId, dto);
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
  async deleteBlock(@CurrentUser('tenantId') tenantId: string, @Param('blockId') blockId: string) {
    return this.scheduleService.deleteBlock(tenantId, blockId);
  }
}
