/**
 * Tipos de los DTO de Reportes (05 F.3), espejo de `backend/src/modules/reports/dto/report-response.dto.ts`.
 * Decimales como cadena (nunca `number`), instantes ISO-8601 UTC y fechas `YYYY-MM-DD`.
 */

export interface ReportNamedRef {
  id: string;
  name: string;
}

export interface ReportLabelRef {
  id: string;
  label: string;
}

export interface ReportUserRef {
  id: string;
  displayName: string;
}

export interface ReportProjectRef {
  id: string;
  code: string;
  name: string;
}

export interface ReportUnitRef {
  id: string;
  code: string;
  symbol: string;
}

export type ReportScope = 'OWN' | 'TEAM' | 'COUNTRY' | 'ORGANIZATION';

export interface ReportCatalogOption {
  id: string;
  code: string;
  label: string;
  /** Los inactivos se ofrecen para consultar históricos (P-05.7). */
  isActive: boolean;
}

export interface ReportStageOption extends ReportCatalogOption {
  order: number;
  isClosed: boolean;
  inFunnel: boolean;
}

export interface ReportPhaseOption extends ReportCatalogOption {
  order: number;
  isFinal: boolean;
}

export type VisitCategory = 'SCHEDULED' | 'COMPLETED' | 'CONFIRMED' | 'CANCELLED';
export type ActivityCategory = 'PENDING' | 'OVERDUE' | 'COMPLETED' | 'CANCELLED';

export interface ReportVisitStatusOption extends ReportCatalogOption {
  category: VisitCategory;
}

export interface ReportActivityStatusOption extends ReportCatalogOption {
  group: 'OPEN' | 'COMPLETED' | 'CANCELLED';
}

export interface ReportPriorityOption extends ReportCatalogOption {
  weight: number;
}

/** `ReportFilterOptionsDto` (`GET /reports/filter-options`): sólo lo visible para el usuario. */
export interface ReportFilterOptions {
  owners: ReportUserRef[];
  countries: ReportNamedRef[];
  catalogs: {
    opportunityStages: ReportStageOption[];
    projectPhases: ReportPhaseOption[];
    projectTypes: ReportCatalogOption[];
    visitStatuses: ReportVisitStatusOption[];
    activityStatuses: ReportActivityStatusOption[];
    activityTypes: ReportCatalogOption[];
    priorities: ReportPriorityOption[];
    companyTypes: ReportCatalogOption[];
  };
  productFamilies: ReportNamedRef[];
  scope: ReportScope;
  /** `crm.zona_horaria_negocio`: "hoy", períodos y fechas de calendario (aditivo, P-05.27). */
  businessTimeZone: string;
  /** Zona del perfil del usuario para los instantes (sin ella, la del negocio). */
  timeZone: string;
}

export interface ForecastMonthRef {
  year: number;
  month: number;
}
