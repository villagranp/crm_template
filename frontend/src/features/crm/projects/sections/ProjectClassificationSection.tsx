import { zodResolver } from '@hookform/resolvers/zod';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import {
  Alert,
  Box,
  Button,
  FormControl,
  FormControlLabel,
  FormLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';

import { DetailList, DialogFooter, EmptyState, EntityDialog, FullRow } from '@/components/data';
import { DecimalField } from '@/features/crm/common/DecimalField';
import { DECIMAL_SPECS, formatDecimal, formatQuantity, formatTonnage, multiplyDecimals } from '@/features/crm/common/decimal';
import { describeApiError } from '@/lib/api-error-view';

import { ConversionBadge } from '../components/ConversionBadge';
import { FormErrorAlert } from '../components/FormErrorAlert';
import { UnitSelect } from '../components/UnitSelect';
import { CONVERSION_SCOPE_LABELS, orDash, PROJECT_FIELD_LABELS, TONNAGE_MODE_LABELS } from '../project-format';
import type { CatalogRefWithState, ProjectDetail, ProjectFormOptions, TonnageMode, UpdateClassificationInput } from '../projects.api';
import { PROJECT_ERROR_MESSAGES, projectFieldErrors } from '../projects.errors';
import { useConversionPreview, useUpdateClassification } from '../projects.queries';
import { buildClassificationSchema, canonicalDecimal, type ClassificationFormValues } from '../projects.schemas';

import { SectionCard, SectionLoading } from './SectionCard';

const MODES: readonly TonnageMode[] = ['RULE', 'MANUAL', 'NONE'];
const FORM_FIELDS: ReadonlySet<string> = new Set(['projectTypeId', 'sectorId', 'measureUnitId', 'estimatedQuantity', 'tonnageMode', 'manualTonnage']);

function isClassified(project: ProjectDetail): boolean {
  const { classification } = project;
  return Boolean(classification.projectType || classification.sector || classification.measureUnit || classification.estimatedQuantity || classification.estimatedTonnage);
}

function toFormValues(project: ProjectDetail): ClassificationFormValues {
  const { classification } = project;
  return {
    projectTypeId: classification.projectType?.id ?? '',
    sectorId: classification.sector?.id ?? '',
    measureUnitId: classification.measureUnit?.id ?? '',
    estimatedQuantity: classification.estimatedQuantity ?? '',
    tonnageMode: classification.tonnageMode,
    manualTonnage: classification.tonnageMode === 'MANUAL' ? (classification.estimatedTonnage ?? '') : '',
  };
}

/** `PUT` que reemplaza (E2a #7): todo campo va, `null` si está vacío; `manualTonnage` sólo con `MANUAL`. */
function toClassificationInput(values: ClassificationFormValues): UpdateClassificationInput {
  const input: UpdateClassificationInput = {
    projectTypeId: values.projectTypeId || null,
    sectorId: values.sectorId || null,
    measureUnitId: values.measureUnitId || null,
    estimatedQuantity: canonicalDecimal(values.estimatedQuantity, DECIMAL_SPECS.quantity),
    tonnageMode: values.tonnageMode,
  };
  if (values.tonnageMode === 'MANUAL') {
    input.manualTonnage = canonicalDecimal(values.manualTonnage, DECIMAL_SPECS.tonnage) ?? '';
  }
  return input;
}

function withCurrent(items: readonly { id: string; label: string }[], current: CatalogRefWithState | null) {
  return current && !items.some((item) => item.id === current.id) ? [...items, { id: current.id, label: `${current.label} (inactivo)` }] : items;
}

interface ClassificationDialogProps {
  open: boolean;
  project: ProjectDetail;
  options: ProjectFormOptions;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Diálogo de clasificación (03 §E.4 #2, F-15). La vista previa de la regla sale
 * de `GET /unit-conversions/resolve` (misma precedencia que el backend): el
 * frontend no tiene factores propios (AC-03.35) y el tonelaje definitivo lo
 * calcula el backend al guardar.
 */
function ClassificationDialog({ open, project, options, onClose, onSaved }: ClassificationDialogProps) {
  const update = useUpdateClassification(project.id);
  const schema = useMemo(() => buildClassificationSchema(options.requiredFields), [options.requiredFields]);
  const required = useMemo(() => new Set(options.requiredFields), [options.requiredFields]);
  const form = useForm<ClassificationFormValues>({ resolver: zodResolver(schema), defaultValues: toFormValues(project) });
  const {
    control,
    handleSubmit,
    watch,
    reset,
    setError,
    formState: { errors },
  } = form;

  useEffect(() => {
    if (open) {
      reset(toFormValues(project));
      update.reset();
    }
    // Sólo al abrir: el formulario parte de la ficha vigente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const error = update.isError ? update.error : null;
  useEffect(() => {
    for (const [field, message] of Object.entries(projectFieldErrors(error))) {
      if (FORM_FIELDS.has(field)) {
        setError(field as keyof ClassificationFormValues, { type: 'server', message }, { shouldFocus: false });
      }
    }
  }, [error, setError]);

  const mode = watch('tonnageMode');
  const unitId = watch('measureUnitId');
  const projectTypeId = watch('projectTypeId');
  const quantity = watch('estimatedQuantity');
  const lookup = mode === 'RULE' && unitId ? { fromUnitId: unitId, projectTypeId: projectTypeId || undefined } : null;
  const preview = useConversionPreview(lookup);
  const rule = preview.data?.rule ?? null;
  const canonicalQuantity = canonicalDecimal(quantity, DECIMAL_SPECS.quantity);
  const errorView = error ? describeApiError(error, PROJECT_ERROR_MESSAGES) : null;
  const close = update.isPending ? undefined : onClose;

  const select = (field: 'projectTypeId' | 'sectorId', items: readonly { id: string; label: string }[]) => (
    <Controller
      control={control}
      name={field}
      render={({ field: input }) => (
        <TextField
          select
          label={PROJECT_FIELD_LABELS[field]}
          name={input.name}
          value={input.value}
          onChange={input.onChange}
          onBlur={input.onBlur}
          inputRef={input.ref}
          required={required.has(field)}
          disabled={update.isPending}
          error={Boolean(errors[field])}
          helperText={errors[field]?.message}
        >
          <MenuItem value="">Sin especificar</MenuItem>
          {items.map((item) => (
            <MenuItem key={item.id} value={item.id}>
              {item.label}
            </MenuItem>
          ))}
        </TextField>
      )}
    />
  );

  let previewContent = null;
  if (mode === 'RULE') {
    if (!unitId) {
      previewContent = <Alert severity="info">Elige la unidad para ver la regla de conversión aplicable.</Alert>;
    } else if (preview.isPending) {
      previewContent = <SectionLoading label="Buscando la regla aplicable" rows={1} />;
    } else if (preview.isError) {
      previewContent = <Alert severity="warning">No se pudo consultar la regla aplicable. El tonelaje se calculará al guardar.</Alert>;
    } else if (!rule) {
      previewContent = (
        <Alert severity="warning" role="status">
          {`No hay una regla de conversión de esta unidad a ${options.tonnageUnit.symbol}. Elige "Manual" o "Sin estimación".`}
        </Alert>
      );
    } else {
      previewContent = (
        <Alert severity="info" role="status">
          {`Regla aplicable: ${CONVERSION_SCOPE_LABELS[rule.scope]}, 1 ${rule.fromUnit.symbol} = ${formatDecimal(rule.factor)} ${rule.toUnit.symbol}.`}
          {canonicalQuantity ? ` Tonelaje estimado: ${formatTonnage(multiplyDecimals(canonicalQuantity, rule.factor, 4), rule.toUnit.symbol)}.` : ''}
        </Alert>
      );
    }
  }

  return (
    <EntityDialog
      open={open}
      onClose={close}
      title={isClassified(project) ? 'Editar clasificación' : 'Clasificar proyecto'}
      subtitle={`${project.code} · ${project.name}`}
      requiredNote
      onSubmit={() => void handleSubmit((values) => update.mutate(toClassificationInput(values), { onSuccess: onSaved }))()}
      actions={<DialogFooter onCancel={onClose} submitLabel={update.isPending ? 'Guardando…' : 'Guardar clasificación'} pending={update.isPending} />}
    >
      <Stack spacing={2}>
        {errorView ? <FormErrorAlert message={errorView.message} correlationId={errorView.correlationId} /> : null}
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' } }}>
          {select('projectTypeId', withCurrent(options.projectTypes, project.classification.projectType))}
          {select('sectorId', withCurrent(options.sectors, project.classification.sector))}
          <Controller
            control={control}
            name="measureUnitId"
            render={({ field }) => (
              <UnitSelect
                label={PROJECT_FIELD_LABELS.measureUnitId}
                name={field.name}
                value={field.value}
                onChange={field.onChange}
                units={options.units}
                current={project.classification.measureUnit}
                allowEmpty
                required={required.has('measureUnitId') || mode === 'RULE'}
                disabled={update.isPending}
                error={Boolean(errors.measureUnitId)}
                helperText={errors.measureUnitId?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="estimatedQuantity"
            render={({ field }) => (
              <DecimalField
                label={PROJECT_FIELD_LABELS.estimatedQuantity}
                spec={DECIMAL_SPECS.quantity}
                name={field.name}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                inputRef={field.ref}
                required={required.has('estimatedQuantity') || mode === 'RULE'}
                disabled={update.isPending}
                error={Boolean(errors.estimatedQuantity)}
                helperText={errors.estimatedQuantity?.message}
              />
            )}
          />
          <FullRow>
            <Controller
              control={control}
              name="tonnageMode"
              render={({ field }) => (
                <FormControl disabled={update.isPending}>
                  <FormLabel id="tonnage-mode-label">{PROJECT_FIELD_LABELS.tonnageMode}</FormLabel>
                  <RadioGroup row aria-labelledby="tonnage-mode-label" name={field.name} value={field.value} onChange={(event) => field.onChange(event.target.value)}>
                    {MODES.map((value) => (
                      <FormControlLabel key={value} value={value} control={<Radio />} label={TONNAGE_MODE_LABELS[value]} />
                    ))}
                  </RadioGroup>
                </FormControl>
              )}
            />
          </FullRow>
          {mode === 'MANUAL' ? (
            <Controller
              control={control}
              name="manualTonnage"
              render={({ field }) => (
                <DecimalField
                  label={PROJECT_FIELD_LABELS.manualTonnage}
                  spec={DECIMAL_SPECS.tonnage}
                  unit={options.tonnageUnit.symbol}
                  name={field.name}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  inputRef={field.ref}
                  required
                  disabled={update.isPending}
                  error={Boolean(errors.manualTonnage)}
                  helperText={errors.manualTonnage?.message ?? 'La estimación manual sólo existe en el proyecto.'}
                />
              )}
            />
          ) : null}
        </Box>
        {previewContent}
        {mode === 'RULE' ? (
          <Typography variant="caption" color="text.secondary">
            El tonelaje definitivo lo calcula el sistema al guardar con la regla vigente.
          </Typography>
        ) : null}
      </Stack>
    </EntityDialog>
  );
}

export interface ProjectClassificationSectionProps {
  project: ProjectDetail;
  /** `form-options`; mientras cargan, el botón de edición espera. */
  options: ProjectFormOptions | undefined;
}

/** Sección 2 · Clasificación (03 §E.4, F-15): tipo, sector, unidad, cantidad, modo, regla y tonelaje. */
export function ProjectClassificationSection({ project, options }: ProjectClassificationSectionProps) {
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) setNotice(null);
  };
  const { classification, capabilities } = project;
  const classified = isClassified(project);
  const label = classified ? 'Editar clasificación' : 'Clasificar';
  const tonnageSymbol = options?.tonnageUnit.symbol ?? 't';

  const action =
    capabilities.canEdit && classified ? (
      <Button size="small" variant="outlined" startIcon={<EditOutlinedIcon />} disabled={!options} onClick={() => onOpenChange(true)}>
        {label}
      </Button>
    ) : null;

  return (
    <SectionCard title="Clasificación" actions={action}>
      {notice ? (
        <Alert severity="success" role="status" sx={{ mb: 2 }} onClose={() => setNotice(null)}>
          {notice}
        </Alert>
      ) : null}
      {classified ? (
        <DetailList
          items={[
            { label: PROJECT_FIELD_LABELS.projectTypeId, value: orDash(classification.projectType?.label) },
            { label: PROJECT_FIELD_LABELS.sectorId, value: orDash(classification.sector?.label) },
            { label: PROJECT_FIELD_LABELS.measureUnitId, value: orDash(classification.measureUnit ? `${classification.measureUnit.code} (${classification.measureUnit.symbol})` : null) },
            { label: PROJECT_FIELD_LABELS.estimatedQuantity, value: formatQuantity(classification.estimatedQuantity, classification.measureUnit?.symbol) },
            { label: PROJECT_FIELD_LABELS.tonnageMode, value: TONNAGE_MODE_LABELS[classification.tonnageMode] },
            {
              label: 'Regla aplicada',
              value: classification.tonnageMode === 'RULE' ? <ConversionBadge conversion={classification.conversion} /> : 'No aplica',
            },
            { label: PROJECT_FIELD_LABELS.manualTonnage, value: formatTonnage(classification.estimatedTonnage, tonnageSymbol) },
          ]}
        />
      ) : (
        <EmptyState
          icon={<CategoryOutlinedIcon />}
          title="Sin clasificar"
          description="Indica el tipo, el sector y la estimación de tonelaje del proyecto."
          action={
            capabilities.canEdit ? (
              <Button disabled={!options} onClick={() => onOpenChange(true)}>
                Clasificar
              </Button>
            ) : undefined
          }
        />
      )}
      {capabilities.canEdit && options ? (
        <ClassificationDialog
          open={open}
          project={project}
          options={options}
          onClose={() => onOpenChange(false)}
          onSaved={() => {
            setOpen(false);
            setNotice('Clasificación guardada.');
          }}
        />
      ) : null}
    </SectionCard>
  );
}
