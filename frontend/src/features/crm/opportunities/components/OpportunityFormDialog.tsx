import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Box, MenuItem, Skeleton, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';

import { DialogFooter, EntityDialog, FullRow } from '@/components/data';
import { DecimalField } from '@/features/crm/common/DecimalField';
import { DECIMAL_SPECS } from '@/features/crm/common/decimal';
import { FormErrorAlert, OPPORTUNITY_PERMISSIONS, OwnerPicker, withReference, type OwnerOption } from '@/features/crm/projects';
import { usePermission } from '@/hooks/use-permission';
import { describeApiError } from '@/lib/api-error-view';

import type { CurrencyOption, OpportunityDetail, OpportunityFormOptions, OpportunityMutationResponse } from '../opportunities.api';
import { OPPORTUNITY_ERROR_MESSAGES, opportunityFieldErrors } from '../opportunities.errors';
import { useCreateOpportunity, useOpportunityFormOptions, useUpdateOpportunity } from '../opportunities.queries';
import {
  buildOpportunitySchema,
  OPPORTUNITY_LIMITS,
  opportunityFormValues,
  toCreateOpportunityInput,
  toUpdateOpportunityInput,
  type OpportunityFormValues,
} from '../opportunities.schemas';
import { estimateTexts, exchangeRateText, OPPORTUNITY_FIELD_LABELS } from '../opportunity-format';

export interface OpportunityFormDialogProps {
  open: boolean;
  /** Proyecto de la oportunidad: decide las monedas admitidas (RN-03.78). */
  projectId: string;
  /** "PRY-… · Nombre" para el subtítulo. */
  projectLabel: string;
  /** Oportunidad a editar; sin ella, alta. */
  opportunity?: OpportunityDetail | null;
  onClose: () => void;
  /** Recibe la respuesta con sus `warnings` (`EXCHANGE_RATE_STALE`, aviso no bloqueante). */
  onSaved: (opportunity: OpportunityMutationResponse) => void;
}

const FORM_FIELDS: ReadonlySet<string> = new Set([
  'stageId',
  'opportunityDate',
  'ownerId',
  'estimatedAmount',
  'currencyCode',
  'estimatedTonnage',
  'description',
  'nextAction',
  'nextActionDate',
]);

export const USD_EQUIVALENT_NOTE = 'El equivalente en USD se calcula al guardar con el tipo de cambio vigente a la fecha de la oportunidad.';

interface FormBodyProps extends Omit<OpportunityFormDialogProps, 'open'> {
  options: OpportunityFormOptions;
}

