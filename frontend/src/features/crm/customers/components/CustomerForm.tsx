import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Box, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useId, useMemo, type ReactNode } from 'react';
import { Controller, useForm } from 'react-hook-form';

import { FormSection, FullRow, RequiredNote } from '@/components/data';

import { formFieldFor } from '../customer-form-values';
import { CUSTOMER_FIELD_LABELS, taxIdLabelOf } from '../customer-format';
import type { CustomerFormOptions } from '../customers.api';
import {
  buildCustomerFormSchema,
  CUSTOMER_LIMITS,
  type CustomerFormValues,
  type CustomerTextField,
} from '../customers.schemas';

import { SalesOwnerPicker } from './SalesOwnerPicker';

/** Etiqueta de un valor ya desactivado del catálogo que conserva el cliente (edición). */
export interface CurrentCatalogValue {
  id: string;
  label: string;
}

export interface CustomerFormProps {
  mode: 'create' | 'edit';
  options: CustomerFormOptions;
  initialValues: CustomerFormValues;
  /** Con `clientes.administrar` (alta) o `canReassignOwner` (edición): el responsable se elige. */
  canChooseOwner: boolean;
  /** Responsable fijo cuando no se puede elegir (alta: el propio usuario). */
  fixedOwnerName?: string;
  /** Edición: `capabilities.editableFields`; el resto queda deshabilitado con explicación. */
  editableFields?: readonly string[];
  /** Edición: valores actuales del cliente que quizá ya no estén en las opciones (desactivados). */
  currentValues?: Partial<Record<'companyTypeId' | 'statusId' | 'ratingId', CurrentCatalogValue | null>>;
  /** Errores por campo del último envío (`fieldErrorsFromApiError`), con nombres del backend. */
  serverFieldErrors?: Record<string, string>;
  /** Alerta general del último envío. */
  formError?: ReactNode;
  isPending: boolean;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (values: CustomerFormValues) => void;
  /** Secciones extra al final (p. ej. adjuntos en el alta). */
  children?: ReactNode;
}

const NOT_EDITABLE_HELP = 'Solo quien puede administrar clientes cambia este campo.';
const NO_EDIT_HELP = 'No puedes cambiar este campo.';

/**
 * Formulario de cliente para el alta y la edición (02 §E.3, §E.4).
 *
 * Toda lista de valores sale de `form-options`; los obligatorios se marcan con
 * `requiredFields`. La validación es de experiencia de usuario y los errores
 * del backend se pintan bajo su campo.
 */
