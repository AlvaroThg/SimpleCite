import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Injectable } from '@nestjs/common';
import type { TDocumentDefinitions, TFontDictionary } from 'pdfmake/interfaces';
import { PrismaService } from '../../../../common/database/prisma.service';
import { ReportsService } from './reports.service';

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

// Fuentes Roboto embebidas en pdfmake → materializadas una vez por proceso.
let cachedFonts: TFontDictionary | null = null;
function getFonts(): TFontDictionary {
  if (cachedFonts) return cachedFonts;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const vfs = require('pdfmake/build/vfs_fonts') as Record<string, string>;
  const dir = mkdtempSync(join(tmpdir(), 'simplecite-fonts-'));
  const files = ['Roboto-Regular.ttf', 'Roboto-Medium.ttf', 'Roboto-Italic.ttf'];
  for (const f of files) writeFileSync(join(dir, f), Buffer.from(vfs[f], 'base64'));
  cachedFonts = {
    Roboto: {
      normal: join(dir, 'Roboto-Regular.ttf'),
      bold: join(dir, 'Roboto-Medium.ttf'),
      italics: join(dir, 'Roboto-Italic.ttf'),
      bolditalics: join(dir, 'Roboto-Medium.ttf'),
    },
  };
  return cachedFonts;
}

const BRAND_DEFAULT = '#2563EB';
function safeColor(hex: string | null | undefined): string {
  return hex && /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : BRAND_DEFAULT;
}
function money(n: number): string {
  return `Bs ${n.toLocaleString('es-BO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
function fmtDay(iso: string): string {
  return new Intl.DateTimeFormat('es-BO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'America/La_Paz',
  }).format(new Date(iso));
}

@Injectable()
export class ReportsPdfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
  ) {}

  async generate(
    tenantId: string,
    fromIso?: string,
    toIso?: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const [tenant, data] = await Promise.all([
      this.prisma.client.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true, primaryColor: true },
      }),
      this.reports.analytics(tenantId, fromIso, toIso),
    ]);
    const accent = safeColor(tenant?.primaryColor);

    const summaryRow = (label: string, value: string) => [
      { text: label, color: '#64748b', fontSize: 10 },
      { text: value, bold: true, alignment: 'right' as const },
    ];

    const doc: TDocumentDefinitions = {
      pageSize: 'A4',
      pageMargins: [40, 48, 40, 48],
      defaultStyle: { font: 'Roboto', fontSize: 10, color: '#0f172a' },
      content: [
        { text: tenant?.name ?? 'Clínica', fontSize: 16, bold: true, color: accent },
        { text: 'Reporte de actividad', fontSize: 12, margin: [0, 2, 0, 0] },
        {
          text: `Período: ${fmtDay(data.from)} — ${fmtDay(data.to)}`,
          color: '#64748b',
          margin: [0, 2, 0, 14],
        },
        {
          columns: [
            {
              table: {
                widths: ['*', 'auto'],
                body: [
                  summaryRow('Ingresos', money(data.totals.income)),
                  summaryRow('Completadas', String(data.totals.completed)),
                ],
              },
              layout: 'noBorders',
            },
            {
              table: {
                widths: ['*', 'auto'],
                body: [
                  summaryRow('Canceladas', String(data.totals.cancelled)),
                  summaryRow('No se presentó', String(data.totals.noShow)),
                ],
              },
              layout: 'noBorders',
            },
          ],
          columnGap: 24,
          margin: [0, 0, 0, 16],
        },
        { text: 'Por doctor', bold: true, fontSize: 12, margin: [0, 4, 0, 6] },
        {
          table: {
            headerRows: 1,
            widths: ['*', 'auto', 'auto', 'auto', 'auto'],
            body: [
              [
                { text: 'Doctor', bold: true, color: '#64748b' },
                { text: 'Ingresos', bold: true, color: '#64748b', alignment: 'right' },
                { text: 'Compl.', bold: true, color: '#64748b', alignment: 'right' },
                { text: 'Canc.', bold: true, color: '#64748b', alignment: 'right' },
                { text: 'No asist.', bold: true, color: '#64748b', alignment: 'right' },
              ],
              ...(data.byDoctor.length
                ? data.byDoctor.map((d) => [
                    d.doctorName,
                    { text: money(d.income), alignment: 'right' as const },
                    { text: String(d.completed), alignment: 'right' as const },
                    { text: String(d.cancelled), alignment: 'right' as const },
                    { text: String(d.noShow), alignment: 'right' as const },
                  ])
                : [
                    [
                      {
                        text: 'Sin datos en el período',
                        colSpan: 5,
                        italics: true,
                        color: '#94a3b8',
                      },
                      {},
                      {},
                      {},
                      {},
                    ],
                  ]),
            ],
          },
          layout: {
            hLineColor: () => '#e2e8f0',
            hLineWidth: () => 0.5,
            vLineWidth: () => 0,
            paddingTop: () => 5,
            paddingBottom: () => 5,
          },
        },
        {
          text: 'Ingreso = precio del servicio de citas cobradas o completadas. No incluye overrides de precio por doctor.',
          fontSize: 8,
          italics: true,
          color: '#94a3b8',
          margin: [0, 16, 0, 0],
        },
      ],
    };

    const printer = new PdfPrinter(getFonts());
    const stream = printer.createPdfKitDocument(doc);
    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (c) => chunks.push(c));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
      stream.end();
    });

    const stamp = fmtDay(data.from).replace(/\s/g, '') + '_' + fmtDay(data.to).replace(/\s/g, '');
    return { buffer, filename: `reporte_${stamp}.pdf` };
  }
}
