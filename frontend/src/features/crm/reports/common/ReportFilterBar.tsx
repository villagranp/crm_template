import FilterListIcon from '@mui/icons-material/FilterList';
import { Autocomplete, Box, Button, Chip, Collapse, MenuItem, Paper, Stack, TextField } from '@mui/material';
import { useId, useState, type FormEvent, type ReactNode } from 'react';

import { ListToolbar } from '@/components/data';
import { CustomerPicker, type CustomerPickerValue, useCustomer } from '@/features/crm/customers';
import { ProductPicker, projectLabel, productLabel, ProjectPicker, type Product, type ProjectPickerValue, useProject } from '@/features/crm/projects';
import { usePermission } from '@/hooks/use-permission';

import { REPORT_SOURCE_PERMISSIONS } from '../reports.permissions';

import { formatMonth, parseMonthKey } from './report-format';
import {
  describeMonthRange,
  describePeriod,
  issuesByField,
  MAX_FORECAST_MONTHS,
  MAX_PERIOD_YEARS,
  matchingPreset,
  monthRangeDraftSchema,
  PERIOD_PRESET_LABELS,
  PERIOD_PRESETS,
  periodDraftSchema,
  presetPeriod,
  type PeriodPreset,
  type ReportPeriod,
} from './report-period';
import type { ForecastMonthRef } from './report-types';
import type { ReportFilterValues } from './use-report-query-state';

/**
 * Barra de filtros de Reportes (05 E.1), común a las siete pantallas: botón "Filtros" que
 * despliega un formulario (borrador que se aplica de una vez), búsqueda opcional, chips de
 * los filtros activos con su "quitar" y "Limpiar". Los valores son los de la URL
 * (`useReportQueryState`) con los nombres de parámetro de la API.
 *
 * Los campos se declaran (`fields`): selectores con las opciones de
 * `GET /reports/filter-options` (nunca listas fijas), texto libre y los selectores remotos de
 * cliente (`clientes.ver`), proyecto (`proyectos.ver`) y producto (`productos.ver`), que no se
 * ofrecen sin su permiso. El período admite atajos ("Mes en curso", "Trimestre en curso",
 * "Año en curso", "Últimos 12 meses"), rango libre y base de fecha, o un rango de meses.
 */

export interface ReportFilterOption {
  value: string;
  label: string;
  /** Valor de catálogo inactivo: se ofrece para consultar históricos (P-05.7), marcado. */
  inactive?: boolean;
}

interface FieldBase {
  /** Nombre del parámetro de la API (y de la URL). */
  key: string;
  label: string;
}

export type ReportFilterField =
  | (FieldBase & { kind: 'select'; options: readonly ReportFilterOption[]; disabled?: boolean })
  | (FieldBase & { kind: 'autocomplete'; options: readonly ReportFilterOption[]; disabled?: boolean })
  | (FieldBase & { kind: 'text'; placeholder?: string })
  | (FieldBase & { kind: 'customer' })
  | (FieldBase & { kind: 'project'; /** Campo de cliente del mismo panel: limita los proyectos a ese cliente. */ customerKey?: string })
  | (FieldBase & { kind: 'product' });

export type ReportPeriodField =
  | {
      kind: 'dates';
      /** Período efectivo (URL o por defecto) y "hoy" en la zona del negocio. */
      period: ReportPeriod | null;
      isDefault: boolean;
      today: string;
      /** Bases de fecha seleccionables (C.2); vacío o ausente = sin selector. */
      dateBases?: readonly ReportFilterOption[];
      defaultDateBasis: string | null;
      /** Proyectos: con período, la base es obligatoria (P-05.4). */
      dateBasisRequired?: boolean;
      /** `true` si se puede quitar el período (sin período no se filtra por fecha). */
      allowEmpty: boolean;
      maxYears?: number;
      /** Máximo en meses de calendario (sustituye a `maxYears`; dashboard: 24). */
      maxMonths?: number;
      /** Texto que acompaña al chip del período por defecto (p. ej. "por defecto"). */
      defaultNote?: string;
      /** Aviso bajo el período por base de fecha (p. ej. `DECIDED`: "solo entran las que tienen resultado"). */
      dateBasisNotes?: Readonly<Record<string, string>>;
    }
  | {
      kind: 'months';
      /** Rango que aplicó el servidor (el de la URL o M+1…M+6), para el chip. */
      appliedRange: { from: ForecastMonthRef; to: ForecastMonthRef } | null;
      maxMonths?: number;
    };

export interface ReportFilterChip {
  key: string;
  label: ReactNode;
  onDelete?: () => void;
}

