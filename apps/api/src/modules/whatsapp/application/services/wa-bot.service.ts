import { Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { addDays, format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../../../common/database/prisma.service';
import { WaMessageService } from './wa-message.service';

// ─── Contexto JSON guardado en wa_conversations.context ───────────────

interface BotContext {
  doctorId?: string;
  doctorName?: string;
  serviceId?: string;
  serviceName?: string;
  serviceDuration?: number;
  selectedDate?: string;
  slotStart?: string;
  slotEnd?: string;
  slotLabel?: string;
  patientName?: string;
  doctorList?: { id: string; name: string; specialty?: string | null }[];
  serviceList?: { id: string; name: string; price: string; duration: number }[];
  dateList?: { label: string; date: string }[];
  slotList?: { start: string; end: string; label: string }[];
}

const CONVERSATION_TTL_MS = 30 * 60 * 1000;
const OTP_BCRYPT_ROUNDS = 10;
const OTP_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class WaBotService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly waMessage: WaMessageService,
    private readonly logger: Logger,
  ) {}

  async handleMessage(params: {
    tenantId: string;
    instanceId: string;
    tenantSlug: string;
    phone: string;
    text: string;
    timezone: string;
  }) {
    const { tenantId, instanceId, tenantSlug, phone, text, timezone } = params;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + CONVERSATION_TTL_MS);

    let conv = await this.prisma.waConversation.findUnique({
      where: { tenantId_phone: { tenantId, phone } },
    });

    if (!conv || conv.expiresAt < now) {
      if (conv) await this.prisma.waConversation.delete({ where: { id: conv.id } });
      conv = await this.prisma.waConversation.create({
        data: { tenantId, instanceId, phone, state: 'IDLE', context: {}, expiresAt },
      });
    }

    const ctx = (conv.context ?? {}) as BotContext;
    const input = text.trim().toLowerCase();

    let reply: string;
    let nextState: string = conv.state as string;
    let nextCtx: BotContext = ctx;

    try {
      if (['cancelar', 'cancel', 'salir'].includes(input)) {
        reply = '👋 Reserva cancelada. Escribe *hola* cuando quieras agendar.';
        nextState = 'IDLE';
        nextCtx = {};
      } else {
        ({ reply, nextState, nextCtx } = await this.dispatch(conv.state, input, text, ctx, {
          tenantId,
          phone,
          timezone,
        }));
      }
    } catch (err) {
      reply = '❌ Ocurrió un error. Escribe *hola* para intentar de nuevo.';
      nextState = 'IDLE';
      nextCtx = {};
      this.logger.error(
        { event: 'wa.bot.error', err: (err as Error).message, phone },
        'WaBotService',
      );
    }

    await this.prisma.waConversation.update({
      where: { id: conv.id },
      data: { state: nextState as never, context: nextCtx as never, lastMessageAt: now, expiresAt },
    });

    await this.waMessage.send({
      tenantId,
      tenantSlug,
      messageKey: `bot:${tenantId}:${phone}:${now.getTime()}`,
      phone,
      text: reply,
    });

    this.logger.log(
      { event: 'wa.bot.step', phone, from: conv.state, to: nextState },
      'WaBotService',
    );
  }

  // ─── Dispatcher ──────────────────────────────────────────────────

  private async dispatch(
    state: string,
    input: string,
    raw: string,
    ctx: BotContext,
    meta: { tenantId: string; phone: string; timezone: string },
  ): Promise<{ reply: string; nextState: string; nextCtx: BotContext }> {
    switch (state) {
      case 'IDLE':
      case 'COMPLETED':
        return this.showDoctors(meta.tenantId);
      case 'AWAITING_DOCTOR':
        return this.selectDoctor(input, ctx, meta.tenantId);
      case 'AWAITING_SERVICE':
        return this.selectService(input, ctx);
      case 'AWAITING_DATE':
        return this.selectDate(input, ctx, meta.tenantId, meta.timezone);
      case 'AWAITING_SLOT':
        return this.selectSlot(input, ctx, meta.phone, meta.tenantId);
      case 'AWAITING_NAME':
        return this.enterName(raw, ctx, meta.tenantId, meta.phone);
      case 'AWAITING_OTP':
        return this.verifyOtp(input, ctx, meta.tenantId, meta.phone);
      default:
        return this.showDoctors(meta.tenantId);
    }
  }

  // ─── Steps ───────────────────────────────────────────────────────

  private async showDoctors(tenantId: string) {
    const doctors = await this.prisma.user.findMany({
      where: { tenantId, role: 'DOCTOR', isActive: true },
      select: { id: true, name: true, doctorProfile: { select: { specialty: true } } },
      orderBy: { name: 'asc' },
    });

    if (!doctors.length) {
      return {
        reply: '⚠️ No hay doctores disponibles. Contacta directamente a la clínica.',
        nextState: 'IDLE',
        nextCtx: {},
      };
    }

    const doctorList = doctors.map((d) => ({
      id: d.id,
      name: d.name,
      specialty: d.doctorProfile?.specialty ?? null,
    }));
    const lines = doctorList.map(
      (d, i) => `  *${i + 1}.* ${d.name}${d.specialty ? ` (${d.specialty})` : ''}`,
    );

    return {
      reply: `👋 ¡Hola! Soy el asistente de reservas.\n\n*¿Con qué doctor deseas tu cita?*\n\n${lines.join('\n')}\n\nResponde con el número o escribe *cancelar*.`,
      nextState: 'AWAITING_DOCTOR',
      nextCtx: { doctorList },
    };
  }

  private async selectDoctor(input: string, ctx: BotContext, tenantId: string) {
    const list = ctx.doctorList ?? [];
    const doc = this.pickByIndex(input, list);
    if (!doc)
      return this.invalidOption(
        list.map((d, i) => `  *${i + 1}.* ${d.name}`),
        'AWAITING_DOCTOR',
        ctx,
      );

    const links = await this.prisma.doctorService.findMany({
      where: { doctorId: doc.id, tenantId, isActive: true },
      select: {
        service: { select: { id: true, name: true, price: true, duration: true } },
        customDuration: true,
        customPrice: true,
      },
    });

    if (!links.length) {
      return {
        reply: `⚠️ ${doc.name} no tiene servicios disponibles. Escribe *hola* para elegir otro doctor.`,
        nextState: 'IDLE',
        nextCtx: {},
      };
    }

    const serviceList = links.map((l) => ({
      id: l.service.id,
      name: l.service.name,
      price: String(l.customPrice ?? l.service.price),
      duration: l.customDuration ?? l.service.duration,
    }));
    const lines = serviceList.map(
      (s, i) => `  *${i + 1}.* ${s.name} — Bs ${s.price} · ${s.duration} min`,
    );

    return {
      reply: `✅ *${doc.name}*\n\n*¿Qué servicio necesitas?*\n\n${lines.join('\n')}\n\nResponde con el número.`,
      nextState: 'AWAITING_SERVICE',
      nextCtx: { ...ctx, doctorId: doc.id, doctorName: doc.name, serviceList },
    };
  }

  private selectService(input: string, ctx: BotContext) {
    const list = ctx.serviceList ?? [];
    const svc = this.pickByIndex(input, list);
    if (!svc)
      return this.invalidOption(
        list.map((s, i) => `  *${i + 1}.* ${s.name}`),
        'AWAITING_SERVICE',
        ctx,
      );

    const today = new Date();
    const dateList = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(today, i);
      return {
        date: format(d, 'yyyy-MM-dd'),
        label: i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : format(d, 'EEEE dd/MM'),
      };
    });
    const lines = dateList.map((d, i) => `  *${i + 1}.* ${d.label}`);

    return {
      reply: `✅ *${svc.name}*\n\n*¿Qué día prefieres?*\n\n${lines.join('\n')}\n\nResponde con el número.`,
      nextState: 'AWAITING_DATE',
      nextCtx: {
        ...ctx,
        serviceId: svc.id,
        serviceName: svc.name,
        serviceDuration: svc.duration,
        dateList,
      },
    } as { reply: string; nextState: string; nextCtx: BotContext };
  }

  private async selectDate(input: string, ctx: BotContext, tenantId: string, timezone: string) {
    const list = ctx.dateList ?? [];
    const day = this.pickByIndex(input, list);
    if (!day)
      return this.invalidOption(
        list.map((d, i) => `  *${i + 1}.* ${d.label}`),
        'AWAITING_DATE',
        ctx,
      );

    // Cargar slots directamente (sin estado intermedio)
    return this.loadSlotsStep({ ...ctx, selectedDate: day.date }, tenantId, timezone);
  }

  private async loadSlotsStep(ctx: BotContext, tenantId: string, timezone: string) {
    const { doctorId, serviceId, serviceDuration, selectedDate } = ctx;
    if (!doctorId || !serviceId || !selectedDate) {
      return { reply: 'Error interno. Escribe *hola*.', nextState: 'IDLE', nextCtx: {} };
    }

    const dateStart = new Date(`${selectedDate}T00:00:00.000Z`);
    const dayOfWeek = new Date(`${selectedDate}T12:00:00Z`).getDay();
    const duration = serviceDuration ?? 30;
    const now = new Date();

    const [rules, existing] = await Promise.all([
      this.prisma.doctorScheduleRule.findMany({
        where: { tenantId, doctorId, dayOfWeek, isActive: true },
        orderBy: { startMinute: 'asc' },
      }),
      this.prisma.appointment.findMany({
        where: {
          tenantId,
          doctorId,
          status: { in: ['TENTATIVE', 'PENDING_PAYMENT', 'CONFIRMED'] },
          startTime: { gte: dateStart },
          endTime: { lt: new Date(dateStart.getTime() + 86_400_000) },
        },
        select: { startTime: true, endTime: true },
      }),
    ]);

    if (!rules.length) {
      return {
        reply: '😔 El doctor no trabaja ese día. Escribe *cancelar* y elige otra fecha.',
        nextState: 'AWAITING_DATE',
        nextCtx: ctx,
      };
    }

    const slots: { start: string; end: string; label: string }[] = [];
    for (const rule of rules) {
      let cur = rule.startMinute;
      while (cur + duration <= rule.endMinute) {
        const start = new Date(dateStart.getTime() + cur * 60_000);
        const end = new Date(start.getTime() + duration * 60_000);
        if (start > now && !existing.some((e) => start < e.endTime && end > e.startTime)) {
          const local = toZonedTime(start, timezone);
          slots.push({
            start: start.toISOString(),
            end: end.toISOString(),
            label: `${String(local.getHours()).padStart(2, '0')}:${String(local.getMinutes()).padStart(2, '0')}`,
          });
        }
        cur += duration;
      }
    }

    if (!slots.length) {
      return {
        reply: '😔 No hay turnos disponibles ese día. Escribe *cancelar* para elegir otra fecha.',
        nextState: 'AWAITING_DATE',
        nextCtx: ctx,
      };
    }

    const shown = slots.slice(0, 10);
    const lines = shown.map((s, i) => `  *${i + 1}.* ${s.label}`);
    return {
      reply: `🕐 *Horarios disponibles:*\n\n${lines.join('\n')}\n\nResponde con el número.`,
      nextState: 'AWAITING_SLOT',
      nextCtx: { ...ctx, slotList: shown },
    };
  }

  private async selectSlot(input: string, ctx: BotContext, phone: string, tenantId: string) {
    const list = ctx.slotList ?? [];
    const slot = this.pickByIndex(input, list);
    if (!slot)
      return this.invalidOption(
        list.map((s, i) => `  *${i + 1}.* ${s.label}`),
        'AWAITING_SLOT',
        ctx,
      );

    const nextCtx: BotContext = {
      ...ctx,
      slotStart: slot.start,
      slotEnd: slot.end,
      slotLabel: slot.label,
    };

    // Si ya conocemos el nombre, pedir OTP; si no, pedir nombre
    const patient = await this.prisma.patient.findUnique({
      where: { phone_tenantId: { phone, tenantId } },
      select: { name: true },
    });

    if (patient?.name) {
      await this.issueOtp(tenantId, phone);
      return {
        reply: `📅 *${slot.label}* seleccionado.\n\nHola *${patient.name}*, te enviamos un código de verificación.\n*Escribe el código de 6 dígitos:*`,
        nextState: 'AWAITING_OTP',
        nextCtx: { ...nextCtx, patientName: patient.name },
      };
    }

    return {
      reply: `📅 *${slot.label}* seleccionado.\n\n¿Cuál es tu *nombre completo*?`,
      nextState: 'AWAITING_NAME',
      nextCtx,
    };
  }

  private async enterName(raw: string, ctx: BotContext, tenantId: string, phone: string) {
    const name = raw.trim();
    if (name.length < 3) {
      return {
        reply: '❓ Escribe tu nombre completo (mínimo 3 caracteres).',
        nextState: 'AWAITING_NAME',
        nextCtx: ctx,
      };
    }

    await this.prisma.patient.upsert({
      where: { phone_tenantId: { phone, tenantId } },
      create: { phone, tenantId, name },
      update: {},
    });

    await this.issueOtp(tenantId, phone);

    return {
      reply: `👋 *${name}*, te enviamos un código de verificación a este WhatsApp.\n*Escribe el código de 6 dígitos:*`,
      nextState: 'AWAITING_OTP',
      nextCtx: { ...ctx, patientName: name },
    };
  }

  private async verifyOtp(input: string, ctx: BotContext, tenantId: string, phone: string) {
    if (!/^\d{6}$/.test(input)) {
      return {
        reply: '❓ El código debe tener 6 dígitos.',
        nextState: 'AWAITING_OTP',
        nextCtx: ctx,
      };
    }

    const otp = await this.prisma.patientOtp.findFirst({
      where: { tenantId, phone, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp || otp.attempts >= 5) {
      return {
        reply: '❌ Código inválido o expirado. Escribe *hola* para solicitar uno nuevo.',
        nextState: 'IDLE',
        nextCtx: {},
      };
    }

    const valid = await bcrypt.compare(input, otp.codeHash);
    if (!valid) {
      await this.prisma.patientOtp.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
      });
      return {
        reply: `❌ Código incorrecto. ${5 - otp.attempts - 1} intento(s) restante(s).`,
        nextState: 'AWAITING_OTP',
        nextCtx: ctx,
      };
    }

    await this.prisma.patientOtp.update({
      where: { id: otp.id },
      data: { consumedAt: new Date() },
    });

    const { slotStart, slotEnd, slotLabel, doctorId, serviceId, patientName } = ctx;
    if (!slotStart || !doctorId || !serviceId) {
      return {
        reply: 'Error interno. Escribe *hola* para empezar de nuevo.',
        nextState: 'IDLE',
        nextCtx: {},
      };
    }

    const patient = await this.prisma.patient.upsert({
      where: { phone_tenantId: { phone, tenantId } },
      create: { phone, tenantId, name: patientName ?? phone },
      update: {},
    });

    await this.prisma.appointment.create({
      data: {
        tenantId,
        patientId: patient.id,
        doctorId,
        serviceId,
        startTime: new Date(slotStart),
        endTime: new Date(slotEnd ?? slotStart),
        status: 'CONFIRMED',
      },
    });

    this.logger.log({ event: 'wa.bot.appointment.created', tenantId, phone }, 'WaBotService');

    return {
      reply:
        `✅ *¡Cita confirmada!*\n\n` +
        `📅 *${ctx.doctorName}* — ${ctx.serviceName}\n` +
        `🕐 ${slotLabel}\n\n` +
        `Recibirás un recordatorio el día anterior.\n` +
        `Escribe *hola* para hacer otra reserva.`,
      nextState: 'COMPLETED',
      nextCtx: {},
    };
  }

  // ─── Helpers ─────────────────────────────────────────────────────

  private pickByIndex<T>(input: string, list: T[]): T | undefined {
    const idx = parseInt(input, 10) - 1;
    if (Number.isInteger(idx) && idx >= 0 && idx < list.length) return list[idx];
    return undefined;
  }

  private invalidOption(opts: string[], state: string, ctx: BotContext) {
    return {
      reply: `❓ No entendí. Responde con el número:\n\n${opts.join('\n')}`,
      nextState: state,
      nextCtx: ctx,
    };
  }

  private async issueOtp(tenantId: string, phone: string) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = await bcrypt.hash(code, OTP_BCRYPT_ROUNDS);
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);
    await this.prisma.patientOtp.create({ data: { tenantId, phone, codeHash, expiresAt } });
    // El código ya está en el mensaje enviado por la instancia Baileys al mismo paciente.
    // No necesitamos otro canal — el WA instance ya es el canal.
    this.logger.log({ event: 'wa.bot.otp.issued', tenantId, phone }, 'WaBotService');
    return code;
  }
}
