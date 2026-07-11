import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StorageService } from '../../common/services/storage.service';
import { SlotsModule } from '../slots/slots.module';
import { PatientsModule } from '../patients/patients.module';
import { ConversationEngine } from './application/services/conversation-engine.service';

/**
 * Motor conversacional de reservas, agnóstico del canal.
 *
 * No conoce Telegram ni WhatsApp: los adaptadores de canal (TelegramService
 * hoy, WhatsApp Cloud después) traducen sus updates a BotInbound, llaman a
 * ConversationEngine.handle() y renderizan los BotOutbound. Por eso este
 * módulo no depende de MessagingModule (y no hay ciclo).
 */
@Module({
  imports: [ConfigModule, SlotsModule, PatientsModule],
  providers: [ConversationEngine, StorageService],
  exports: [ConversationEngine],
})
export class BotModule {}
