import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Box, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';

import { DialogFooter, EntityDialog, FullRow } from '@/components/data';
import { DecimalField } from '@/features/crm/common/DecimalField';
import { OpportunityPicker, type OpportunityPickerValue } from '@/features/crm/opportunities';
import { usePermission } from '@/hooks/use-permission';
import { DECIMAL_SPECS, formatDecimal, formatTonnage, multiplyDecimals } from '@/features/crm/common/decimal';
import { describeApiError } from '@/lib/api-error-view';

import { FormErrorAlert } from '../components/FormErrorAlert';
import { ProductPicker } from '../components/ProductPicker';
import { UnitSelect } from '../components/UnitSelect';
import { CONVERSION_SCOPE_LABELS, productLabel, PROJECT_FIELD_LABELS } from '../project-format';
import type { ProjectDetail, ProjectFormOptions } from '../projects.api';
import { PROJECT_ERROR_MESSAGES, projectFieldErrors } from '../projects.errors';
import { OPPORTUNITY_PERMISSIONS } from '../projects.permissions';
import { useConversionPreview } from '../projects.queries';
import { canonicalDecimal, PROJECT_LIMITS, projectProductFormSchema, type ProjectProductFormValues } from '../projects.schemas';

import type { CreateProjectProductInput, Product, ProjectProduct, UpdateProjectProductInput } from './project-products.api';
import { useCreateProjectProduct, useUpdateProjectProduct } from './project-products.queries';

export interface ProjectProductFormDialogProps {
  open: boolean;
  project: ProjectDetail;
  options: ProjectFormOptions;
  /** Asociación a editar; sin ella, alta. */
  line?: ProjectProduct | null;
  onClose: () => void;
  onSaved: (line: ProjectProduct) => void;
}

const FORM_FIELDS: ReadonlySet<string> = new Set(['productId', 'quantity', 'unitId', 'statusId', 'notes']);

function initialValues(line: ProjectProduct | null | undefined, options: ProjectFormOptions): ProjectProductFormValues {
  if (line) {
    return { productId: line.product.id, quantity: line.quantity, unitId: line.unit.id, statusId: line.status.id, notes: line.notes ?? '' };
  }
  // RN-03.22 / DTO: sin estado, el backend pone el primero activo por orden.
  return { productId: '', quantity: '', unitId: '', statusId: options.productStatuses[0]?.id ?? '', notes: '' };
}

type OpportunityValue = OpportunityPickerValue | { id: string; code: string } | null;

/** Sólo lo que cambió (omitido = sin cambio); `opportunityId: null` = sin oportunidad. */
function toUpdateInput(line: ProjectProduct, values: ProjectProductFormValues, opportunity: OpportunityValue): UpdateProjectProductInput {
  const input: UpdateProjectProductInput = {};
  if ((opportunity?.id ?? null) !== (line.opportunity?.id ?? null)) input.opportunityId = opportunity?.id ?? null;
  const quantity = canonicalDecimal(values.quantity, DECIMAL_SPECS.quantity);
  if (quantity !== null && quantity !== canonicalDecimal(line.quantity, DECIMAL_SPECS.quantity)) input.quantity = quantity;
  if (values.unitId && values.unitId !== line.unit.id) input.unitId = values.unitId;
  if (values.statusId && values.statusId !== line.status.id) input.statusId = values.statusId;
  const notes = values.notes.trim() || null;
  if (notes !== (line.notes ?? null)) input.notes = notes;
  return input;
}

/**
 * Asociar o editar un producto del proyecto (03 §E.4 #6, F-19): producto del
 * catálogo local (sólo activos), cantidad, unidad (por defecto la base del
 * producto; cualquier unidad activa, D-03.14), estado y notas. La vista previa
 * del tonelaje usa la regla que devuelve el backend; sin regla, "Sin
 * conversión" (no hay tonelaje manual en líneas, DM-24).
 *
 * La oportunidad es opcional y del mismo proyecto (RN-03.56): se elige entre
 * las oportunidades del proyecto (`OpportunityPicker`, con `oportunidades.ver`);
 * sin ese permiso se muestra la que ya tenga, de solo lectura.
 */
