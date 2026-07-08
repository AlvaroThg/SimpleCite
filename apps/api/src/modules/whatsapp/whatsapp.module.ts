import { Module } from '@nestjs/common';

import { BillingModule } from '../billing/billing.module';
import { StorageService } from '../../common/services/storage.service';
import { InstanceManagerService } from './application/services/instance-manager.service';
import { WaMessageService } from './application/services/wa-message.service';
import { WaBotService } from './application/services/wa-bot.service';
import { WhatsappHealthService } from './application/services/whatsapp-health.service';
import { WaReminderService } from './application/services/wa-reminder.service';
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
 *   - ScheduleModule.forRoot() (registrado allí, global) para los @Cron
 *
 * Este módulo se carga SOLO con ENABLE_WHATSAPP=true (ver AppModule).
 *   - Que el Docker socket esté montado en el contenedor del API
 */
@Module({
  imports: [BillingModule],
  controllers: [WhatsappAdminController, WhatsappInternalController],
  providers: [
    StorageService,
    InstanceManagerService,
    WaMessageService,
    WaBotService,
    WhatsappHealthService,
    WaReminderService,
  ],
  exports: [InstanceManagerService, WaMessageService],
})
export class WhatsappModule {}
