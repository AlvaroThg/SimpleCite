import { Module } from '@nestjs/common';
import { WhatsappCloudService } from './application/services/whatsapp-cloud.service';
import { WhatsappCloudController } from './infrastructure/adapters/whatsapp-cloud.controller';

/**
 * Integración con la WhatsApp Cloud API oficial de Meta (bot centralizado).
 * Independiente del módulo Baileys legacy (`WhatsappModule`).
 *
 * Exporta WhatsappCloudService para que otros módulos (p.ej. AppointmentsModule)
 * envíen notificaciones salientes.
 */
@Module({
  controllers: [WhatsappCloudController],
  providers: [WhatsappCloudService],
  exports: [WhatsappCloudService],
})
export class WhatsappCloudModule {}