export interface ReportFilterBarProps {
  /** Nombre accesible del formulario (p. ej. "Filtros del reporte de visitas"). */
  label: string;
  fields: readonly ReportFilterField[];
  period?: ReportPeriodField;
  values: ReportFilterValues;
  onApply: (values: ReportFilterValues) => void;
  onClear: () => void;
  search?: { value: string; onChange: (value: string) => void; label: string; placeholder?: string };
  /** Contenido extra bajo los chips (p. ej. el aviso de una base de fecha). */
  children?: ReactNode;
}

/** Nombres elegidos en los selectores remotos durante la sesión, para el texto de su chip. */
const rememberedLabels = new Map<string, string>();

function remember(kind: string, id: string | undefined, label: string | undefined) {
  if (id && label) {
    rememberedLabels.set(`${kind}:${id}`, label);
  }
}

function remembered(kind: string, id: string): string | undefined {
  return rememberedLabels.get(`${kind}:${id}`);
}

const SELECTED = 'Seleccionado';
const CUSTOM = 'CUSTOM';
const NO_PERIOD = 'NONE';

type Draft = Record<string, string>;

function toDraft(values: ReportFilterValues, keys: readonly string[]): Draft {
  return Object.fromEntries(keys.map((key) => [key, values[key] ?? '']));
}

function optionLabel(option: ReportFilterOption): string {
  return option.inactive ? `${option.label} (inactivo)` : option.label;
}

function periodKeysOf(period: ReportPeriodField | undefined): string[] {
  if (period?.kind === 'dates') {
    return ['from', 'to', 'dateBasis'];
  }
  if (period?.kind === 'months') {
    return ['fromMonth', 'toMonth'];
  }
  return [];
}

export function ReportFilterBar({ label, fields, period, values, onApply, onClear, search, children }: ReportFilterBarProps) {
  const panelId = useId();
  const keys = [...fields.map((field) => field.key), ...periodKeysOf(period)];
  const appliedKey = JSON.stringify(toDraft(values, keys));
  const [seenKey, setSeenKey] = useState(appliedKey);
  const [draft, setDraft] = useState<Draft>(() => toDraft(values, keys));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const activeCount = fields.filter((field) => values[field.key]).length + (period && hasUserPeriod(period, values) ? 1 : 0);
  const [open, setOpen] = useState(false);

  // La URL manda (atrás/adelante, "Limpiar", un chip quitado): el borrador se reinicia cuando
  // cambian los filtros aplicados, sin un render intermedio con el borrador viejo.
  if (seenKey !== appliedKey) {
    setSeenKey(appliedKey);
    setDraft(toDraft(values, keys));
    setErrors({});
  }

  const set = (key: string, value: string) => setDraft((current) => ({ ...current, [key]: value }));

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const issues = validatePeriod(period, draft);
    setErrors(issues);
    if (Object.keys(issues).length > 0) {
      return;
    }
    onApply(Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, value.trim() || undefined])));
  };

  const chips = buildChips({ fields, period, values, onApply });

  return (
    <Paper component="section" aria-label={label} sx={{ overflow: 'hidden', boxShadow: 1 }}>
      <ListToolbar
        filters={
          <Button
            variant="outlined"
            color="inherit"
            startIcon={<FilterListIcon />}
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((current) => !current)}
            sx={{ flex: '0 0 auto', borderColor: 'divider' }}
          >
            {activeCount > 0 ? `Filtros (${activeCount})` : 'Filtros'}
          </Button>
        }
        search={search}
      >
        <Collapse in={open} id={panelId}>
          <Box component="form" role="search" aria-label={label} noValidate onSubmit={submit} sx={{ pt: 2 }}>
            <Box
              sx={{
                display: 'grid',
                gap: 2,
                gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' },
                alignItems: 'start',
              }}
            >
              {period?.kind === 'dates' ? <DatePeriodFields period={period} draft={draft} errors={errors} onChange={set} onDraft={setDraft} /> : null}
              {period?.kind === 'months' ? <MonthPeriodFields draft={draft} errors={errors} onChange={set} /> : null}
              {fields.map((field) => (
                <FilterFieldInput key={field.key} field={field} draft={draft} onChange={set} />
              ))}
            </Box>
            <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ mt: 2 }}>
              <Button type="submit">Aplicar filtros</Button>
            </Stack>
          </Box>
        </Collapse>
        {chips.length > 0 ? (
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center" sx={{ pt: 2 }} aria-label="Filtros activos">
            {chips.map((chip) => (
              <Chip key={chip.key} label={chip.label} onDelete={chip.onDelete} />
            ))}
            {activeCount > 0 || Boolean(search?.value) ? (
              <Button size="small" variant="text" onClick={onClear}>
                Limpiar
              </Button>
            ) : null}
          </Stack>
        ) : null}
        {children}
      </ListToolbar>
    </Paper>
  );
}

