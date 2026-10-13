import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { Alert, Box, Button, IconButton, LinearProgress, Skeleton, Stack, Typography } from '@mui/material';
import { useMemo, type ReactNode } from 'react';

import { EmptyState, FilterChips } from '@/components/data';
import { describeApiError } from '@/lib/api-error-view';

import type { ActivityTypeOption } from '../../activities/activities.api';
import type { AgendaItem } from '../../common/commercial-activity.api';
import { COMMERCIAL_ERROR_MESSAGES, withReference } from '../../common/commercial-activity.errors';
import type { AgendaApiFilters } from '../agenda.api';
import { useAgendaCalendar } from '../agenda.queries';
import { groupByDay, MONDAY, periodLabel, rangeFor, shiftReference, weekDays, type CalendarMode } from '../calendar-grid';

import { CalendarDayView, WeekDayStrip } from './CalendarDayView';
import { CalendarMonthView } from './CalendarMonthView';
import { CalendarWeekView } from './CalendarWeekView';

export const TRUNCATED_MESSAGE = 'Se muestran los primeros 500 eventos; acota los filtros.';

const NAVIGATION_LABELS: Record<CalendarMode, { previous: string; next: string }> = {
  month: { previous: 'Mes anterior', next: 'Mes siguiente' },
  week: { previous: 'Semana anterior', next: 'Semana siguiente' },
  day: { previous: 'Día anterior', next: 'Día siguiente' },
};

const MODE_OPTIONS = [
  { value: 'month', label: 'Mes' },
  { value: 'week', label: 'Semana' },
  { value: 'day', label: 'Día' },
] as const;

const SKELETON_CELLS = 35;
const SKELETON_ROWS = 4;
/** Alto de una celda del esqueleto del mes, en unidades de espaciado. */
const SKELETON_CELL_HEIGHT = 10;

export interface AgendaEmptyContent {
  title: string;
  description: string;
  icon?: ReactNode;
  action?: ReactNode;
}

export interface AgendaCalendarProps {
  /** Filtros comunes ya traducidos a la API. */
  filters: AgendaApiFilters;
  /** Zona del usuario (RN-04.9): rango pedido y día de cada evento; `undefined` = la del navegador. */
  timeZone: string | undefined;
  /** Modo efectivo (en móvil nunca es `week`). */
  mode: CalendarMode;
  referenceKey: string;
  todayKey: string;
  isMobile: boolean;
  types: readonly ActivityTypeOption[] | undefined;
  onOpen: (item: AgendaItem) => void;
  /** Cambia la fecha de referencia; `null` = hoy. */
  onNavigate: (key: string | null) => void;
  /** Cambia el modo y, si se indica, la fecha (p. ej. "+N más" → Día). */
  onModeChange: (mode: CalendarMode, key?: string) => void;
  empty: AgendaEmptyContent;
}

function CalendarSkeleton({ mode }: { mode: CalendarMode }) {
  return (
    <Box role="status" aria-label="Cargando agenda" sx={{ p: { xs: 1, md: 1.5 } }}>
      {mode === 'month' ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 0.5 }}>
          {Array.from({ length: SKELETON_CELLS }, (_, index) => (
            <Skeleton key={index} variant="rounded" sx={{ height: (theme) => theme.spacing(SKELETON_CELL_HEIGHT) }} />
          ))}
        </Box>
      ) : (
        <Stack spacing={1}>
          {Array.from({ length: SKELETON_ROWS }, (_, index) => (
            <Skeleton key={index} variant="rounded" sx={{ height: (theme) => theme.spacing(SKELETON_CELL_HEIGHT) }} />
          ))}
        </Stack>
      )}
    </Box>
  );
}

/**
 * Vista calendario de la agenda (04 §E.2, D-04.1, D-04.12): navegación
 * anterior / hoy / siguiente, modo Mes · Semana · Día y la consulta
 * `GET /agenda/calendar` del rango visible. En móvil, la vista Día pide la
 * semana entera para que la tira de días muestre cuántos eventos tiene cada uno.
 */
