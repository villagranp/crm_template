import { Box, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';

import { LazyBarChart } from '../charts/LazyCharts';
import { ChartPanel } from '../common/ChartPanel';
import { formatCount } from '../common/report-format';

import type { OpportunityReportSummary } from './opportunities-report.api';

/**
 * Distribuciones del reporte de oportunidades (05 E.3, RN-05.30, RN-05.31): por etapa (todas
 * las activas en orden, también con 0) y por asesor. Por etapa: barras horizontales
 * (`@mui/x-charts` Community en diferido, ADR-023) con la tabla como "Ver como tabla"; por
 * asesor: tabla (E.3 no pide gráfica para ella).
 */
export interface OpportunityDistributionsProps {
  summary: OpportunityReportSummary | undefined;
  isLoading: boolean;
  errorMessage: string | null;
  onRetry: () => void;
}

export function OpportunityDistributions({ summary, isLoading, errorMessage, onRetry }: OpportunityDistributionsProps) {
  const stages = summary?.byStage ?? [];
  const owners = summary?.byOwner ?? [];
  const stageLabel = (item: (typeof stages)[number]) => (item.stage.isActive ? item.stage.label : `${item.stage.label} (inactiva)`);
  return (
    <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' } }}>
      <ChartPanel
        title="Distribución por etapa"
        description="Etapa vigente de las oportunidades filtradas; incluye las etapas sin oportunidades."
        isLoading={isLoading}
        errorMessage={errorMessage}
        onRetry={onRetry}
        isEmpty={stages.length === 0}
        chart={
          <LazyBarChart
            ariaLabel="Oportunidades por etapa"
            layout="horizontal"
            categories={stages.map(stageLabel)}
            series={[{ key: 'count', label: 'Oportunidades', tone: 'primary', values: stages.map((item) => item.count) }]}
          />
        }
        table={
          <TableContainer className="scroll-x">
            <Table size="small" aria-label="Oportunidades por etapa">
              <TableHead>
                <TableRow>
                  <TableCell>Etapa</TableCell>
                  <TableCell align="right">Oportunidades</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {stages.map((item) => (
                  <TableRow key={item.stage.id}>
                    <TableCell>{stageLabel(item)}</TableCell>
                    <TableCell align="right">{formatCount(item.count)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        }
      />
      <ChartPanel
        title="Distribución por asesor"
        description="Por asesor de la oportunidad. Ganadas incluye las parciales."
        isLoading={isLoading}
        errorMessage={errorMessage}
        onRetry={onRetry}
        isEmpty={owners.length === 0}
        table={
          <TableContainer className="scroll-x">
            <Table size="small" aria-label="Oportunidades por asesor">
              <TableHead>
                <TableRow>
                  <TableCell>Asesor</TableCell>
                  <TableCell align="right">Total</TableCell>
                  <TableCell align="right">Abiertas</TableCell>
                  <TableCell align="right">Ganadas</TableCell>
                  <TableCell align="right">Parciales</TableCell>
                  <TableCell align="right">Perdidas</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {owners.map((item) => (
                  <TableRow key={item.owner.id}>
                    <TableCell>{item.owner.displayName}</TableCell>
                    <TableCell align="right">{formatCount(item.total)}</TableCell>
                    <TableCell align="right">{formatCount(item.open)}</TableCell>
                    <TableCell align="right">{formatCount(item.won)}</TableCell>
                    <TableCell align="right">{formatCount(item.partial)}</TableCell>
                    <TableCell align="right">{formatCount(item.lost)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        }
      />
    </Box>
  );
}
