/**
 * Contratos del motor conversacional, agnósticos del canal.
 *
 * Telegram (hoy) y WhatsApp Cloud (después) traducen sus updates a BotInbound
 * y renderizan los BotOutbound con sus propios widgets (inline keyboards /
 * interactive buttons). Límites de diseño pensados para Meta: máximo ~10
 * opciones por lista y textos de botón cortos.
 */

export type BotChannel = 'telegram' | 'whatsapp';

export interface BotInbound {
  channel: BotChannel;
  /// chatId de Telegram; phone E.164 sin '+' en WhatsApp.
  chatId: string;
  /// Texto libre escrito por el paciente.
  text?: string;
  /// Data del botón tocado (callback_query / interactive reply).
  callback?: string;
  /// Payload del deep link (t.me/bot?start=<slug> · wa.me con texto prellenado).
  startPayload?: string;
  /// Foto enviada por el paciente (comprobante de pago). El adaptador de canal
  /// ya descargó los bytes; el motor decide qué hacer con ellos.
  photo?: { buffer: Buffer; mimeType: string };
}

export interface BotButton {
  label: string;
  data: string;
}

export interface BotOutbound {
  text: string;
  /// Filas de botones. Ausente = mensaje plano.
  buttons?: BotButton[][];
  /// Foto adjunta (el texto va como caption): fachada de la clínica, QR, etc.
  imageUrl?: string;
}

/** Pasos del wizard. Persisten en BotConversation.step. */
export type BotStep =
  | 'IDLE'
  | 'CHOOSING_CLINIC'
  | 'SEARCHING_CLINIC'
  | 'MAIN_MENU'
  | 'REGISTERING_NAME'
  | 'CHOOSING_DOCTOR'
  | 'CHOOSING_SERVICE'
  | 'CHOOSING_WEEK'
  | 'CHOOSING_DAY'
  | 'CHOOSING_SLOT'
  | 'CHOOSING_PAYMENT'
  | 'AWAITING_RECEIPT';

/** Estado acumulado del wizard. Persiste en BotConversation.data (JSONB). */
export interface ConvData {
  /// Nombre completo del paciente (del registro o del Patient existente).
  name?: string;
  doctorId?: string;
  doctorName?: string;
  serviceId?: string;
  serviceName?: string;
  /// Precio congelado (Bs) y duración del servicio elegido.
  price?: string;
  durationMin?: number;
  /// Semana elegida (yyyy-MM-dd del lunes, en timezone del tenant).
  weekIso?: string;
  /// Día elegido (yyyy-MM-dd en timezone del tenant).
  dayIso?: string;
  /// Paginación de horarios dentro del día.
  slotPage?: number;
  /// Cita TENTATIVE creada, esperando método de pago.
  appointmentId?: string;
  /// Cita existente que se está reprogramando (el pago viaja con ella): el
  /// wizard de día/hora corre igual, pero al final se MUEVE en vez de crear.
  rescheduleId?: string;
  /// Comprobante huérfano ya subido a R2 (una copia por tenant candidato,
  /// en `<slug>/receipts`), esperando saber a qué cita adjuntarlo.
  pendingReceipts?: Record<string, string>;
}