export function AgendaCalendar({
  filters,
  timeZone,
  mode,
  referenceKey,
  todayKey,
  isMobile,
  types,
  onOpen,
  onNavigate,
  onModeChange,
  empty,
}: AgendaCalendarProps) {
  const rangeMode: CalendarMode = isMobile && mode === 'day' ? 'week' : mode;
  const range = useMemo(() => rangeFor(rangeMode, referenceKey, MONDAY, timeZone), [rangeMode, referenceKey, timeZone]);
  const calendar = useAgendaCalendar({ ...filters, ...range });
  const items = calendar.data?.data;
  const itemsByDay = useMemo(() => groupByDay(items ?? [], timeZone), [items, timeZone]);
  const labels = NAVIGATION_LABELS[mode];
  const modeOptions = isMobile ? MODE_OPTIONS.filter((option) => option.value !== 'week') : MODE_OPTIONS;

  const counts = useMemo(() => new Map([...itemsByDay].map(([key, group]) => [key, group.length])), [itemsByDay]);
  const strip =
    isMobile && mode === 'day' ? (
      <WeekDayStrip days={weekDays(referenceKey)} selectedKey={referenceKey} todayKey={todayKey} counts={counts} onSelect={(key) => onNavigate(key)} />
    ) : null;

  let body: ReactNode;
  if (calendar.isError) {
    body = (
      <EmptyState
        role="alert"
        icon={<ErrorOutlineIcon />}
        title="No se pudo cargar la agenda"
        description={withReference(describeApiError(calendar.error, COMMERCIAL_ERROR_MESSAGES))}
        action={
          <Button variant="outlined" onClick={() => void calendar.refetch()}>
            Reintentar
          </Button>
        }
      />
    );
  } else if (!items) {
    body = <CalendarSkeleton mode={mode} />;
  } else if (items.length === 0) {
    body = (
      <>
        {strip}
        <EmptyState title={empty.title} description={empty.description} icon={empty.icon} action={empty.action} />
      </>
    );
  } else if (mode === 'month') {
    body = (
      <CalendarMonthView
        referenceKey={referenceKey}
        todayKey={todayKey}
        itemsByDay={itemsByDay}
        types={types}
        onOpen={onOpen}
        timeZone={timeZone}
        isMobile={isMobile}
        onSelectDay={(key) => onNavigate(key)}
        onShowDay={(key) => onModeChange('day', key)}
      />
    );
  } else if (mode === 'week') {
    body = (
      <CalendarWeekView
        referenceKey={referenceKey}
        todayKey={todayKey}
        itemsByDay={itemsByDay}
        types={types}
        onOpen={onOpen}
        timeZone={timeZone}
        onShowDay={(key) => onModeChange('day', key)}
      />
    );
  } else {
    body = (
      <>
        {strip}
        <CalendarDayView items={itemsByDay.get(referenceKey) ?? []} types={types} onOpen={onOpen} timeZone={timeZone} />
      </>
    );
  }

  return (
    <Box>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={1.5}
        useFlexGap
        alignItems={{ md: 'center' }}
        justifyContent="space-between"
        sx={{ px: { xs: 2, md: 2.5 }, py: 1.5 }}
      >
        <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
          <IconButton aria-label={labels.previous} onClick={() => onNavigate(shiftReference(mode, referenceKey, -1))}>
            <ChevronLeftIcon />
          </IconButton>
          <Button variant="outlined" color="inherit" onClick={() => onNavigate(null)} sx={{ borderColor: 'divider', flexShrink: 0 }}>
            Hoy
          </Button>
          <IconButton aria-label={labels.next} onClick={() => onNavigate(shiftReference(mode, referenceKey, 1))}>
            <ChevronRightIcon />
          </IconButton>
          <Typography
            component="h2"
            variant="h6"
            aria-live="polite"
            sx={{ minWidth: 0, overflowWrap: 'anywhere', '&::first-letter': { textTransform: 'uppercase' } }}
          >
            {periodLabel(mode, referenceKey)}
          </Typography>
        </Stack>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <FilterChips label="Periodo del calendario" value={mode} options={modeOptions} onChange={(value) => onModeChange(value as CalendarMode)} />
        </Box>
      </Stack>

      <Box sx={{ visibility: calendar.isFetching && items ? 'visible' : 'hidden' }}>
        <LinearProgress aria-hidden />
      </Box>

      {calendar.data?.truncated && !calendar.isError ? (
        <Alert severity="warning" role="status" sx={{ mx: { xs: 2, md: 2.5 }, mb: 1.5 }}>
          {TRUNCATED_MESSAGE}
        </Alert>
      ) : null}

      <Box
        sx={{
          px: { xs: 1, md: mode === 'day' ? 2.5 : 0 },
          pt: { md: mode === 'day' ? 2 : 0 },
          pb: { xs: 2, md: mode === 'day' ? 2.5 : 0 },
          borderTop: { md: 1 },
          borderColor: { md: 'divider' },
        }}
      >
        {body}
      </Box>
    </Box>
  );
}
