import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Autocomplete, MenuItem, TextField } from '@mui/material';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';

import {
  AdminDialog,
  describeApiError,
  DialogFooter,
  FormSection,
  FullRow,
  SEARCH_DEBOUNCE_MS,
} from '@/features/admin/common';

import {
  CONVERSION_SCOPES,
  type ConversionRule,
  type ProductOption,
  type UnitOption,
} from '../conversions.api';
import { formatFactor, isIdentityRule, SCOPE_LABELS } from '../conversions-format';
import {
  useCreateConversionRule,
  useFamilyOptions,
  useProductOptions,
  useProjectTypeOptions,
  useUpdateConversionRule,
} from '../conversions.queries';
import {
  conversionRuleFormSchema,
  DESCRIPTION_MAX,
  normalizeFactor,
  type ConversionRuleFormValues,
} from '../conversions.schemas';

export interface ConversionRuleFormDialogProps {
  open: boolean;
  /** `null` = alta. */
  rule: ConversionRule | null;
  units: readonly UnitOption[];
  /** Unidad de tonelaje configurada (destino obligado), si se conoce. */
  tonnageUnit: UnitOption | null;
  /** `catalogos.ver`: sin él no se ofrece el ámbito «Tipo de proyecto». */
  canUseProjectTypes: boolean;
  /** Referencia legible del ámbito de `rule` (edición). */
  referenceLabel: string | null;
  onClose: () => void;
}

const FORM_ERRORS = {
  RESOURCE_CONFLICT: 'Ya existe una regla con ese origen, destino y ámbito.',
  UNKNOWN_REFERENCE:
    'La unidad, familia, producto o tipo de proyecto elegido ya no existe o está inactivo.',
  VALIDATION_FAILED: 'Revisa los datos: el ámbito y su referencia deben ser coherentes.',
};

function defaults(
  rule: ConversionRule | null,
  tonnageUnit: UnitOption | null,
): ConversionRuleFormValues {
  if (rule) {
    return {
      fromUnitId: rule.fromUnit.id,
      toUnitId: rule.toUnit.id,
      scope: rule.scope,
      referenceId: rule.product?.id ?? rule.productFamily?.id ?? rule.projectType?.id ?? '',
      factor: formatFactor(rule.factor),
      description: rule.description ?? '',
    };
  }
  return {
    fromUnitId: '',
    toUnitId: tonnageUnit?.id ?? '',
    scope: 'GLOBAL',
    referenceId: '',
    factor: '',
    description: '',
  };
}

function unitLabel(unit: { code: string; symbol: string; name?: string }): string {
  return unit.name ? `${unit.name} (${unit.code})` : `${unit.code} (${unit.symbol})`;
}

/**
 * Alta y edición de una regla de conversión (07 E.5, RN-07.36). En el alta, el
 * destino es la unidad de tonelaje configurada. En la edición sólo cambian el
 * factor y la descripción (origen, destino y ámbito son la clave de la regla);
 * la regla identidad no admite cambiar el factor.
 */
