import { ConfirmDialog } from '@/components/data';
import { describeApiError } from '@/lib/api-error-view';

import type { ProjectDetail } from '../projects.api';
import { describeActiveChildren, PROJECT_ERROR_MESSAGES, withReference } from '../projects.errors';
import { useDeleteProject } from '../projects.queries';

export interface DeleteProjectDialogProps {
  open: boolean;
  project: ProjectDetail;
  onClose: () => void;
  onDeleted: () => void;
}

/**
 * Eliminación lógica del proyecto (03 §E.4, RN-03.12, DM-33). Un `409
 * PROJECT_HAS_ACTIVE_CHILDREN` muestra los bloqueos que devuelve el backend.
 */
export function DeleteProjectDialog({ open, project, onClose, onDeleted }: DeleteProjectDialogProps) {
  const removal = useDeleteProject(project.id);
  const blockers = describeActiveChildren(removal.error);
  const errorMessage = removal.isError
    ? blockers
      ? `No se puede eliminar: el proyecto tiene ${blockers}.`
      : withReference(describeApiError(removal.error, PROJECT_ERROR_MESSAGES))
    : null;

  return (
    <ConfirmDialog
      open={open}
      destructive
      title="Eliminar proyecto"
      description={`«${project.name}» (${project.code}) dejará de aparecer en las búsquedas, en la vista de equipo y en la ficha del cliente. La eliminación es lógica: su historia se conserva.`}
      confirmLabel="Eliminar"
      isPending={removal.isPending}
      errorMessage={errorMessage}
      onConfirm={() => removal.mutate(undefined, { onSuccess: onDeleted })}
      onClose={() => {
        removal.reset();
        onClose();
      }}
    />
  );
}