function hasUserPeriod(period: ReportPeriodField, values: ReportFilterValues): boolean {
  if (period.kind === 'months') {
    return Boolean(values.fromMonth || values.toMonth);
  }
  return Boolean(values.from || values.to || values.dateBasis);
}

function validatePeriod(period: ReportPeriodField | undefined, draft: Draft): Record<string, string> {
  if (period?.kind === 'dates') {
    const result = periodDraftSchema({
      maxYears: period.maxYears ?? MAX_PERIOD_YEARS,
      maxMonths: period.maxMonths,
      dateBasisRequired: period.dateBasisRequired,
    }).safeParse({
      from: draft.from ?? '',
      to: draft.to ?? '',
      dateBasis: draft.dateBasis ?? '',
    });
    return result.success ? {} : issuesByField(result.error);
  }
  if (period?.kind === 'months') {
    const result = monthRangeDraftSchema({ maxMonths: period.maxMonths ?? MAX_FORECAST_MONTHS }).safeParse({
      fromMonth: draft.fromMonth ?? '',
      toMonth: draft.toMonth ?? '',
    });
    return result.success ? {} : issuesByField(result.error);
  }
  return {};
}

interface DatePeriodFieldsProps {
  period: Extract<ReportPeriodField, { kind: 'dates' }>;
  draft: Draft;
  errors: Record<string, string>;
  onChange: (key: string, value: string) => void;
  onDraft: (update: (current: Draft) => Draft) => void;
}

