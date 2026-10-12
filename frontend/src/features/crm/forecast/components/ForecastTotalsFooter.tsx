import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { Box, Button, Stack, TableCell, TableFooter, TableRow, Typography } from '@mui/material';
import { useId, useState } from 'react';

import { formatQuantity, formatTonnage } from '@/features/crm/common/decimal';

import type { ForecastTotals, YearMonth } from '../forecast.api';
import { periodHeader, periodKey } from '../forecast-format';

export interface ForecastTotalsFooterProps {
  totals: ForecastTotals;
  /** Períodos de las columnas, en orden. */
  periods: readonly (YearMonth & { offset: number })[];
  /** Columnas antes de los períodos (producto, unidad). */
  leadingColumns: number;
  /** Columnas después del total de fila (fecha de actualización). */
  trailingColumns: number;
}

function withoutConversionText(count: number): string {
  return count === 1 ? '1 línea sin conversión no suma en toneladas.' : `${count} líneas sin conversión no suman en toneladas.`;
}

/**
 * Pie de la matriz (03 §E.8, RN-03.74, AC-03.74): toneladas por período,
 * acumulado corrido y total de la ventana, cantidades por unidad (una fila por
 * unidad, nunca mezcladas) y cuántas líneas no suman por no tener conversión.
 * Son los totales del backend sobre todas las filas filtradas (no la página) y
 * reflejan lo guardado.
 */
export function ForecastTotalsFooter({ totals, periods, leadingColumns, trailingColumns }: ForecastTotalsFooterProps) {
  const [unitsOpen, setUnitsOpen] = useState(false);
  const unitsId = useId();
  const byPeriod = new Map(totals.periods.map((period) => [periodKey(period), period]));
  const span = leadingColumns + periods.length + 1 + trailingColumns;
  const head = (text: string) => (
    <TableCell component="th" scope="row" colSpan={leadingColumns} sx={{ fontWeight: 'fontWeightMedium', position: 'sticky', left: 0, bgcolor: 'background.subtle', zIndex: 1 }}>
      {text}
    </TableCell>
  );

  return (
    <TableFooter aria-label="Totales del forecast" sx={{ '& td, & th': { bgcolor: 'background.subtle', color: 'text.primary', typography: 'body2' } }}>
      <TableRow>
        {head('Total toneladas')}
        {periods.map((period) => (
          <TableCell key={periodKey(period)} align="right" aria-label={`Total toneladas ${periodHeader(period)}`}>
            {formatTonnage(byPeriod.get(periodKey(period))?.tonnage ?? '0')}
          </TableCell>
        ))}
        <TableCell align="right" sx={{ fontWeight: 'fontWeightMedium' }}>
          {formatTonnage(totals.windowTonnage)}
        </TableCell>
        {trailingColumns > 0 ? <TableCell colSpan={trailingColumns} /> : null}
      </TableRow>
      <TableRow>
        {head('Acumulado')}
        {periods.map((period) => (
          <TableCell key={periodKey(period)} align="right" aria-label={`Acumulado ${periodHeader(period)}`}>
            {formatTonnage(byPeriod.get(periodKey(period))?.accumulatedTonnage ?? '0')}
          </TableCell>
        ))}
        <TableCell align="right" sx={{ fontWeight: 'fontWeightMedium' }} aria-label="Total de la ventana">
          {formatTonnage(totals.windowTonnage)}
        </TableCell>
        {trailingColumns > 0 ? <TableCell colSpan={trailingColumns} /> : null}
      </TableRow>
      <TableRow>
        <TableCell colSpan={span}>
          <Stack direction="row" spacing={2} useFlexGap flexWrap="wrap" alignItems="center">
            <Button
              size="small"
              variant="text"
              aria-expanded={unitsOpen}
              aria-controls={unitsId}
              endIcon={unitsOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              onClick={() => setUnitsOpen((open) => !open)}
              disabled={totals.quantitiesByUnit.length === 0}
            >
              Cantidades por unidad
            </Button>
            <Typography variant="caption" color={totals.linesWithoutConversion > 0 ? 'warning.main' : 'text.secondary'}>
              {withoutConversionText(totals.linesWithoutConversion)}
            </Typography>
          </Stack>
        </TableCell>
      </TableRow>
      {unitsOpen
        ? totals.quantitiesByUnit.map((unit, index) => {
            const quantities = new Map(unit.byPeriod.map((item) => [periodKey(item), item.quantity]));
            return (
              <TableRow key={unit.unit.id} id={index === 0 ? unitsId : undefined}>
                {head(`${unit.unit.code} (${unit.unit.symbol})`)}
                {periods.map((period) => (
                  <TableCell key={periodKey(period)} align="right">
                    {formatQuantity(quantities.get(periodKey(period)) ?? '0', unit.unit.symbol)}
                  </TableCell>
                ))}
                <TableCell align="right">{formatQuantity(unit.total, unit.unit.symbol)}</TableCell>
                {trailingColumns > 0 ? <TableCell colSpan={trailingColumns} /> : null}
              </TableRow>
            );
          })
        : null}
    </TableFooter>
  );
}

/** Totales en móvil (03 §E.8): un panel al final de las tarjetas, con la misma información. */
export function ForecastTotalsPanel({ totals, periods }: Pick<ForecastTotalsFooterProps, 'totals' | 'periods'>) {
  const byPeriod = new Map(totals.periods.map((period) => [periodKey(period), period]));
  return (
    <Box component="section" aria-label="Totales del forecast" sx={{ p: 2, borderRadius: 1, bgcolor: 'background.subtle' }}>
      <Typography variant="subtitle2" component="h3" sx={{ mb: 1 }}>
        {`Total de la ventana: ${formatTonnage(totals.windowTonnage)}`}
      </Typography>
      <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto', columnGap: 2, rowGap: 0.5 }}>
        {periods.map((period) => {
          const total = byPeriod.get(periodKey(period));
          return (
            <Box key={periodKey(period)} sx={{ display: 'contents' }}>
              <Typography component="dt" variant="body2">
                {periodHeader(period)}
              </Typography>
              <Typography component="dd" variant="body2" sx={{ m: 0, textAlign: 'right' }}>
                {formatTonnage(total?.tonnage ?? '0')}
              </Typography>
              <Typography component="dd" variant="caption" color="text.secondary" sx={{ m: 0, textAlign: 'right' }}>
                {`Acum. ${formatTonnage(total?.accumulatedTonnage ?? '0')}`}
              </Typography>
            </Box>
          );
        })}
      </Box>
      {totals.quantitiesByUnit.length > 0 ? (
        <Typography variant="body2" sx={{ mt: 1.5 }}>
          {`Cantidades por unidad: ${totals.quantitiesByUnit.map((unit) => formatQuantity(unit.total, unit.unit.symbol)).join(' · ')}`}
        </Typography>
      ) : null}
      <Typography variant="caption" color={totals.linesWithoutConversion > 0 ? 'warning.main' : 'text.secondary'} component="p" sx={{ mt: 1 }}>
        {withoutConversionText(totals.linesWithoutConversion)}
      </Typography>
    </Box>
  );
}
