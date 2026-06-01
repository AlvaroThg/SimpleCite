import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

import { InstanceManagerService } from './application/services/instance-manager.service';
import { WaMessageService } from './application/services/wa-message.service';
import { WaBotService } from './application/services/wa-bot.service';
import { WhatsappHealthService } from './application/services/whatsapp-health.service';
import { WhatsappAdminController } from './infrastructure/adapters/whatsapp-admin.controller';
import { WhatsappInternalController } from './infrastructure/adapters/whatsapp-internal.controller';

/**
 * WhatsappModule — Orquestador de instancias Baileys por tenant.
 *
 * Exporta:
 *   - InstanceManagerService → para que otros módulos puedan crear/consultar instancias
 *   - WaMessageService       → para enviar mensajes (OTP, notificaciones, bot)
 *
 * Requiere en AppModule:
 *   - ScheduleModule.forRoot() para el @Cron de health checks
 *   - Que el Docker socket esté montado en el contenedor del API
 */
@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [WhatsappAdminController, WhatsappInternalController],
  providers: [InstanceManagerService, WaMessageService, WaBotService, WhatsappHealthService],
  exports: [InstanceManagerService, WaMessageService],
})
export class WhatsappModule {}
