import { Injectable, InternalServerErrorException } from '@nestjs/common';
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
    // Config faltante: mensaje claro en vez de un 500 genérico.
    if (!this.supabaseUrl || !this.serviceRoleKey) {
      throw new InternalServerErrorException(
        'Almacenamiento no configurado: faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.',
      );
    }

    const url = `${this.supabaseUrl}/storage/v1/object/${bucket}/${path}`;

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${this.serviceRoleKey}`,
          'Content-Type': mimeType,
          'x-upsert': 'true',
        },
        body: buffer,
      });
    } catch {
      throw new InternalServerErrorException(
        'No se pudo conectar con Supabase Storage. Verifica la configuración de Storage y tu conexión.',
      );
    }

    if (!res.ok) {
      // Lanzamos HttpException (no Error plano) para que el mensaje descriptivo
      // llegue al cliente en vez del genérico "Internal server error" de Nest.
      const detail =
        res.status === 404
          ? `el bucket "${bucket}" no existe o no es público`
          : res.status === 401 || res.status === 403
            ? 'credenciales inválidas (revisa SUPABASE_SERVICE_ROLE_KEY)'
            : `error HTTP ${res.status}`;
      throw new InternalServerErrorException(
        `Fallo al subir el archivo: ${detail}. Verifica la configuración de Supabase Storage.`,
      );
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
