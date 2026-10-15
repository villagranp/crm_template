import { Alert, Box, Stack, Tooltip, Typography } from '@mui/material';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { ChartDataTable } from '../common/ChartDataTable';
import { ChartPanel } from '../common/ChartPanel';
import { ReportPage } from '../common/ReportPage';
import { ReportFilterBar, type ReportFilterField } from '../common/ReportFilterBar';
import { catalogOptions, namedOptions, ownerOptions } from '../common/report-filter-options';
import { formatCount } from '../common/report-format';
import { opportunitiesReportHref } from '../common/report-links';
import type { ReportFilterOptions } from '../common/report-types';
import { SourceLink } from '../common/SourceLink';
import { useReportQueryState, type ReportPeriodMode } from '../common/use-report-query-state';
import { useReportFilterOptions } from '../filter-options.queries';
import { useSalesFunnel } from '../report.queries';
import { reportErrorMessage } from '../reports.errors';
import { REPORT_PERMISSIONS } from '../reports.permissions';

import { FunnelChart } from './FunnelChart';
import { FUNNEL_FILTER_KEYS, type FunnelStage, type FunnelUnavailableReason, type SalesFunnel } from './funnel.api';
import { conversionReason, NOT_CALCULABLE, percentText, shareReason, unavailableReasonText } from './funnel-format';

const TITLE = 'Embudo comercial';
const NO_SORT_FIELDS: readonly string[] = [];
const NO_SORT = { field: 'none', direction: 'asc' } as const;
/** Período opcional (cohorte por fecha de identificación); sin él, todas las oportunidades vigentes. */
const PERIOD: ReportPeriodMode = { kind: 'dates', defaultPreset: null, defaultDateBasis: null };

function filterFields(options: ReportFilterOptions | undefined): ReportFilterField[] {
  const disabled = !options;
  const funnelStages = (options?.catalogs.opportunityStages ?? []).filter((stage) => stage.inFunnel);
  return [
    { key: 'stageId', label: 'Etapa', kind: 'select', options: catalogOptions(funnelStages), disabled },
    { key: 'customerId', label: 'Cliente', kind: 'customer' },
    { key: 'companyTypeId', label: 'Tipo de cliente', kind: 'select', options: catalogOptions(options?.catalogs.companyTypes), disabled },
    { key: 'ownerId', label: 'Asesor', kind: 'autocomplete', options: ownerOptions(options?.owners), disabled },
    { key: 'countryId', label: 'País', kind: 'select', options: namedOptions(options?.countries), disabled },
  ];
}

/** Porcentaje o "—" con el motivo visible y en *tooltip* (E.8, AC-05.36). */
function PercentCell({ value, reason, sampleMinimum }: { value: string | null; reason: FunnelUnavailableReason | null; sampleMinimum: number }) {
  if (value !== null || reason === null) {
    return <>{percentText(value)}</>;
  }
  const text = unavailableReasonText(reason, sampleMinimum);
  return (
    <Stack component="span" alignItems="flex-end">
      <Tooltip title={text}>
        <span aria-label={`${NOT_CALCULABLE} (${text})`}>{NOT_CALCULABLE}</span>
      </Tooltip>
      <Typography component="span" variant="caption" color="text.secondary">
        {text}
      </Typography>
    </Stack>
  );
}

/** Aviso cuando la conversión acumulada no se puede calcular para ninguna etapa (RN-05.55). */
function ConversionNotice({ funnel }: { funnel: SalesFunnel }) {
  const reason = funnel.stages.map(conversionReason).find((item): item is FunnelUnavailableReason => item !== null && item !== 'NO_DATA');
  if (!reason || funnel.totalInFunnel === 0) {
    return null;
  }
  return (
    <Alert severity="info" role="status">
      {`La conversión acumulada no se puede calcular: ${unavailableReasonText(reason, funnel.sampleMinimum).toLowerCase()}. La participación de cada etapa sí se muestra.`}
    </Alert>
  );
}

