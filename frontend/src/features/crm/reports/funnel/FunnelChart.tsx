import { LazyBarChart } from '../charts/LazyCharts';
import { formatCount } from '../common/report-format';

import { barLabelText, conversionReason, percentText, unavailableReasonText } from './funnel-format';
import type { SalesFunnel } from './funnel.api';

/**
 * Embudo comercial como **barras horizontales** (05 E.8, ADR-023): `BarChart` de
 * `@mui/x-charts` Community en `layout="horizontal"`, una barra por etapa en `metadata.order`
 * con la cantidad y el % de participación junto a la barra. **No** usa el `FunnelChart` de la
 * edición Pro (lo vigila `charts-architecture.spec.ts`). Una sola serie (sin leyenda: el título
 * del panel la nombra); la tabla equivalente está en "Ver como tabla".
 */
export interface FunnelChartProps {
  funnel: SalesFunnel;
  onStageClick: (stageId: string) => void;
}

export function FunnelChart({ funnel, onStageClick }: FunnelChartProps) {
  const { stages, sampleMinimum } = funnel;
  return (
    <LazyBarChart
      ariaLabel="Embudo comercial por etapa"
      layout="horizontal"
      categories={stages.map((item) => item.stage.label)}
      series={[
        {
          key: 'count',
          label: 'Oportunidades',
          tone: 'primary',
          values: stages.map((item) => item.count),
          formatValue: (_value, index) => {
            const stage = stages[index];
            if (!stage) {
              return '';
            }
            const reason = conversionReason(stage);
            const conversion = reason ? `${percentText(null)} (${unavailableReasonText(reason, sampleMinimum)})` : percentText(stage.cumulativeConversion);
            return `${formatCount(stage.count)} · ${percentText(stage.shareOfTotal)} del embudo · conversión acumulada ${conversion}`;
          },
        },
      ]}
      barLabel={(_value, index) => {
        const stage = stages[index];
        return stage ? barLabelText(stage) : null;
      }}
      onItemClick={(index) => {
        const stage = stages[index];
        if (stage) {
          onStageClick(stage.stage.id);
        }
      }}
    />
  );
}
