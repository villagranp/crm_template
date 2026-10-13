import { Box, Button, Chip, MenuItem, Stack, TextField } from '@mui/material';
import { useEffect, useState, type FormEvent } from 'react';

import {
  OwnerPicker,
  PRODUCT_PERMISSIONS,
  ProductPicker,
  PROJECT_PERMISSIONS,
  ProjectPicker,
  type OwnerOption,
  type Product,
  type ProjectPickerValue,
} from '@/features/crm/projects';
import { useCan } from '@/hooks/use-permission';

import type { ForecastFilterKey, ForecastMode, ForecastWindowPeriod } from '../forecast.api';
import { periodHeader } from '../forecast-format';

export type ForecastFilterValues = Partial<Record<ForecastFilterKey, string>>;

const LIST_SEPARATOR = ',';
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

const FIELD_LABELS: Record<ForecastFilterKey, string> = {
  mode: 'Vista',
  projectId: 'Proyecto',
  productId: 'Producto',
  ownerId: 'Asesor',
  periods: 'Meses',
  from: 'Desde (mes)',
  to: 'Hasta (mes)',
};

export interface ForecastFiltersProps {
  values: ForecastFilterValues;
  mode: ForecastMode;
  /** Períodos de la ventana vigente (`GET /forecast/window`). */
  windowPeriods: readonly ForecastWindowPeriod[];
  onApply: (values: ForecastFilterValues) => void;
}

/**
 * Filtros del forecast (03 §E.8, AC-03.75): proyecto, producto, asesor y meses
 * de la ventana (en modo historial, rango "desde–hasta" de meses pasados). Se
 * aplican juntos; filas y totales usan exactamente los mismos.
 */
