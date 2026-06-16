import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import type { TDocumentDefinitions, TFontDictionary } from 'pdfmake/interfaces';
import type { MedicationItem } from '@simplecite/shared';
import { PrismaService } from '../../../../common/database/prisma.service';
import type { RequesterContext } from './medical-records.service';

/**
 * pdfmake 0.2.x exporta la clase server-side `PdfPrinter` como export principal
 * de `src/printer.js`. Los `@types/pdfmake` actuales tipan la API de navegador,
 * así que declaramos aquí el contrato mínimo de la clase server.
 */
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

/**
 * Las fuentes Roboto vienen embebidas (base64) en `pdfmake/build/vfs_fonts`.
 * Las materializamos una sola vez en un dir temporal y le pasamos las rutas a
 * PdfPrinter. Funciona en cualquier entorno (incl. Alpine/musl) sin fuentes del
 * sistema. Memoizado a nivel de módulo: se hace una vez por proceso.
 */
let cachedFonts: TFontDictionary | null = null;
function getFonts(): TFontDictionary {
  if (cachedFonts) return cachedFonts;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const vfs = require('pdfmake/build/vfs_fonts') as Record<string, string>;
  const dir = mkdtempSync(join(tmpdir(), 'simplecite-fonts-'));
  const files = [
    'Roboto-Regular.ttf',
    'Roboto-Medium.ttf',
    'Roboto-Italic.ttf',
    'Roboto-MediumItalic.ttf',
  ];
  for (const f of files) {
    writeFileSync(join(dir, f), Buffer.from(vfs[f], 'base64'));
  }
  cachedFonts = {
    Roboto: {
      normal: join(dir, 'Roboto-Regular.ttf'),
      bold: join(dir, 'Roboto-Medium.ttf'),
      italics: join(dir, 'Roboto-Italic.ttf'),
      bolditalics: join(dir, 'Roboto-MediumItalic.ttf'),
    },
  };
  return cachedFonts;
}

const BRAND_DEFAULT = '#0a70f8';
/** Solo aceptamos un hex válido como color de acento (evita inyección en pdfmake). */
function safeColor(hex: string | null | undefined): string {
  return hex && /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : BRAND_DEFAULT;
}