function OpportunityForm({ projectId, projectLabel, opportunity, options, onClose, onSaved }: FormBodyProps) {
  const isEdit = Boolean(opportunity);
  const canAssign = usePermission(OPPORTUNITY_PERMISSIONS.administer);
  const creation = useCreateOpportunity(projectId);
  const update = useUpdateOpportunity(opportunity?.id ?? '', projectId);
  const mutation = isEdit ? update : creation;
  const [owner, setOwner] = useState<OwnerOption | null>(
    opportunity ? { id: opportunity.owner.id, displayName: opportunity.owner.displayName, countryId: null, primaryTeam: null } : null,
  );

  const allowed: CurrencyOption[] = useMemo(() => {
    const list = options.currencies?.allowed ?? [];
    // Una estimación guardada en una moneda que ya no se admite (cambió el país) se muestra igual (foto, RN-03.82).
    const current = opportunity?.currencyCode;
    return current && !list.some((currency) => currency.code === current)
      ? [...list, { code: current, name: `${current} (ya no admitida)`, symbol: current, decimals: 2 }]
      : list;
  }, [options.currencies, opportunity?.currencyCode]);
  const defaultCurrency = options.currencies?.defaultCode ?? options.baseCurrencyCode;
  const openStages = options.stages.filter((stage) => !stage.isClosed);

  const form = useForm<OpportunityFormValues>({
    resolver: zodResolver(buildOpportunitySchema()),
    defaultValues: opportunityFormValues(opportunity, { ...options.defaults, currencyCode: defaultCurrency }),
  });
  const { control, register, handleSubmit, setError, setValue, watch, formState } = form;
  const { errors } = formState;
  const currencyCode = watch('currencyCode');

  const error = mutation.isError ? mutation.error : null;
  useEffect(() => {
    for (const [field, message] of Object.entries(opportunityFieldErrors(error))) {
      if (FORM_FIELDS.has(field)) {
        setError(field as keyof OpportunityFormValues, { type: 'server', message }, { shouldFocus: false });
      }
    }
  }, [error, setError]);
  const fieldErrors = opportunityFieldErrors(error);
  // Los errores de la moneda se explican bajo su selector, no en la alerta general.
  const errorView = error && !fieldErrors.currencyCode ? describeApiError(error, OPPORTUNITY_ERROR_MESSAGES) : null;

  const onSubmit = (values: OpportunityFormValues) => {
    if (opportunity) {
      const input = toUpdateOpportunityInput(opportunity, values);
      if (Object.keys(input).length === 0) {
        onClose();
        return;
      }
      update.mutate(input, { onSuccess: (saved) => onSaved(saved) });
      return;
    }
    creation.mutate(toCreateOpportunityInput(values), { onSuccess: (saved) => onSaved(saved) });
  };

  const snapshot = opportunity ? estimateTexts(opportunity) : null;

  return (
    <EntityDialog
      open
      onClose={mutation.isPending ? undefined : onClose}
      title={isEdit ? 'Editar oportunidad' : 'Nueva oportunidad'}
      subtitle={opportunity ? `${opportunity.code} · ${projectLabel}` : projectLabel}
      requiredNote
      onSubmit={() => void handleSubmit(onSubmit)()}
      actions={
        <DialogFooter
          onCancel={onClose}
          submitLabel={mutation.isPending ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear oportunidad'}
          pending={mutation.isPending}
        />
      }
    >
      <Stack spacing={2}>
        {errorView ? <FormErrorAlert message={errorView.message} correlationId={errorView.correlationId} /> : null}
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' } }}>
          {isEdit ? null : (
            <Controller
              control={control}
              name="stageId"
              render={({ field }) => (
                <TextField
                  select
                  label="Etapa inicial"
                  name={field.name}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  inputRef={field.ref}
                  disabled={mutation.isPending}
                  error={Boolean(errors.stageId)}
                  helperText={errors.stageId?.message ?? 'Una oportunidad nueva empieza en una etapa abierta.'}
                >
                  {openStages.map((stage) => (
                    <MenuItem key={stage.id} value={stage.id}>
                      {stage.label}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />
          )}
          <TextField
            {...register('opportunityDate')}
            type="date"
            label={OPPORTUNITY_FIELD_LABELS.opportunityDate}
            required
            disabled={mutation.isPending}
            error={Boolean(errors.opportunityDate)}
            helperText={errors.opportunityDate?.message ?? 'Fecha de identificación; también fija el tipo de cambio.'}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <FullRow>
            {canAssign ? (
              <OwnerPicker
                label={OPPORTUNITY_FIELD_LABELS.ownerId}
                name="ownerId"
                value={owner}
                onChange={(selected) => {
                  setOwner(selected);
                  setValue('ownerId', selected?.id ?? '');
                }}
                disabled={mutation.isPending}
                error={Boolean(errors.ownerId)}
                helperText={errors.ownerId?.message ?? (isEdit ? undefined : 'Vacío: tú serás el asesor.')}
              />
            ) : (
              <TextField
                label={OPPORTUNITY_FIELD_LABELS.ownerId}
                value={opportunity ? opportunity.owner.displayName : 'Tú'}
                disabled
                helperText="Solo quien puede administrar oportunidades asigna otro asesor."
              />
            )}
          </FullRow>
          <Controller
            control={control}
            name="estimatedAmount"
            render={({ field }) => (
              <DecimalField
                label={OPPORTUNITY_FIELD_LABELS.estimatedAmount}
                spec={DECIMAL_SPECS.money}
                unit={currencyCode || undefined}
                name={field.name}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                inputRef={field.ref}
                disabled={mutation.isPending}
                error={Boolean(errors.estimatedAmount)}
                helperText={errors.estimatedAmount?.message ?? (isEdit ? 'Vacío: se borra la estimación.' : undefined)}
              />
            )}
          />
          <Controller
            control={control}
            name="currencyCode"
            render={({ field }) => (
              <TextField
                select
                label={OPPORTUNITY_FIELD_LABELS.currencyCode}
                name={field.name}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                inputRef={field.ref}
                disabled={mutation.isPending}
                error={Boolean(errors.currencyCode)}
                helperText={errors.currencyCode?.message ?? 'USD o la moneda del país del proyecto.'}
              >
                {allowed.map((currency) => (
                  <MenuItem key={currency.code} value={currency.code}>
                    {`${currency.code} · ${currency.name}`}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />
          <FullRow>
            <Typography variant="caption" color="text.secondary" component="p">
              {USD_EQUIVALENT_NOTE}
            </Typography>
            {snapshot && opportunity?.estimatedAmount ? (
              <Typography variant="caption" color="text.secondary" component="p">
                {`Guardado: ${snapshot.original}${snapshot.usd ? ` ≈ ${snapshot.usd}` : ''}. Tipo de cambio: ${exchangeRateText(opportunity)}.`}
              </Typography>
            ) : null}
          </FullRow>
          <Controller
            control={control}
            name="estimatedTonnage"
            render={({ field }) => (
              <DecimalField
                label={OPPORTUNITY_FIELD_LABELS.estimatedTonnage}
                spec={DECIMAL_SPECS.tonnage}
                unit="t"
                name={field.name}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                inputRef={field.ref}
                disabled={mutation.isPending}
                error={Boolean(errors.estimatedTonnage)}
                helperText={errors.estimatedTonnage?.message ?? 'Opcional e independiente del monto.'}
              />
            )}
          />
          <Box aria-hidden sx={{ display: { xs: 'none', sm: 'block' } }} />
          <TextField
            {...register('nextAction')}
            label={OPPORTUNITY_FIELD_LABELS.nextAction}
            disabled={mutation.isPending}
            error={Boolean(errors.nextAction)}
            helperText={errors.nextAction?.message}
            slotProps={{ htmlInput: { maxLength: OPPORTUNITY_LIMITS.nextAction } }}
          />
          <TextField
            {...register('nextActionDate')}
            type="date"
            label={OPPORTUNITY_FIELD_LABELS.nextActionDate}
            disabled={mutation.isPending}
            error={Boolean(errors.nextActionDate)}
            helperText={errors.nextActionDate?.message}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <FullRow>
            <TextField
              {...register('description')}
              label={OPPORTUNITY_FIELD_LABELS.description}
              multiline
              minRows={2}
              disabled={mutation.isPending}
              error={Boolean(errors.description)}
              helperText={errors.description?.message}
              slotProps={{ htmlInput: { maxLength: OPPORTUNITY_LIMITS.description } }}
            />
          </FullRow>
        </Box>
      </Stack>
    </EntityDialog>
  );
}

/**
 * Alta y edición de una oportunidad (03 §E.7, F-17, C.11).
 *
 * La estimación se captura en USD o en la moneda del país del proyecto (solo
 * las admitidas de `GET /opportunities/form-options?projectId=`, preseleccionada
 * la del país, RN-03.78). El formulario **no** calcula la conversión: la tasa y
 * el equivalente en USD los resuelve el servidor al guardar. Un
 * `422 EXCHANGE_RATE_NOT_FOUND` o `CURRENCY_NOT_ALLOWED` se explica bajo el
 * selector de moneda; el aviso `EXCHANGE_RATE_STALE` llega en la respuesta y lo
 * muestra quien abre el diálogo (no bloquea).
 */
export function OpportunityFormDialog({ open, projectId, projectLabel, opportunity, onClose, onSaved }: OpportunityFormDialogProps) {
  const options = useOpportunityFormOptions(projectId, open);
  const title = opportunity ? 'Editar oportunidad' : 'Nueva oportunidad';

  if (!open) {
    return null;
  }
  if (options.data) {
    return (
      <OpportunityForm
        key={opportunity?.id ?? 'new'}
        projectId={projectId}
        projectLabel={projectLabel}
        opportunity={opportunity}
        options={options.data}
        onClose={onClose}
        onSaved={onSaved}
      />
    );
  }
  return (
    <EntityDialog open onClose={onClose} title={title} subtitle={projectLabel}>
      {options.isError ? (
        <Alert severity="error">{withReference(describeApiError(options.error, OPPORTUNITY_ERROR_MESSAGES))}</Alert>
      ) : (
        <Stack role="status" aria-label="Cargando el formulario" spacing={1}>
          <Skeleton variant="text" />
          <Skeleton variant="rounded" sx={{ height: (theme) => theme.spacing(7) }} />
        </Stack>
      )}
    </EntityDialog>
  );
}
