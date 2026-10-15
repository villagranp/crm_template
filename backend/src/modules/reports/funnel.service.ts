import { Injectable } from '@nestjs/common';

import { CommercialMetricsService, type SalesFunnel } from '@/modules/commercial-metrics/commercial-metrics.service';

import type { ReportContext } from './report-context';
import { opportunityCriteria } from './report-criteria';

export interface FunnelFilter {
  readonly from?: string;
  readonly to?: string;
  readonly stageId?: readonly string[];
  readonly customerId?: readonly string[];
  readonly companyTypeId?: readonly string[];
  readonly ownerId?: readonly string[];
  readonly countryId?: readonly string[];
}

/**
 * Embudo comercial (05 F-41, E.8, RN-05.53–RN-05.57). Cohorte por fecha de
 * identificación (`IDENTIFIED`, C.2) cuando hay período. El filtro de etapa **no** entra
 * en el criterio: solo limita las barras (RN-05.56), así los porcentajes son siempre los
 * del embudo completo del resto de filtros.
 */
@Injectable()
export class FunnelService {
  constructor(private readonly metrics: CommercialMetricsService) {}

  async funnel(ctx: ReportContext, filter: FunnelFilter): Promise<SalesFunnel> {
    const semantics = await this.metrics.semantics();
    const criteria = {
      ...opportunityCriteria(
        { from: filter.from, to: filter.to, dateBasis: 'IDENTIFIED', ownerId: filter.ownerId, customerId: filter.customerId, countryId: filter.countryId },
        ctx,
        semantics,
      ),
      companyTypeIds: filter.companyTypeId ? [...new Set(filter.companyTypeId)] : [],
    };
    return this.metrics.funnel(criteria, semantics, filter.stageId ? [...new Set(filter.stageId)] : []);
  }
}
