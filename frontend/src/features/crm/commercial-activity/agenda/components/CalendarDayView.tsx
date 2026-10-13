import { Box, Button, Stack, Typography } from '@mui/material';

import { layout } from '@/theme/tokens';

import type { ActivityTypeOption } from '../../activities/activities.api';
import type { AgendaItem } from '../../common/commercial-activity.api';
import { dayLongLabel, eventCountLabel, weekdayNames, type CalendarDay } from '../calendar-grid';

import { AgendaEventButton } from './AgendaEventButton';

export interface CalendarDayViewProps {
  /** Eventos del día, ya ordenados por hora (`groupByDay`). */
  items: readonly AgendaItem[];
  types: readonly ActivityTypeOption[] | undefined;
  onOpen: (item: AgendaItem) => void;
  /** Zona del usuario para la hora de cada evento; `undefined` = la del navegador. */
  timeZone?: string;
}

/**
 * Vista Día (04 §E.2): lista de los eventos del día por hora, con el resumen
 * completo de cada uno. También es el detalle del día en el Mes móvil.
 */
export function CalendarDayView({ items, types, onOpen, timeZone }: CalendarDayViewProps) {
  if (items.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ px: 0.5, py: 2 }}>
        Sin eventos este día.
      </Typography>
    );
  }
  return (
    <Stack component="ul" spacing={1} sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {items.map((item) => (
        <Box component="li" key={`${item.kind}-${item.id}`} sx={{ minWidth: 0 }}>
          <AgendaEventButton item={item} types={types} onOpen={onOpen} timeZone={timeZone} variant="full" />
        </Box>
      ))}
    </Stack>
  );
}

export interface WeekDayStripProps {
  /** Los siete días de la semana, de lunes a domingo (`weekDays`). */
  days: readonly CalendarDay[];
  selectedKey: string;
  todayKey: string;
  counts: ReadonlyMap<string, number>;
  onSelect: (key: string) => void;
}

/**
 * Tira de días de la semana de la vista Día en móvil (E.2). Botones con
 * `aria-pressed` y el número de eventos en su nombre accesible; si no cabe,
 * scrollea dentro de su contenedor (`scroll-x`), nunca la página.
 */
export function WeekDayStrip({ days, selectedKey, todayKey, counts, onSelect }: WeekDayStripProps) {
  const names = weekdayNames();
  return (
    <Box role="group" aria-label="Días de la semana" className="scroll-x" sx={{ display: 'flex', gap: 0.75, pb: 0.5, mb: 1.5 }}>
      {days.map((day, index) => {
        const selected = day.key === selectedKey;
        const count = counts.get(day.key) ?? 0;
        const weekday = names[index]?.short ?? '';
        return (
          <Button
            key={day.key}
            variant={selected ? 'contained' : 'outlined'}
            color={selected ? 'primary' : 'inherit'}
            aria-pressed={selected}
            aria-current={day.key === todayKey ? 'date' : undefined}
            aria-label={`${dayLongLabel(day.key)}: ${eventCountLabel(count)}`}
            onClick={() => onSelect(day.key)}
            sx={{
              flex: '1 0 auto',
              minWidth: layout.tap,
              px: 1,
              flexDirection: 'column',
              gap: 0,
              borderColor: selected ? undefined : 'divider',
              fontWeight: day.key === todayKey ? 'fontWeightBold' : undefined,
              textDecoration: day.key === todayKey && !selected ? 'underline' : undefined,
            }}
          >
            <Box component="span" aria-hidden sx={{ typography: 'caption' }}>
              {weekday}
            </Box>
            <Box component="span" aria-hidden sx={{ typography: 'body2', fontWeight: 'inherit' }}>
              {day.dayOfMonth}
            </Box>
            <Box component="span" aria-hidden sx={{ typography: 'caption', visibility: count > 0 ? 'visible' : 'hidden' }}>
              {count}
            </Box>
          </Button>
        );
      })}
    </Box>
  );
}
