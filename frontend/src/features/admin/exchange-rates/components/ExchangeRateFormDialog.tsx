import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, MenuItem, TextField } from '@mui/material';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';

import { AdminDialog, DialogFooter, FormSection, FullRow } from '@/features/admin/common';

import type { Currency, ExchangeRate } from '../exchange-rates.api';
import { describeExchangeRateError } from '../exchange-rates.errors';
import { BASE_CURRENCY, formatRate } from '../exchange-rates-format';
import { useCreateExchangeRate, useUpdateExchangeRate } from '../exchange-rates.queries';
import {
  exchangeRateFormSchema,
  normalizeRate,
  NOTES_MAX,
  SOURCE_MAX,
  type ExchangeRateFormValues,
} from '../exchange-rates.schemas';

export interface ExchangeRateFormDialogProps {
  open: boolean;
  /** `null` = alta; con valor = corrección (moneda y fecha bloqueadas). */
  rate: ExchangeRate | null;
  currencies: readonly Currency[];
  onClose: () => void;
}

function defaults(rate: ExchangeRate | null): ExchangeRateFormValues {
  return {
    currencyCode: rate?.currencyCode ?? '',
    effectiveDate: rate?.effectiveDate.slice(0, 10) ?? '',
    ratePerUsd: rate ? formatRate(rate.ratePerUsd) : '',
    source: rate?.source ?? '',
    notes: rate?.notes ?? '',
  };
}

/**
 * Alta («Nuevo tipo de cambio») y corrección de una tasa (07 E.5, RN-07.44). Al
 * corregir sólo cambian tasa, fuente y notas: la moneda y la fecha de vigencia
 * son inmutables y se muestran bloqueadas; para otra fecha se registra otra
 * fila. Corregir no recalcula las oportunidades ya guardadas.
 */
export function ExchangeRateFormDialog({
  open,
  rate,
  currencies,
  onClose,
}: ExchangeRateFormDialogProps) {
  const createMutation = useCreateExchangeRate();
  const updateMutation = useUpdateExchangeRate();
  const mutation = rate ? updateMutation : createMutation;
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ExchangeRateFormValues>({
    resolver: zodResolver(exchangeRateFormSchema),
    defaultValues: defaults(rate),
  });
  const { reset: resetCreate } = createMutation;
  const { reset: resetUpdate } = updateMutation;

  useEffect(() => {
    if (open) {
      reset(defaults(rate));
      resetCreate();
      resetUpdate();
    }
  }, [open, rate, reset, resetCreate, resetUpdate]);

  // Alta: monedas activas distintas de la base. Corrección: la de la fila (bloqueada).
  const currencyOptions = rate
    ? currencies.filter((currency) => currency.code === rate.currencyCode)
    : currencies.filter((currency) => currency.isActive && currency.code !== BASE_CURRENCY);
  const currencyLabel = (code: string) => {
    const currency = currencies.find((candidate) => candidate.code === code);
    return currency ? `${currency.code} — ${currency.name}` : code;
  };

  const submit = handleSubmit((values) => {
    const ratePerUsd = normalizeRate(values.ratePerUsd);
    if (rate) {
      updateMutation.mutate(
        { id: rate.id, body: { ratePerUsd, source: values.source, notes: values.notes || null } },
        { onSuccess: onClose },
      );
    } else {
      createMutation.mutate(
        {
          currencyCode: values.currencyCode,
          effectiveDate: values.effectiveDate,
          ratePerUsd,
          source: values.source,
          ...(values.notes ? { notes: values.notes } : {}),
        },
        { onSuccess: onClose },
      );
    }
  });

  const pending = mutation.isPending;
  const error = mutation.isError ? describeExchangeRateError(mutation.error) : null;

  return (
    <AdminDialog
      open={open}
      onClose={pending ? undefined : onClose}
      title={rate ? `Corregir tipo de cambio ${rate.currencyCode}` : 'Nuevo tipo de cambio'}
      subtitle="Tipos de cambio"
      requiredNote
      onSubmit={(event) => {
        void submit(event);
      }}
      actions={
        <DialogFooter
          onCancel={onClose}
          submitLabel={rate ? 'Guardar corrección' : 'Registrar'}
          pending={pending}
        />
      }
    >
      {rate ? (
        <Alert severity="info" sx={{ mb: 2 }}>
          Corregir una tasa no recalcula las oportunidades ya guardadas. Para otra fecha, registra
          un tipo de cambio nuevo.
        </Alert>
      ) : null}
      <FormSection number={1} title="Tipo de cambio">
        <Controller
          name="currencyCode"
          control={control}
          render={({ field, fieldState }) => (
            <TextField
              {...field}
              select
              label="Moneda"
              required
              disabled={Boolean(rate) || pending}
              error={Boolean(fieldState.error)}
              helperText={
                fieldState.error?.message ??
                (rate
                  ? 'La moneda no se puede cambiar.'
                  : 'Monedas activas; USD es la base y no lleva tasa.')
              }
            >
              {currencyOptions.map((currency) => (
                <MenuItem key={currency.code} value={currency.code}>
                  {currencyLabel(currency.code)}
                </MenuItem>
              ))}
            </TextField>
          )}
        />
        <TextField
          {...register('effectiveDate')}
          label="Fecha de vigencia"
          type="date"
          required
          disabled={Boolean(rate) || pending}
          slotProps={{ inputLabel: { shrink: true } }}
          error={Boolean(errors.effectiveDate)}
          helperText={
            errors.effectiveDate?.message ??
            (rate ? 'La fecha no se puede cambiar.' : 'Rige desde este día.')
          }
        />
        <TextField
          {...register('ratePerUsd')}
          label="Tasa (unidades por 1 USD)"
          required
          disabled={pending}
          slotProps={{ htmlInput: { inputMode: 'decimal' } }}
          error={Boolean(errors.ratePerUsd)}
          helperText={errors.ratePerUsd?.message ?? 'Mayor que 0, hasta 8 decimales.'}
        />
        <TextField
          {...register('source')}
          label="Fuente"
          required
          disabled={pending}
          slotProps={{ htmlInput: { maxLength: SOURCE_MAX } }}
          error={Boolean(errors.source)}
          helperText={errors.source?.message ?? 'Banco central, tesorería…'}
        />
        <FullRow>
          <TextField
            {...register('notes')}
            label="Notas"
            multiline
            minRows={2}
            disabled={pending}
            slotProps={{ htmlInput: { maxLength: NOTES_MAX } }}
            error={Boolean(errors.notes)}
            helperText={errors.notes?.message}
          />
        </FullRow>
      </FormSection>
      {error ? (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error.message}
          {error.issues.length > 0 ? ` ${error.issues.join(' ')}` : null}
        </Alert>
      ) : null}
    </AdminDialog>
  );
}
