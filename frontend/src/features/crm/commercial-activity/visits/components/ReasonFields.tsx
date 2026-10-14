import { MenuItem, TextField } from '@mui/material';
import { Controller, type Control, type Path } from 'react-hook-form';

import type { VisitCatalogOption } from '../visits.api';
import { VISIT_LIMITS, type VisitReasonValues } from '../visits.schemas';

export interface ReasonFieldsProps<TValues extends VisitReasonValues> {
  control: Control<TValues>;
  /** Motivos activos del catálogo (`crm.motivo_reprogramacion` o `crm.motivo_cancelacion`). */
  reasons: readonly VisitCatalogOption[];
  disabled: boolean;
}

/**
 * Motivo (de la lista y/o escrito: al menos uno, RN-04.19/20) y comentario de
 * una reprogramación o cancelación. Los motivos salen del catálogo, nunca de
 * una lista fija.
 */
export function ReasonFields<TValues extends VisitReasonValues>({ control, reasons, disabled }: ReasonFieldsProps<TValues>) {
  return (
    <>
      <Controller
        control={control}
        name={'reasonId' as Path<TValues>}
        render={({ field, fieldState }) => (
          <TextField
            select
            name={field.name}
            inputRef={field.ref}
            value={String(field.value ?? '')}
            onChange={field.onChange}
            onBlur={field.onBlur}
            label="Motivo"
            required
            disabled={disabled}
            error={Boolean(fieldState.error)}
            helperText={fieldState.error?.message ?? 'De la lista, escrito o ambos.'}
          >
            <MenuItem value="">Sin motivo de la lista</MenuItem>
            {reasons.map((reason) => (
              <MenuItem key={reason.id} value={reason.id}>
                {reason.label}
              </MenuItem>
            ))}
          </TextField>
        )}
      />
      <Controller
        control={control}
        name={'reasonText' as Path<TValues>}
        render={({ field, fieldState }) => (
          <TextField
            name={field.name}
            inputRef={field.ref}
            value={String(field.value ?? '')}
            onChange={field.onChange}
            onBlur={field.onBlur}
            label="Motivo (texto)"
            multiline
            minRows={2}
            disabled={disabled}
            error={Boolean(fieldState.error)}
            helperText={fieldState.error?.message}
            slotProps={{ htmlInput: { maxLength: VISIT_LIMITS.reasonText } }}
          />
        )}
      />
      <Controller
        control={control}
        name={'comment' as Path<TValues>}
        render={({ field, fieldState }) => (
          <TextField
            name={field.name}
            inputRef={field.ref}
            value={String(field.value ?? '')}
            onChange={field.onChange}
            onBlur={field.onBlur}
            label="Comentario"
            multiline
            minRows={2}
            disabled={disabled}
            error={Boolean(fieldState.error)}
            helperText={fieldState.error?.message}
            slotProps={{ htmlInput: { maxLength: VISIT_LIMITS.eventComment } }}
          />
        )}
      />
    </>
  );
}
