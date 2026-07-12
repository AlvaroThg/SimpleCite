import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { PrismaService } from '../../../../common/database/prisma.service';
import { StorageService } from '../../../../common/services/storage.service';
import { SlotsService } from '../../../slots/application/services/slots.service';
import { PatientsService } from '../../../patients/application/services/patients.service';
import { generateCancellationToken } from '../../../appointments/application/services/appointments.service';
import type { BotInbound, BotOutbound, BotButton, BotStep, ConvData } from '../../bot.types';

/// La conversación se reinicia con gentileza pasado este tiempo sin actividad.
const CONVERSATION_TTL_MIN = 30;
/// Máximo de opciones por lista (límite de las interactive lists de Meta).
const MAX_OPTIONS = 8;
/// Ventana de búsqueda de disponibilidad (~1 mes; se navega semana → día).
const AVAILABILITY_DAYS = 30;

/** Lunes (yyyy-MM-dd) de la semana de una fecha local yyyy-MM-dd. */
function mondayOf(dayIso: string): string {
  const d = new Date(`${dayIso}T12:00:00Z`);
  return addDaysIso(dayIso, -((d.getUTCDay() + 6) % 7));
}

/** Suma días a una fecha local yyyy-MM-dd (aritmética de calendario, sin tz). */
function addDaysIso(dayIso: string, days: number): string {
  const d = new Date(`${dayIso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

interface Convo {
  id: string;
  channel: string;
  chatId: string;
  step: BotStep;
  tenantId: string | null;
  data: ConvData;
}

/**
 * Motor conversacional de reservas (agnóstico del canal).
 *
 * Identidad = el canal (chatId/phone): no hay registro "en el bot". El
 * paciente NO está ligado a una clínica; se le reconoce por su historial en
 * cada una (Patient es por tenant, unique [phone, tenantId]). Las búsquedas
 * de historial son cross-tenant a propósito: el bot es plataforma.
 *
 * Flujo: clínica (deep link → historial → búsqueda) → registro si es nuevo
 * (solo nombre) → especialidad → doctor → servicio → día → hora (TENTATIVE
 * con TTL, mismo mecanismo del web booking) → pago → cierre.
 */
@Injectable()
export class ConversationEngine {
  constructor(
    private readonly prisma: PrismaService,
    private readonly slots: SlotsService,
    private readonly patients: PatientsService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
    private readonly logger: Logger,
  ) {}

  async handle(msg: BotInbound): Promise<BotOutbound[]> {
    const convo = await this.loadConversation(msg);
    const input = (msg.callback ?? msg.text ?? '').trim();

    try {
      // Deep links: `r-<appointmentId>` viene del checkout web ("enviar
      // comprobante por chat"); cualquier otro payload es el slug de la
      // clínica desde su landing. Siempre ganan sobre el estado previo.
      if (msg.startPayload) {
        if (msg.startPayload.startsWith('r-')) {
          return await this.primeReceipt(convo, msg.startPayload.slice(2));
        }
        return await this.selectClinicBySlug(convo, msg.startPayload);
      }

      // Deep link como texto plano: wa.me no tiene start payload — el texto
      // prellenado del checkout ("r-<uuid>") llega como mensaje normal.
      if (/^r-[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(input)) {
        return await this.primeReceipt(convo, input.slice(2));
      }

      // Comandos globales, en cualquier paso.
      if (/^\/?(cancelar|cancel)$/i.test(input)) return await this.abort(convo);
      if (input.startsWith('cancel-appt:')) {
        return await this.cancelUpcoming(convo, input.slice('cancel-appt:'.length));
      }
      if (input === 'keep-appts') {
        return [{ text: 'Perfecto 👍 Tus citas siguen en pie. Escríbeme cuando necesites algo.' }];
      }
      if (input.startsWith('rcpt:')) {
        return await this.attachOrphanReceipt(convo, input.slice(5));
      }
      if (/cambiar de cl[ií]nica/i.test(input) || input === 'switch-clinic') {
        return await this.askClinic(convo);
      }

      // Fotos: hoy solo tienen sentido como comprobante de pago.
      if (msg.photo) return await this.onPhotoReceived(convo, msg.photo);

      switch (convo.step) {
        case 'IDLE':
          return await this.askClinic(convo);
        case 'CHOOSING_CLINIC':
          return await this.onClinicChosen(convo, input);
        case 'SEARCHING_CLINIC':
          return await this.onClinicSearch(convo, input);
        case 'MAIN_MENU':
          return await this.onMainMenu(convo, input);
        case 'REGISTERING_NAME':
          return await this.onNameGiven(convo, msg.text ?? '');
        case 'CHOOSING_DOCTOR':
          return await this.onDoctorChosen(convo, input);
        case 'CHOOSING_SERVICE':
          return await this.onServiceChosen(convo, input);
        case 'CHOOSING_WEEK':
          return await this.onWeekChosen(convo, input);
        case 'CHOOSING_DAY':
          return await this.onDayChosen(convo, input);
        case 'CHOOSING_SLOT':
          return await this.onSlotChosen(convo, input);
        case 'CHOOSING_PAYMENT':
          return await this.onPaymentChosen(convo, input);
        case 'AWAITING_RECEIPT':
          return [
            {
              text:
                'Estoy esperando la *foto de tu comprobante de pago* 📄. ' +
                'Envíala por aquí, o escribe "cancelar" si prefieres no continuar.',
            },
          ];
        default:
          return await this.askClinic(convo);
      }
    } catch (err) {
      this.logger.error(
        {
          event: 'bot.engine.error',
          chatId: msg.chatId,
          step: convo.step,
          err: (err as Error).message,
        },
        'ConversationEngine',
      );
      return [
        {
          text: 'Ups, algo salió mal de mi lado 😓. Escribe "hola" para empezar de nuevo, o "cancelar" para salir.',
        },
      ];
    }
  }

  // ─── Paso 1: resolver clínica ───────────────────────────────────────────

  /** Ofrece las clínicas donde el paciente ya tiene historial, o pide buscar. */
  private async askClinic(convo: Convo): Promise<BotOutbound[]> {
    const visited = await this.prisma.client.patient.findMany({
      where: { phone: convo.chatId, tenant: { status: { not: 'SUSPENDED' } } },
      select: { tenant: { select: { id: true, name: true } } },
      distinct: ['tenantId'],
      take: MAX_OPTIONS - 1,
    });

    if (visited.length === 0) {
      await this.save(convo, 'SEARCHING_CLINIC', {});
      return [
        {
          text:
            '¡Hola! 👋 Soy el asistente de reservas de SimpleCite.\n\n' +
            '¿En qué clínica o consultorio quieres atenderte? Escríbeme su nombre:',
        },
      ];
    }

    await this.save(convo, 'CHOOSING_CLINIC', {});
    const rows: BotButton[][] = visited.map((v) => [
      { label: v.tenant.name, data: `t:${v.tenant.id}` },
    ]);
    rows.push([{ label: 'Otra clínica', data: 'otra' }]);
    return [{ text: '¡Hola! 👋 ¿Para cuál clínica es tu cita?', buttons: rows }];
  }

  private async onClinicChosen(convo: Convo, input: string): Promise<BotOutbound[]> {
    if (input === 'otra') {
      await this.save(convo, 'SEARCHING_CLINIC', {});
      return [{ text: 'Claro 👍 Escríbeme el nombre de la clínica o consultorio:' }];
    }
    if (input.startsWith('t:')) return this.selectClinic(convo, input.slice(2));
    // Texto libre en vez de botón: trátalo como búsqueda.
    return this.onClinicSearch(convo, input);
  }

  private async onClinicSearch(convo: Convo, query: string): Promise<BotOutbound[]> {
    if (query.startsWith('t:')) return this.selectClinic(convo, query.slice(2));
    if (query.length < 3) {
      return [{ text: 'Escríbeme al menos 3 letras del nombre de la clínica 🙂' }];
    }

    // Slug exacto primero: el deep link de la landing en WhatsApp llega como
    // texto plano con el slug (wa.me no tiene start payload).
    const bySlug = await this.prisma.client.tenant.findFirst({
      where: { slug: query.toLowerCase().trim(), status: { not: 'SUSPENDED' } },
      select: { id: true },
    });
    if (bySlug) return this.selectClinic(convo, bySlug.id);

    const found = await this.prisma.client.tenant.findMany({
      where: { name: { contains: query, mode: 'insensitive' }, status: { not: 'SUSPENDED' } },
      select: { id: true, name: true },
      take: MAX_OPTIONS,
    });

    if (found.length === 0) {
      return [
        {
          text: `No encontré ninguna clínica llamada "${query}" 😕. Revisa el nombre e inténtalo de nuevo.`,
        },
      ];
    }
    if (found.length === 1) return this.selectClinic(convo, found[0].id);

    await this.save(convo, 'CHOOSING_CLINIC', {});
    return [
      {
        text: 'Encontré varias opciones, ¿cuál es?',
        buttons: found.map((t) => [{ label: t.name, data: `t:${t.id}` }]),
      },
    ];
  }

  private async selectClinicBySlug(convo: Convo, slug: string): Promise<BotOutbound[]> {
    const tenant = await this.prisma.client.tenant.findFirst({
      where: { slug: slug.toLowerCase(), status: { not: 'SUSPENDED' } },
      select: { id: true },
    });
    if (!tenant) return this.askClinic(convo);
    return this.selectClinic(convo, tenant.id);
  }

  /** Clínica resuelta: saluda como recurrente o pide el nombre si es nuevo. */
  private async selectClinic(convo: Convo, tenantId: string): Promise<BotOutbound[]> {
    const tenant = await this.prisma.client.tenant.findFirst({
      where: { id: tenantId, status: { not: 'SUSPENDED' } },
      select: { id: true, name: true, locationPhotoUrl: true, heroImageUrl: true },
    });
    if (!tenant) return this.askClinic(convo);

    convo.tenantId = tenant.id;
    // La fachada da contexto visual de a dónde está reservando (o la portada
    // como respaldo). Se adjunta al saludo como foto con caption.
    const photo = tenant.locationPhotoUrl || tenant.heroImageUrl || undefined;
    const patient = await this.prisma.client.patient.findFirst({
      where: { phone: convo.chatId, tenantId: tenant.id },
      select: { name: true },
    });

    if (patient) {
      await this.save(convo, 'MAIN_MENU', { name: patient.name });
      const first = patient.name.split(/\s+/)[0];
      return [
        {
          text: `¡Hola ${first}! 👋 ¿Deseas registrar una cita en ${tenant.name}?`,
          imageUrl: photo,
          buttons: [
            [{ label: 'Sí, reservar cita', data: 'book' }],
            [{ label: 'Cambiar de clínica', data: 'switch-clinic' }],
          ],
        },
      ];
    }

    await this.save(convo, 'REGISTERING_NAME', {});
    return [
      {
        text:
          `¡Bienvenido a ${tenant.name}! 👋 Eres nuevo por aquí.\n\n` +
          'Para reservar tu cita solo necesito tu *nombre completo*:',
        imageUrl: photo,
      },
    ];
  }

  // ─── Paso 2: menú / registro ────────────────────────────────────────────

  private async onMainMenu(convo: Convo, input: string): Promise<BotOutbound[]> {
    if (input === 'book' || /^(s[ií]|reservar|cita)/i.test(input)) {
      return this.askDoctor(convo);
    }
    return [
      {
        text: '¿Te ayudo con una cita?',
        buttons: [
          [{ label: 'Sí, reservar cita', data: 'book' }],
          [{ label: 'Cambiar de clínica', data: 'switch-clinic' }],
        ],
      },
    ];
  }

  private async onNameGiven(convo: Convo, text: string): Promise<BotOutbound[]> {
    const name = text.replace(/\s+/g, ' ').trim();
    if (name.split(' ').length < 2 || name.length < 5 || name.length > 80) {
      return [{ text: 'Necesito tu nombre y apellido (ej: "María Fernández") 🙂' }];
    }
    convo.data.name = name;
    return this.askDoctor(convo);
  }

  // ─── Paso 3: especialista → servicio ────────────────────────────────────
  // El paciente elige directamente al especialista (nombre + especialidad),
  // no una especialidad abstracta. Solo se listan doctores con al menos un
  // servicio activo: un doctor sin servicios era un callejón sin salida.

  private async askDoctor(convo: Convo): Promise<BotOutbound[]> {
    const doctors = await this.prisma.client.user.findMany({
      where: {
        tenantId: convo.tenantId!,
        role: 'DOCTOR',
        isActive: true,
        doctorServices: { some: { isActive: true, service: { isActive: true } } },
      },
      select: { id: true, name: true, doctorProfile: { select: { specialty: true } } },
      take: MAX_OPTIONS,
    });

    if (doctors.length === 0) {
      return [
        {
          text: 'Esta clínica aún no tiene especialistas con servicios configurados 😕. Intenta más tarde.',
        },
      ];
    }
    if (doctors.length === 1) {
      convo.data.doctorId = doctors[0].id;
      convo.data.doctorName = doctors[0].name;
      return this.askService(convo);
    }

    await this.save(convo, 'CHOOSING_DOCTOR', convo.data);
    return [
      {
        text: '¿Con qué especialista quieres atenderte?',
        buttons: doctors.map((d) => {
          const sp = d.doctorProfile?.specialty?.trim();
          return [{ label: sp ? `${d.name} — ${sp}` : d.name, data: `d:${d.id}` }];
        }),
      },
    ];
  }

  private async onDoctorChosen(convo: Convo, input: string): Promise<BotOutbound[]> {
    if (!input.startsWith('d:')) return [{ text: 'Elige un especialista tocando un botón 🙂' }];
    const doctor = await this.prisma.client.user.findFirst({
      where: {
        id: input.slice(2),
        tenantId: convo.tenantId!,
        role: 'DOCTOR',
        isActive: true,
        doctorServices: { some: { isActive: true, service: { isActive: true } } },
      },
      select: { id: true, name: true },
    });
    if (!doctor)
      return [{ text: 'Ese especialista ya no está disponible. Elige otro de la lista.' }];
    convo.data.doctorId = doctor.id;
    convo.data.doctorName = doctor.name;
    return this.askService(convo);
  }

  private async askService(convo: Convo): Promise<BotOutbound[]> {
    const links = await this.prisma.client.doctorService.findMany({
      where: { doctorId: convo.data.doctorId!, tenantId: convo.tenantId!, isActive: true },
      include: {
        service: { select: { id: true, name: true, price: true, duration: true, isActive: true } },
      },
      take: MAX_OPTIONS,
    });
    const active = links.filter((l) => l.service.isActive);

    if (active.length === 0) {
      return [{ text: `${convo.data.doctorName} no tiene servicios configurados por ahora 😕.` }];
    }

    // Siempre se muestra la lista (aunque haya un solo servicio): el paciente
    // debe ver y elegir qué se está reservando y a qué precio.
    await this.save(convo, 'CHOOSING_SERVICE', convo.data);
    return [
      {
        text: `¿Qué servicio necesitas con ${convo.data.doctorName}?`,
        buttons: active.map((l) => [
          {
            label: `${l.service.name} — Bs ${l.customPrice ?? l.service.price}`,
            data: `sv:${l.service.id}`,
          },
        ]),
      },
    ];
  }

  private async onServiceChosen(convo: Convo, input: string): Promise<BotOutbound[]> {
    if (!input.startsWith('sv:')) return [{ text: 'Elige un servicio tocando un botón 🙂' }];
    const link = await this.prisma.client.doctorService.findFirst({
      where: {
        doctorId: convo.data.doctorId!,
        serviceId: input.slice(3),
        tenantId: convo.tenantId!,
        isActive: true,
      },
      include: { service: { select: { id: true, name: true, price: true, duration: true } } },
    });
    if (!link) return [{ text: 'Ese servicio ya no está disponible. Elige otro de la lista.' }];
    convo.data.serviceId = link.service.id;
    convo.data.serviceName = link.service.name;
    convo.data.price = String(link.customPrice ?? link.service.price);
    convo.data.durationMin = link.customDuration ?? link.service.duration;
    return this.askDay(convo);
  }

  // ─── Paso 4: semana → día → hora ────────────────────────────────────────

  /**
   * Con pocas fechas (≤ MAX_OPTIONS días con horarios) muestra los días
   * directo; con la ventana completa de 30 días, primero se elige la semana
   * ("Esta semana", "Próxima semana", "Semana del 28 jul") — listas siempre
   * cortas para los widgets de WhatsApp.
   */
  private async askDay(convo: Convo): Promise<BotOutbound[]> {
    const tz = await this.tenantTz(convo.tenantId!);
    const available = await this.availableSlots(convo);

    if (available.length === 0) {
      return [
        {
          text: `${convo.data.doctorName} no tiene horarios libres en las próximas semanas 😕. Intenta más adelante o contacta a la clínica.`,
        },
      ];
    }

    const days = this.availableDays(available, tz);
    const header = `${convo.data.serviceName} con ${convo.data.doctorName} — Bs ${convo.data.price}.`;

    if (days.size <= MAX_OPTIONS) {
      await this.save(convo, 'CHOOSING_DAY', {
        ...convo.data,
        weekIso: undefined,
        dayIso: undefined,
        slotPage: 0,
      });
      return [
        {
          text: `${header}\n\n¿Qué día te viene bien?`,
          buttons: Array.from(days, ([key, label]) => [{ label, data: `day:${key}` }]),
        },
      ];
    }

    // Agrupar por semana (lunes como inicio) sobre la fecha LOCAL de la clínica.
    const weeks = new Map<string, { from: string; to: string }>();
    for (const key of days.keys()) {
      const monday = mondayOf(key);
      const w = weeks.get(monday);
      if (!w) weeks.set(monday, { from: key, to: key });
      else if (key > w.to) w.to = key;
    }

    const todayKey = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const thisMonday = mondayOf(todayKey);
    const nextMonday = addDaysIso(thisMonday, 7);
    const shortDate = (iso: string) =>
      new Intl.DateTimeFormat('es-BO', { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(
        new Date(`${iso}T12:00:00Z`),
      );

    const rows: BotButton[][] = Array.from(weeks.keys())
      .sort()
      .slice(0, MAX_OPTIONS)
      .map((monday) => {
        const { from, to } = weeks.get(monday)!;
        const name =
          monday === thisMonday
            ? 'Esta semana'
            : monday === nextMonday
              ? 'Próxima semana'
              : `Semana del ${shortDate(monday)}`;
        const range = from === to ? shortDate(from) : `${shortDate(from)} a ${shortDate(to)}`;
        return [{ label: `${name} — ${range}`, data: `wk:${monday}` }];
      });

    await this.save(convo, 'CHOOSING_WEEK', {
      ...convo.data,
      weekIso: undefined,
      dayIso: undefined,
      slotPage: 0,
    });
    return [{ text: `${header}\n\n¿Qué semana te viene bien?`, buttons: rows }];
  }

  private async onWeekChosen(convo: Convo, input: string): Promise<BotOutbound[]> {
    if (!input.startsWith('wk:')) return [{ text: 'Elige una semana tocando un botón 🙂' }];
    convo.data.weekIso = input.slice(3);
    return this.askDayOfWeek(convo);
  }

  /** Días con horarios libres dentro de la semana elegida. */
  private async askDayOfWeek(convo: Convo): Promise<BotOutbound[]> {
    const tz = await this.tenantTz(convo.tenantId!);
    const monday = convo.data.weekIso!;
    const sunday = addDaysIso(monday, 6);
    const days = this.availableDays(await this.availableSlots(convo), tz, monday, sunday);

    if (days.size === 0) {
      convo.data.weekIso = undefined;
      return [
        { text: 'Esa semana se quedó sin horarios 😅. Elige otra:' },
        ...(await this.askDay(convo)),
      ];
    }

    const rows: BotButton[][] = Array.from(days, ([key, label]) => [
      { label, data: `day:${key}` } as BotButton,
    ]);
    rows.push([{ label: '◂ Otras semanas', data: 'weeks' }]);
    await this.save(convo, 'CHOOSING_DAY', convo.data);
    return [{ text: '¿Qué día te viene bien?', buttons: rows }];
  }

  private async onDayChosen(convo: Convo, input: string): Promise<BotOutbound[]> {
    if (input === 'weeks') return this.askDay(convo);
    if (input.startsWith('wk:')) return this.onWeekChosen(convo, input);
    if (!input.startsWith('day:')) return [{ text: 'Elige un día tocando un botón 🙂' }];
    convo.data.dayIso = input.slice(4);
    convo.data.slotPage = 0;
    return this.askSlot(convo);
  }

  /** Días locales (clave yyyy-MM-dd → etiqueta "lun, 13 jul") con slots libres. */
  private availableDays(
    available: { startTime: string }[],
    tz: string,
    fromKey?: string,
    toKey?: string,
  ): Map<string, string> {
    const dayKey = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const dayLabel = new Intl.DateTimeFormat('es-BO', {
      timeZone: tz,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
    const days = new Map<string, string>();
    for (const s of available) {
      const d = new Date(s.startTime);
      const key = dayKey.format(d);
      if (fromKey && key < fromKey) continue;
      if (toKey && key > toKey) continue;
      if (!days.has(key)) days.set(key, dayLabel.format(d));
    }
    return days;
  }

  private async askSlot(convo: Convo): Promise<BotOutbound[]> {
    const tz = await this.tenantTz(convo.tenantId!);
    const dayKey = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const timeLabel = new Intl.DateTimeFormat('es-BO', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const available = (await this.availableSlots(convo)).filter(
      (s) => dayKey.format(new Date(s.startTime)) === convo.data.dayIso,
    );
    if (available.length === 0) {
      return [
        { text: 'Ese día se quedó sin horarios libres 😅. Elige otro día.' },
        ...(convo.data.weekIso ? await this.askDayOfWeek(convo) : await this.askDay(convo)),
      ];
    }

    const page = convo.data.slotPage ?? 0;
    const pageSlots = available.slice(page * MAX_OPTIONS, (page + 1) * MAX_OPTIONS);
    const rows: BotButton[][] = [];
    for (let i = 0; i < pageSlots.length; i += 2) {
      rows.push(
        pageSlots.slice(i, i + 2).map((s) => ({
          label: timeLabel.format(new Date(s.startTime)),
          data: `slot:${s.startTime}`,
        })),
      );
    }
    if (available.length > (page + 1) * MAX_OPTIONS) {
      rows.push([{ label: 'Más horarios ▸', data: 'slots-more' }]);
    }

    await this.save(convo, 'CHOOSING_SLOT', convo.data);
    return [{ text: '¿A qué hora?', buttons: rows }];
  }

  private async onSlotChosen(convo: Convo, input: string): Promise<BotOutbound[]> {
    if (input === 'slots-more') {
      convo.data.slotPage = (convo.data.slotPage ?? 0) + 1;
      return this.askSlot(convo);
    }
    if (input.startsWith('day:')) return this.onDayChosen(convo, input);
    if (!input.startsWith('slot:')) return [{ text: 'Elige un horario tocando un botón 🙂' }];

    const startTime = new Date(input.slice(5));
    if (isNaN(startTime.getTime()) || startTime < new Date()) {
      return [{ text: 'Ese horario ya pasó 😅. Elige otro.' }, ...(await this.askSlot(convo))];
    }

    // Resolver/crear el paciente de ESTA clínica (identidad = canal).
    const patient = await this.patients.findOrCreate({
      tenantId: convo.tenantId!,
      phone: convo.chatId,
      name: convo.data.name ?? 'Paciente',
    });

    const ttlMin = this.config.get<number>('TENTATIVE_APPOINTMENT_TTL_MINUTES') ?? 15;
    const endTime = new Date(startTime.getTime() + (convo.data.durationMin ?? 30) * 60_000);

    try {
      const appointment = await this.prisma.client.appointment.create({
        data: {
          tenantId: convo.tenantId!,
          patientId: patient.id,
          doctorId: convo.data.doctorId!,
          serviceId: convo.data.serviceId!,
          startTime,
          endTime,
          status: 'TENTATIVE',
          expiresAt: new Date(Date.now() + ttlMin * 60_000),
          price: convo.data.price,
          cancellationToken: generateCancellationToken(),
        },
        select: { id: true },
      });
      convo.data.appointmentId = appointment.id;
    } catch (err) {
      if (this.isExclusionViolation(err)) {
        return [
          { text: 'Ese horario se acaba de ocupar 😅. Te muestro los que quedan:' },
          ...(await this.askSlot(convo)),
        ];
      }
      throw err;
    }

    const tz = await this.tenantTz(convo.tenantId!);
    const when = new Intl.DateTimeFormat('es-BO', {
      timeZone: tz,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(startTime);

    await this.save(convo, 'CHOOSING_PAYMENT', convo.data);
    this.logger.log(
      {
        event: 'bot.appointment.tentative',
        tenantId: convo.tenantId,
        appointmentId: convo.data.appointmentId,
      },
      'ConversationEngine',
    );
    return [
      {
        text:
          `Casi listo ✨\n\n🩺 ${convo.data.serviceName} con ${convo.data.doctorName}\n` +
          `🗓 ${when}\n💰 Total: Bs ${convo.data.price}\n\n¿Cómo prefieres pagar?`,
        buttons: [
          [{ label: '💵 Efectivo', data: 'pay:cash' }],
          [{ label: '📱 QR bancario', data: 'pay:qr' }],
        ],
      },
    ];
  }

  // ─── Paso 5: pago y cierre ─────────────────────────────────────────────

  private async onPaymentChosen(convo: Convo, input: string): Promise<BotOutbound[]> {
    if (input !== 'pay:cash' && input !== 'pay:qr') {
      return [{ text: '¿Cómo prefieres pagar? Toca una de las opciones 🙂' }];
    }

    const appointment = await this.prisma.client.appointment.findFirst({
      where: { id: convo.data.appointmentId, tenantId: convo.tenantId! },
      select: { id: true, status: true, expiresAt: true, startTime: true },
    });
    if (!appointment || appointment.status !== 'TENTATIVE') {
      await this.save(convo, 'MAIN_MENU', { name: convo.data.name });
      return [
        { text: 'Esa reserva ya no está activa 😕. ¿Empezamos de nuevo? Escribe "reservar".' },
      ];
    }
    if (appointment.expiresAt && appointment.expiresAt < new Date()) {
      await this.prisma.client.appointment.update({
        where: { id: appointment.id },
        data: { status: 'CANCELLED', expiresAt: null },
      });
      await this.save(convo, 'MAIN_MENU', { name: convo.data.name });
      return [
        {
          text: 'La reserva expiró (pasaron más de 15 min) 😅. Escribe "reservar" para elegir otro horario.',
        },
      ];
    }

    if (input === 'pay:qr') return this.startQrPayment(convo, appointment.id);

    await this.prisma.client.appointment.update({
      where: { id: appointment.id },
      data: { status: 'CONFIRMED', paymentMethod: 'CASH', expiresAt: null },
    });
    await this.recordBookingNotification(convo.tenantId!, appointment.id);

    const tenant = await this.prisma.client.tenant.findUnique({
      where: { id: convo.tenantId! },
      select: { name: true, timezone: true, mapsUrl: true },
    });
    const when = new Intl.DateTimeFormat('es-BO', {
      timeZone: tenant?.timezone ?? 'America/La_Paz',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(appointment.startTime);

    this.logger.log(
      {
        event: 'bot.appointment.confirmed-cash',
        tenantId: convo.tenantId,
        appointmentId: appointment.id,
      },
      'ConversationEngine',
    );

    // Capturar antes de save(): el reset del wizard limpia convo.data.
    const { doctorName, price } = convo.data;
    const first = (convo.data.name ?? '').split(/\s+/)[0] || '';
    const maps = tenant?.mapsUrl ? `\n📍 Cómo llegar: ${tenant.mapsUrl}` : '';
    await this.save(convo, 'IDLE', { name: convo.data.name });
    return [
      {
        text:
          `¡Gracias${first ? ` ${first}` : ''}! 🎉 ${doctorName} te atenderá el ${when}.\n\n` +
          `💵 Pagas Bs ${price} al llegar a ${tenant?.name ?? 'la clínica'}.${maps}`,
      },
    ];
  }

  /**
   * Pago por QR: envía el QR correcto (compartido del tenant o el del doctor
   * según QrAssignmentMode), deja la cita PENDING_PAYMENT y espera la foto
   * del comprobante. La confirmación final la hace el staff desde el panel
   * al revisar el comprobante (decisión del producto: el dinero se revisa).
   */
  private async startQrPayment(convo: Convo, appointmentId: string): Promise<BotOutbound[]> {
    const tenant = await this.prisma.client.tenant.findUnique({
      where: { id: convo.tenantId! },
      select: { qrAssignmentMode: true, staticQrUrl: true, staticQrLabel: true },
    });

    let qrUrl = tenant?.staticQrUrl ?? null;
    let qrLabel = tenant?.staticQrLabel ?? null;
    if (tenant?.qrAssignmentMode === 'PER_DOCTOR') {
      const profile = await this.prisma.client.doctorProfile.findFirst({
        where: { userId: convo.data.doctorId!, user: { tenantId: convo.tenantId! } },
        select: { qrUrl: true, qrLabel: true },
      });
      // El QR del doctor manda; si no tiene, el del tenant es el respaldo.
      qrUrl = profile?.qrUrl || qrUrl;
      qrLabel = profile?.qrLabel || qrLabel;
    }

    if (!qrUrl) {
      return [
        {
          text:
            'Esta clínica todavía no tiene QR de pago configurado 😕. ' +
            'Puedes pagar en efectivo al llegar:',
          buttons: [[{ label: '💵 Pagar en efectivo', data: 'pay:cash' }]],
        },
      ];
    }

    await this.prisma.client.appointment.update({
      where: { id: appointmentId },
      data: { status: 'PENDING_PAYMENT', paymentMethod: 'STATIC_QR', expiresAt: null },
    });
    await this.recordBookingNotification(convo.tenantId!, appointmentId);
    await this.save(convo, 'AWAITING_RECEIPT', convo.data);

    this.logger.log(
      { event: 'bot.appointment.awaiting-receipt', tenantId: convo.tenantId, appointmentId },
      'ConversationEngine',
    );

    const bank = qrLabel ? ` (${qrLabel})` : '';
    return [
      {
        imageUrl: qrUrl,
        text:
          `📲 Escanea este QR${bank} y paga *Bs ${convo.data.price}*.\n\n` +
          'Cuando termines, envíame la *foto del comprobante* por aquí. ' +
          'La clínica la verificará y te confirmo tu cita por este chat.',
      },
    ];
  }

  /** Foto entrante: comprobante de pago si hay una cita esperándolo. */
  private async onPhotoReceived(
    convo: Convo,
    photo: { buffer: Buffer; mimeType: string },
  ): Promise<BotOutbound[]> {
    if (convo.step !== 'AWAITING_RECEIPT' || !convo.data.appointmentId) {
      // Foto huérfana (típico: pagó en el booking web y manda el comprobante
      // directo al chat): buscar sus reservas esperando pago por QR.
      return this.onOrphanPhoto(convo, photo);
    }

    const appointment = await this.prisma.client.appointment.findFirst({
      where: {
        id: convo.data.appointmentId,
        tenantId: convo.tenantId!,
        status: 'PENDING_PAYMENT',
      },
      select: { id: true, tenant: { select: { slug: true } } },
    });
    if (!appointment) {
      await this.save(convo, 'IDLE', { name: convo.data.name });
      return [
        { text: 'Esa reserva ya no está esperando pago 😕. Escribe "hola" para empezar de nuevo.' },
      ];
    }

    // Comprobante a R2 dentro de la carpeta de la clínica (<slug>/receipts):
    // visible en el panel para que el staff lo revise y confirme la cita.
    const receiptUrl = await this.storage.uploadImage(
      `${appointment.tenant.slug}/receipts`,
      photo.buffer,
      photo.mimeType,
    );
    await this.prisma.client.appointment.update({
      where: { id: appointment.id },
      data: { receiptUrl },
    });

    this.logger.log(
      { event: 'bot.receipt.received', tenantId: convo.tenantId, appointmentId: appointment.id },
      'ConversationEngine',
    );

    const first = (convo.data.name ?? '').split(/\s+/)[0] || '';
    await this.save(convo, 'IDLE', { name: convo.data.name });
    return [
      {
        text:
          `📄 ¡Comprobante recibido${first ? `, ${first}` : ''}! Tu horario queda reservado.\n\n` +
          'La clínica verificará el pago y te confirmaré la cita por este chat. ' +
          'Si algo no cuadra, se comunicarán contigo.',
      },
    ];
  }

  // ─── Fase 3: comprobantes desde el booking web ──────────────────────────

  /**
   * Deep link `r-<appointmentId>` del checkout web: prepara la conversación
   * para recibir el comprobante de esa reserva. El uuid de la cita actúa de
   * bearer token (no adivinable); no se puede validar por teléfono porque la
   * reserva web usa el número real y el chat puede ser otro canal.
   */
  private async primeReceipt(convo: Convo, appointmentId: string): Promise<BotOutbound[]> {
    const appointment = await this.prisma.client.appointment.findFirst({
      where: { id: appointmentId, status: 'PENDING_PAYMENT', paymentMethod: 'STATIC_QR' },
      select: {
        id: true,
        tenantId: true,
        startTime: true,
        patient: { select: { name: true } },
        doctor: { select: { name: true } },
        tenant: { select: { name: true, timezone: true } },
      },
    });
    if (!appointment) {
      await this.save(convo, 'IDLE', { name: convo.data.name });
      return [
        {
          text:
            'No encontré una reserva esperando pago con ese enlace 😕 (quizá ya fue confirmada). ' +
            'Escribe "hola" si quieres agendar una cita.',
        },
      ];
    }

    convo.tenantId = appointment.tenantId;
    const when = new Intl.DateTimeFormat('es-BO', {
      timeZone: appointment.tenant.timezone ?? 'America/La_Paz',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(appointment.startTime);
    const first = appointment.patient.name.split(/\s+/)[0];

    await this.save(convo, 'AWAITING_RECEIPT', {
      name: appointment.patient.name,
      appointmentId: appointment.id,
    });
    return [
      {
        text:
          `¡Hola ${first}! 👋 Encontré tu reserva en ${appointment.tenant.name}: ` +
          `${appointment.doctor.name}, ${when}.\n\n` +
          'Envíame la *foto de tu comprobante de pago* 📄 y la clínica la verificará.',
      },
    ];
  }

  /**
   * Foto sin conversación esperándola: buscar reservas del chat que estén
   * esperando pago por QR (cross-tenant). 1 → adjuntar directo; varias →
   * subir una vez y preguntar a cuál; 0 → mensaje amable.
   */
  private async onOrphanPhoto(
    convo: Convo,
    photo: { buffer: Buffer; mimeType: string },
  ): Promise<BotOutbound[]> {
    const candidates = await this.prisma.client.appointment.findMany({
      where: {
        patient: { phone: convo.chatId },
        status: 'PENDING_PAYMENT',
        paymentMethod: 'STATIC_QR',
        startTime: { gt: new Date() },
      },
      orderBy: { startTime: 'asc' },
      take: MAX_OPTIONS,
      select: {
        id: true,
        tenantId: true,
        startTime: true,
        doctor: { select: { name: true } },
        tenant: { select: { name: true, slug: true, timezone: true } },
      },
    });

    if (candidates.length === 0) {
      return [
        {
          text:
            'Recibí tu imagen 🙌 pero no tengo una reserva esperando comprobante en este chat. ' +
            'Si quieres agendar una cita, escribe "hola".',
        },
      ];
    }

    if (candidates.length === 1) {
      const appt = candidates[0];
      const receiptUrl = await this.storage.uploadImage(
        `${appt.tenant.slug}/receipts`,
        photo.buffer,
        photo.mimeType,
      );
      await this.prisma.client.appointment.update({
        where: { id: appt.id },
        data: { receiptUrl },
      });
      this.logger.log(
        { event: 'bot.receipt.orphan-attached', appointmentId: appt.id, tenantId: appt.tenantId },
        'ConversationEngine',
      );
      return [
        {
          text:
            `📄 ¡Comprobante recibido! Lo adjunté a tu cita con ${appt.doctor.name} en ${appt.tenant.name}.\n\n` +
            'La clínica verificará el pago y te confirmaré la cita por este chat.',
        },
      ];
    }

    // Varias reservas esperando pago: aún no se sabe a cuál pertenece, pero
    // cada comprobante debe vivir en la carpeta de SU clínica — se sube una
    // copia por tenant distinto (caso raro, casi siempre es un solo tenant)
    // y al elegir la cita se usa la URL de esa clínica.
    const pendingReceipts: Record<string, string> = {};
    for (const t of new Map(candidates.map((c) => [c.tenantId, c.tenant.slug]))) {
      const [tenantId, slug] = t;
      pendingReceipts[tenantId] = await this.storage.uploadImage(
        `${slug}/receipts`,
        photo.buffer,
        photo.mimeType,
      );
    }
    await this.save(convo, 'IDLE', { name: convo.data.name, pendingReceipts });
    const rows: BotButton[][] = candidates.map((a) => {
      const when = new Intl.DateTimeFormat('es-BO', {
        timeZone: a.tenant.timezone ?? 'America/La_Paz',
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(a.startTime);
      return [{ label: `${when} — ${a.doctor.name} (${a.tenant.name})`, data: `rcpt:${a.id}` }];
    });
    return [
      {
        text: 'Tienes varias reservas esperando pago 🤔 ¿De cuál es este comprobante?',
        buttons: rows,
      },
    ];
  }

  /** Adjunta el comprobante huérfano ya subido a la cita elegida. */
  private async attachOrphanReceipt(convo: Convo, appointmentId: string): Promise<BotOutbound[]> {
    const { pendingReceipts } = convo.data;
    if (!pendingReceipts || Object.keys(pendingReceipts).length === 0) {
      return [{ text: 'No tengo un comprobante pendiente 🙂. Envíame la foto primero.' }];
    }

    const appointment = await this.prisma.client.appointment.findFirst({
      where: {
        id: appointmentId,
        // Titularidad: la reserva debe ser de este chat.
        patient: { phone: convo.chatId },
        status: 'PENDING_PAYMENT',
      },
      select: {
        id: true,
        tenantId: true,
        doctor: { select: { name: true } },
        tenant: { select: { name: true } },
      },
    });
    // La cita debe además tener su copia del comprobante (subida a SU carpeta).
    const receiptUrl = appointment ? pendingReceipts[appointment.tenantId] : undefined;
    if (!appointment || !receiptUrl) {
      return [{ text: 'Esa reserva ya no está esperando pago 😕. Elige otra de la lista.' }];
    }

    await this.prisma.client.appointment.update({
      where: { id: appointment.id },
      data: { receiptUrl },
    });
    await this.save(convo, 'IDLE', { name: convo.data.name });
    this.logger.log(
      { event: 'bot.receipt.orphan-attached', appointmentId: appointment.id },
      'ConversationEngine',
    );
    return [
      {
        text:
          `📄 Listo, adjunté tu comprobante a la cita con ${appointment.doctor.name} en ${appointment.tenant.name}.\n\n` +
          'La clínica verificará el pago y te confirmaré la cita por este chat.',
      },
    ];
  }

  // ─── Utilitarios ───────────────────────────────────────────────────────

  private async abort(convo: Convo): Promise<BotOutbound[]> {
    // Liberar el slot si había una reserva a medio camino (TENTATIVE del
    // wizard, o PENDING_PAYMENT esperando un comprobante que nunca llegó).
    if (convo.data.appointmentId) {
      await this.prisma.client.appointment.updateMany({
        where: {
          id: convo.data.appointmentId,
          tenantId: convo.tenantId ?? undefined,
          status: { in: ['TENTATIVE', 'PENDING_PAYMENT'] },
        },
        data: { status: 'CANCELLED', expiresAt: null },
      });
      await this.save(convo, 'IDLE', { name: convo.data.name });
      return [
        { text: 'Listo, cancelé el proceso 👍. Escríbeme cuando quieras reservar una cita.' },
      ];
    }

    // Sin nada a medio camino: "cancelar" significa cancelar una cita próxima.
    // Cross-tenant a propósito: se listan todas las citas del chat.
    const upcoming = await this.prisma.client.appointment.findMany({
      where: {
        patient: { phone: convo.chatId },
        status: { in: ['CONFIRMED', 'PENDING_PAYMENT'] },
        startTime: { gt: new Date() },
      },
      orderBy: { startTime: 'asc' },
      take: MAX_OPTIONS - 1,
      select: {
        id: true,
        startTime: true,
        doctor: { select: { name: true } },
        tenant: { select: { name: true, timezone: true } },
      },
    });

    await this.save(convo, 'IDLE', { name: convo.data.name });
    if (upcoming.length === 0) {
      return [
        { text: 'No tienes citas próximas que cancelar 🙂. Escríbeme "hola" si quieres reservar.' },
      ];
    }

    const rows: BotButton[][] = upcoming.map((a) => {
      const when = new Intl.DateTimeFormat('es-BO', {
        timeZone: a.tenant.timezone ?? 'America/La_Paz',
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(a.startTime);
      return [
        { label: `${when} — ${a.doctor.name} (${a.tenant.name})`, data: `cancel-appt:${a.id}` },
      ];
    });
    rows.push([{ label: 'No, dejar todo así', data: 'keep-appts' }]);
    return [{ text: '¿Cuál cita quieres cancelar?', buttons: rows }];
  }

  /** Cancela una cita próxima del paciente (verificando que sea suya). */
  private async cancelUpcoming(convo: Convo, appointmentId: string): Promise<BotOutbound[]> {
    const appointment = await this.prisma.client.appointment.findFirst({
      where: {
        id: appointmentId,
        // Titularidad: la cita debe ser de un Patient con el phone/chatId de
        // ESTE chat. Sin esto, cualquier chat podría cancelar citas ajenas.
        patient: { phone: convo.chatId },
        status: { in: ['CONFIRMED', 'PENDING_PAYMENT'] },
      },
      select: {
        id: true,
        startTime: true,
        doctor: { select: { name: true } },
        tenant: { select: { name: true, timezone: true } },
      },
    });
    if (!appointment) {
      return [{ text: 'Esa cita ya no se puede cancelar (quizá ya fue cancelada) 🙂.' }];
    }

    await this.prisma.client.appointment.update({
      where: { id: appointment.id },
      data: { status: 'CANCELLED', expiresAt: null },
    });
    this.logger.log(
      { event: 'bot.appointment.cancelled-by-patient', appointmentId: appointment.id },
      'ConversationEngine',
    );

    const when = new Intl.DateTimeFormat('es-BO', {
      timeZone: appointment.tenant.timezone ?? 'America/La_Paz',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(appointment.startTime);
    return [
      {
        text:
          `Tu cita del ${when} con ${appointment.doctor.name} en ${appointment.tenant.name} quedó cancelada 👍\n\n` +
          'Escríbeme "hola" cuando quieras reservar de nuevo.',
      },
    ];
  }

  private async availableSlots(convo: Convo) {
    const from = new Date();
    const to = new Date(from.getTime() + AVAILABILITY_DAYS * 86_400_000);
    const slots = await this.slots.generate(convo.tenantId!, {
      doctorId: convo.data.doctorId!,
      serviceId: convo.data.serviceId!,
      from: from.toISOString(),
      to: to.toISOString(),
    });
    return slots.filter((s) => s.available);
  }

  private async tenantTz(tenantId: string): Promise<string> {
    const t = await this.prisma.client.tenant.findUnique({
      where: { id: tenantId },
      select: { timezone: true },
    });
    return t?.timezone ?? 'America/La_Paz';
  }

  /** Igual que el web booking: notificación de reserva nueva para el panel. */
  private async recordBookingNotification(tenantId: string, appointmentId: string) {
    try {
      await this.prisma.client.bookingNotification.upsert({
        where: { appointmentId },
        create: { tenantId, appointmentId },
        update: {},
      });
    } catch (err) {
      this.logger.warn(
        { event: 'bot.booking.notification-failed', appointmentId, err: (err as Error).message },
        'ConversationEngine',
      );
    }
  }

  private async loadConversation(msg: BotInbound): Promise<Convo> {
    const found = await this.prisma.client.botConversation.findUnique({
      where: { channel_chatId: { channel: msg.channel, chatId: msg.chatId } },
    });

    if (!found) {
      const created = await this.prisma.client.botConversation.create({
        data: {
          channel: msg.channel,
          chatId: msg.chatId,
          step: 'IDLE',
          data: {},
          expiresAt: this.ttl(),
        },
      });
      return { ...created, step: 'IDLE', data: {}, tenantId: null };
    }

    // Conversación vencida: reset suave (se conserva la fila, no el estado).
    if (found.expiresAt < new Date()) {
      return {
        id: found.id,
        channel: found.channel,
        chatId: found.chatId,
        step: 'IDLE',
        tenantId: null,
        data: {},
      };
    }

    return {
      id: found.id,
      channel: found.channel,
      chatId: found.chatId,
      step: found.step as BotStep,
      tenantId: found.tenantId,
      data: (found.data ?? {}) as ConvData,
    };
  }

  private async save(convo: Convo, step: BotStep, data: ConvData): Promise<void> {
    convo.step = step;
    convo.data = data;
    await this.prisma.client.botConversation.update({
      where: { id: convo.id },
      data: {
        step,
        tenantId: convo.tenantId,
        data: data as object,
        expiresAt: this.ttl(),
      },
    });
  }

  private ttl(): Date {
    return new Date(Date.now() + CONVERSATION_TTL_MIN * 60_000);
  }

  /** Mismo manejo del exclusion constraint anti-overlap que el web booking. */
  private isExclusionViolation(err: unknown): boolean {
    if (typeof err !== 'object' || err === null) return false;
    const e = err as { code?: string; message?: string; meta?: { code?: string } };
    if (e.code === 'P2010' && e.meta?.code === '23P01') return true;
    if (typeof e.message === 'string' && e.message.includes('23P01')) return true;
    return false;
  }
}