function DatePeriodFields({ period, draft, errors, onChange, onDraft }: DatePeriodFieldsProps) {
  const from = draft.from ?? '';
  const to = draft.to ?? '';
  // Sin período en el borrador: el por defecto del reporte (si lo tiene) o "Sin período".
  const shown = from || to ? { from, to } : null;
  let preset: string;
  if (shown) {
    preset = shown.from && shown.to ? (matchingPreset(shown, period.today) ?? CUSTOM) : CUSTOM;
  } else {
    preset = period.allowEmpty ? NO_PERIOD : (period.period ? (matchingPreset(period.period, period.today) ?? CUSTOM) : NO_PERIOD);
  }

  const choosePreset = (value: string) => {
    if (value === NO_PERIOD) {
      onDraft((current) => ({ ...current, from: '', to: '' }));
      return;
    }
    if (value === CUSTOM) {
      const base = shown ?? period.period;
      onDraft((current) => ({ ...current, from: base?.from ?? '', to: base?.to ?? '' }));
      return;
    }
    const range = presetPeriod(value as PeriodPreset, period.today);
    onDraft((current) => ({ ...current, from: range.from, to: range.to }));
  };

  const shownFrom = from || (!period.allowEmpty ? (period.period?.from ?? '') : '');
  const shownTo = to || (!period.allowEmpty ? (period.period?.to ?? '') : '');
  const basisNote = period.dateBasisNotes?.[draft.dateBasis || period.defaultDateBasis || ''];

  return (
    <>
      <TextField select size="small" label="Período" value={preset} onChange={(event) => choosePreset(event.target.value)}>
        {period.allowEmpty ? <MenuItem value={NO_PERIOD}>Sin período</MenuItem> : null}
        {PERIOD_PRESETS.map((item) => (
          <MenuItem key={item} value={item}>
            {PERIOD_PRESET_LABELS[item]}
          </MenuItem>
        ))}
        <MenuItem value={CUSTOM}>Personalizado</MenuItem>
      </TextField>
      <TextField
        type="date"
        size="small"
        label="Desde"
        value={shownFrom}
        onChange={(event) => onDraft((current) => ({ ...current, from: event.target.value, to: current.to || shownTo }))}
        error={Boolean(errors.from)}
        helperText={errors.from}
      />
      <TextField
        type="date"
        size="small"
        label="Hasta"
        value={shownTo}
        onChange={(event) => onDraft((current) => ({ ...current, to: event.target.value, from: current.from || shownFrom }))}
        error={Boolean(errors.to)}
        helperText={errors.to}
      />
      {period.dateBases && period.dateBases.length > 0 ? (
        <TextField
          select
          size="small"
          label="Fecha del período"
          value={draft.dateBasis || period.defaultDateBasis || ''}
          onChange={(event) => onChange('dateBasis', event.target.value)}
          error={Boolean(errors.dateBasis)}
          helperText={errors.dateBasis ?? basisNote}
        >
          {period.defaultDateBasis ? null : <MenuItem value="">Sin elegir</MenuItem>}
          {period.dateBases.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </TextField>
      ) : null}
    </>
  );
}

interface MonthPeriodFieldsProps {
  draft: Draft;
  errors: Record<string, string>;
  onChange: (key: string, value: string) => void;
}

function MonthPeriodFields({ draft, errors, onChange }: MonthPeriodFieldsProps) {
  return (
    <>
      <TextField
        type="month"
        size="small"
        label="Mes inicial"
        value={draft.fromMonth ?? ''}
        onChange={(event) => onChange('fromMonth', event.target.value)}
        error={Boolean(errors.fromMonth)}
        helperText={errors.fromMonth ?? 'Vacío: los próximos 6 meses'}
      />
      <TextField
        type="month"
        size="small"
        label="Mes final"
        value={draft.toMonth ?? ''}
        onChange={(event) => onChange('toMonth', event.target.value)}
        error={Boolean(errors.toMonth)}
        helperText={errors.toMonth}
      />
    </>
  );
}

interface FilterFieldInputProps {
  field: ReportFilterField;
  draft: Draft;
  onChange: (key: string, value: string) => void;
}

function FilterFieldInput({ field, draft, onChange }: FilterFieldInputProps) {
  const value = draft[field.key] ?? '';
  switch (field.kind) {
    case 'select':
      return (
        <TextField select size="small" label={field.label} value={value} onChange={(event) => onChange(field.key, event.target.value)} disabled={field.disabled}>
          <MenuItem value="">Todos</MenuItem>
          {value && !field.options.some((option) => option.value === value) ? <MenuItem value={value}>{SELECTED}</MenuItem> : null}
          {field.options.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {optionLabel(option)}
            </MenuItem>
          ))}
        </TextField>
      );
    case 'autocomplete': {
      const selected = field.options.find((option) => option.value === value) ?? (value ? { value, label: SELECTED } : null);
      return (
        <Autocomplete<ReportFilterOption>
          options={field.options}
          value={selected}
          onChange={(_, option) => onChange(field.key, option?.value ?? '')}
          getOptionLabel={optionLabel}
          isOptionEqualToValue={(option, current) => option.value === current.value}
          disabled={field.disabled}
          noOptionsText="Sin resultados"
          renderInput={(params) => <TextField {...params} size="small" label={field.label} placeholder="Todos" />}
        />
      );
    }
    case 'text':
      return (
        <TextField
          size="small"
          label={field.label}
          value={value}
          placeholder={field.placeholder}
          onChange={(event) => onChange(field.key, event.target.value)}
          slotProps={{ htmlInput: { maxLength: 100 } }}
        />
      );
    case 'customer':
      return <CustomerField field={field} value={value} onChange={onChange} />;
    case 'project':
      return <ProjectField field={field} value={value} customerId={field.customerKey ? draft[field.customerKey] : undefined} onChange={onChange} />;
    case 'product':
      return <ProductField field={field} value={value} onChange={onChange} />;
  }
}

interface RemoteFieldProps {
  field: ReportFilterField;
  value: string;
  onChange: (key: string, value: string) => void;
}

function CustomerField({ field, value, onChange }: RemoteFieldProps) {
  const allowed = usePermission(REPORT_SOURCE_PERMISSIONS.customer);
  if (!allowed) {
    return null;
  }
  return (
    <CustomerPicker
      label={field.label}
      value={value ? { id: value } : null}
      onChange={(customer: CustomerPickerValue | null) => {
        remember('customer', customer?.id, customer?.legalName);
        onChange(field.key, customer?.id ?? '');
      }}
    />
  );
}

function ProjectField({ field, value, customerId, onChange }: RemoteFieldProps & { customerId?: string }) {
  const allowed = usePermission(REPORT_SOURCE_PERMISSIONS.project);
  if (!allowed) {
    return null;
  }
  return (
    <ProjectPicker
      label={field.label}
      value={value ? { id: value } : null}
      customerId={customerId || undefined}
      onChange={(project: ProjectPickerValue | null) => {
        remember('project', project?.id, project ? projectLabel(project) : undefined);
        onChange(field.key, project?.id ?? '');
      }}
    />
  );
}

