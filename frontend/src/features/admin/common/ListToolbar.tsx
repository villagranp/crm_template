import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import { Box, Button, InputAdornment, Stack, TextField, type Theme } from '@mui/material';
import type { ReactNode } from 'react';

import { neutralSoft, PILL_RADIUS } from './admin-surfaces';

export interface FilterChipOption {
  /** Valor del filtro; `''` = "Todos". */
  value: string;
  label: string;
  /** Total de registros con ese filtro; sin él, el chip no muestra contador. */
  count?: number;
}

export interface FilterChipsProps {
  /** Nombre accesible del grupo (p. ej. "Filtrar por estado"). */
  label: string;
  options: readonly FilterChipOption[];
  value: string;
  onChange: (value: string) => void;
}

/**
 * Chips de filtro del prototipo (`filter-chip`): píldoras con contador opcional;
 * la activa va rellena del color primario. Son botones con `aria-pressed`.
 */
export function FilterChips({ label, options, value, onChange }: FilterChipsProps) {
  return (
    <Box role="group" aria-label={label} sx={{ display: 'contents' }}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Button
            key={option.value || 'todos'}
            variant={active ? 'contained' : 'outlined'}
            color={active ? 'primary' : 'inherit'}
            aria-pressed={active}
            aria-label={option.count !== undefined ? `${option.label}, ${option.count}` : undefined}
            onClick={() => onChange(option.value)}
            sx={{
              flex: '0 0 auto',
              whiteSpace: 'nowrap',
              borderRadius: PILL_RADIUS,
              px: 1.75,
              gap: 0.75,
              typography: 'body2',
              fontWeight: 500,
              ...(active
                ? {}
                : { borderColor: 'divider', color: 'text.secondary', bgcolor: 'background.paper' }),
            }}
          >
            {option.label}
            {option.count !== undefined ? (
              <Box
                component="span"
                aria-hidden
                sx={{
                  minWidth: (theme) => theme.spacing(2.75),
                  px: 0.75,
                  borderRadius: PILL_RADIUS,
                  typography: 'caption',
                  fontWeight: 600,
                  textAlign: 'center',
                  bgcolor: (theme: Theme) =>
                    active ? theme.palette.action.focus : neutralSoft(theme),
                  color: 'inherit',
                }}
              >
                {option.count}
              </Box>
            ) : null}
          </Button>
        );
      })}
    </Box>
  );
}

export interface ListToolbarProps {
  /** Chips de filtro y selectores compactos (a la izquierda; en móvil, tira con scroll horizontal). */
  filters?: ReactNode;
  search?: {
    value: string;
    onChange: (value: string) => void;
    /** Nombre accesible del campo (p. ej. "Buscar por nombre o correo"). */
    label: string;
    placeholder?: string;
  };
  /** Acción primaria ("Nuevo …"). En móvil queda sólo con icono, con el mismo nombre accesible. */
  primaryAction?: {
    label: string;
    onClick: () => void;
    icon?: ReactNode;
  };
  /** Contenido extra bajo la fila principal (p. ej. un aviso). */
  children?: ReactNode;
}

/**
 * Barra de la tarjeta de listado (`table-toolbar` del prototipo): filtros a la
 * izquierda; búsqueda con icono y botón primario a la derecha.
 */
export function ListToolbar({ filters, search, primaryAction, children }: ListToolbarProps) {
  if (!filters && !search && !primaryAction && !children) {
    return null;
  }

  return (
    <Box sx={{ px: { xs: 2, md: 2.5 }, py: 2, borderBottom: 1, borderColor: 'divider' }}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={1.5}
        useFlexGap
        alignItems={{ md: 'center' }}
        justifyContent="space-between"
      >
        {filters ? (
          <Box
            className="scroll-x"
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              flexWrap: { xs: 'nowrap', md: 'wrap' },
              mx: { xs: -2, md: 0 },
              px: { xs: 2, md: 0 },
              pb: { xs: 0.5, md: 0 },
              minWidth: 0,
            }}
          >
            {filters}
          </Box>
        ) : (
          <Box />
        )}
        {search || primaryAction ? (
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            sx={{ flex: { md: '0 1 28rem' }, minWidth: 0 }}
          >
            {search ? (
              <TextField
                type="search"
                size="small"
                value={search.value}
                onChange={(event) => search.onChange(event.target.value)}
                placeholder={search.placeholder ?? 'Buscar…'}
                sx={{ flex: 1, minWidth: 0 }}
                slotProps={{
                  htmlInput: { 'aria-label': search.label },
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon fontSize="small" />
                      </InputAdornment>
                    ),
                  },
                }}
              />
            ) : (
              <Box sx={{ flex: 1 }} />
            )}
            {primaryAction ? (
              <Button
                onClick={primaryAction.onClick}
                aria-label={primaryAction.label}
                sx={{
                  flexShrink: 0,
                  minWidth: { xs: 'auto', sm: undefined },
                  px: { xs: 1.5, sm: 2.25 },
                  gap: 1,
                }}
              >
                {primaryAction.icon ?? <AddIcon />}
                <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
                  {primaryAction.label}
                </Box>
              </Button>
            ) : null}
          </Stack>
        ) : null}
      </Stack>
      {children}
    </Box>
  );
}
