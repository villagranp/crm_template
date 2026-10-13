import SyncDisabledOutlinedIcon from '@mui/icons-material/SyncDisabledOutlined';
import { Box, Tooltip, Typography } from '@mui/material';
import type { KeyboardEvent } from 'react';

import { DecimalField } from '@/features/crm/common/DecimalField';
import { DECIMAL_SPECS, formatQuantity, formatTonnage, normalizeDecimal } from '@/features/crm/common/decimal';
import { NO_CONVERSION_HELP } from '@/features/crm/projects';
import { softTintsFor } from '@/theme/tokens';

import type { ForecastCell } from '../forecast.api';
import { updatedText } from '../forecast-format';

export interface ForecastCellEditorProps {
  cell: ForecastCell;
  /** Nombre accesible ("Cantidad de VAR-3 en M+1 (ene 2027)"). */
  label: string;
  /** Valor del borrador; `undefined` = sin cambios (se muestra lo guardado). */
  draftValue: string | undefined;
  /** Error local o del servidor de esta celda. */
  error?: string;
  /** Tonelaje de vista previa (factor del backend) para el valor en borrador. */
  preview: string | null;
  /** La fila tiene regla de conversión para su unidad. */
  rowHasConversion: boolean;
  /** Símbolo de la unidad de la celda. */
  unitSymbol: string;
  onChange: (value: string) => void;
  /** Escape: revierte la celda. */
  onRevert: () => void;
  /** Enter: baja a la fila siguiente. */
  onEnter: (input: HTMLInputElement) => void;
  /** Posición en la matriz (navegación con Enter). */
  position: { row: number; column: number };
  fullWidth?: boolean;
}

function TonnageLine({ tonnage, hasConversion }: { tonnage: string | null; hasConversion: boolean }) {
  if (tonnage !== null) {
    return (
      <Typography variant="caption" color="text.secondary" component="span" sx={{ display: 'block', whiteSpace: 'nowrap' }}>
        {formatTonnage(tonnage)}
      </Typography>
    );
  }
  if (!hasConversion) {
    return (
      <Tooltip title={NO_CONVERSION_HELP} describeChild>
        <Typography variant="caption" color="warning.main" component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25 }}>
          <SyncDisabledOutlinedIcon fontSize="inherit" aria-hidden />
          Sin conversión
        </Typography>
      </Tooltip>
    );
  }
  return (
    <Typography variant="caption" color="text.secondary" component="span" sx={{ display: 'block' }}>
      —
    </Typography>
  );
}

/**
 * Celda de la matriz del forecast (03 §E.8). Editable (según `cell.editable`,
 * que decide el backend): campo decimal con `inputMode="decimal"`; las celdas
 * cambiadas se marcan con el tinte de aviso y, debajo, la vista previa del
 * tonelaje. De solo lectura: cantidad y tonelaje con estilo deshabilitado.
 * Al pasar o enfocar: "Actualizado el … por …".
 */
export function ForecastCellEditor({
  cell,
  label,
  draftValue,
  error,
  preview,
  rowHasConversion,
  unitSymbol,
  onChange,
  onRevert,
  onEnter,
  position,
  fullWidth = false,
}: ForecastCellEditorProps) {
  const updated = updatedText(cell);
  const dirty = draftValue !== undefined;
  const saved = cell.quantity !== null ? normalizeDecimal(cell.quantity) : '';

  if (!cell.editable) {
    return (
      <Tooltip title={updated ?? ''} describeChild disableHoverListener={!updated} disableFocusListener={!updated}>
        <Box
          tabIndex={updated ? 0 : undefined}
          role={updated ? 'group' : undefined}
          aria-label={updated ? `${label}: ${formatQuantity(cell.quantity, unitSymbol)}. ${updated}` : undefined}
          sx={{ px: 1, py: 0.5, borderRadius: 1, bgcolor: 'action.disabledBackground', color: 'text.secondary', textAlign: 'right', minWidth: 0 }}
        >
          <Typography variant="body2" component="span" sx={{ display: 'block' }}>
            {cell.quantity !== null ? formatQuantity(cell.quantity) : '—'}
          </Typography>
          {cell.quantity !== null ? <TonnageLine tonnage={cell.tonnage} hasConversion={cell.hasConversion} /> : null}
        </Box>
      </Tooltip>
    );
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      onEnter(event.currentTarget);
    } else if (event.key === 'Escape' && dirty) {
      event.preventDefault();
      event.stopPropagation();
      onRevert();
    }
  };

  let below;
  if (dirty) {
    below = preview !== null ? (
      <Typography variant="caption" color="text.secondary" component="span" sx={{ display: 'block', whiteSpace: 'nowrap' }}>
        {`≈ ${formatTonnage(preview)}`}
      </Typography>
    ) : (
      <TonnageLine tonnage={null} hasConversion={rowHasConversion} />
    );
  } else if (cell.quantity !== null) {
    below = <TonnageLine tonnage={cell.tonnage} hasConversion={cell.hasConversion} />;
  } else {
    below = rowHasConversion ? null : <TonnageLine tonnage={null} hasConversion={false} />;
  }

  return (
    <Tooltip title={updated ?? ''} describeChild disableHoverListener={!updated} disableFocusListener={!updated} placement="top">
      <Box sx={{ minWidth: 0 }}>
        <DecimalField
          size="small"
          fullWidth={fullWidth}
          spec={DECIMAL_SPECS.quantity}
          value={dirty ? draftValue : saved}
          onChange={onChange}
          error={Boolean(error)}
          helperText={error}
          slotProps={{
            htmlInput: {
              'aria-label': dirty ? `${label} (cambio sin guardar)` : label,
              'data-row': position.row,
              'data-column': position.column,
              onKeyDown: handleKeyDown,
              style: { textAlign: 'right' },
            },
          }}
          sx={(theme) => ({
            '& .MuiInputBase-root': dirty ? { bgcolor: softTintsFor(theme.palette.mode).warning } : {},
          })}
        />
        {below}
      </Box>
    </Tooltip>
  );
}
