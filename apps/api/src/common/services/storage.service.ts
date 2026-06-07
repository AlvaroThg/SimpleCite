import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Sube archivos a Supabase Storage vía REST API (sin SDK JS).
 *
 * Requiere que los buckets existan y sean públicos (configurado en el dashboard
 * de Supabase → Storage → Buckets).
 *
 * Buckets usados:
 *   assets   — logos y QR estáticos del tenant
 *   receipts — comprobantes de pago enviados por WhatsApp
 */
@Injectable()
export class StorageService {
  private readonly supabaseUrl: string;
  private readonly serviceRoleKey: string;

  constructor(config: ConfigService) {
    this.supabaseUrl = config.get<string>('SUPABASE_URL') ?? '';
    this.serviceRoleKey = config.get<string>('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  }

  /**
   * Sube un buffer a Supabase Storage y devuelve la URL pública.
   * Usa PUT con x-upsert para crear o reemplazar.
   */
  async upload(bucket: string, path: string, buffer: Buffer, mimeType: string): Promise<string> {
    const url = `${this.supabaseUrl}/storage/v1/object/${bucket}/${path}`;

    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${this.serviceRoleKey}`,
        'Content-Type': mimeType,
        'x-upsert': 'true',
      },
      body: buffer,
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Storage upload failed (${res.status}): ${body}`);
    }

    return `${this.supabaseUrl}/storage/v1/object/public/${bucket}/${path}`;
  }

  uploadFromBase64(
    bucket: string,
    path: string,
    base64: string,
    mimeType: string,
  ): Promise<string> {
    return this.upload(bucket, path, Buffer.from(base64, 'base64'), mimeType);
  }
}
