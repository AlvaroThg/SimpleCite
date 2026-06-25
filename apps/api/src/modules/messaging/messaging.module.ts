import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TelegrafModule } from 'nestjs-telegraf';
import { WhatsappCloudModule } from '../whatsapp-cloud/whatsapp-cloud.module';
import { WhatsappCloudService } from '../whatsapp-cloud/application/services/whatsapp-cloud.service';
import { TelegramService } from './telegram.service';
import { MESSAGING_SERVICE, type IMessagingService } from './messaging.port';

/**
 * Mensajería al paciente (Ports & Adapters). Expone el puerto `MESSAGING_SERVICE`
 * resuelto al adaptador activo:
 *   - Telegram (pruebas del MVP): si hay TELEGRAM_BOT_TOKEN.
 *   - WhatsApp Cloud (producción): por defecto / cuando MESSAGING_PROVIDER=whatsapp.
 *
 * El bot de Telegram (TelegrafModule, polling) solo se carga si hay token, para
 * no romper el arranque en entornos sin Telegram. Cambiar de canal = cambiar la
 * env `MESSAGING_PROVIDER`, sin tocar el dominio de citas.
 */
const telegramEnabled = !!process.env.TELEGRAM_BOT_TOKEN;

@Module({
  imports: [
    ConfigModule,
    WhatsappCloudModule,
    ...(telegramEnabled
      ? [
          TelegrafModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (config: ConfigService) => ({
              token: config.get<string>('TELEGRAM_BOT_TOKEN') as string,
              // Polling por defecto (sin launchOptions.webhook) — ideal en local.
            }),
          }),
        ]
      : []),
  ],
  providers: [
    ...(telegramEnabled ? [TelegramService] : []),
    {
      provide: MESSAGING_SERVICE,
      inject: [ConfigService, WhatsappCloudService, ...(telegramEnabled ? [TelegramService] : [])],
      useFactory: (
        config: ConfigService,
        whatsapp: WhatsappCloudService,
        telegram?: TelegramService,
      ): IMessagingService => {
        const provider =
          config.get<string>('MESSAGING_PROVIDER') ?? (telegramEnabled ? 'telegram' : 'whatsapp');
        return provider === 'telegram' && telegram ? telegram : whatsapp;
      },
    },
  ],
  exports: [MESSAGING_SERVICE],
})
export class MessagingModule {}
