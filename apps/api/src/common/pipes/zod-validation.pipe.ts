import type { PipeTransform } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import type { ZodSchema, ZodError } from 'zod';

/**
 * Pipe genérico que valida el payload de un endpoint contra un schema Zod.
 *
 * Uso:
 *   @Post()
 *   create(@Body(new ZodValidationPipe(CreateDoctorSchema)) dto: CreateDoctorDto) { ... }
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: 'Payload inválido',
        errors: this.formatErrors(result.error),
      });
    }
    return result.data;
  }

  private formatErrors(error: ZodError) {
    return error.issues.map((i) => ({
      field: i.path.join('.'),
      message: i.message,
    }));
  }
}
