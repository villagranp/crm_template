import { zodResolver } from '@hookform/resolvers/zod';
import {
  Alert,
  DialogContentText,
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  TextField,
  type Breakpoint,
} from '@mui/material';
import { useEffect, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';

import { AdminDialog, describeApiError, DialogFooter } from '@/features/admin/common';
import { useCan } from '@/hooks/use-permission';

import type { SystemParameter } from '../parameters.api';
import { useUpdateParameter } from '../parameters.queries';
import { parameterFormSchema, rangeOf, type ParameterFormValues } from '../parameters.schemas';
import { CatalogDefaultsEditor } from './editors/CatalogDefaultsEditor';
import { DashboardCardsEditor } from './editors/DashboardCardsEditor';
import { DuplicateRulesEditor } from './editors/DuplicateRulesEditor';
import {
  DUPLICATE_RULE_FIELDS,
  parseDashboardComposition,
  parseJsonObject,
  parseStringArray,
} from './editors/editor-metadata';
import { MimeTypesEditor } from './editors/MimeTypesEditor';
import { PriorityMapEditor } from './editors/PriorityMapEditor';
import { ProgressRulesEditor } from './editors/ProgressRulesEditor';
import { RequiredFieldsEditor } from './editors/RequiredFieldsEditor';
import { StageTransitionsEditor } from './editors/StageTransitionsEditor';

export interface ParameterEditDialogProps {
  /** Parámetro a editar; `null` cierra el diálogo. Los de sólo lectura no se abren aquí. */
  parameter: SystemParameter | null;
  onClose: () => void;
}

/** Permiso para consultar los catálogos que ofrecen los editores estructurados. */
const CATALOG_VIEW_PERMISSION = 'catalogos.ver';

type ControlKind =
  | 'boolean'
  | 'select'
  | 'required-fields'
  | 'catalog-defaults'
  | 'priority-map'
  | 'stage-transitions'
  | 'progress-rules'
  | 'duplicate-rules'
  | 'mime-types'
  | 'dashboard-cards'
  | 'text';

const OBJECT_EDITORS = new Set<ControlKind>([
  'required-fields',
  'catalog-defaults',
  'priority-map',
  'stage-transitions',
  'progress-rules',
]);

/**
 * Control de un parámetro: editor estructurado si el registro lo indica y el
 * valor guardado es interpretable; si no, el control por tipo (JSON en texto).
 */
function controlKindOf(parameter: SystemParameter): ControlKind {
  const { editor, type, value } = parameter;
  if (type === 'BOOLEAN') {
    return 'boolean';
  }
  if (type === 'STRING' && parameter.allowedValues && parameter.allowedValues.length > 0) {
    return 'select';
  }
  if (type !== 'JSON' || !editor) {
    return 'text';
  }
  if (OBJECT_EDITORS.has(editor as ControlKind)) {
    return parseJsonObject(value) ? (editor as ControlKind) : 'text';
  }
  if (editor === 'duplicate-rules') {
    return DUPLICATE_RULE_FIELDS[parameter.key] && parseJsonObject(value) ? 'duplicate-rules' : 'text';
  }
  if (editor === 'dashboard-cards') {
    return parseDashboardComposition(value) ? 'dashboard-cards' : 'text';
  }
  if (editor === 'mime-types') {
    return parameter.allowedValues && parseStringArray(value) ? 'mime-types' : 'text';
  }
  return 'text';
}

/** Editores que ofrecen códigos de catálogo. */
const CATALOG_EDITORS = new Set<ControlKind>(['catalog-defaults', 'priority-map', 'stage-transitions', 'progress-rules']);

function helperFor(parameter: SystemParameter): string | undefined {
  const range = rangeOf(parameter);
  if (range) {
    return `Entre ${range.min} y ${range.max}.`;
  }
  if (parameter.type === 'JSON') {
    return 'JSON válido. El servidor comprueba su estructura.';
  }
  return undefined;
}

function dialogWidth(kind: ControlKind): Breakpoint {
  return kind === 'stage-transitions' || kind === 'required-fields' ? 'md' : 'sm';
}

/**
 * Edición del valor de un parámetro, con el control adecuado a su tipo y a su
 * editor (07 E.4). El backend vuelve a validar; su `422` se muestra con el motivo.
 */
export function ParameterEditDialog({ parameter, onClose }: ParameterEditDialogProps) {
  const can = useCan();
  const mutation = useUpdateParameter();
  const schema = useMemo(() => (parameter ? parameterFormSchema(parameter) : null), [parameter]);
  const catalogsEnabled = can(CATALOG_VIEW_PERMISSION);

  const form = useForm<ParameterFormValues>({
    resolver: schema ? zodResolver(schema) : undefined,
    defaultValues: { value: parameter?.value ?? '' },
  });
  const { reset } = form;
  const { reset: resetMutation } = mutation;

  useEffect(() => {
    reset({ value: parameter?.value ?? '' });
    resetMutation();
  }, [parameter, reset, resetMutation]);

  if (!parameter || parameter.readOnly) {
    return null;
  }

  const kind = controlKindOf(parameter);
  const error = mutation.isError ? describeApiError(mutation.error) : null;
  const pending = mutation.isPending;
  const handleClose = () => {
    if (!pending) {
      onClose();
    }
  };

  const submit = form.handleSubmit((values) => {
    mutation.mutate({ key: parameter.key, value: values.value.trim() }, { onSuccess: () => onClose() });
  });

  return (
    <AdminDialog
      open
      onClose={pending ? undefined : handleClose}
      title={`Editar «${parameter.name}»`}
      subtitle="Parámetros"
      maxWidth={dialogWidth(kind)}
      onSubmit={(event) => {
        void submit(event);
      }}
      actions={<DialogFooter onCancel={handleClose} submitLabel="Guardar" pending={pending} />}
    >
      <Stack spacing={2}>
        {parameter.description ? (
          <DialogContentText variant="body2">{parameter.description}</DialogContentText>
        ) : null}
        <Controller
          name="value"
          control={form.control}
          render={({ field, fieldState }) => {
            const structured = { value: field.value, onChange: field.onChange, disabled: pending };
            const structuredError = fieldState.error ? (
              <Alert severity="warning" role="alert">
                {fieldState.error.message}
              </Alert>
            ) : null;
            switch (kind) {
              case 'boolean':
                return (
                  <FormControlLabel
                    control={
                      <Switch
                        checked={field.value === 'true'}
                        onChange={(event) => field.onChange(event.target.checked ? 'true' : 'false')}
                      />
                    }
                    label={field.value === 'true' ? 'Activado' : 'Desactivado'}
                  />
                );
              case 'select':
                return (
                  <TextField
                    {...field}
                    select
                    fullWidth
                    label="Valor"
                    error={Boolean(fieldState.error)}
                    helperText={fieldState.error?.message}
                  >
                    {(parameter.allowedValues ?? []).map((allowed) => (
                      <MenuItem key={allowed} value={allowed}>
                        {allowed}
                      </MenuItem>
                    ))}
                  </TextField>
                );
              case 'required-fields':
                return (
                  <>
                    <RequiredFieldsEditor {...structured} />
                    {structuredError}
                  </>
                );
              case 'catalog-defaults':
                return (
                  <>
                    <CatalogDefaultsEditor {...structured} catalogsEnabled={catalogsEnabled} />
                    {structuredError}
                  </>
                );
              case 'priority-map':
                return (
                  <>
                    <PriorityMapEditor {...structured} catalogsEnabled={catalogsEnabled} />
                    {structuredError}
                  </>
                );
              case 'stage-transitions':
                return (
                  <>
                    <StageTransitionsEditor {...structured} catalogsEnabled={catalogsEnabled} />
                    {structuredError}
                  </>
                );
              case 'progress-rules':
                return (
                  <>
                    <ProgressRulesEditor {...structured} catalogsEnabled={catalogsEnabled} />
                    {structuredError}
                  </>
                );
              case 'duplicate-rules':
                return (
                  <>
                    <DuplicateRulesEditor {...structured} parameterKey={parameter.key} />
                    {structuredError}
                  </>
                );
              case 'mime-types':
                return (
                  <>
                    <MimeTypesEditor {...structured} allowedValues={parameter.allowedValues ?? []} />
                    {structuredError}
                  </>
                );
              case 'dashboard-cards':
                return (
                  <>
                    <DashboardCardsEditor {...structured} />
                    {structuredError}
                  </>
                );
              case 'text':
              default:
                return (
                  <TextField
                    {...field}
                    autoFocus
                    fullWidth
                    label="Valor"
                    type={parameter.type === 'DATE' && /^\d{4}-\d{2}-\d{2}$/.test(parameter.value) ? 'date' : 'text'}
                    multiline={parameter.type === 'JSON'}
                    minRows={parameter.type === 'JSON' ? 4 : undefined}
                    slotProps={{
                      htmlInput: parameter.type === 'NUMBER' ? { inputMode: 'decimal' } : undefined,
                      inputLabel: parameter.type === 'DATE' ? { shrink: true } : undefined,
                    }}
                    error={Boolean(fieldState.error)}
                    helperText={fieldState.error?.message ?? helperFor(parameter)}
                  />
                );
            }
          }}
        />
        {!catalogsEnabled && CATALOG_EDITORS.has(kind) ? (
          <Alert severity="info">
            Sin permiso para consultar catálogos: se trabaja con los códigos. El servidor comprueba que existan y
            estén activos.
          </Alert>
        ) : null}
        {error ? (
          <Alert severity="error">
            {error.message}
            {error.issues.length > 0 ? ` ${error.issues.join(' ')}` : null}
          </Alert>
        ) : null}
      </Stack>
    </AdminDialog>
  );
}