@Injectable()
export class PrescriptionPdfService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Genera el PDF de una receta como Buffer. Aplica el mismo control de acceso
   * que el resto del módulo (ADMIN/DOCTOR; el doctor solo sus recetas).
   * Devuelve también un nombre de archivo sugerido para el Content-Disposition.
   */
  async generate(
    ctx: RequesterContext,
    prescriptionId: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    if (ctx.role === 'STAFF') {
      throw new ForbiddenException('El personal de recepción no accede a las recetas');
    }

    const p = await this.prisma.client.prescription.findFirst({
      where: { id: prescriptionId, tenantId: ctx.tenantId },
      include: {
        tenant: { select: { name: true, address: true, primaryColor: true } },
        patient: { select: { name: true, ci: true } },
        doctor: {
          select: {
            name: true,
            doctorProfile: { select: { specialty: true, licenseNumber: true } },
          },
        },
        medicalRecord: { select: { diagnosis: true } },
      },
    });
    if (!p) throw new NotFoundException('Receta no encontrada');
    if (ctx.role === 'DOCTOR' && p.doctorId !== ctx.userId) {
      throw new ForbiddenException('No tienes acceso a esta receta');
    }

    const medications: MedicationItem[] = Array.isArray(p.medications)
      ? (p.medications as unknown as MedicationItem[])
      : [];

    const docDefinition = this.buildDocDefinition({
      brand: safeColor(p.tenant.primaryColor),
      clinicName: p.tenant.name,
      clinicAddress: p.tenant.address,
      patientName: p.patient.name,
      patientCi: p.patient.ci,
      doctorName: p.doctor.name,
      specialty: p.doctor.doctorProfile?.specialty ?? null,
      licenseNumber: p.doctor.doctorProfile?.licenseNumber ?? null,
      diagnosis: p.medicalRecord?.diagnosis ?? null,
      instructions: p.instructions,
      medications,
      issuedAt: p.createdAt,
    });

    const buffer = await this.renderToBuffer(docDefinition);
    return { buffer, filename: `receta-${prescriptionId.slice(0, 8)}.pdf` };
  }

  private renderToBuffer(def: TDocumentDefinitions): Promise<Buffer> {
    const printer = new PdfPrinter(getFonts());
    const pdfDoc = printer.createPdfKitDocument(def);
    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      pdfDoc.on('data', (c) => chunks.push(c));
      pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
      pdfDoc.on('error', reject);
      pdfDoc.end();
    });
  }

  private buildDocDefinition(data: {
    brand: string;
    clinicName: string;
    clinicAddress: string | null;
    patientName: string;
    patientCi: string | null;
    doctorName: string;
    specialty: string | null;
    licenseNumber: string | null;
    diagnosis: string | null;
    instructions: string | null;
    medications: MedicationItem[];
    issuedAt: Date;
  }): TDocumentDefinitions {
    const fecha = new Intl.DateTimeFormat('es-BO', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      timeZone: 'America/La_Paz',
    }).format(data.issuedAt);

    const medsBody = [
      [
        { text: '#', style: 'th' },
        { text: 'Medicamento', style: 'th' },
        { text: 'Dosis', style: 'th' },
        { text: 'Frecuencia', style: 'th' },
        { text: 'Duración', style: 'th' },
      ],
      ...data.medications.map((m, i) => [
        { text: String(i + 1), style: 'td' },
        { text: m.name, style: 'tdStrong' },
        { text: m.dose, style: 'td' },
        { text: m.frequency, style: 'td' },
        { text: m.duration, style: 'td' },
      ]),
    ];

    return {
      pageSize: 'A4',
      pageMargins: [48, 56, 48, 64],
      defaultStyle: { font: 'Roboto', fontSize: 10, color: '#1a1a1a', lineHeight: 1.25 },
      content: [
        // ── Encabezado de la clínica ──
        {
          columns: [
            [
              { text: data.clinicName, style: 'clinic' },
              data.clinicAddress
                ? { text: data.clinicAddress, style: 'muted' }
                : { text: '', margin: [0, 0, 0, 0] },
            ],
            { text: 'RECETA MÉDICA', style: 'docTitle', alignment: 'right' },
          ],
        },
        {
          canvas: [
            { type: 'line', x1: 0, y1: 8, x2: 515, y2: 8, lineWidth: 2, lineColor: data.brand },
          ],
        },

        // ── Datos del paciente y fecha ──
        {
          margin: [0, 18, 0, 0],
          columns: [
            [
              { text: 'Paciente', style: 'label' },
              { text: data.patientName, style: 'value' },
              ...(data.patientCi ? [{ text: `CI: ${data.patientCi}`, style: 'muted' }] : []),
            ],
            {
              width: 'auto',
              stack: [
                { text: 'Fecha', style: 'label', alignment: 'right' },
                { text: fecha, style: 'value', alignment: 'right' },
              ],
            },
          ],
        },

        // ── Diagnóstico (opcional) ──
        ...(data.diagnosis
          ? [
              {
                text: 'Diagnóstico',
                style: 'label',
                margin: [0, 14, 0, 2] as [number, number, number, number],
              },
              { text: data.diagnosis, style: 'value' },
            ]
          : []),

        // ── Medicamentos (Rp.) ──
        { text: 'Rp.', style: 'rp', margin: [0, 18, 0, 6] },
        {
          table: { headerRows: 1, widths: [18, '*', 70, 90, 70], body: medsBody },
          layout: {
            hLineWidth: (i: number) => (i === 1 ? 1 : 0.5),
            hLineColor: (i: number) => (i === 1 ? data.brand : '#e5e7eb'),
            vLineWidth: () => 0,
            paddingTop: () => 6,
            paddingBottom: () => 6,
          },
        },

        // ── Indicaciones (opcional) ──
        ...(data.instructions
          ? [
              {
                text: 'Indicaciones',
                style: 'label',
                margin: [0, 18, 0, 2] as [number, number, number, number],
              },
              { text: data.instructions, style: 'value' },
            ]
          : []),

        // ── Firma del médico ──
        {
          margin: [0, 56, 0, 0],
          alignment: 'center',
          stack: [
            {
              canvas: [
                {
                  type: 'line',
                  x1: 160,
                  y1: 0,
                  x2: 355,
                  y2: 0,
                  lineWidth: 0.8,
                  lineColor: '#9ca3af',
                },
              ],
            },
            { text: data.doctorName, style: 'value', alignment: 'center', margin: [0, 6, 0, 0] },
            ...(data.specialty
              ? [{ text: data.specialty, style: 'muted', alignment: 'center' as const }]
              : []),
            ...(data.licenseNumber
              ? [
                  {
                    text: `Matrícula: ${data.licenseNumber}`,
                    style: 'muted',
                    alignment: 'center' as const,
                  },
                ]
              : []),
          ],
        },
      ],
      footer: () => ({
        margin: [48, 0, 48, 20],
        columns: [
          { text: data.clinicName, style: 'footer' },
          { text: 'Generado con SimpleCite', style: 'footer', alignment: 'right' },
        ],
      }),
      styles: {
        clinic: { fontSize: 16, bold: true, color: data.brand },
        docTitle: { fontSize: 13, bold: true, color: '#374151', characterSpacing: 1 },
        label: { fontSize: 8, bold: true, color: '#6b7280', characterSpacing: 0.5 },
        value: { fontSize: 11, color: '#111827' },
        muted: { fontSize: 9, color: '#6b7280' },
        rp: { fontSize: 15, bold: true, italics: true, color: data.brand },
        th: { fontSize: 8, bold: true, color: '#6b7280', characterSpacing: 0.5 },
        td: { fontSize: 10, color: '#1f2937' },
        tdStrong: { fontSize: 10, bold: true, color: '#111827' },
        footer: { fontSize: 8, color: '#9ca3af' },
      },
    };
  }
}
