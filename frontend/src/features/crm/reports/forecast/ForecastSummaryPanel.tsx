import { Alert, Button, Card, CardContent, CardHeader, Skeleton, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';

import { ReportDateTime } from '../common/ReportDateTime';
import { formatMonth, formatQuantityWithUnit, formatTons, monthKey } from '../common/report-format';

import type { ForecastReportSummary } from './forecast-report.api';
import { quantitiesText, withoutConversionText } from './forecast-report-format';

/**
 * Resumen del forecast (05 E.4, RN-05.34, RN-05.35): totales mensuales en toneladas, acumulado,
 * cantidades por unidad (una fila por unidad, nunca mezcladas), líneas sin conversión y última
 * actualización; con aviso de "datos sin conversión" (E.1) cuando las hay.
 */
export interface ForecastSummaryPanelProps {
  summary: ForecastReportSummary | undefined;
  isLoading: boolean;
  errorMessage: string | null;
  onRetry: () => void;
}

export function ForecastSummaryPanel({ summary, isLoading, errorMessage, onRetry }: ForecastSummaryPanelProps) {
  if (errorMessage) {
    return (
      <Alert
        severity="error"
        role="alert"
        action={
          <Button color="inherit" size="small" onClick={onRetry}>
            Reintentar
          </Button>
        }
      >
        {`No se pudo cargar el resumen. ${errorMessage}`}
      </Alert>
    );
  }
  if (isLoading || !summary) {
    return (
      <Card>
        <CardContent role="status" aria-label="Cargando el resumen del forecast">
          <Skeleton variant="text" />
          <Skeleton variant="text" />
          <Skeleton variant="text" width="60%" />
        </CardContent>
      </Card>
    );
  }

  const units = new Map<string, { symbol: string; byMonth: Map<string, { quantity: string; cumulative: string }> }>();
  for (const month of summary.months) {
    for (const item of month.quantities) {
      const entry = units.get(item.unit.id) ?? { symbol: item.unit.symbol, byMonth: new Map() };
      entry.byMonth.set(monthKey(month), { quantity: item.quantity, cumulative: item.cumulative });
      units.set(item.unit.id, entry);
    }
  }
  const withoutConversion = withoutConversionText(summary.totals.linesWithoutConversion);

  return (
    <Card component="section" aria-label="Resumen del forecast">
      <CardHeader
        title="Totales por mes"
        titleTypographyProps={{ component: 'h2', variant: 'h6' }}
        subheader={
          <Stack component="span" direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 0, sm: 2 }}>
            <span>{`Total del rango: ${formatTons(summary.totals.tonnage)} · ${summary.lineCount} líneas`}</span>
            <span>
              {'Última actualización: '}
              {summary.lastUpdatedAt ? <ReportDateTime value={summary.lastUpdatedAt} /> : 'sin proyecciones'}
            </span>
          </Stack>
        }
        subheaderTypographyProps={{ variant: 'body2', component: 'div' }}
      />
      <CardContent>
        <Stack spacing={2}>
          {withoutConversion ? (
            <Alert severity="warning">
              {`${withoutConversion}: se muestran en su unidad y no suman en las toneladas.`}
            </Alert>
          ) : null}
          <TableContainer className="scroll-x">
            <Table size="small" aria-label="Totales mensuales del forecast">
              <TableHead>
                <TableRow>
                  <TableCell component="th" scope="col">
                    Concepto
                  </TableCell>
                  {summary.months.map((month) => (
                    <TableCell key={monthKey(month)} align="right" sx={{ whiteSpace: 'nowrap' }}>
                      {formatMonth(month)}
                    </TableCell>
                  ))}
                  <TableCell align="right">Total</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell component="th" scope="row">
                    Tonelaje (t)
                  </TableCell>
                  {summary.months.map((month) => (
                    <TableCell key={monthKey(month)} align="right" sx={{ whiteSpace: 'nowrap' }}>
                      {formatTons(month.tonnage)}
                    </TableCell>
                  ))}
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap', fontWeight: 600 }}>
                    {formatTons(summary.totals.tonnage)}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell component="th" scope="row">
                    Acumulado (t)
                  </TableCell>
                  {summary.months.map((month) => (
                    <TableCell key={monthKey(month)} align="right" sx={{ whiteSpace: 'nowrap' }}>
                      {formatTons(month.cumulativeTonnage)}
                    </TableCell>
                  ))}
                  <TableCell />
                </TableRow>
                {[...units.entries()].map(([unitId, unit]) => (
                  <TableRow key={unitId}>
                    <TableCell component="th" scope="row">{`Cantidad (${unit.symbol})`}</TableCell>
                    {summary.months.map((month) => (
                      <TableCell key={monthKey(month)} align="right" sx={{ whiteSpace: 'nowrap' }}>
                        {formatQuantityWithUnit(unit.byMonth.get(monthKey(month))?.quantity ?? '0', unit.symbol)}
                      </TableCell>
                    ))}
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap', fontWeight: 600 }}>
                      {formatQuantityWithUnit(summary.totals.quantities.find((item) => item.unit.id === unitId)?.quantity ?? '0', unit.symbol)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell component="th" scope="row">
                    Líneas sin conversión
                  </TableCell>
                  {summary.months.map((month) => (
                    <TableCell key={monthKey(month)} align="right">
                      {month.linesWithoutConversion}
                    </TableCell>
                  ))}
                  <TableCell align="right" sx={{ fontWeight: 600 }}>
                    {summary.totals.linesWithoutConversion}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
          {summary.totals.quantities.length > 0 ? (
            <Typography variant="body2" color="text.secondary">{`Cantidades del rango por unidad: ${quantitiesText(summary.totals.quantities)}`}</Typography>
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  );
}