export function ProjectProductFormDialog({ open, project, options, line, onClose, onSaved }: ProjectProductFormDialogProps) {
  const isEdit = Boolean(line);
  const creation = useCreateProjectProduct(project.id);
  const update = useUpdateProjectProduct(project.id);
  const mutation = isEdit ? update : creation;
  const [product, setProduct] = useState<Product | null>(null);
  const canChooseOpportunity = usePermission(OPPORTUNITY_PERMISSIONS.view);
  const [opportunity, setOpportunity] = useState<OpportunityValue>(line?.opportunity ?? null);
  const form = useForm<ProjectProductFormValues>({ resolver: zodResolver(projectProductFormSchema), defaultValues: initialValues(line, options) });
  const {
    control,
    register,
    handleSubmit,
    reset,
    setValue,
    setError,
    watch,
    formState: { errors },
  } = form;

  useEffect(() => {
    if (open) {
      reset(initialValues(line, options));
      setProduct(null);
      setOpportunity(line?.opportunity ?? null);
      creation.reset();
      update.reset();
    }
    // Sólo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const error = mutation.isError ? mutation.error : null;
  useEffect(() => {
    for (const [field, message] of Object.entries(projectFieldErrors(error))) {
      if (FORM_FIELDS.has(field)) {
        setError(field as keyof ProjectProductFormValues, { type: 'server', message }, { shouldFocus: false });
      }
    }
  }, [error, setError]);

  const productId = watch('productId');
  const unitId = watch('unitId');
  const quantity = watch('quantity');
  const preview = useConversionPreview(
    productId && unitId ? { fromUnitId: unitId, productId, projectTypeId: project.classification.projectType?.id } : null,
  );
  const rule = preview.data?.rule;
  const canonicalQuantity = canonicalDecimal(quantity, DECIMAL_SPECS.quantity);
  const errorView = error ? describeApiError(error, PROJECT_ERROR_MESSAGES) : null;
  const serverFieldErrors = projectFieldErrors(error);

  const onSubmit = (values: ProjectProductFormValues) => {
    if (line) {
      const input = toUpdateInput(line, values, opportunity);
      if (Object.keys(input).length === 0) {
        onClose();
        return;
      }
      update.mutate({ projectProductId: line.id, input }, { onSuccess: onSaved });
      return;
    }
    const input: CreateProjectProductInput = {
      productId: values.productId,
      quantity: canonicalDecimal(values.quantity, DECIMAL_SPECS.quantity) ?? values.quantity,
      unitId: values.unitId,
    };
    if (values.statusId) input.statusId = values.statusId;
    if (opportunity) input.opportunityId = opportunity.id;
    if (values.notes.trim()) input.notes = values.notes.trim();
    creation.mutate(input, { onSuccess: onSaved });
  };

  const unit = options.units.find((item) => item.id === unitId) ?? (line?.unit.id === unitId ? line.unit : undefined);

  return (
    <EntityDialog
      open={open}
      onClose={mutation.isPending ? undefined : onClose}
      title={isEdit ? 'Editar producto asociado' : 'Asociar producto'}
      subtitle={`${project.code} · ${project.name}`}
      requiredNote
      onSubmit={() => void handleSubmit(onSubmit)()}
      actions={
        <DialogFooter
          onCancel={onClose}
          submitLabel={mutation.isPending ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Asociar producto'}
          pending={mutation.isPending}
        />
      }
    >
      <Stack spacing={2}>
        {errorView ? <FormErrorAlert message={errorView.message} correlationId={errorView.correlationId} /> : null}
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' } }}>
          <FullRow>
            {line ? (
              <TextField
                label={PROJECT_FIELD_LABELS.productId}
                value={productLabel(line.product)}
                disabled
                helperText={`${line.product.family.name}. Para cambiar de producto, quita esta asociación y asocia otro.`}
              />
            ) : (
              <ProductPicker
                name="productId"
                value={product}
                onChange={(selected) => {
                  setProduct(selected);
                  setValue('productId', selected?.id ?? '', { shouldValidate: Boolean(errors.productId) });
                  // D-03.14: por defecto, la unidad base del producto.
                  if (selected) setValue('unitId', selected.baseUnit.id);
                }}
                required
                disabled={mutation.isPending}
                error={Boolean(errors.productId)}
                helperText={errors.productId?.message}
              />
            )}
          </FullRow>
          <Controller
            control={control}
            name="quantity"
            render={({ field }) => (
              <DecimalField
                label={PROJECT_FIELD_LABELS.quantity}
                spec={DECIMAL_SPECS.quantity}
                unit={unit?.symbol}
                name={field.name}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                inputRef={field.ref}
                required
                disabled={mutation.isPending}
                error={Boolean(errors.quantity)}
                helperText={errors.quantity?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="unitId"
            render={({ field }) => (
              <UnitSelect
                label={PROJECT_FIELD_LABELS.unitId}
                name={field.name}
                value={field.value}
                onChange={field.onChange}
                units={options.units}
                current={line?.unit ?? null}
                required
                disabled={mutation.isPending}
                error={Boolean(errors.unitId)}
                helperText={errors.unitId?.message ?? 'Por defecto, la unidad base del producto.'}
              />
            )}
          />
          <Controller
            control={control}
            name="statusId"
            render={({ field }) => (
              <TextField
                select
                label={PROJECT_FIELD_LABELS.statusId}
                name={field.name}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                inputRef={field.ref}
                disabled={mutation.isPending}
                error={Boolean(errors.statusId)}
                helperText={errors.statusId?.message}
              >
                {options.productStatuses.map((status) => (
                  <MenuItem key={status.id} value={status.id}>
                    {status.isActive ? status.label : `${status.label} (no suma en totales)`}
                  </MenuItem>
                ))}
                {line && !options.productStatuses.some((status) => status.id === line.status.id) ? (
                  <MenuItem value={line.status.id}>{`${line.status.label} (inactivo)`}</MenuItem>
                ) : null}
              </TextField>
            )}
          />
          {canChooseOpportunity ? (
            <OpportunityPicker
              projectId={project.id}
              label={PROJECT_FIELD_LABELS.opportunityId}
              name="opportunityId"
              value={opportunity}
              onChange={setOpportunity}
              disabled={mutation.isPending}
              error={Boolean(serverFieldErrors.opportunityId)}
              helperText={serverFieldErrors.opportunityId ?? 'Opcional: vacío = sin oportunidad.'}
            />
          ) : line?.opportunity ? (
            <TextField label={PROJECT_FIELD_LABELS.opportunityId} value={line.opportunity.code} disabled />
          ) : null}
          <FullRow>
            <TextField
              {...register('notes')}
              label={PROJECT_FIELD_LABELS.notes}
              multiline
              minRows={2}
              disabled={mutation.isPending}
              error={Boolean(errors.notes)}
              helperText={errors.notes?.message}
              slotProps={{ htmlInput: { maxLength: PROJECT_LIMITS.notes } }}
            />
          </FullRow>
        </Box>
        {productId && unitId && preview.isSuccess ? (
          rule ? (
            <Alert severity="info" role="status">
              {`Regla aplicable: ${CONVERSION_SCOPE_LABELS[rule.scope]}, 1 ${rule.fromUnit.symbol} = ${formatDecimal(rule.factor)} ${rule.toUnit.symbol}.`}
              {canonicalQuantity ? ` Tonelaje estimado: ${formatTonnage(multiplyDecimals(canonicalQuantity, rule.factor, 4), rule.toUnit.symbol)}.` : ''}
            </Alert>
          ) : (
            <Alert severity="warning" role="status">
              Sin conversión: no hay regla de esta unidad a toneladas. La línea se guarda sin tonelaje y no suma en el total.
            </Alert>
          )
        ) : null}
        <Typography variant="caption" color="text.secondary">
          El tonelaje definitivo lo calcula el sistema al guardar con la regla vigente.
        </Typography>
      </Stack>
    </EntityDialog>
  );
}