/**
 * Embudo comercial (05 F-41, E.8): barras horizontales por etapa del embudo (`inFunnel`, en su
 * orden) con la cantidad, el % de participación y la conversión acumulada si es calculable
 * (RN-05.53–RN-05.56); porcentajes `null` como "—" con motivo. Filtros de etapa, cliente, tipo
 * de cliente, asesor, país y período en la URL. Clic en una etapa (o su enlace en la tabla) →
 * reporte de oportunidades filtrado por esa etapa y los mismos filtros que admite.
 */
export function SalesFunnelPage() {
  const navigate = useNavigate();
  const state = useReportQueryState({ filterKeys: FUNNEL_FILTER_KEYS, sortableFields: NO_SORT_FIELDS, defaultSort: NO_SORT, period: PERIOD });
  const options = useReportFilterOptions();
  const funnel = useSalesFunnel(state.filterQuery);
  const fields = useMemo(() => filterFields(options.data), [options.data]);
  const data = funnel.data;
  const stages = data?.stages ?? [];
  const errorMessage = funnel.isError ? reportErrorMessage(funnel.error) : null;

  const hrefOf = (stageId: string) =>
    opportunitiesReportHref({
      stageId,
      customerId: state.values.customerId,
      ownerId: state.values.ownerId,
      countryId: state.values.countryId,
      period: state.period,
    });

  const rowOf = (item: FunnelStage, funnelData: SalesFunnel) => ({
    key: item.stage.id,
    cells: [
      <SourceLink key="stage" to={hrefOf(item.stage.id)} permission={REPORT_PERMISSIONS.view} label={`Ver las oportunidades en ${item.stage.label}`}>
        {item.stage.label}
      </SourceLink>,
      formatCount(item.count),
      <PercentCell key="share" value={item.shareOfTotal} reason={shareReason(item)} sampleMinimum={funnelData.sampleMinimum} />,
      <PercentCell key="conversion" value={item.cumulativeConversion} reason={conversionReason(item)} sampleMinimum={funnelData.sampleMinimum} />,
    ],
  });

  return (
    <ReportPage
      title={TITLE}
      subtitle="Oportunidades por etapa vigente del embudo. El período filtra por fecha de identificación."
      filterOptionsFailed={options.isError}
    >
      <ReportFilterBar
        label="Filtros del embudo comercial"
        fields={fields}
        values={state.values}
        onApply={state.apply}
        onClear={state.clear}
        period={{ kind: 'dates', period: state.period, isDefault: false, today: state.today, defaultDateBasis: null, allowEmpty: true }}
      >
        {state.values.stageId ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            Los porcentajes se calculan sobre el embudo completo con el resto de filtros.
          </Typography>
        ) : null}
      </ReportFilterBar>
      {data ? (
        <Typography variant="body2" color="text.secondary" data-testid="funnel-total">
          {`Oportunidades en el embudo: ${formatCount(data.totalInFunnel)}`}
        </Typography>
      ) : null}
      {data ? <ConversionNotice funnel={data} /> : null}
      <Box>
        <ChartPanel
          title="Oportunidades por etapa del embudo"
          description="Cantidad por etapa vigente, % del total del embudo y conversión acumulada (alcanzaron la etapa / alcanzaron la primera)."
          isLoading={funnel.isPending}
          errorMessage={errorMessage}
          onRetry={() => void funnel.refetch()}
          isEmpty={stages.length === 0}
          emptyMessage="No hay etapas del embudo para los filtros seleccionados."
          chart={data ? <FunnelChart funnel={data} onStageClick={(stageId) => navigate(hrefOf(stageId))} /> : null}
          table={
            data ? (
              <ChartDataTable
                label="Embudo comercial"
                columns={[
                  { key: 'stage', header: 'Etapa' },
                  { key: 'count', header: 'Cantidad', align: 'right' },
                  { key: 'share', header: '% del embudo', align: 'right' },
                  { key: 'conversion', header: 'Conversión acumulada', align: 'right' },
                ]}
                rows={stages.map((item) => rowOf(item, data))}
              />
            ) : null
          }
        />
      </Box>
    </ReportPage>
  );
}
