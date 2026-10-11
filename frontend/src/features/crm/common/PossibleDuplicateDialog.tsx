import { Alert, Box, Button, Chip, DialogContentText, Link, Stack, Typography } from '@mui/material';
import { useId } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import { DialogFooter, EntityDialog } from '@/components/data';

import { acknowledgeableIds, type DuplicateCandidate, type DuplicateReason } from './duplicates';

export type DuplicateEntity = 'customer' | 'contact';

export interface PossibleDuplicateDialogProps {
  open: boolean;
  /** Qué se está guardando: cambia los textos, no el comportamiento. */
  entity: DuplicateEntity;
  /** Candidatos ya agrupados con `parseDuplicateCandidates(error.details)`. */
  candidates: readonly DuplicateCandidate[];
  /** `DUPLICATE_BLOCKED`: no se ofrece guardar de todos modos. */
  blocked?: boolean;
  /** Etiqueta del identificador fiscal del país (`taxIdLabel`); por defecto "NIT". */
  taxIdLabel?: string;
  /** Ruta de la ficha de un candidato visible; sin ella no hay enlaces. */
  getCandidateHref?: (id: string) => string;
  /** El reenvío está en curso: bloquea los botones y el cierre. */
  isPending?: boolean;
  /** Error del reenvío ya traducido (`describeApiError(error).message`). */
  errorMessage?: string | null;
  /** "Revisar": cierra el diálogo y vuelve al formulario sin guardar. */
  onReview: () => void;
  /** "Guardar de todos modos": recibe los ids para `acknowledgedDuplicateIds`. El diálogo no se cierra solo. */
  onConfirm: (acknowledgedDuplicateIds: string[]) => void;
}

const COPY: Record<DuplicateEntity, { title: string; warning: string; blocked: string }> = {
  customer: {
    title: 'Posible cliente duplicado',
    warning: 'Encontramos clientes que podrían ser el mismo que estás guardando. Revísalos antes de continuar.',
    blocked:
      'Ya existe un cliente con estos datos y la configuración no permite duplicarlo. Revisa los datos o coordina con su responsable.',
  },
  contact: {
    title: 'Posible contacto duplicado',
    warning: 'Este cliente ya tiene contactos que podrían ser el mismo que estás guardando. Revísalos antes de continuar.',
    blocked: 'Este cliente ya tiene un contacto con estos datos y la configuración no permite duplicarlo. Revisa los datos.',
  },
};

function reasonLabel(reason: DuplicateReason, taxIdLabel: string): string {
  switch (reason) {
    case 'LEGAL_NAME':
      return 'Razón social parecida';
    case 'TRADE_NAME':
      return 'Nombre comercial parecido';
    case 'EMAIL':
      return 'Mismo correo';
    case 'PHONE':
      return 'Mismo teléfono';
    case 'TAX_ID':
      return `Mismo ${taxIdLabel}`;
    case 'FULL_NAME':
      return 'Mismo nombre completo';
  }
}

function CandidateTitle({
  candidate,
  getCandidateHref,
}: {
  candidate: DuplicateCandidate;
  getCandidateHref?: (id: string) => string;
}) {
  if (candidate.isVisible && candidate.id && getCandidateHref) {
    return (
      <Link
        component={RouterLink}
        to={getCandidateHref(candidate.id)}
        target="_blank"
        rel="noopener"
        aria-label={`${candidate.title} (se abre en otra pestaña)`}
        sx={{ fontWeight: 'fontWeightMedium', overflowWrap: 'anywhere' }}
      >
        {candidate.title}
      </Link>
    );
  }
  return (
    <Typography component="span" sx={{ fontWeight: 'fontWeightMedium', overflowWrap: 'anywhere' }}>
      {candidate.title}
    </Typography>
  );
}

/**
 * Confirmación ante un `409 POSSIBLE_DUPLICATE` (o aviso de bloqueo ante
 * `DUPLICATE_BLOCKED`) al guardar un cliente o un contacto (02 §E.3, §E.5).
 *
 * Lista cada candidato con sus motivos; enlaza a su ficha sólo si el usuario
 * puede verlo (RN-02.15). "Guardar de todos modos" no reenvía nada por sí
 * mismo: entrega los ids para `acknowledgedDuplicateIds` y la pantalla repite
 * la mutación, pasa `isPending`/`errorMessage` y cierra al terminar.
 */
export function PossibleDuplicateDialog({
  open,
  entity,
  candidates,
  blocked = false,
  taxIdLabel = 'NIT',
  getCandidateHref,
  isPending = false,
  errorMessage,
  onReview,
  onConfirm,
}: PossibleDuplicateDialogProps) {
  const descriptionId = useId();
  const copy = COPY[entity];
  const hasTaxIdMatch = candidates.some((candidate) => candidate.reasons.includes('TAX_ID'));
  const hiddenCount = candidates.filter((candidate) => !candidate.isVisible).length;

  return (
    <EntityDialog
      open={open}
      onClose={isPending ? undefined : onReview}
      title={copy.title}
      describedBy={descriptionId}
      maxWidth="sm"
      actions={
        blocked ? (
          <Button onClick={onReview}>Revisar datos</Button>
        ) : (
          <DialogFooter
            onCancel={onReview}
            cancelLabel="Revisar"
            submitLabel={isPending ? 'Guardando…' : 'Guardar de todos modos'}
            pending={isPending}
            onSubmit={() => onConfirm(acknowledgeableIds(candidates))}
          />
        )
      }
    >
      <Stack spacing={2}>
        <DialogContentText id={descriptionId}>{blocked ? copy.blocked : copy.warning}</DialogContentText>

        {hasTaxIdMatch && !blocked ? (
          <Alert severity="info" role="note">
            {`Un ${taxIdLabel} repetido puede corresponder a otro establecimiento del mismo cliente. Si es así, puedes guardarlo de todos modos.`}
          </Alert>
        ) : null}

        <Box component="ul" aria-label="Posibles duplicados" sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {candidates.map((candidate) => (
            <Box
              component="li"
              key={candidate.key}
              sx={{ py: 1.5, borderBottom: 1, borderColor: 'divider', '&:last-of-type': { borderBottom: 0 } }}
            >
              <CandidateTitle candidate={candidate} getCandidateHref={getCandidateHref} />
              {candidate.details.length > 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
                  {candidate.details.join(' · ')}
                </Typography>
              ) : null}
              <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mt: 0.75 }}>
                {candidate.reasons.map((reason) => (
                  <Chip key={reason} size="small" variant="outlined" color="warning" label={reasonLabel(reason, taxIdLabel)} />
                ))}
                {candidate.isDeleted ? <Chip size="small" variant="outlined" label="Eliminado" /> : null}
              </Stack>
            </Box>
          ))}
        </Box>

        {hiddenCount > 0 ? (
          <Typography variant="body2" color="text.secondary">
            {hiddenCount === 1
              ? 'Uno de los registros pertenece a otro responsable y no tienes acceso a su ficha.'
              : `${hiddenCount} registros pertenecen a otros responsables y no tienes acceso a su ficha.`}
          </Typography>
        ) : null}

        {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}
      </Stack>
    </EntityDialog>
  );
}
