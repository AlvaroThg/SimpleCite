import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';

/**
 * Almacenamiento de archivos en Cloudflare R2 (compatible con la API S3).
 *
 * R2 expone un endpoint S3 (`https://<accountId>.r2.cloudflarestorage.com`).
 * Las URLs públicas NO salen de ese endpoint: el bucket debe tener habilitado
 * el acceso público (subdominio `*.r2.dev`) o un dominio propio conectado; esa
 * base se configura en `R2_PUBLIC_URL`.
 *
 * Carpetas (prefijos) dentro del bucket:
 *   assets/<tenantId>   — logos, QR estático, portada del tenant
 *   receipts/<tenantId> — comprobantes de pago enviados por WhatsApp
 */
@Injectable()
export class StorageService {
  private readonly client: S3Client | null;
  private readonly bucket: string;
  private readonly publicUrl: string;

  constructor(config: ConfigService) {
    const accountId = config.get<string>('R2_ACCOUNT_ID');
    const accessKeyId = config.get<string>('R2_ACCESS_KEY_ID');
    const secretAccessKey = config.get<string>('R2_SECRET_ACCESS_KEY');
    // Endpoint explícito o derivado del account id.
    const endpoint =
      config.get<string>('R2_ENDPOINT') ??
      (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '');

    this.bucket = config.get<string>('R2_BUCKET') ?? '';
    // Sin barra final para concatenar limpio con la key.
    this.publicUrl = (config.get<string>('R2_PUBLIC_URL') ?? '').replace(/\/+$/, '');

    this.client =
      accessKeyId && secretAccessKey && endpoint && this.bucket
        ? new S3Client({
            region: 'auto', // R2 ignora la región pero el SDK la exige
            endpoint,
            credentials: { accessKeyId, secretAccessKey },
          })
        : null;
  }

  /**
   * Sube una imagen a R2 con un nombre UUID dentro de `folder` y devuelve la
   * URL pública (`R2_PUBLIC_URL/folder/<uuid>.<ext>`).
   *
   * @param folder   prefijo lógico, p.ej. `assets/<tenantId>` o `receipts/<tenantId>`
   * @param buffer   contenido del archivo
   * @param mimeType ej: image/png — define la extensión y el Content-Type
   */
  async uploadImage(folder: string, buffer: Buffer, mimeType: string): Promise<string> {
    if (!this.client || !this.bucket || !this.publicUrl) {
      throw new InternalServerErrorException(
        'Almacenamiento R2 no configurado. Revisa R2_ACCOUNT_ID/R2_ENDPOINT, ' +
          'R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET y R2_PUBLIC_URL.',
      );
    }

    const ext = (mimeType.split('/')[1] ?? 'bin').replace('jpeg', 'jpg');
    const key = `${folder.replace(/^\/+|\/+$/g, '')}/${randomUUID()}.${ext}`;

    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: buffer,
          ContentType: mimeType,
        }),
      );
    } catch (err) {
      throw new InternalServerErrorException(
        `Fallo al subir el archivo a Cloudflare R2: ${(err as Error).message}. ` +
          'Verifica las credenciales R2 y el nombre del bucket.',
      );
    }

    return `${this.publicUrl}/${key}`;
  }

  /** Igual que `uploadImage` pero recibiendo el contenido en base64. */
  uploadImageFromBase64(folder: string, base64: string, mimeType: string): Promise<string> {
    return this.uploadImage(folder, Buffer.from(base64, 'base64'), mimeType);
  }
}