export function CustomerForm({
  mode,
  options,
  initialValues,
  canChooseOwner,
  fixedOwnerName,
  editableFields,
  currentValues,
  serverFieldErrors,
  formError,
  isPending,
  submitLabel,
  onCancel,
  onSubmit,
  children,
}: CustomerFormProps) {
  const formId = useId();
  const required = useMemo(() => new Set(['legalName', 'countryId', ...options.requiredFields]), [options.requiredFields]);
  const isEditable = (field: string) => mode === 'create' || (editableFields ?? []).includes(field);
  const skipFields = useMemo(
    () =>
      mode === 'edit'
        ? new Set(
            ['customerCode', 'legalName', 'tradeName', 'taxId', 'countryId', 'city', 'address', 'phone', 'email', 'companyTypeId', 'statusId', 'ratingId', 'salesOwnerId'].filter(
              (field) => !(editableFields ?? []).includes(field),
            ),
          )
        : undefined,
    [mode, editableFields],
  );
  const schema = useMemo(
    () =>
      buildCustomerFormSchema({
        requiredFields: options.requiredFields,
        countries: options.countries,
        canChooseOwner,
        ownerDefaultsToActor: mode === 'create',
        skipFields,
      }),
    [options.requiredFields, options.countries, canChooseOwner, mode, skipFields],
  );

  const {
    register,
    control,
    handleSubmit,
    setError,
    watch,
    formState: { errors },
  } = useForm<CustomerFormValues>({ resolver: zodResolver(schema), defaultValues: initialValues });

  useEffect(() => {
    for (const [apiField, message] of Object.entries(serverFieldErrors ?? {})) {
      const field = formFieldFor(apiField);
      if (field) {
        setError(field, { type: 'server', message }, { shouldFocus: false });
      }
    }
  }, [serverFieldErrors, setError]);

  const countryId = watch('countryId');
  const country = options.countries.find((option) => option.id === countryId);
  const taxIdLabel = taxIdLabelOf(country);

  const disabledHelp = (field: string) =>
    isEditable(field) ? undefined : ['customerCode', 'countryId', 'salesOwnerId'].includes(field) ? NOT_EDITABLE_HELP : NO_EDIT_HELP;

  const textField = (field: CustomerTextField, label: string, extra: { helperText?: string; multiline?: boolean; type?: string } = {}) => (
    <TextField
      {...register(field)}
      label={label}
      type={extra.type}
      required={required.has(field)}
      disabled={isPending || !isEditable(field)}
      multiline={extra.multiline}
      minRows={extra.multiline ? 2 : undefined}
      error={Boolean(errors[field])}
      helperText={errors[field]?.message ?? disabledHelp(field) ?? extra.helperText}
      slotProps={{ htmlInput: { maxLength: CUSTOMER_LIMITS[field as keyof typeof CUSTOMER_LIMITS] } }}
    />
  );

  const catalogSelect = (
    field: 'companyTypeId' | 'statusId' | 'ratingId',
    label: string,
    items: readonly { id: string; label: string }[],
    allowEmpty: boolean,
  ) => {
    const current = currentValues?.[field];
    const withCurrent =
      current && !items.some((item) => item.id === current.id) ? [...items, { id: current.id, label: `${current.label} (inactivo)` }] : items;
    return (
      <Controller
        control={control}
        name={field}
        render={({ field: input }) => (
          <TextField
            select
            label={label}
            name={input.name}
            value={input.value}
            onChange={input.onChange}
            onBlur={input.onBlur}
            inputRef={input.ref}
            required={required.has(field)}
            disabled={isPending || !isEditable(field)}
            error={Boolean(errors[field])}
            helperText={errors[field]?.message ?? disabledHelp(field)}
          >
            {allowEmpty || !input.value ? <MenuItem value="">Sin especificar</MenuItem> : null}
            {withCurrent.map((item) => (
              <MenuItem key={item.id} value={item.id}>
                {item.label}
              </MenuItem>
            ))}
          </TextField>
        )}
      />
    );
  };

  return (
    <Box
      component="form"
      id={formId}
      noValidate
      aria-label={mode === 'create' ? 'Nuevo cliente' : 'Editar cliente'}
      onSubmit={(event) => {
        void handleSubmit(onSubmit)(event);
      }}
    >
      <RequiredNote />
      {formError ? <Box sx={{ mb: 2 }}>{formError}</Box> : null}

      <FormSection number={1} title="Identificación">
        {textField('customerCode', CUSTOMER_FIELD_LABELS.customerCode, { helperText: 'Opcional. Identifica el establecimiento en el país.' })}
        {mode === 'create' ? (
          <TextField label={CUSTOMER_FIELD_LABELS.crmCode} value="Se asigna al guardar" disabled helperText="Lo genera el sistema." />
        ) : null}
        <FullRow>{textField('legalName', CUSTOMER_FIELD_LABELS.legalName)}</FullRow>
        {textField('tradeName', CUSTOMER_FIELD_LABELS.tradeName)}
        {textField('taxId', taxIdLabel, { helperText: 'Puede repetirse en otro establecimiento del mismo cliente.' })}
      </FormSection>

      <FormSection number={2} title="Ubicación y contacto">
        <Controller
          control={control}
          name="countryId"
          render={({ field }) => (
            <TextField
              select
              label={CUSTOMER_FIELD_LABELS.countryId}
              name={field.name}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              inputRef={field.ref}
              required
              disabled={isPending || !isEditable('countryId')}
              error={Boolean(errors.countryId)}
              helperText={errors.countryId?.message ?? disabledHelp('countryId')}
            >
              {!field.value ? <MenuItem value="">Elige un país</MenuItem> : null}
              {options.countries.map((option) => (
                <MenuItem key={option.id} value={option.id}>
                  {option.name}
                </MenuItem>
              ))}
            </TextField>
          )}
        />
        {textField('city', CUSTOMER_FIELD_LABELS.city)}
        <FullRow>{textField('address', CUSTOMER_FIELD_LABELS.address, { multiline: true })}</FullRow>
        {textField('phone', CUSTOMER_FIELD_LABELS.phone, {
          type: 'tel',
          helperText: country?.phonePrefix ? `Prefijo de ${country.name}: ${country.phonePrefix}` : undefined,
        })}
        {textField('email', CUSTOMER_FIELD_LABELS.email, { type: 'email' })}
      </FormSection>

      <FormSection number={3} title="Clasificación comercial">
        {catalogSelect('companyTypeId', CUSTOMER_FIELD_LABELS.companyTypeId, options.companyTypes, !required.has('companyTypeId'))}
        {catalogSelect('statusId', CUSTOMER_FIELD_LABELS.statusId, options.statuses, false)}
        {catalogSelect('ratingId', CUSTOMER_FIELD_LABELS.ratingId, options.ratings, !required.has('ratingId'))}
        <Controller
          control={control}
          name="salesOwner"
          render={({ field }) =>
            canChooseOwner && isEditable('salesOwnerId') ? (
              <SalesOwnerPicker
                name="salesOwner"
                label={CUSTOMER_FIELD_LABELS.salesOwnerId}
                value={field.value}
                onChange={field.onChange}
                required={mode === 'edit' && required.has('salesOwnerId')}
                disabled={isPending}
                error={Boolean(errors.salesOwner)}
                helperText={errors.salesOwner?.message ?? (mode === 'create' ? 'Si lo dejas vacío, serás tú.' : undefined)}
              />
            ) : (
              <TextField
                label={CUSTOMER_FIELD_LABELS.salesOwnerId}
                value={field.value?.displayName ?? fixedOwnerName ?? ''}
                disabled
                error={Boolean(errors.salesOwner)}
                helperText={
                  errors.salesOwner?.message ??
                  (mode === 'create' ? 'El cliente queda a tu nombre.' : NOT_EDITABLE_HELP)
                }
              />
            )
          }
        />
      </FormSection>

      {children}

      <Stack
        direction={{ xs: 'column-reverse', sm: 'row' }}
        spacing={1}
        justifyContent="flex-end"
        sx={{ mt: 3, pt: 2, borderTop: 1, borderColor: 'divider' }}
      >
        <Button variant="outlined" color="inherit" onClick={onCancel} disabled={isPending} sx={{ borderColor: 'divider' }}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Guardando…' : submitLabel}
        </Button>
      </Stack>
      {isPending ? (
        <Typography role="status" variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, textAlign: 'right' }}>
          Guardando el cliente…
        </Typography>
      ) : null}
    </Box>
  );
}

/** Alerta general de un envío fallido, con la referencia para soporte. */
export function FormErrorAlert({ message, correlationId, action }: { message: string; correlationId?: string; action?: ReactNode }) {
  return (
    <Alert severity="error" action={action}>
      {message}
      {correlationId ? (
        <Typography variant="caption" component="p" color="text.secondary">
          {`Referencia: ${correlationId}`}
        </Typography>
      ) : null}
    </Alert>
  );
}
