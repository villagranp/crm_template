import { MenuItem, TextField } from '@mui/material';
import { Controller, type UseFormReturn } from 'react-hook-form';

import { FormSection, FullRow } from '@/components/data';
import { CustomerPicker } from '@/features/crm/customers';

import type { ProjectGeneralField } from '../capabilities';
import { PROJECT_FIELD_LABELS } from '../project-format';
import type { CountryRef, ProjectFormOptions } from '../projects.api';
import { PROJECT_LIMITS, type ProjectFormValues } from '../projects.schemas';

import { OwnerPicker } from './OwnerPicker';

export interface ProjectFormFieldsProps {
  form: UseFormReturn<ProjectFormValues>;
  mode: 'create' | 'edit';
  options: ProjectFormOptions;
  /** Obligatorios de datos generales (`requiredGeneralFields`). */
  required: ReadonlySet<string>;
  /** Con `proyectos.administrar`: asesor y código editables (RN-03.6, DM-17). */
  canAdminister: boolean;
  /** Si el campo se puede cambiar (edición: según `capabilities`). */
  isEditable?: (field: ProjectGeneralField) => boolean;
  /** Explicación de un campo deshabilitado. */
  disabledHelp?: (field: ProjectGeneralField) => string | undefined;
  /** Asesor fijo cuando no se puede elegir (alta: el propio usuario). */
  fixedOwnerName?: string;
  /** País actual del proyecto, aunque ya no esté activo (edición). */
  currentCountry?: CountryRef;
  isPending: boolean;
}

/**
 * Campos de datos generales del proyecto (03 §E.3): datos, fechas y
 * responsable. Los usan el alta y el diálogo de edición. Toda lista de valores
 * sale de `form-options`; el cliente, de `CustomerPicker` (Módulo 2, sólo
 * clientes activos visibles).
 */
export function ProjectFormFields({
  form,
  mode,
  options,
  required,
  canAdminister,
  isEditable = () => true,
  disabledHelp = () => undefined,
  fixedOwnerName,
  currentCountry,
  isPending,
}: ProjectFormFieldsProps) {
  const {
    register,
    control,
    setValue,
    getValues,
    formState: { errors },
  } = form;

  const countries =
    currentCountry && !options.countries.some((country) => country.id === currentCountry.id)
      ? [...options.countries, { ...currentCountry, currencyCode: '' }]
      : options.countries;

  const textField = (
    field: 'name' | 'city' | 'address' | 'description' | 'code',
    apiField: ProjectGeneralField,
    extra: { multiline?: boolean; helperText?: string } = {},
  ) => (
    <TextField
      {...register(field)}
      label={PROJECT_FIELD_LABELS[apiField]}
      required={required.has(apiField)}
      disabled={isPending || !isEditable(apiField)}
      multiline={extra.multiline}
      minRows={extra.multiline ? 3 : undefined}
      error={Boolean(errors[field])}
      helperText={errors[field]?.message ?? disabledHelp(apiField) ?? extra.helperText}
      slotProps={{ htmlInput: { maxLength: PROJECT_LIMITS[field] } }}
    />
  );

  const dateField = (field: 'estimatedStartDate' | 'estimatedEndDate' | 'estimatedDecisionDate', helperText?: string) => (
    <TextField
      {...register(field)}
      type="date"
      label={PROJECT_FIELD_LABELS[field]}
      required={required.has(field)}
      disabled={isPending || !isEditable(field)}
      error={Boolean(errors[field])}
      helperText={errors[field]?.message ?? disabledHelp(field) ?? helperText}
      slotProps={{ inputLabel: { shrink: true } }}
    />
  );

  return (
    <>
      <FormSection number={1} title="Datos generales">
        <FullRow>{textField('name', 'name')}</FullRow>
        <Controller
          control={control}
          name="customer"
          render={({ field }) => (
            <CustomerPicker
              name="customer"
              label={PROJECT_FIELD_LABELS.customerId}
              value={field.value}
              onChange={(customer) => {
                field.onChange(customer);
                // El país por defecto es el del cliente (RN-03.5); en la edición no se cambia solo.
                if (mode === 'create' && customer?.countryId && getValues('countryId') !== customer.countryId) {
                  setValue('countryId', customer.countryId, { shouldValidate: false });
                }
              }}
              required
              disabled={isPending || !isEditable('customerId')}
              error={Boolean(errors.customer)}
              helperText={
                errors.customer?.message ??
                disabledHelp('customerId') ??
                (mode === 'create' ? 'Solo clientes activos que puedes ver.' : 'Solo si el proyecto no tiene visitas ni actividades.')
              }
            />
          )}
        />
        <Controller
          control={control}
          name="countryId"
          render={({ field }) => (
            <TextField
              select
              label={PROJECT_FIELD_LABELS.countryId}
              name={field.name}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              inputRef={field.ref}
              required
              disabled={isPending || !isEditable('countryId')}
              error={Boolean(errors.countryId)}
              helperText={errors.countryId?.message ?? disabledHelp('countryId') ?? (mode === 'create' ? 'Por defecto, el del cliente.' : undefined)}
            >
              {!field.value ? <MenuItem value="">Elige un país</MenuItem> : null}
              {countries.map((country) => (
                <MenuItem key={country.id} value={country.id}>
                  {country.name}
                </MenuItem>
              ))}
            </TextField>
          )}
        />
        {textField('city', 'city')}
        {textField('address', 'address')}
        <FullRow>{textField('description', 'description', { multiline: true })}</FullRow>
      </FormSection>

      <FormSection number={2} title="Fechas estimadas">
        {dateField('estimatedStartDate')}
        {dateField('estimatedEndDate', 'Igual o posterior al inicio.')}
        {dateField('estimatedDecisionDate', 'Fecha en la que el cliente decidirá.')}
      </FormSection>

      <FormSection number={3} title="Responsable">
        <Controller
          control={control}
          name="owner"
          render={({ field }) =>
            canAdminister && isEditable('ownerId') ? (
              <OwnerPicker
                name="owner"
                label={PROJECT_FIELD_LABELS.ownerId}
                value={field.value}
                onChange={field.onChange}
                required={mode === 'edit'}
                disabled={isPending}
                error={Boolean(errors.owner)}
                helperText={errors.owner?.message ?? (mode === 'create' ? 'Si lo dejas vacío, serás tú.' : undefined)}
              />
            ) : (
              <TextField
                label={PROJECT_FIELD_LABELS.ownerId}
                value={field.value?.displayName ?? fixedOwnerName ?? ''}
                disabled
                error={Boolean(errors.owner)}
                helperText={errors.owner?.message ?? (mode === 'create' ? 'El proyecto queda a tu nombre.' : disabledHelp('ownerId'))}
              />
            )
          }
        />
        {mode === 'create' && !canAdminister ? (
          <TextField label={PROJECT_FIELD_LABELS.code} value="Se asigna al guardar" disabled helperText="Lo genera el sistema (PRY-AAAA-nnnnn)." />
        ) : (
          textField('code', 'code', { helperText: mode === 'create' ? 'Opcional. Si lo dejas vacío, se genera PRY-AAAA-nnnnn.' : undefined })
        )}
      </FormSection>
    </>
  );
}
