import { Alert } from '@mui/material';
import { useEffect } from 'react';

import { EntityDialog } from '@/components/data';
import { describeApiError } from '@/lib/api-error-view';

import { COMMERCIAL_ERROR_MESSAGES, withReference } from '../../common/commercial-activity.errors';
import type { VisitDetail, VisitFormOptions } from '../visits.api';
import { useUpdateVisit } from '../visits.queries';
import { toUpdateVisitInput, visitPlanningValuesFrom, type VisitPlanningValues } from '../visits.schemas';

import { VisitPlanningForm } from './VisitPlanningForm';

export interface VisitPlanningDialogProps {
  open: boolean;
  visit: VisitDetail;
  options: VisitFormOptions | undefined;
  /** Con `visitas.administrar`: se puede reasignar el responsable (RN-04.5). */
  canChooseOwner: boolean;
  currentUserId: string | null;
  onClose: () => void;
  onDone: (visit: VisitDetail) => void;
}

/**
 * Editar la planificación de una visita pendiente (04 §E.7, RN-04.15): el mismo
 * formulario que el alta, sin la fecha de inicio ("Para cambiar la fecha,
 * reprograma la visita") ni el cliente.
 */
export function VisitPlanningDialog({ open, visit, options, canChooseOwner, currentUserId, onClose, onDone }: VisitPlanningDialogProps) {
  const update = useUpdateVisit(visit.id);
  const { reset } = update;

  useEffect(() => {
    if (open) {
      reset();
    }
  }, [open, reset]);

  const onSubmit = (values: VisitPlanningValues) => {
    update.mutate(toUpdateVisitInput(values, visit), {
      onSuccess: (saved) => {
        onDone(saved);
        onClose();
      },
    });
  };

  const errorView = update.isError ? describeApiError(update.error, COMMERCIAL_ERROR_MESSAGES) : null;

  return (
    <EntityDialog open={open} onClose={update.isPending ? undefined : onClose} title="Editar planificación" subtitle={`${visit.code} · ${visit.customer.legalName}`} maxWidth="md">
      {options ? (
        <VisitPlanningForm
          mode="edit"
          options={options}
          initialValues={visitPlanningValuesFrom(visit)}
          canChooseOwner={canChooseOwner}
          fixedOwnerName={visit.owner.displayName}
          currentUserId={currentUserId}
          visitId={visit.id}
          serverError={update.error}
          formError={errorView ? <Alert severity="error">{withReference(errorView)}</Alert> : null}
          isPending={update.isPending}
          submitLabel="Guardar cambios"
          onCancel={onClose}
          onSubmit={onSubmit}
        />
      ) : (
        <Alert severity="info">Cargando el formulario…</Alert>
      )}
    </EntityDialog>
  );
}