export function ForecastFilters({ values, mode, windowPeriods, onApply }: ForecastFiltersProps) {
  const can = useCan();
  const [periods, setPeriods] = useState<string[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [project, setProject] = useState<ProjectPickerValue | { id: string } | null>(null);
  const [product, setProduct] = useState<Product | null>(null);
  // Id del producto filtrado: el de la URL aunque aún no se haya resuelto su nombre, o el elegido.
  const [productId, setProductId] = useState<string | undefined>(undefined);
  const [owner, setOwner] = useState<OwnerOption | null>(null);
  const [rangeError, setRangeError] = useState<string | null>(null);

  // La URL manda: atrás/adelante o "Limpiar" actualizan el borrador.
  useEffect(() => {
    setPeriods((values.periods ?? '').split(LIST_SEPARATOR).filter(Boolean));
    setFrom(values.from ?? '');
    setTo(values.to ?? '');
    setProject(values.projectId ? { id: values.projectId } : null);
    setProduct((current) => (current && current.id === values.productId ? current : null));
    setProductId(values.productId);
    setOwner(values.ownerId ? { id: values.ownerId, displayName: 'Asesor seleccionado', countryId: null, primaryTeam: null } : null);
    setRangeError(null);
  }, [values]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (mode === 'HISTORY' && ((from && !MONTH_PATTERN.test(from)) || (to && !MONTH_PATTERN.test(to)))) {
      setRangeError('Escribe meses válidos (AAAA-MM).');
      return;
    }
    if (mode === 'HISTORY' && from && to && from > to) {
      setRangeError('"Desde" no puede ser posterior a "Hasta".');
      return;
    }
    setRangeError(null);
    onApply({
      projectId: project?.id,
      // Un producto preseleccionado por la URL se conserva aunque no se haya resuelto su nombre;
      // vaciar el selector lo quita.
      productId,
      ownerId: owner?.id,
      periods: mode === 'WINDOW' && periods.length > 0 ? periods.join(LIST_SEPARATOR) : undefined,
      from: mode === 'HISTORY' ? from || undefined : undefined,
      to: mode === 'HISTORY' ? to || undefined : undefined,
    });
  };

  return (
    <Box component="form" role="search" aria-label="Filtros del forecast" noValidate onSubmit={submit} sx={{ pt: 2 }}>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' } }}>
        {can(PROJECT_PERMISSIONS.view) ? (
          <Box sx={{ gridColumn: { sm: 'span 2' } }}>
            <ProjectPicker label={FIELD_LABELS.projectId} value={project} onChange={setProject} />
          </Box>
        ) : null}
        {can(PRODUCT_PERMISSIONS.view) ? (
          <Box sx={{ gridColumn: { sm: 'span 2' } }}>
            <ProductPicker
              label={FIELD_LABELS.productId}
              value={product}
              onChange={(next) => {
                setProduct(next);
                setProductId(next?.id);
              }}
              helperText={productId && !product ? 'Hay un producto filtrado; elige otro o quítalo en los filtros activos.' : undefined}
            />
          </Box>
        ) : null}
        {can(PROJECT_PERMISSIONS.view) ? <OwnerPicker label={FIELD_LABELS.ownerId} purpose="FILTER" value={owner} onChange={setOwner} /> : null}
        {mode === 'WINDOW' ? (
          <TextField
            select
            size="small"
            label={FIELD_LABELS.periods}
            value={periods}
            onChange={(event) => {
              const next = event.target.value as unknown as string[] | string;
              setPeriods(typeof next === 'string' ? next.split(LIST_SEPARATOR).filter(Boolean) : next);
            }}
            slotProps={{
              select: {
                multiple: true,
                displayEmpty: true,
                renderValue: (selected) => {
                  const chosen = selected as string[];
                  return chosen.length > 0
                    ? windowPeriods.filter((period) => chosen.includes(period.label)).map(periodHeader).join(', ')
                    : 'Toda la ventana';
                },
              },
              inputLabel: { shrink: true },
            }}
          >
            {windowPeriods.map((period) => (
              <MenuItem key={period.label} value={period.label}>
                {periodHeader(period)}
              </MenuItem>
            ))}
          </TextField>
        ) : (
          <>
            <TextField
              size="small"
              type="month"
              label={FIELD_LABELS.from}
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              error={Boolean(rangeError)}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { placeholder: 'AAAA-MM' } }}
            />
            <TextField
              size="small"
              type="month"
              label={FIELD_LABELS.to}
              value={to}
              onChange={(event) => setTo(event.target.value)}
              error={Boolean(rangeError)}
              helperText={rangeError ?? 'Máximo 24 meses; vacío: hasta el mes en curso.'}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { placeholder: 'AAAA-MM' } }}
            />
          </>
        )}
      </Box>
      <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ mt: 2 }}>
        <Button type="submit">Aplicar filtros</Button>
      </Stack>
    </Box>
  );
}

export interface ForecastFilterChipsProps {
  values: ForecastFilterValues;
  windowPeriods: readonly ForecastWindowPeriod[];
  onRemove: (key: ForecastFilterKey) => void;
  onClear: () => void;
}

/** Chips de los filtros activos con su "quitar", y "Limpiar". */
export function ForecastFilterChips({ values, windowPeriods, onRemove, onClear }: ForecastFilterChipsProps) {
  const entries = (Object.entries(values) as [ForecastFilterKey, string | undefined][]).filter(
    (entry): entry is [ForecastFilterKey, string] => Boolean(entry[1]) && entry[0] !== 'mode',
  );
  if (entries.length === 0) {
    return null;
  }
  const display = (key: ForecastFilterKey, value: string): string => {
    if (key === 'periods') {
      const chosen = value.split(LIST_SEPARATOR);
      const labels = windowPeriods.filter((period) => chosen.includes(period.label)).map(periodHeader);
      return labels.length > 0 ? labels.join(', ') : value;
    }
    if (key === 'from' || key === 'to') {
      return value;
    }
    return 'Seleccionado';
  };
  return (
    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center" sx={{ pt: 2 }} aria-label="Filtros activos">
      {entries.map(([key, value]) => (
        <Chip key={key} label={`${FIELD_LABELS[key]}: ${display(key, value)}`} onDelete={() => onRemove(key)} />
      ))}
      <Button size="small" variant="text" onClick={onClear}>
        Limpiar
      </Button>
    </Stack>
  );
}
