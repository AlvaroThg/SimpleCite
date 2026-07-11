/**
 * Smoke test del canal de mensajería: levanta el contexto de la app (sin HTTP)
 * y dispara una confirmación de cita real por el puerto MESSAGING_SERVICE,
 * exactamente como lo hace appointments.service.
 *
 *   npx tsx scripts/telegram-smoke.ts <chatId> [nombre]
 *
 * Requiere TELEGRAM_BOT_TOKEN y MESSAGING_PROVIDER=telegram en el entorno
 * (.env.development.local). No corre en paralelo con el API dev: dos procesos
 * no pueden hacer polling del mismo bot.
 */
import '../src/common/config/load-env';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { MESSAGING_SERVICE, type IMessagingService } from '../src/modules/messaging/messaging.port';

async function main() {
  const [chatId, nombre = 'Paciente de Prueba'] = process.argv.slice(2);
  if (!chatId) {
    console.error('Uso: npx tsx scripts/telegram-smoke.ts <chatId> [nombre]');
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule);
  const messaging = app.get<IMessagingService>(MESSAGING_SERVICE);

  const mañana = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await messaging.sendAppointmentConfirmation(
    chatId,
    nombre,
    'Dr. Bryan (prueba)',
    mañana,
    'token-de-prueba-no-valido',
  );

  console.log(`Confirmación de cita enviada al chat ${chatId}.`);
  // En app-context el bot no lanza polling; nestjs-telegraf igual intenta
  // bot.stop() al cerrar y tira "Bot is not running!" — no es un fallo real.
  await app.close().catch(() => undefined);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
