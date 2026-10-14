import BarChartIcon from '@mui/icons-material/BarChart';
import TableRowsOutlinedIcon from '@mui/icons-material/TableRowsOutlined';
import { Alert, Box, Button, Card, CardContent, CardHeader, Skeleton, Stack, Typography } from '@mui/material';
import { useId, useState, type ReactNode } from 'react';

/**
 * Panel de una visualización de Reportes (05 E.1, E.3, E.7, E.8) con su **tabla equivalente**
 * ("Ver como tabla", AC-05.33) y estados propios: cada panel carga y falla por separado
 * (AC-05.32), con "Reintentar".
 *
 * La gráfica es opcional: hoy F-35 sólo pasa la tabla (las distribuciones por etapa y asesor);
 * la tanda del dashboard y el embudo añade `chart` con `@mui/x-charts` Community (ADR-023)
 * sin cambiar este contrato. Con `chart`, la vista inicial es la gráfica y el conmutador
 * alterna con la tabla; sin ella, sólo se muestra la tabla.
 */

export interface ChartPanelProps {
  title: string;
  /** Qué mide y con qué base de fecha (p. ej. "Etapa vigente de las oportunidades del período"). */
  description?: ReactNode;
  /** Visualización (gráfica). Opcional: sin ella, el panel muestra la tabla. */
  chart?: ReactNode;
  /** Tabla con los mismos valores que la gráfica (accesibilidad, lectores de pantalla). */
  table: ReactNode;
  isLoading?: boolean;
  /** Mensaje ya traducido (con referencia); con él se pinta el error del panel. */
  errorMessage?: string | null;
  onRetry?: () => void;
  /** Sin datos que mostrar (se pinta `emptyMessage`, nunca un 0 % inventado). */
  isEmpty?: boolean;
  emptyMessage?: string;
  /** Acciones extra en la cabecera (p. ej. un enlace al reporte filtrado). */
  action?: ReactNode;
}

export function ChartPanel({
  title,
  description,
  chart,
  table,
  isLoading = false,
  errorMessage,
  onRetry,
  isEmpty = false,
  emptyMessage = 'No hay datos para los filtros seleccionados.',
  action,
}: ChartPanelProps) {
  const titleId = useId();
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const showChart = Boolean(chart) && view === 'chart';

  let body: ReactNode;
  if (errorMessage) {
    body = (
      <Alert
        severity="error"
        role="alert"
        action={
          onRetry ? (
            <Button color="inherit" size="small" onClick={onRetry}>
              Reintentar
            </Button>
          ) : undefined
        }
      >
        {errorMessage}
      </Alert>
    );
  } else if (isLoading) {
    body = (
      <Stack role="status" aria-label={`Cargando ${title}`} spacing={1}>
        <Skeleton variant="text" />
        <Skeleton variant="text" />
        <Skeleton variant="text" width="70%" />
      </Stack>
    );
  } else if (isEmpty) {
    body = (
      <Typography role="status" variant="body2" color="text.secondary">
        {emptyMessage}
      </Typography>
    );
  } else {
    body = showChart ? chart : table;
  }

  const canToggle = Boolean(chart) && !errorMessage && !isLoading && !isEmpty;

  return (
    <Card component="section" aria-labelledby={titleId} sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardHeader
        title={title}
        titleTypographyProps={{ id: titleId, component: 'h2', variant: 'h6' }}
        subheader={description}
        subheaderTypographyProps={{ variant: 'body2' }}
        action={
          <Stack direction="row" spacing={1} alignItems="center">
            {action}
            {canToggle ? (
              <Button
                size="small"
                variant="text"
                startIcon={showChart ? <TableRowsOutlinedIcon /> : <BarChartIcon />}
                onClick={() => setView(showChart ? 'table' : 'chart')}
              >
                {showChart ? 'Ver como tabla' : 'Ver como gráfica'}
              </Button>
            ) : null}
          </Stack>
        }
      />
      <CardContent sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ minWidth: 0 }}>{body}</Box>
      </CardContent>
    </Card>
  );
}
