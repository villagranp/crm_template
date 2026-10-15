import { Alert, Box, Button, DialogContentText, Skeleton, Stack, Typography } from '@mui/material';
import { useState } from 'react';

import { ConfirmDialog, DialogFooter, EntityDialog } from '@/components/data';
import { describeApiError } from '@/lib/api-error-view';
import {
  useResetDashboardComposition,
  useSaveDashboardComposition,
  useUiSettings,
  type DashboardComposition,
} from '@/services/ui-settings';
import { fontSizes } from '@/theme/tokens';

import {
  BLOCK_LABELS,
  isBlockPermitted,
  isKpiPermitted,
  KPI_LABELS,
  LOCKED_BLOCK_KEYS,
  mergeSubset,
} from '../dashboard-layout';
import type { DashboardAccess } from '../dashboard.permissions';
import { DashboardCardsList } from './DashboardCardsList';

export const SAFETY_MINUTE_LOCKED_NOTE = 'Mensaje institucional: siempre visible';

const ERROR_MESSAGES = {
  INVALID_DASHBOARD_CARDS:
    'La composición del panel no es válida. Cierra el diálogo, restablece el panel e inténtalo de nuevo.',
} as const;

export interface DashboardCustomizeDialogProps {
  open: boolean;
  onClose: () => void;
  /** Permisos de la sesión: sólo se listan los elementos a los que tiene acceso (AC-AJ1.1). */
  access: DashboardAccess;
}

function SectionTitle({ id, children }: { id: string; children: string }) {
  return (
    <Typography id={id} component="h3" sx={{ fontWeight: 600, fontSize: fontSizes.cardTitle, mb: 0.5 }}>
      {children}
    </Typography>
  );
}

/**
 * «Personalizar panel» (D-AJ1.1): cada usuario elige qué bloques e indicadores ve y en qué orden.
 * Guarda la lista COMPLETA (las claves sin acceso se conservan para que un cambio posterior de
 * permisos no las pierda) con `PUT /me/preferences/dashboard-cards`; «Restablecer» borra la
 * preferencia (`DELETE`) tras confirmar y sólo existe si el panel está personalizado.
 */
export function DashboardCustomizeDialog({ open, onClose, access }: DashboardCustomizeDialogProps) {
  const { settings, isLoaded, isLoading } = useUiSettings();
  const save = useSaveDashboardComposition();
  const reset = useResetDashboardComposition();
  const [draft, setDraft] = useState<DashboardComposition | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);

  const working: DashboardComposition = draft ?? settings.dashboard;
  const pending = save.isPending || reset.isPending;

  const close = () => {
    if (pending) {
      return;
    }
    setDraft(null);
    setConfirmingReset(false);
    save.reset();
    reset.reset();
    onClose();
  };

  const submit = () => {
    if (!draft) {
      return;
    }
    save.mutate(
      { blocks: draft.blocks, kpis: draft.kpis },
      {
        onSuccess: () => {
          setDraft(null);
          onClose();
        },
      },
    );
  };

  const confirmReset = () => {
    reset.mutate(undefined, {
      onSuccess: () => {
        setDraft(null);
        setConfirmingReset(false);
        onClose();
      },
    });
  };

  const blocks = working.blocks.filter((entry) => isBlockPermitted(entry.key, access));
  const kpis = working.kpis.filter((entry) => isKpiPermitted(entry.key, access));
  const saveError = save.isError ? describeApiError(save.error, ERROR_MESSAGES) : null;
  const resetError = reset.isError ? describeApiError(reset.error) : null;

  let body;
  if (isLoading) {
    body = (
      <Stack spacing={1} aria-busy="true" aria-label="Cargando tu configuración">
        <Skeleton variant="rounded" height={48} />
        <Skeleton variant="rounded" height={48} />
        <Skeleton variant="rounded" height={48} />
      </Stack>
    );
  } else if (!isLoaded) {
    body = (
      <Alert severity="error">
        No se pudo cargar tu configuración del panel. Cierra este diálogo e inténtalo de nuevo.
      </Alert>
    );
  } else {
    body = (
      <Stack spacing={3}>
        <DialogContentText variant="body2">
          Elige qué ver en tu panel y en qué orden. Sólo aparece lo que tu acceso permite.
        </DialogContentText>

        <Box component="section" aria-labelledby="customize-blocks">
          <SectionTitle id="customize-blocks">Bloques</SectionTitle>
          <DashboardCardsList
            label="Bloques"
            items={blocks}
            labels={BLOCK_LABELS}
            lockedKeys={LOCKED_BLOCK_KEYS}
            lockedNote={SAFETY_MINUTE_LOCKED_NOTE}
            disabled={pending}
            onChange={(subset) =>
              setDraft({ ...working, blocks: mergeSubset(working.blocks, subset) })
            }
          />
        </Box>

        {kpis.length > 0 ? (
          <Box component="section" aria-labelledby="customize-kpis">
            <SectionTitle id="customize-kpis">Indicadores</SectionTitle>
            <DashboardCardsList
              label="Indicadores"
              items={kpis}
              labels={KPI_LABELS}
              disabled={pending}
              onChange={(subset) =>
                setDraft({ ...working, kpis: mergeSubset(working.kpis, subset) })
              }
            />
          </Box>
        ) : null}

        {settings.dashboard.isCustomized ? (
          <Box>
            <Button
              variant="text"
              color="inherit"
              onClick={() => setConfirmingReset(true)}
              disabled={pending}
            >
              Restablecer
            </Button>
          </Box>
        ) : null}

        {saveError ? <Alert severity="error">{saveError.message}</Alert> : null}
      </Stack>
    );
  }

  return (
    <>
      <EntityDialog
        open={open}
        onClose={pending ? undefined : close}
        title="Personalizar panel"
        subtitle="Inicio"
        maxWidth="sm"
        onSubmit={submit}
        actions={
          <DialogFooter
            onCancel={close}
            submitLabel="Guardar"
            pending={pending}
            submitDisabled={!isLoaded || !draft}
          />
        }
      >
        {body}
      </EntityDialog>

      <ConfirmDialog
        open={open && confirmingReset}
        title="Restablecer el panel"
        description="Tu panel volverá a la composición por defecto. Perderás el orden y la visibilidad que elegiste."
        confirmLabel="Restablecer"
        destructive
        isPending={reset.isPending}
        errorMessage={resetError?.message ?? null}
        onConfirm={confirmReset}
        onClose={() => setConfirmingReset(false)}
      />
    </>
  );
}
