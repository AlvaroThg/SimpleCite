import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { PrismaService } from '../../../../common/database/prisma.service';
import { SlotsService } from '../../../slots/application/services/slots.service';
import { PatientsService } from '../../../patients/application/services/patients.service';
import { generateCancellationToken } from '../../../appointments/application/services/appointments.service';
import type { BotInbound, BotOutbound, BotButton, BotStep, ConvData } from '../../bot.types';

/// La conversación se reinicia con gentileza pasado este tiempo sin actividad.
const CONVERSATION_TTL_MIN = 30;
/// Máximo de opciones por lista (límite de las interactive lists de Meta).
const MAX_OPTIONS = 8;
/// Ventana de búsqueda de disponibilidad.
const AVAILABILITY_DAYS = 14;

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
    private readonly config: ConfigService,
    private readonly logger: Logger,
  ) {}

  async handle(msg: BotInbound): Promise<BotOutbound[]> {
    const convo = await this.loadConversation(msg);
    const input = (msg.callback ?? msg.text ?? '').trim();

    try {
      // Deep link desde la landing: contexto de clínica explícito, siempre gana.
      if (msg.startPayload) {
        return await this.selectClinicBySlug(convo, msg.startPayload);
      }

      // Comandos globales, en cualquier paso.
      if (/^\/?(cancelar|cancel)$/i.test(input)) return await this.abort(convo);
      if (/cambiar de cl[ií]nica/i.test(input) || input === 'switch-clinic') {
        return await this.askClinic(convo);
      }

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
        case 'CHOOSING_DAY':
          return await this.onDayChosen(convo, input);
        case 'CHOOSING_SLOT':
          return await this.onSlotChosen(convo, input);
        case 'CHOOSING_PAYMENT':
          return await this.onPaymentChosen(convo, input);
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

  // ─── Paso 4: día y hora ────────────────────────────────────────────────

  private async askDay(convo: Convo): Promise<BotOutbound[]> {
    const tz = await this.tenantTz(convo.tenantId!);
    const available = await this.availableSlots(convo);

    if (available.length === 0) {
      return [
        {
          text: `${convo.data.doctorName} no tiene horarios libres en las próximas 2 semanas 😕. Intenta más adelante o contacta a la clínica.`,
        },
      ];
    }

    // Días (en timezone de la clínica) que tienen al menos un slot libre.
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
      if (!days.has(key)) days.set(key, dayLabel.format(d));
      if (days.size >= MAX_OPTIONS) break;
    }

    await this.save(convo, 'CHOOSING_DAY', { ...convo.data, dayIso: undefined, slotPage: 0 });
    return [
      {
        text: `${convo.data.serviceName} con ${convo.data.doctorName} — Bs ${convo.data.price}.\n\n¿Qué día te viene bien?`,
        buttons: Array.from(days, ([key, label]) => [{ label, data: `day:${key}` }]),
      },
    ];
  }

  private async onDayChosen(convo: Convo, input: string): Promise<BotOutbound[]> {
    if (!input.startsWith('day:')) return [{ text: 'Elige un día tocando un botón 🙂' }];
    convo.data.dayIso = input.slice(4);
    convo.data.slotPage = 0;
    return this.askSlot(convo);
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
        ...(await this.askDay(convo)),
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
          [{ label: '💵 Efectivo en la clínica', data: 'pay:cash' }],
          [{ label: '📱 QR bancario', data: 'pay:qr' }],
        ],
      },
    ];
  }

  // ─── Paso 5: pago y cierre ─────────────────────────────────────────────

  private async onPaymentChosen(convo: Convo, input: string): Promise<BotOutbound[]> {
    if (input === 'pay:qr') {
      // Fase 2: envío del QR + espera del comprobante con revisión del staff.
      return [
        {
          text:
            'El pago por QR desde el chat llega muy pronto 🙌.\n\n' +
            'Por ahora puedes pagar en efectivo al llegar a la clínica:',
          buttons: [[{ label: '💵 Pagar en efectivo', data: 'pay:cash' }]],
        },
      ];
    }
    if (input !== 'pay:cash') {
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

  // ─── Utilitarios ───────────────────────────────────────────────────────

  private async abort(convo: Convo): Promise<BotOutbound[]> {
    // Liberar el slot si había una TENTATIVE a medio camino.
    if (convo.data.appointmentId) {
      await this.prisma.client.appointment.updateMany({
        where: {
          id: convo.data.appointmentId,
          tenantId: convo.tenantId ?? undefined,
          status: 'TENTATIVE',
        },
        data: { status: 'CANCELLED', expiresAt: null },
      });
    }
    await this.save(convo, 'IDLE', {});
    return [{ text: 'Listo, cancelé el proceso 👍. Escríbeme cuando quieras reservar una cita.' }];
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
