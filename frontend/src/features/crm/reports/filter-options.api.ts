import { httpClient } from '@/services/api';

import type { ReportFilterOptions } from './common/report-types';

/** `GET /reports/filter-options` (05 F.1): asesores, países, catálogos y familias visibles para el usuario. */
export function getReportFilterOptions(): Promise<ReportFilterOptions> {
  return httpClient.get<ReportFilterOptions>('/reports/filter-options');
}
