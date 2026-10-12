import { Box, Typography, type SxProps, type Theme } from '@mui/material';
import { useId, type ReactNode } from 'react';

import { brandSoft, SECTION_NUMBER_SIZE } from './surfaces';

export interface FormSectionProps {
  /** Número de la sección ("1", "2"…); sin él, sólo el título. */
  number?: number;
  title: string;
  /** Rejilla de dos columnas desde `sm`; en móvil, una. */
  columns?: 1 | 2;
  children: ReactNode;
}

/** Título de sección del prototipo (`form-sec-title`): número en círculo + mayúsculas espaciadas. */
function SectionTitle({
  id,
  number,
  title,
  component,
}: {
  id?: string;
  number?: number;
  title: string;
  component: 'legend' | 'h3';
}) {
  return (
    <Typography
      id={id}
      component={component}
      sx={(theme) => ({
        ...theme.typography.overline,
        fontSize: theme.typography.caption.fontSize,
        color: theme.palette.text.primary,
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        p: 0,
        pb: 1,
        mb: 2,
        borderBottom: 1,
        borderColor: 'divider',
      })}
    >
      {number !== undefined ? (
        <Box
          component="span"
          aria-hidden
          sx={{
            width: (theme) => theme.spacing(SECTION_NUMBER_SIZE),
            height: (theme) => theme.spacing(SECTION_NUMBER_SIZE),
            flexShrink: 0,
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            bgcolor: brandSoft,
            color: 'primary.main',
            letterSpacing: 0,
          }}
        >
          {number}
        </Box>
      ) : null}
      {title}
    </Typography>
  );
}

const gridSx = (columns: 1 | 2): SxProps<Theme> => ({
  display: 'grid',
  gap: 2,
  gridTemplateColumns: {
    xs: 'minmax(0, 1fr)',
    sm: columns === 2 ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)',
  },
  alignItems: 'start',
});

/**
 * Sección numerada de un formulario (`form-sec` del prototipo): un `fieldset`
 * con su `legend` y los campos en rejilla. Un hijo que deba ocupar la fila
 * entera va dentro de `FullRow`.
 */
export function FormSection({ number, title, columns = 2, children }: FormSectionProps) {
  return (
    <Box component="fieldset" sx={{ border: 0, p: 0, m: 0, minWidth: 0, '& + &': { mt: 3 } }}>
      <SectionTitle number={number} title={title} component="legend" />
      <Box sx={gridSx(columns)}>{children}</Box>
    </Box>
  );
}

/** Campo que ocupa toda la fila de una `FormSection` de dos columnas. */
export function FullRow({ children }: { children: ReactNode }) {
  return <Box sx={{ gridColumn: '1 / -1', minWidth: 0 }}>{children}</Box>;
}

export interface DetailSectionProps {
  title: string;
  number?: number;
  children: ReactNode;
}

/** Sección de una ficha de detalle (`detail-sec`): mismo título que los formularios. */
export function DetailSection({ title, number, children }: DetailSectionProps) {
  const titleId = useId();
  return (
    <Box component="section" aria-labelledby={titleId} sx={{ minWidth: 0, '& + &': { mt: 3 } }}>
      <SectionTitle id={titleId} number={number} title={title} component="h3" />
      {children}
    </Box>
  );
}

export interface DetailListProps {
  items: readonly { label: string; value: ReactNode; wide?: boolean }[];
}

/** Pares etiqueta/valor de una ficha (`detail-grid`): una columna en móvil, dos desde `sm`. */
export function DetailList({ items }: DetailListProps) {
  return (
    <Box
      component="dl"
      sx={{
        m: 0,
        display: 'grid',
        columnGap: 2.5,
        rowGap: 1.75,
        gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' },
      }}
    >
      {items.map((item) => (
        <Box key={item.label} sx={{ minWidth: 0, gridColumn: item.wide ? '1 / -1' : undefined }}>
          <Typography
            component="dt"
            sx={(theme) => ({
              ...theme.typography.overline,
              fontFamily: theme.typography.fontFamily,
              color: theme.palette.text.secondary,
            })}
          >
            {item.label}
          </Typography>
          <Typography component="dd" variant="body2" sx={{ m: 0, overflowWrap: 'anywhere' }}>
            {item.value}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}
