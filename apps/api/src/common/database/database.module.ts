import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Módulo global de base de datos.
 * Exporta PrismaService para que esté disponible en toda la app
 * sin necesidad de importar DatabaseModule en cada módulo.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class DatabaseModule {}
