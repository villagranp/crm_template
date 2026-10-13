import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { Alert, Box, Button, Card, Link, Skeleton, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import { describeApiError } from '@/lib/api-error-view';
import {
  breakpoints,
  duration,
  easing,
  fonts,
  fontSizes,
  gradients,
  layout,
  onBrand,
  shadows,
  softTintsFor,
  statHover,
} from '@/theme/tokens';
import { sectionLabelSx } from '@/theme/typography';

import { formatUpdatedAt } from '../dashboard-format';
import { UNAVAILABLE_ROUTE_NOTE } from '../source-routes';

export type KpiTone = 'brand' | 'brandSoft' | 'plain';

export interface KpiCardProps {
  /** Nombre del indicador; también es el nombre accesible de la tarjeta (`section`). */
  label: string;
  icon: ReactNode;
  tone?: KpiTone;
  /** Primera carga: esqueleto del tamaño de la tarjeta. */
  isLoading?: boolean;
  /** Error de la consulta de esta tarjeta (RN-01.8): mensaje, reintento y referencia. */
  error?: unknown;
  onRetry?: () => void;
  value?: ReactNode;
  /** Pie: subconteos o explicación. */
  foot?: ReactNode;
  /** `generatedAt` de la respuesta: "Actualizado hh:mm". */
  generatedAt?: string;
  /**
   * Destino del indicador (E.3): una ruta, `null` si el módulo dueño aún no
   * tiene la ruta registrada (nota de RN-01.19) o `undefined` si el indicador
   * no tiene destino propio (K9 y los de "Mi acceso").
   */
  href?: string | null;
  /** Contenido adicional bajo el pie (p. ej. la mini-serie del forecast). */
  children?: ReactNode;
}

/** Sólo con ratón y sin movimiento reducido. */
const HOVER_MOTION =
  '@media (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)';

/**
 * Tarjeta de indicador (`.stat-card` del prototipo), evolución del `StatCard`
 * del panel: ficha de icono, etiqueta en versalitas, valor grande y pie, con
 * los estados de 01 §E.3 (cargando, error con reintento y `correlationId`,
 * valor o texto de "no calculable") y el enlace "Ver …" a su listado.
 *
 * Al pasar el ratón: reflejo diagonal, el icono crece y gira un poco y el
 * valor se compacta; desde `lg` la tarjeta se eleva. Con movimiento reducido
 * o en táctil no hay nada de eso.
 */
export function KpiCard({
  label,
  icon,
  tone = 'plain',
  isLoading = false,
  error,
  onRetry,
  value,
  foot,
  generatedAt,
  href,
  children,
}: KpiCardProps) {
  const hasError = error !== undefined && error !== null;
  const onGradient = tone !== 'plain' && !hasError;
  const mutedColor = onGradient ? onBrand.textMuted : 'text.secondary';
  const updatedText = formatUpdatedAt(generatedAt);
  const errorView = hasError ? describeApiError(error) : null;

  return (
    <Card
      component="section"
      aria-label={label}
      aria-busy={isLoading || undefined}
      sx={(theme) => ({
        p: 2.25,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
        transition: `transform ${duration.hover}ms ease, box-shadow ${duration.hover}ms ease`,
        '&::after': {
          content: '""',
          position: 'absolute',
          inset: 0,
          backgroundImage: gradients.statSheen,
          transform: 'translateX(-130%)',
          transition: `transform ${duration.statSheen}ms ${easing.out}`,
          pointerEvents: 'none',
        },
        '& [data-stat-icon]': {
          transition: `transform ${duration.statReact}ms ${easing.out}`,
        },
        '& [data-stat-value]': {
          transition: `letter-spacing ${duration.statReact}ms ${easing.out}`,
        },
        [HOVER_MOTION]: {
          '&:hover::after': { transform: 'translateX(130%)' },
          '&:hover [data-stat-icon]': { transform: statHover.iconTransform },
          '&:hover [data-stat-value]': { letterSpacing: statHover.valueLetterSpacing },
          [`@media (min-width: ${breakpoints.lg}px)`]: {
            '&:hover': {
              transform: `translateY(-${statHover.lift}px)`,
              boxShadow: shadows[theme.palette.mode].md,
            },
          },
        },
        ...(onGradient
          ? {
              border: 0,
              color: 'common.white',
              backgroundImage: tone === 'brand' ? gradients.brand : gradients.brandSoft,
            }
          : {}),
      })}
    >
      <Box
        aria-hidden="true"
        data-stat-icon=""
        sx={(theme) => ({
          width: layout.statIconSize,
          height: layout.statIconSize,
          borderRadius: `${layout.radiusIcon}px`,
          display: 'grid',
          placeItems: 'center',
          mb: 1.5,
          color: onGradient ? 'common.white' : 'primary.main',
          bgcolor: onGradient ? onBrand.iconTile : softTintsFor(theme.palette.mode).brand,
        })}
      >
        {icon}
      </Box>
      <Typography component="h3" sx={{ ...sectionLabelSx, color: mutedColor }}>
        {label}
      </Typography>

      {isLoading ? (
        <Stack spacing={0.75} sx={{ mt: 1 }}>
          <Skeleton variant="text" width="45%" sx={{ fontSize: fontSizes.statValue }} />
          <Skeleton variant="text" width="80%" />
        </Stack>
      ) : hasError && errorView ? (
        <Alert
          severity="error"
          sx={{ mt: 1 }}
          action={
            onRetry ? (
              <Button color="inherit" size="small" onClick={onRetry}>
                Reintentar
              </Button>
            ) : undefined
          }
        >
          {errorView.message}
          {errorView.correlationId ? (
            <Typography component="span" sx={{ display: 'block', fontSize: fontSizes.caption }}>
              Referencia: {errorView.correlationId}
            </Typography>
          ) : null}
        </Alert>
      ) : (
        <>
          <Typography
            data-stat-value=""
            sx={{
              fontFamily: fonts.heading,
              fontWeight: 700,
              fontSize: fontSizes.statValue,
              lineHeight: 1.2,
              my: 0.5,
              overflowWrap: 'anywhere',
            }}
          >
            {value}
          </Typography>
          {foot ? (
            <Typography component="div" sx={{ fontSize: fontSizes.small, color: mutedColor }}>
              {foot}
            </Typography>
          ) : null}
          {children}
        </>
      )}

      {!isLoading && !hasError && (updatedText || href !== undefined) ? (
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          justifyContent="space-between"
          flexWrap="wrap"
          useFlexGap
          sx={{ mt: 'auto', pt: 1.5 }}
        >
          {updatedText ? (
            <Typography sx={{ fontSize: fontSizes.caption, color: mutedColor }}>
              {updatedText}
            </Typography>
          ) : null}
          {href ? (
            <Link
              component={RouterLink}
              to={href}
              underline="hover"
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.5,
                minHeight: layout.tap,
                fontSize: fontSizes.small,
                fontWeight: 600,
                color: onGradient ? 'common.white' : 'primary.main',
              }}
            >
              Ver {label.toLowerCase()}
              <ArrowForwardIcon aria-hidden="true" fontSize="inherit" />
            </Link>
          ) : href === null ? (
            <Typography sx={{ fontSize: fontSizes.caption, color: mutedColor }}>
              {UNAVAILABLE_ROUTE_NOTE}
            </Typography>
          ) : null}
        </Stack>
      ) : null}
    </Card>
  );
}
