import { Alert, Checkbox, DialogContentText, FormControlLabel, Skeleton, Stack } from '@mui/material';
import { useEffect, useId, useState } from 'react';

import { DialogFooter, EntityDialog } from '@/components/data';

import type { ConfirmCustomerImportInput, CustomerImport } from '../customer-imports.api';
import { confirmationSummary, formatCount, pluralize } from '../customer-imports-format';
import { useValidRowsWithWarnings } from '../customer-imports.queries';

export interface ConfirmImportDialogProps {
  open: boolean;
  data: CustomerImport;
  isPending: boolean;
  /** Error de la mutación ya traducido. */
  errorMessage: string | null;
  onConfirm: (input: ConfirmCustomerImportInput) => void;
  onClose: () => void;
}

/**
 * Confirmación de la importación (06 §E.4, AC-06.15): "Se importarán N
 * clientes. M filas no se importarán." y la casilla, desmarcada, para incluir
 * las filas válidas con advertencias (RN-06.18). `expectedValidRows` es el
 * `validRows` que muestra la pantalla: si cambió, el backend responde
 * `409 IMPORT_CHANGED`.
 *
 * Mismo marco que `ConfirmDialog` (`EntityDialog` + `DialogFooter`); lleva
 * su propio diálogo porque necesita la casilla dentro del contenido.
 */
export function ConfirmImportDialog({ open, data, isPending, errorMessage, onConfirm, onClose }: ConfirmImportDialogProps) {
  const descriptionId = useId();
  const [includeWarnings, setIncludeWarnings] = useState(false);
  const withWarnings = useValidRowsWithWarnings(data.id, open);

  useEffect(() => {
    if (open) {
      setIncludeWarnings(false);
    }
  }, [open]);

  const warningCount = withWarnings.data ?? 0;
  const summary = confirmationSummary(data, warningCount, includeWarnings);
  const counting = withWarnings.isPending;

  return (
    <EntityDialog
      open={open}
      onClose={isPending ? undefined : onClose}
      title={`Confirmar la importación de ${data.code}`}
      describedBy={descriptionId}
      maxWidth="sm"
      fullScreenBelow="xs"
      actions={
        <DialogFooter
          onCancel={onClose}
          cancelLabel="Volver"
          submitLabel="Confirmar importación"
          pending={isPending}
          submitDisabled={counting || summary.toImport === 0}
          onSubmit={() => onConfirm({ expectedValidRows: data.validRows, includeRowsWithWarnings: includeWarnings })}
        />
      }
    >
      <Stack spacing={2}>
        {counting ? (
          <Skeleton variant="text" aria-label="Calculando el resumen" />
        ) : (
          <DialogContentText id={descriptionId} role="status">
            {`Se importarán ${withWarnings.isError && !includeWarnings ? 'hasta ' : ''}${pluralize(summary.toImport, 'cliente', 'clientes')}. ${pluralize(summary.notImported, 'fila no se importará', 'filas no se importarán')}.`}
          </DialogContentText>
        )}

        {withWarnings.isError ? (
          <Alert severity="warning">
            No se pudo comprobar cuántas filas válidas tienen advertencias. Puede incluirlas marcando la casilla.
          </Alert>
        ) : null}

        {withWarnings.isError || warningCount > 0 ? (
          <FormControlLabel
            control={
              <Checkbox checked={includeWarnings} onChange={(event) => setIncludeWarnings(event.target.checked)} disabled={isPending} />
            }
            label={
              withWarnings.isError
                ? 'Importar también las filas válidas con advertencias'
                : `Importar también ${warningCount === 1 ? 'la fila' : `las ${formatCount(warningCount)} filas`} con advertencias`
            }
          />
        ) : null}

        {!counting && summary.toImport === 0 ? (
          <Alert severity="info">Todas las filas válidas tienen advertencias: marque la casilla para importarlas.</Alert>
        ) : null}

        <DialogContentText variant="body2">
          Los clientes se crean con las mismas reglas que el alta manual. Esta acción no se puede deshacer.
        </DialogContentText>

        {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}
      </Stack>
    </EntityDialog>
  );
}
