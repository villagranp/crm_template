import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import { Box, Typography } from '@mui/material';

import { fontSizes } from '@/theme/tokens';

import {
  formatCompliance,
  formatPeriodRange,
  formatTargetValue,
  TARGET_METRIC_LABELS,
} from '../dashboard-format';
import { useTargetIndicators } from '../dashboard.queries';
import type { DashboardPeriod } from '../dashboard.types';
import { KpiCard } from './KpiCard';

export const TARGETS_LABEL = 'Metas y cumplimiento';

/**
 * K9 Metas y cumplimiento (01 §E.3, RN-01.18, DM-9). Sólo se monta con
 * `metas.ver` (lo decide `KpiGrid`). Sin metas aplicables: "Sin metas
 * configuradas" y ningún número; con objetivo 0: cumplimiento "No calculable".
 * Los importes `AMOUNT` están en USD (RN-01.32). No tiene destino propio.
 */
export function TargetsCard({ period }: { period: DashboardPeriod }) {
  const query = useTargetIndicators(period, true);
  const data = query.data;
  const [main] = data?.items ?? [];

  let value: string | undefined;
  let foot: string | undefined;
  if (data && (!data.hasTargets || !main)) {
    value = 'Sin metas configuradas';
  } else if (data && main) {
    value = formatCompliance(main.compliancePercent);
    foot = `Período: ${formatPeriodRange(data.period)}`;
  }

  return (
    <KpiCard
      label={TARGETS_LABEL}
      icon={<FlagOutlinedIcon />}
      isLoading={query.isPending}
      error={query.isError ? query.error : undefined}
      onRetry={() => void query.refetch()}
      value={value}
      foot={foot}
      generatedAt={data?.generatedAt}
    >
      {data?.hasTargets && data.items.length > 0 ? (
        <Box
          component="ul"
          aria-label="Metas del período"
          sx={{ listStyle: 'none', m: 0, mt: 1, p: 0 }}
        >
          {data.items.map((item, index) => (
            <Box
              component="li"
              key={item.targetId ?? `${item.metric}-${item.subject.type}-${index}`}
              sx={{
                fontSize: fontSizes.small,
                py: 0.5,
                borderTop: index === 0 ? 0 : 1,
                borderColor: 'divider',
              }}
            >
              <Typography
                component="span"
                sx={{ fontWeight: 600, fontSize: 'inherit', display: 'block' }}
              >
                {TARGET_METRIC_LABELS[item.metric]} · {item.subject.label}
              </Typography>
              <Typography component="span" sx={{ fontSize: 'inherit', color: 'text.secondary' }}>
                Objetivo {formatTargetValue(item.targetValue, item)} · Logrado{' '}
                {formatTargetValue(item.achievedValue, item)} · Cumplimiento{' '}
                {formatCompliance(item.compliancePercent)}
              </Typography>
            </Box>
          ))}
        </Box>
      ) : null}
    </KpiCard>
  );
}