function ProductField({ field, value, onChange }: RemoteFieldProps) {
  const allowed = usePermission(REPORT_SOURCE_PERMISSIONS.product);
  const [selected, setSelected] = useState<Product | null>(null);
  if (!allowed) {
    return null;
  }
  const current = selected && selected.id === value ? selected : null;
  const pendingLabel = value && !current ? (remembered('product', value) ?? 'Producto seleccionado') : undefined;
  return (
    <ProductPicker
      label={field.label}
      value={current}
      helperText={pendingLabel ? `Filtro actual: ${pendingLabel}` : undefined}
      onChange={(product) => {
        setSelected(product);
        remember('product', product?.id, product ? productLabel(product) : undefined);
        onChange(field.key, product?.id ?? '');
      }}
    />
  );
}

interface BuildChipsInput {
  fields: readonly ReportFilterField[];
  period: ReportPeriodField | undefined;
  values: ReportFilterValues;
  onApply: (values: ReportFilterValues) => void;
}

/**
 * Nombre de un cliente o proyecto elegido en un selector remoto cuando la sesión no lo recuerda
 * (p. ej. tras recargar): se resuelve con su ficha (`GET /customers/:id`, `GET /projects/:id`)
 * sólo con el mismo permiso que ofrece el selector; si no se puede (sin permiso, fuera de
 * alcance o error), "Seleccionado" (P-05.28).
 */
function CustomerChipName({ id }: { id: string }) {
  const allowed = usePermission(REPORT_SOURCE_PERMISSIONS.customer);
  const customer = useCustomer(allowed ? id : undefined);
  return <>{customer.data?.legalName ?? SELECTED}</>;
}

function ProjectChipName({ id }: { id: string }) {
  const allowed = usePermission(REPORT_SOURCE_PERMISSIONS.project);
  const project = useProject(allowed ? id : undefined);
  return <>{project.data ? projectLabel(project.data) : SELECTED}</>;
}

function chipValue(field: ReportFilterField, value: string): ReactNode {
  switch (field.kind) {
    case 'select':
    case 'autocomplete':
      return field.options.find((option) => option.value === value)?.label ?? SELECTED;
    case 'text':
      return value;
    case 'customer':
      return remembered(field.kind, value) ?? <CustomerChipName id={value} />;
    case 'project':
      return remembered(field.kind, value) ?? <ProjectChipName id={value} />;
    case 'product':
      // Sin `GET /products/:id` ni filtro por id en `GET /products`: hueco documentado (P-05.28).
      return remembered(field.kind, value) ?? SELECTED;
  }
}

/** Chips de los filtros activos; el del período por defecto se muestra, pero no se quita (se cambia). */
function buildChips({ fields, period, values, onApply }: BuildChipsInput): ReportFilterChip[] {
  const without = (...keys: string[]) => () => onApply({ ...values, ...Object.fromEntries(keys.map((key) => [key, undefined])) });
  const chips: ReportFilterChip[] = [];

  if (period?.kind === 'dates' && period.period) {
    const basis = period.dateBases?.find((option) => option.value === (values.dateBasis ?? period.defaultDateBasis));
    const note = period.isDefault && period.defaultNote ? ` (${period.defaultNote})` : '';
    const text = `Período: ${describePeriod(period.period, period.today)}${note}${basis ? ` · ${basis.label}` : ''}`;
    chips.push({
      key: 'period',
      label: text,
      onDelete: period.isDefault ? undefined : without('from', 'to', 'dateBasis'),
    });
  }
  if (period?.kind === 'months' && period.appliedRange) {
    const isUserRange = Boolean(values.fromMonth && values.toMonth);
    chips.push({
      key: 'months',
      label: `Meses: ${describeMonthRange(period.appliedRange.from, period.appliedRange.to)}${isUserRange ? '' : ' (próximos 6 meses)'}`,
      onDelete: isUserRange ? without('fromMonth', 'toMonth') : undefined,
    });
  } else if (period?.kind === 'months' && values.fromMonth && values.toMonth) {
    const from = parseMonthKey(values.fromMonth);
    const to = parseMonthKey(values.toMonth);
    chips.push({
      key: 'months',
      label: `Meses: ${from && to ? `${formatMonth(from)} – ${formatMonth(to)}` : SELECTED}`,
      onDelete: without('fromMonth', 'toMonth'),
    });
  }

  for (const field of fields) {
    const value = values[field.key];
    if (value) {
      chips.push({
        key: field.key,
        label: (
          <>
            {field.label}: {chipValue(field, value)}
          </>
        ),
        onDelete: without(field.key),
      });
    }
  }
  return chips;
}
