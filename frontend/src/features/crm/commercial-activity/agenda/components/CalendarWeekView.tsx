import { Box, ButtonBase, Stack, Typography } from '@mui/material';

import { layout } from '@/theme/tokens';

import type { ActivityTypeOption } from '../../activities/activities.api';
import type { AgendaItem } from '../../common/commercial-activity.api';
import { dayLongLabel, eventCountLabel, weekDays, weekdayNames } from '../calendar-grid';

import { AgendaEventButton } from './AgendaEventButton';

/** Alto mínimo de una columna de la semana, en unidades de espaciado. */
const WEEK_COLUMN_MIN_HEIGHT = 30;

export interface CalendarWeekViewProps {
  referenceKey: string;
  todayKey: string;
  itemsByDay: ReadonlyMap<string, AgendaItem[]>;
  types: readonly ActivityTypeOption[] | undefined;
  onOpen: (item: AgendaItem) => void;
  /** Zona del usuario para la hora de cada evento; `undefined` = la del navegador. */
  timeZone?: string;
  /** La cabecera de cada día abre su vista Día. */
  onShowDay: (key: string) => void;
}

/**
 * Vista Semana (04 §E.2), solo desde `md` (en móvil se usa la vista Día): siete
 * columnas lunes–domingo con los eventos de cada día ordenados por hora.
 */
export function CalendarWeekView({ referenceKey, todayKey, itemsByDay, types, onOpen, timeZone, onShowDay }: CalendarWeekViewProps) {
  const names = weekdayNames();
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
      {weekDays(referenceKey).map((day, index) => {
        const items = itemsByDay.get(day.key) ?? [];
        const isToday = day.key === todayKey;
        return (
          <Box
            key={day.key}
            component="section"
            aria-label={`${dayLongLabel(day.key)}: ${eventCountLabel(items.length)}`}
            aria-current={isToday ? 'date' : undefined}
            sx={{
              minWidth: 0,
              minHeight: (theme) => theme.spacing(WEEK_COLUMN_MIN_HEIGHT),
              borderRight: index === 6 ? 0 : 1,
              borderColor: 'divider',
            }}
          >
            <ButtonBase
              onClick={() => onShowDay(day.key)}
              aria-label={`Ver el día ${dayLongLabel(day.key)}`}
              sx={{
                width: '100%',
                minHeight: layout.tap,
                flexDirection: 'column',
                py: 0.75,
                borderBottom: 1,
                borderColor: 'divider',
                bgcolor: isToday ? 'primary.main' : 'background.subtle',
                color: isToday ? 'primary.contrastText' : 'text.primary',
              }}
            >
              <Typography component="span" variant="overline" aria-hidden sx={{ color: 'inherit' }}>
                {names[index]?.short}
              </Typography>
              <Typography component="span" variant="h6" aria-hidden sx={{ color: 'inherit' }}>
                {day.dayOfMonth}
              </Typography>
            </ButtonBase>
            <Stack component="ul" spacing={0.5} sx={{ listStyle: 'none', m: 0, p: 0.75 }}>
              {items.map((item) => (
                <Box component="li" key={`${item.kind}-${item.id}`} sx={{ minWidth: 0 }}>
                  <AgendaEventButton item={item} types={types} onOpen={onOpen} timeZone={timeZone} variant="compact" />
                </Box>
              ))}
            </Stack>
          </Box>
        );
      })}
    </Box>
  );
}
