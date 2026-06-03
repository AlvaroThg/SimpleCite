import { Module } from '@nestjs/common';
import { PatientsService } from './application/services/patients.service';
import { ClinicalNotesService } from './application/services/clinical-notes.service';
import { PatientsController } from './infrastructure/adapters/patients.controller';

/**
 * PatientsModule — Pacientes, historial clínico (EHR) y dedupe de identidad.
 *
 * Exporta PatientsService para que el flujo de booking público / bot puedan
 * deduplicar pacientes (findOrCreate con normalización de phone + ci).
 */
@Module({
  controllers: [PatientsController],
  providers: [PatientsService, ClinicalNotesService],
  exports: [PatientsService],
})
export class PatientsModule {}