export function ConversionRuleFormDialog({
  open,
  rule,
  units,
  tonnageUnit,
  canUseProjectTypes,
  referenceLabel,
  onClose,
}: ConversionRuleFormDialogProps) {
  const createMutation = useCreateConversionRule();
  const updateMutation = useUpdateConversionRule();
  const mutation = rule ? updateMutation : createMutation;
  /** Origen = destino: el factor no cambia (identity_factor). */
  const identity = rule ? isIdentityRule(rule) : false;

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ConversionRuleFormValues>({
    resolver: zodResolver(conversionRuleFormSchema),
    defaultValues: defaults(rule, tonnageUnit),
  });
  const { reset: resetCreate } = createMutation;
  const { reset: resetUpdate } = updateMutation;

  useEffect(() => {
    if (open) {
      reset(defaults(rule, tonnageUnit));
      resetCreate();
      resetUpdate();
    }
  }, [open, rule, tonnageUnit, reset, resetCreate, resetUpdate]);

  const scope = watch('scope');
  const creating = rule === null;
  const families = useFamilyOptions(open && creating && scope === 'PRODUCT_FAMILY');
  const projectTypes = useProjectTypeOptions(
    open && creating && scope === 'PROJECT_TYPE' && canUseProjectTypes,
  );

  const [productInput, setProductInput] = useState('');
  const [productSearch, setProductSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setProductSearch(productInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [productInput]);
  const products = useProductOptions(productSearch, open && creating && scope === 'PRODUCT');
  const [selectedProduct, setSelectedProduct] = useState<ProductOption | null>(null);
  useEffect(() => {
    if (open) {
      setSelectedProduct(null);
      setProductInput('');
    }
  }, [open]);

  const destinationUnits = tonnageUnit
    ? [tonnageUnit]
    : units.filter((unit) => unit.dimension === 'MASS');

  const submit = handleSubmit((values) => {
    const factor = normalizeFactor(values.factor);
    if (rule) {
      const body = identity
        ? { description: values.description || null }
        : { factor, description: values.description || null };
      updateMutation.mutate({ id: rule.id, body }, { onSuccess: onClose });
      return;
    }
    const reference =
      values.scope === 'PRODUCT'
        ? { productId: values.referenceId }
        : values.scope === 'PRODUCT_FAMILY'
          ? { productFamilyId: values.referenceId }
          : values.scope === 'PROJECT_TYPE'
            ? { projectTypeId: values.referenceId }
            : {};
    createMutation.mutate(
      {
        fromUnitId: values.fromUnitId,
        ...(values.toUnitId ? { toUnitId: values.toUnitId } : {}),
        factor,
        scope: values.scope,
        ...reference,
        ...(values.description ? { description: values.description } : {}),
      },
      { onSuccess: onClose },
    );
  });

  const pending = mutation.isPending;
  const error = mutation.isError ? describeApiError(mutation.error, FORM_ERRORS) : null;

  return (
    <AdminDialog
      open={open}
      onClose={pending ? undefined : onClose}
      title={
        rule
          ? `Editar regla ${rule.fromUnit.code} → ${rule.toUnit.code}`
          : 'Nueva regla de conversión'
      }
      subtitle="Conversiones"
      requiredNote
      onSubmit={(event) => {
        void submit(event);
      }}
      actions={
        <DialogFooter
          onCancel={onClose}
          submitLabel={rule ? 'Guardar cambios' : 'Crear regla'}
          pending={pending}
        />
      }
    >
      {identity ? (
        <Alert severity="info" sx={{ mb: 2 }}>
          Es una regla identidad (origen = destino): su factor es 1 y no cambia.
          {rule?.isProtected ? ' Es la de la unidad de tonelaje: tampoco se puede desactivar.' : ''}
        </Alert>
      ) : null}
      {rule && !identity ? (
        <Alert severity="info" sx={{ mb: 2 }}>
          Cambiar el factor no modifica las líneas que ya lo usan: cada línea conserva el factor con
          el que se guardó.
        </Alert>
      ) : null}
      <FormSection number={1} title="Unidades y ámbito">
        {rule ? (
          <>
            <TextField label="Origen" value={unitLabel(rule.fromUnit)} disabled />
            <TextField label="Destino" value={unitLabel(rule.toUnit)} disabled />
            <TextField label="Ámbito" value={SCOPE_LABELS[rule.scope]} disabled />
            {rule.scope === 'GLOBAL' ? null : (
              <TextField label="Aplica a" value={referenceLabel ?? '—'} disabled />
            )}
          </>
        ) : (
          <>
            <Controller
              name="fromUnitId"
              control={control}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  select
                  label="Origen"
                  required
                  disabled={pending}
                  error={Boolean(fieldState.error)}
                  helperText={fieldState.error?.message}
                >
                  {units.map((unit) => (
                    <MenuItem key={unit.id} value={unit.id}>
                      {unitLabel(unit)}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />
            <Controller
              name="toUnitId"
              control={control}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  select
                  label="Destino"
                  disabled={pending || tonnageUnit !== null}
                  error={Boolean(fieldState.error)}
                  helperText={
                    fieldState.error?.message ??
                    (tonnageUnit
                      ? 'Unidad de tonelaje configurada.'
                      : 'Debe ser la unidad de tonelaje configurada; vacío, se usa ésa.')
                  }
                  slotProps={{ select: { displayEmpty: true } }}
                >
                  {tonnageUnit ? null : (
                    <MenuItem value="">Unidad de tonelaje configurada</MenuItem>
                  )}
                  {destinationUnits.map((unit) => (
                    <MenuItem key={unit.id} value={unit.id}>
                      {unitLabel(unit)}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />
            <Controller
              name="scope"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  onChange={(event) => {
                    field.onChange(event);
                    setValue('referenceId', '');
                    setSelectedProduct(null);
                  }}
                  select
                  label="Ámbito"
                  required
                  disabled={pending}
                  helperText={
                    canUseProjectTypes
                      ? undefined
                      : 'Tipo de proyecto requiere permiso para consultar catálogos.'
                  }
                >
                  {CONVERSION_SCOPES.map((option) => (
                    <MenuItem
                      key={option}
                      value={option}
                      disabled={option === 'PROJECT_TYPE' && !canUseProjectTypes}
                    >
                      {SCOPE_LABELS[option]}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />
            {scope === 'PRODUCT_FAMILY' ? (
              <Controller
                name="referenceId"
                control={control}
                render={({ field, fieldState }) => (
                  <TextField
                    {...field}
                    select
                    label="Familia"
                    required
                    disabled={pending || families.isPending}
                    error={Boolean(fieldState.error)}
                    helperText={
                      fieldState.error?.message ??
                      (families.isPending ? 'Cargando familias…' : undefined)
                    }
                  >
                    {(families.data ?? []).map((family) => (
                      <MenuItem key={family.id} value={family.id}>
                        {family.name}
                      </MenuItem>
                    ))}
                  </TextField>
                )}
              />
            ) : null}
            {scope === 'PROJECT_TYPE' ? (
              <Controller
                name="referenceId"
                control={control}
                render={({ field, fieldState }) => (
                  <TextField
                    {...field}
                    select
                    label="Tipo de proyecto"
                    required
                    disabled={pending || projectTypes.isPending}
                    error={Boolean(fieldState.error)}
                    helperText={
                      fieldState.error?.message ??
                      (projectTypes.isPending ? 'Cargando tipos…' : undefined)
                    }
                  >
                    {(projectTypes.data ?? []).map((type) => (
                      <MenuItem key={type.id} value={type.id}>
                        {type.label}
                      </MenuItem>
                    ))}
                  </TextField>
                )}
              />
            ) : null}
            {scope === 'PRODUCT' ? (
              <Autocomplete<ProductOption>
                options={products.data ?? []}
                value={selectedProduct}
                onChange={(_, product) => {
                  setSelectedProduct(product);
                  setValue('referenceId', product?.id ?? '', { shouldValidate: true });
                }}
                inputValue={productInput}
                onInputChange={(_, value) => setProductInput(value)}
                getOptionLabel={(product) => `${product.sku} — ${product.description}`}
                isOptionEqualToValue={(option, value) => option.id === value.id}
                filterOptions={(options) => options}
                loading={products.isFetching}
                loadingText="Buscando…"
                noOptionsText="Sin productos"
                disabled={pending}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Producto"
                    required
                    error={Boolean(errors.referenceId)}
                    helperText={errors.referenceId?.message ?? 'Escribe el SKU o la descripción.'}
                  />
                )}
              />
            ) : null}
          </>
        )}
      </FormSection>
      <FormSection number={2} title="Factor">
        <TextField
          {...register('factor')}
          label="Factor"
          required
          disabled={pending || identity}
          slotProps={{ htmlInput: { inputMode: 'decimal' } }}
          error={Boolean(errors.factor)}
          helperText={errors.factor?.message ?? 'Cantidad destino = cantidad origen × factor.'}
        />
        <FullRow>
          <TextField
            {...register('description')}
            label="Descripción"
            multiline
            minRows={2}
            disabled={pending}
            slotProps={{ htmlInput: { maxLength: DESCRIPTION_MAX } }}
            error={Boolean(errors.description)}
            helperText={errors.description?.message}
          />
        </FullRow>
      </FormSection>
      {error ? (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error.message}
          {error.code === 'VALIDATION_FAILED' && error.issues.length > 0
            ? ` ${error.issues.join(' ')}`
            : null}
        </Alert>
      ) : null}
    </AdminDialog>
  );
}
