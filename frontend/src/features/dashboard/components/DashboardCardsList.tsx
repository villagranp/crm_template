import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import { Box, FormControlLabel, IconButton, Stack, Switch, Typography } from '@mui/material';
import { useEffect, useRef } from 'react';

import type { DashboardCardEntry } from '@/services/ui-settings';
import { fontSizes, layout } from '@/theme/tokens';

import { moveEntry } from '../dashboard-layout';

export interface DashboardCardsListProps<TKey extends string> {
  /** Nombre accesible de la lista («Bloques», «Indicadores»). */
  label: string;
  /** Elementos a mostrar, en su orden actual. */
  items: readonly DashboardCardEntry<TKey>[];
  labels: Readonly<Record<TKey, string>>;
  /** Claves sin interruptor: siempre visibles, sólo se reordenan (D-AJ1.10). */
  lockedKeys?: readonly TKey[];
  /** Nota bajo la etiqueta de los elementos bloqueados. */
  lockedNote?: string;
  disabled?: boolean;
  /** Anuncia la nueva posición tras mover; el padre pinta UNA región compartida (`AnnouncementRegion`). */
  onAnnounce: (message: string) => void;
  /** Recibe la lista completa mostrada con el nuevo orden o visibilidad. */
  onChange: (items: DashboardCardEntry<TKey>[]) => void;
}

type Direction = 'up' | 'down';

/**
 * Única región `aria-live` de un grupo de listas. Va dentro de un contenedor `position: relative`,
 * porque su caja visualmente oculta es `position: absolute`.
 */
export function AnnouncementRegion({ message }: { message: string }) {
  return (
    <Box
      role="status"
      aria-live="polite"
      sx={{
        position: 'absolute',
        width: 0,
        height: 0,
        overflow: 'hidden',
        clipPath: 'inset(50%)',
        whiteSpace: 'nowrap',
      }}
    >
      {message}
    </Box>
  );
}

/**
 * Lista reordenable compartida por «Personalizar panel» y por el editor del parámetro por defecto.
 * Sin arrastrar y soltar (exigiría una librería y un ADR): cada fila tiene un interruptor «Visible»
 * y botones subir/bajar con nombre accesible. Tras mover, el foco se queda en el botón de la fila
 * movida y se anuncia la nueva posición por la región `aria-live` del padre.
 */
export function DashboardCardsList<TKey extends string>({
  label,
  items,
  labels,
  lockedKeys = [],
  lockedNote,
  disabled = false,
  onAnnounce,
  onChange,
}: DashboardCardsListProps<TKey>) {
  const listRef = useRef<HTMLUListElement>(null);
  const pendingFocus = useRef<{ key: TKey; direction: Direction } | null>(null);

  useEffect(() => {
    const pending = pendingFocus.current;
    if (!pending) {
      return;
    }
    pendingFocus.current = null;
    const row = [...(listRef.current?.querySelectorAll<HTMLElement>('[data-card-key]') ?? [])].find(
      (element) => element.dataset.cardKey === pending.key,
    );
    const preferred = row?.querySelector<HTMLButtonElement>(`[data-move="${pending.direction}"]`);
    const fallback = row?.querySelector<HTMLButtonElement>(
      `[data-move="${pending.direction === 'up' ? 'down' : 'up'}"]`,
    );
    (preferred && !preferred.disabled ? preferred : fallback)?.focus();
  }, [items]);

  const move = (index: number, direction: Direction) => {
    const entry = items[index];
    if (!entry) {
      return;
    }
    const next = moveEntry(items, index, direction === 'up' ? -1 : 1);
    pendingFocus.current = { key: entry.key, direction };
    onAnnounce(
      `«${labels[entry.key]}» en la posición ${next.indexOf(entry) + 1} de ${next.length}`,
    );
    onChange(next);
  };

  const toggle = (index: number, visible: boolean) => {
    onChange(items.map((entry, position) => (position === index ? { ...entry, visible } : entry)));
  };

  return (
    <Box>
      <Box component="ul" ref={listRef} aria-label={label} sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {items.map((entry, index) => {
          const name = labels[entry.key];
          const locked = lockedKeys.includes(entry.key);
          return (
            <Stack
              key={entry.key}
              component="li"
              data-card-key={entry.key}
              direction="row"
              alignItems="center"
              spacing={1}
              sx={{ py: 0.75, borderBottom: 1, borderColor: 'divider', minWidth: 0 }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography
                  sx={{
                    fontWeight: 500,
                    overflowWrap: 'anywhere',
                    color: !locked && !entry.visible ? 'text.secondary' : 'text.primary',
                  }}
                >
                  {name}
                </Typography>
                {locked && lockedNote ? (
                  <Typography sx={{ fontSize: fontSizes.caption, color: 'text.secondary' }}>
                    {lockedNote}
                  </Typography>
                ) : null}
              </Box>
              {locked ? null : (
                <FormControlLabel
                  sx={{ m: 0, flexShrink: 0 }}
                  disabled={disabled}
                  label="Visible"
                  control={
                    <Switch
                      checked={entry.visible}
                      onChange={(event) => toggle(index, event.target.checked)}
                      slotProps={{ input: { 'aria-label': `Visible: ${name}` } }}
                    />
                  }
                />
              )}
              <IconButton
                data-move="up"
                aria-label={`Subir ${name}`}
                onClick={() => move(index, 'up')}
                disabled={disabled || index === 0}
                sx={{ width: layout.tap, height: layout.tap }}
              >
                <ArrowUpwardIcon />
              </IconButton>
              <IconButton
                data-move="down"
                aria-label={`Bajar ${name}`}
                onClick={() => move(index, 'down')}
                disabled={disabled || index === items.length - 1}
                sx={{ width: layout.tap, height: layout.tap }}
              >
                <ArrowDownwardIcon />
              </IconButton>
            </Stack>
          );
        })}
      </Box>
    </Box>
  );
}
