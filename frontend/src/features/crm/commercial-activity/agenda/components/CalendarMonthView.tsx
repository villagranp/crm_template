import { Box, Button, ButtonBase, Stack, Typography } from '@mui/material';
import { useId } from 'react';

import { layout } from '@/theme/tokens';

import type { ActivityTypeOption } from '../../activities/activities.api';
import type { AgendaItem } from '../../common/commercial-activity.api';
import { dayLongLabel, eventCountLabel, monthGrid, weekdayNames, type CalendarDay } from '../calendar-grid';

import { AgendaEventButton } from './AgendaEventButton';
import { CalendarDayView } from './CalendarDayView';

/** Eventos que caben en una celda del mes (≥ md); el resto, "+N más". */
export const MONTH_CELL_MAX_EVENTS = 3;
/** Alto mínimo de una celda del mes en escritorio, en unidades de espaciado. */
const MONTH_CELL_MIN_HEIGHT = 15;

export interface CalendarMonthViewProps {
  /** Fecha de referencia `YYYY-MM-DD` (día seleccionado en móvil). */
  referenceKey: string;
  todayKey: string;
  itemsByDay: ReadonlyMap<string, AgendaItem[]>;
  types: readonly ActivityTypeOption[] | undefined;
  onOpen: (item: AgendaItem) => void;
  /** `< md`: solo indicadores por día y el detalle del día elegido debajo (E.2). */
  isMobile: boolean;
  /** Móvil: elegir el día cuyo detalle se muestra debajo. */
  onSelectDay: (key: string) => void;
  /** Escritorio: "+N más" abre la vista Día de esa fecha. */
  onShowDay: (key: string) => void;
}

function WeekdayHeader() {
  return (
    <Box aria-hidden sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', borderBottom: 1, borderColor: 'divider' }}>
      {weekdayNames().map((name) => (
        <Typography key={name.long} variant="overline" color="text.secondary" sx={{ textAlign: 'center', py: 0.5 }}>
          {name.short}
        </Typography>
      ))}
    </Box>
  );
}

function DayNumber({ day, isToday }: { day: CalendarDay; isToday: boolean }) {
  return (
    <Box
      component="span"
      aria-hidden
      sx={{
        display: 'inline-grid',
        placeItems: 'center',
        minWidth: (theme) => theme.spacing(3.5),
        height: (theme) => theme.spacing(3.5),
        borderRadius: `${layout.radiusPill}px`,
        typography: 'body2',
        fontWeight: isToday ? 'fontWeightBold' : 'fontWeightMedium',
        color: isToday ? 'primary.contrastText' : day.inMonth ? 'text.primary' : 'text.secondary',
        bgcolor: isToday ? 'primary.main' : undefined,
      }}
    >
      {day.dayOfMonth}
    </Box>
  );
}

/**
 * Vista Mes (04 §E.2, D-04.1): rejilla lunes–domingo con CSS grid. Desde `md`
 * cada celda lista hasta tres eventos y "+N más"; por debajo, cada día es un
 * botón con el número de eventos y el detalle del día elegido va debajo. Hoy se
 * marca con `aria-current="date"` además del estilo.
 */
export function CalendarMonthView({ referenceKey, todayKey, itemsByDay, types, onOpen, isMobile, onSelectDay, onShowDay }: CalendarMonthViewProps) {
  const weeks = monthGrid(referenceKey);
  const detailId = useId();

  if (isMobile) {
    const selectedItems = itemsByDay.get(referenceKey) ?? [];
    return (
      <Box>
        <WeekdayHeader />
        <Box role="group" aria-label="Días del mes" sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 0.5, p: 0.5 }}>
          {weeks.flat().map((day) => {
            const count = itemsByDay.get(day.key)?.length ?? 0;
            const selected = day.key === referenceKey;
            const isToday = day.key === todayKey;
            return (
              <ButtonBase
                key={day.key}
                aria-label={`${dayLongLabel(day.key)}: ${eventCountLabel(count)}`}
                aria-pressed={selected}
                aria-current={isToday ? 'date' : undefined}
                aria-controls={detailId}
                onClick={() => onSelectDay(day.key)}
                sx={{
                  minHeight: layout.tap,
                  minWidth: 0,
                  flexDirection: 'column',
                  gap: 0.25,
                  py: 0.5,
                  borderRadius: `${layout.radiusSm}px`,
                  border: 1,
                  borderColor: selected ? 'primary.main' : 'transparent',
                  bgcolor: day.inMonth ? undefined : 'background.subtle',
                }}
              >
                <DayNumber day={day} isToday={isToday} />
                <Box
                  component="span"
                  aria-hidden
                  sx={{
                    minWidth: (theme) => theme.spacing(2.25),
                    px: 0.5,
                    borderRadius: `${layout.radiusPill}px`,
                    typography: 'caption',
                    fontWeight: 'fontWeightBold',
                    lineHeight: 1.4,
                    visibility: count > 0 ? 'visible' : 'hidden',
                    bgcolor: 'primary.main',
                    color: 'primary.contrastText',
                  }}
                >
                  {count}
                </Box>
              </ButtonBase>
            );
          })}
        </Box>
        <Box id={detailId} component="section" aria-label={`Eventos del ${dayLongLabel(referenceKey)}`} sx={{ borderTop: 1, borderColor: 'divider', pt: 2, mt: 1 }}>
          <Typography variant="subtitle2" component="h3" sx={{ px: 0.5, mb: 1, '&::first-letter': { textTransform: 'uppercase' } }}>
            {dayLongLabel(referenceKey)}
          </Typography>
          <CalendarDayView items={selectedItems} types={types} onOpen={onOpen} />
        </Box>
      </Box>
    );
  }

  return (
    <Box>
      <WeekdayHeader />
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
        {weeks.flat().map((day, index) => {
          const items = itemsByDay.get(day.key) ?? [];
          const hidden = items.length - MONTH_CELL_MAX_EVENTS;
          const isToday = day.key === todayKey;
          const label = `${dayLongLabel(day.key)}: ${eventCountLabel(items.length)}`;
          return (
            <Box
              key={day.key}
              component="section"
              aria-label={label}
              aria-current={isToday ? 'date' : undefined}
              sx={{
                minWidth: 0,
                minHeight: (theme) => theme.spacing(MONTH_CELL_MIN_HEIGHT),
                p: 0.75,
                borderBottom: 1,
                borderRight: (index + 1) % 7 === 0 ? 0 : 1,
                borderColor: 'divider',
                bgcolor: day.inMonth ? undefined : 'background.subtle',
                boxShadow: isToday ? (theme) => `inset 0 0 0 ${theme.spacing(0.25)} ${theme.palette.primary.main}` : undefined,
              }}
            >
              <DayNumber day={day} isToday={isToday} />
              <Stack component="ul" spacing={0.5} sx={{ listStyle: 'none', m: 0, mt: 0.5, p: 0 }}>
                {items.slice(0, MONTH_CELL_MAX_EVENTS).map((item) => (
                  <Box component="li" key={`${item.kind}-${item.id}`} sx={{ minWidth: 0 }}>
                    <AgendaEventButton item={item} types={types} onOpen={onOpen} variant="compact" />
                  </Box>
                ))}
              </Stack>
              {hidden > 0 ? (
                <Button
                  size="small"
                  variant="text"
                  onClick={() => onShowDay(day.key)}
                  aria-label={`+${hidden} más: ver los ${items.length} eventos del ${dayLongLabel(day.key)}`}
                  sx={{ mt: 0.5, px: 0.75, minHeight: 0 }}
                >
                  +{hidden} más
                </Button>
              ) : null}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
