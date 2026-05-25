import { Controller, Get } from '@nestjs/common';
import { Public } from '../../../../common/decorators/public.decorator';
import type { PrismaService } from '../../../../common/database/prisma.service';

@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    // Verificar conectividad con la base de datos
    let dbStatus = 'ok';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      dbStatus = 'error';
    }

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'SimpleCite API',
      version: '0.1.0',
      database: dbStatus,
    };
  }
}
