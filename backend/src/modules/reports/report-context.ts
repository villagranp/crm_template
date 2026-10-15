import { Inject, Injectable } from '@nestjs/common';

import { PermissionDeniedError } from '@/common/errors/application-error';
import type { AuditContext } from '@/modules/audit/audit.service';
import type { AppRequest } from '@/common/types/request-context';
import { AccessService } from '@/modules/access/access.service';
import type { DataScope } from '@/modules/access/ports/access.repository.port';
import { VisibilityScopeResolver } from '@/modules/access/visibility-scope.resolver';
import { BUSINESS_CLOCK, type BusinessClock } from '@/modules/commercial-metrics/business-clock';
import type { MetricContext } from '@/modules/commercial-metrics/ports/commercial-metrics-read-model.port';
import { ParameterReader } from '@/modules/parameters/parameter-reader';

/** Permisos del módulo (00 §5.2, 05 H.1). */
export const REPORT_PERMISSIONS = {
  view: 'reportes.ver',
  export: 'reportes.exportar',
} as const;

/** Parámetros que leen los reportes (05 D.5, 00 §8.2). */
export const REPORT_PARAMETERS = {
  timeZone: 'crm.zona_horaria_negocio',
  forecastHorizon: 'crm.forecast.horizonte_meses',
  tonnageUnit: 'crm.forecast.unidad_tonelaje',
  dueSoonHours: 'crm.alertas.actividad_por_vencer_horas',
  upcomingVisitDays: 'crm.inicio.visitas_proximas_dias',
  maxExportRows: 'crm.reportes.max_filas_exportacion',
} as const;

/** Contexto de una consulta de reportes: alcance de `reportes.ver`, reloj del negocio y correlación. */
export interface ReportContext extends MetricContext {
  readonly userId: string;
  /** Alcance efectivo de `reportes.ver` (Propios / Equipo / País / Organización). */
  readonly dataScope: DataScope;
  readonly correlationId: string;
  /** Quién consulta y desde dónde (auditoría de la exportación, RN-05.43). */
  readonly audit: AuditContext;
}

/**
 * Resuelve quién consulta y con qué alcance (05 H.1). Todas las consultas del módulo
 * usan el alcance de **`reportes.ver`** (D-05.11: no se exige además el `.ver` de cada
 * entidad), aplicado por entidad con las columnas y herencias de 00 §4.2.
 *
 * Deny-by-default: sin alcance resuelto (sin cuenta local o sin el permiso) no se
 * ejecuta ninguna consulta (`403`), aunque el guard ya haya exigido el permiso.
 */
@Injectable()
export class ReportContextResolver {
  constructor(
    private readonly access: AccessService,
    private readonly scopes: VisibilityScopeResolver,
    private readonly parameters: ParameterReader,
    @Inject(BUSINESS_CLOCK) private readonly clock: BusinessClock,
  ) {}

  async fromRequest(request: AppRequest): Promise<ReportContext> {
    const { userId, audit } = await this.access.resolveActor(request);
    const scope = await this.scopes.resolve(userId, REPORT_PERMISSIONS.view);
    if (userId === null || scope.dataScope === 'NONE') throw new PermissionDeniedError(REPORT_PERMISSIONS.view);
    const businessTimeZone = await this.parameters.get<string>(REPORT_PARAMETERS.timeZone);
    return { userId, scope, dataScope: scope.dataScope, now: this.clock.now(), businessTimeZone, correlationId: audit.correlationId, audit };
  }
}
