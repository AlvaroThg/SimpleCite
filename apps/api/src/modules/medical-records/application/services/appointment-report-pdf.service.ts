import { dirname, join } from 'node:path';
import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import type { TDocumentDefinitions, TFontDictionary, Content } from 'pdfmake/interfaces';
import { PrismaService } from '../../../../common/database/prisma.service';
import type { RequesterContext } from './medical-records.service';

// pdfmake 0.2.x: el export principal es la clase PdfPrinter (server-side).
interface PdfDocStream {
  on(event: 'data', cb: (chunk: Buffer) => void): void;
  on(event: 'end', cb: () => void): void;
  on(event: 'error', cb: (err: Error) => void): void;
  end(): void;
}
type PdfPrinterCtor = new (fonts: TFontDictionary) => {
  createPdfKitDocument(def: TDocumentDefinitions): PdfDocStream;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PdfPrinter = require('pdfmake') as PdfPrinterCtor;

/** Fuentes Inter (TTF) desde @expo-google-fonts/inter, memoizadas. */
let cachedFonts: TFontDictionary | null = null;
function getInterFonts(): TFontDictionary {
  if (cachedFonts) return cachedFonts;
  const pkgDir = dirname(require.resolve('@expo-google-fonts/inter/package.json'));
  cachedFonts = {
    Inter: {
      normal: join(pkgDir, '400Regular', 'Inter_400Regular.ttf'),
      bold: join(pkgDir, '700Bold', 'Inter_700Bold.ttf'),
      italics: join(pkgDir, '400Regular_Italic', 'Inter_400Regular_Italic.ttf'),
      bolditalics: join(pkgDir, '700Bold_Italic', 'Inter_700Bold_Italic.ttf'),
    },
  };
  return cachedFonts;
}

/** Descarga una imagen (logo del tenant en R2) y la vuelve data URI. Solo PNG/JPEG (pdfmake). */
async function fetchImageDataUri(url?: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') ?? '';
    if (!/^image\/(png|jpe?g)$/i.test(ct)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:${ct};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

/**
 * Genera un informe PDF de una cita atendida con fuente Inter y formato tipo
 * APA (márgenes 1", interlineado amplio, secciones, numeración de página) y el
 * logo de la clínica (desde Cloudflare R2). Mismo control de acceso que el EHR.
 */
@Injectable()
export class AppointmentReportPdfService {
  constructor(private readonly prisma: PrismaService) {}

  async generate(
    ctx: RequesterContext,
    appointmentId: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    if (ctx.role === 'STAFF') {
      throw new ForbiddenException('El personal de recepción no accede al informe clínico');
    }

    const appt = await this.prisma.client.appointment.findFirst({
      where: { id: appointmentId, tenantId: ctx.tenantId },
      include: {
        tenant: { select: { name: true, address: true, logoUrl: true, primaryColor: true } },
        patient: { select: { name: true, ci: true, phone: true } },
        doctor: {
          select: {
            name: true,
            doctorProfile: { select: { specialty: true, licenseNumber: true } },
          },
        },
        service: { select: { name: true } },
        medicalRecord: {
          select: { symptoms: true, diagnosis: true, treatment: true },
        },
        medicalNotes: {
          orderBy: { createdAt: 'asc' },
          select: { content: true, createdAt: true, doctor: { select: { name: true } } },
        },
      },
    });
    if (!appt) throw new NotFoundException('Cita no encontrada');
    if (ctx.role === 'DOCTOR' && appt.doctorId !== ctx.userId) {
      throw new ForbiddenException('No tienes acceso a esta cita');
    }

    const accent = /^#[0-9a-fA-F]{6}$/.test(appt.tenant.primaryColor)
      ? appt.tenant.primaryColor
      : '#0a70f8';
    const logo = await fetchImageDataUri(appt.tenant.logoUrl);

    const fmtDate = (d: Date) =>
      new Intl.DateTimeFormat('es-BO', {
        timeZone: 'America/La_Paz',
        dateStyle: 'long',
        timeStyle: 'short',
      }).format(d);

    const rec = appt.medicalRecord;
    const sections: Content[] = [];
    const section = (title: string, body: string | null) => {
      if (!body) return;
      sections.push({ text: title, style: 'h2', margin: [0, 14, 0, 4] });
      sections.push({ text: body, style: 'body' });
    };
    section('Motivo de consulta', rec?.symptoms ?? null);
    section('Diagnóstico', rec?.diagnosis ?? null);
    section('Tratamiento e indicaciones', rec?.treatment ?? null);
    if (appt.medicalNotes.length > 0) {
      sections.push({ text: 'Notas clínicas', style: 'h2', margin: [0, 14, 0, 4] });
      for (const n of appt.medicalNotes) {
        sections.push({
          text: `${fmtDate(n.createdAt)} — ${n.doctor.name}`,
          style: 'noteMeta',
        });
        sections.push({ text: n.content, style: 'body', margin: [0, 0, 0, 6] });
      }
    }
    if (sections.length === 0) {
      sections.push({
        text: 'Sin registros clínicos asociados a esta cita.',
        style: 'body',
        italics: true,
        color: '#6b7280',
      });
    }

    const docDefinition: TDocumentDefinitions = {
      pageSize: 'A4',
      // Márgenes ~1 pulgada (formato APA).
      pageMargins: [72, 72, 72, 72],
      defaultStyle: { font: 'Inter', fontSize: 11, color: '#1f2937', lineHeight: 1.5 },
      content: [
        // ── Encabezado con logo + clínica ──
        {
          columns: [
            logo ? { image: logo, width: 54, margin: [0, 0, 12, 0] } : { text: '', width: 0 },
            [
              { text: appt.tenant.name, style: 'clinic' },
              ...(appt.tenant.address ? [{ text: appt.tenant.address, style: 'muted' }] : []),
            ],
          ],
        },
        {
          canvas: [
            { type: 'line', x1: 0, y1: 8, x2: 451, y2: 8, lineWidth: 1.5, lineColor: accent },
          ],
        },

        // ── Título (centrado, APA) ──
        { text: 'Informe de Atención Médica', style: 'title', margin: [0, 22, 0, 18] },

        // ── Datos generales ──
        {
          style: 'meta',
          table: {
            widths: ['auto', '*'],
            body: [
              ['Paciente:', appt.patient.name],
              ['CI:', appt.patient.ci ?? '—'],
              ['Teléfono:', appt.patient.phone],
              ['Profesional:', appt.doctor.name],
              [
                'Especialidad:',
                [
                  appt.doctor.doctorProfile?.specialty ?? '—',
                  appt.doctor.doctorProfile?.licenseNumber
                    ? `  ·  Mat. ${appt.doctor.doctorProfile.licenseNumber}`
                    : '',
                ].join(''),
              ],
              ['Servicio:', appt.service.name],
              ['Fecha de la cita:', fmtDate(appt.startTime)],
              // Pago: las citas por seguro muestran el nombre congelado
              // (snapshot inmutable) y Bs 0.00 al paciente.
              ...(appt.paymentMethod === 'INSURANCE'
                ? [
                    ['Tipo de pago:', 'Seguro médico'],
                    ['Seguro:', appt.insuranceNameSnapshot ?? '—'],
                    ['Monto paciente:', 'Bs 0.00'],
                  ]
                : [
                    [
                      'Tipo de pago:',
                      appt.paymentMethod === 'STATIC_QR' ? 'QR Bancario' : 'Efectivo',
                    ],
                    ...(appt.price !== null
                      ? [['Monto:', `Bs ${Number(appt.price).toFixed(2)}`]]
                      : []),
                  ]),
            ].map(([k, v]) => [
              { text: k, bold: true, color: '#374151' },
              { text: v, color: '#111827' },
            ]),
          },
          layout: 'noBorders',
        },

        ...sections,
      ],
      footer: (currentPage: number, pageCount: number) => ({
        margin: [72, 12, 72, 0],
        columns: [
          { text: appt.tenant.name, style: 'foot' },
          { text: `Página ${currentPage} de ${pageCount}`, style: 'foot', alignment: 'right' },
        ],
      }),
      styles: {
        clinic: { fontSize: 15, bold: true, color: '#111827' },
        title: { fontSize: 16, bold: true, alignment: 'center' },
        h2: { fontSize: 12, bold: true, color: '#111827' },
        body: { fontSize: 11, lineHeight: 1.6 },
        meta: { fontSize: 11, lineHeight: 1.35 },
        noteMeta: { fontSize: 9, bold: true, color: '#6b7280' },
        muted: { fontSize: 9, color: '#6b7280' },
        foot: { fontSize: 8, color: '#9ca3af' },
      },
    };

    const printer = new PdfPrinter(getInterFonts());
    const pdfDoc = printer.createPdfKitDocument(docDefinition);
    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      pdfDoc.on('data', (c) => chunks.push(c));
      pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
      pdfDoc.on('error', reject);
      pdfDoc.end();
    });

    return { buffer, filename: `informe-cita-${appointmentId.slice(0, 8)}.pdf` };
  }
}
