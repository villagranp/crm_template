import { zodResolver } from '@hookform/resolvers/zod';
import TimelineOutlinedIcon from '@mui/icons-material/TimelineOutlined';
import {
  Alert,
  Box,
  Button,
  LinearProgress,
  MenuItem,
  Stack,
  Step,
  StepLabel,
  Stepper,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useId, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';

import { DialogFooter, EmptyState, EntityDialog } from '@/components/data';
import { DecimalField } from '@/features/crm/common/DecimalField';
import { DECIMAL_SPECS, formatPercent, normalizeDecimal } from '@/features/crm/common/decimal';
import { describeApiError } from '@/lib/api-error-view';

import { FormErrorAlert } from '../components/FormErrorAlert';
import { formatDateTime, PROJECT_FIELD_LABELS, progressBarValue } from '../project-format';
import type { PhaseOption, ProjectDetail, ProjectFormOptions } from '../projects.api';
import { PROJECT_ERROR_MESSAGES, projectFieldErrors } from '../projects.errors';
import { useCreatePhaseChange, usePhaseHistory } from '../projects.queries';
import { buildPhaseChangeSchema, canonicalDecimal, minimumProgressFor, PROJECT_LIMITS, type PhaseChangeFormValues } from '../projects.schemas';

import { SectionCard, SectionError, SectionLoading } from './SectionCard';

const HISTORY_PAGE_SIZE = 10;

function sortedPhases(phases: readonly PhaseOption[]): PhaseOption[] {
  return [...phases].sort((left, right) => left.order - right.order);
}

interface PhaseDialogProps {
  open: boolean;
  project: ProjectDetail;
  options: ProjectFormOptions;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * "Actualizar fase" (03 §E.4 #3, F-16): fase, porcentaje y comentario. Al
 * cambiar de fase propone su `defaultProgress` (RN-03.34) y muestra la regla de
 * avance; la decisión final es del backend (`PHASE_PROGRESS_RULE`).
 */
function PhaseDialog({ open, project, options, onClose, onSaved }: PhaseDialogProps) {
  const change = useCreatePhaseChange(project.id);
  const phases = useMemo(() => sortedPhases(options.phases), [options.phases]);
  const schema = useMemo(
    () =>
      buildPhaseChangeSchema({
        phases,
        progressRules: options.progressRules,
        currentPhaseId: project.phase.phase.id,
        currentProgress: project.phase.progress,
      }),
    [phases, options.progressRules, project.phase],
  );
  const initial: PhaseChangeFormValues = { phaseId: project.phase.phase.id, progress: normalizeDecimal(project.phase.progress), comment: '' };
  const form = useForm<PhaseChangeFormValues>({ resolver: zodResolver(schema), defaultValues: initial });
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
      reset(initial);
      change.reset();
    }
    // Sólo al abrir: parte de la fase vigente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const error = change.isError ? change.error : null;
  useEffect(() => {
    for (const [field, message] of Object.entries(projectFieldErrors(error))) {
      if (field === 'phaseId' || field === 'progress' || field === 'comment') {
        setError(field, { type: 'server', message }, { shouldFocus: false });
      }
    }
  }, [error, setError]);

  const phaseId = watch('phaseId');
  const selected = phases.find((phase) => phase.id === phaseId);
  const minimum = minimumProgressFor(selected?.code, options.progressRules);
  const currentInList = phases.some((phase) => phase.id === project.phase.phase.id);
  const errorView = error ? describeApiError(error, PROJECT_ERROR_MESSAGES) : null;

  const onSubmit = (values: PhaseChangeFormValues) =>
    change.mutate(
      {
        phaseId: values.phaseId,
        progress: canonicalDecimal(values.progress, DECIMAL_SPECS.percent) ?? undefined,
        comment: values.comment.trim() || undefined,
      },
      { onSuccess: onSaved },
    );

  return (
    <EntityDialog
      open={open}
      onClose={change.isPending ? undefined : onClose}
      title="Actualizar fase"
      subtitle={`${project.code} · ${project.name}`}
      maxWidth="sm"
      requiredNote
      onSubmit={() => void handleSubmit(onSubmit)()}
      actions={<DialogFooter onCancel={onClose} submitLabel={change.isPending ? 'Guardando…' : 'Guardar fase'} pending={change.isPending} />}
    >
      <Stack spacing={2}>
        {errorView ? <FormErrorAlert message={errorView.message} correlationId={errorView.correlationId} /> : null}
        <Controller
          control={control}
          name="phaseId"
          render={({ field }) => (
            <TextField
              select
              label={PROJECT_FIELD_LABELS.phaseId}
              name={field.name}
              value={field.value}
              onChange={(event) => {
                const next = phases.find((phase) => phase.id === event.target.value);
                field.onChange(event.target.value);
                // RN-03.34: al cambiar de fase se propone su porcentaje por defecto.
                if (next?.defaultProgress && next.id !== project.phase.phase.id) {
                  setValue('progress', normalizeDecimal(next.defaultProgress), { shouldValidate: false });
                }
              }}
              onBlur={field.onBlur}
              inputRef={field.ref}
              required
              disabled={change.isPending}
              error={Boolean(errors.phaseId)}
              helperText={errors.phaseId?.message ?? 'Se puede retroceder de fase; queda en el historial.'}
            >
              {phases.map((phase) => (
                <MenuItem key={phase.id} value={phase.id}>
                  {phase.label}
                </MenuItem>
              ))}
              {currentInList ? null : (
                <MenuItem value={project.phase.phase.id}>{`${project.phase.phase.label} (inactiva)`}</MenuItem>
              )}
            </TextField>
          )}
        />
        <Controller
          control={control}
          name="progress"
          render={({ field }) => (
            <DecimalField
              label={PROJECT_FIELD_LABELS.progress}
              spec={DECIMAL_SPECS.percent}
              unit="%"
              name={field.name}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              inputRef={field.ref}
              required
              disabled={change.isPending}
              error={Boolean(errors.progress)}
              helperText={errors.progress?.message ?? (minimum !== null ? `Esta fase exige al menos ${minimum}%.` : 'Entre 0 y 100, hasta 2 decimales.')}
            />
          )}
        />
        <TextField
          {...register('comment')}
          label={PROJECT_FIELD_LABELS.comment}
          multiline
          minRows={2}
          disabled={change.isPending}
          error={Boolean(errors.comment)}
          helperText={errors.comment?.message ?? 'Opcional.'}
          slotProps={{ htmlInput: { maxLength: PROJECT_LIMITS.comment } }}
        />
      </Stack>
    </EntityDialog>
  );
}

function PhaseHistory({ projectId }: { projectId: string }) {
  const [page, setPage] = useState(1);
  const history = usePhaseHistory(projectId, { page, pageSize: HISTORY_PAGE_SIZE });
  const titleId = useId();

  let content;
  if (history.isPending) {
    content = <SectionLoading label="Cargando el historial de fase" />;
  } else if (history.isError) {
    content = <SectionError title="No se pudo cargar el historial de fase" error={history.error} onRetry={() => void history.refetch()} />;
  } else if (history.data.data.length === 0) {
    content = <Typography color="text.secondary">Sin cambios de fase.</Typography>;
  } else {
    const { totalPages } = history.data.pagination;
    content = (
      <>
        <Box component="ol" sx={{ listStyle: 'none', p: 0, m: 0 }}>
          {history.data.data.map((item) => (
            <Box component="li" key={item.id} sx={{ py: 1.25, borderBottom: 1, borderColor: 'divider' }}>
              <Typography variant="body2" sx={{ fontWeight: 'fontWeightMedium' }}>
                {item.fromPhase
                  ? `${item.fromPhase.label} ${formatPercent(item.fromProgress)} → ${item.toPhase.label} ${formatPercent(item.toProgress)}`
                  : `Alta en ${item.toPhase.label} ${formatPercent(item.toProgress)}`}
              </Typography>
              <Typography variant="caption" color="text.secondary" component="p">
                {`${item.changedBy.displayName} · ${formatDateTime(item.changedAt)}`}
              </Typography>
              {item.comment ? (
                <Typography variant="body2" sx={{ mt: 0.5, overflowWrap: 'anywhere' }}>
                  {item.comment}
                </Typography>
              ) : null}
            </Box>
          ))}
        </Box>
        {totalPages > 1 ? (
          <Stack direction="row" spacing={1} justifyContent="flex-end" alignItems="center" sx={{ mt: 1 }}>
            <Button size="small" variant="text" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
              Más recientes
            </Button>
            <Typography variant="caption" color="text.secondary">{`Página ${page} de ${totalPages}`}</Typography>
            <Button size="small" variant="text" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>
              Anteriores
            </Button>
          </Stack>
        ) : null}
      </>
    );
  }

  return (
    <Box component="section" aria-labelledby={titleId} sx={{ mt: 3 }}>
      <Typography id={titleId} variant="subtitle2" component="h3" sx={{ mb: 1 }}>
        Historial de fase
      </Typography>
      {content}
    </Box>
  );
}

export interface ProjectPhaseSectionProps {
  project: ProjectDetail;
  options: ProjectFormOptions | undefined;
}

/**
 * Sección 3 · Fase del cliente (03 §E.4, F-16): pasos del catálogo (por
 * `metadata.order`), barra de avance con texto, fecha, comentario e historial.
 * Es independiente de las oportunidades (RN-03.36).
 */
export function ProjectPhaseSection({ project, options }: ProjectPhaseSectionProps) {
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const phases = useMemo(() => sortedPhases(options?.phases ?? []), [options?.phases]);
  const activeStep = phases.findIndex((phase) => phase.id === project.phase.phase.id);
  const progressText = formatPercent(project.phase.progress);

  return (
    <SectionCard
      title="Fase del cliente"
      actions={
        project.capabilities.canEdit ? (
          <Button
            size="small"
            variant="outlined"
            startIcon={<TimelineOutlinedIcon />}
            disabled={!options}
            onClick={() => {
              setNotice(null);
              setOpen(true);
            }}
          >
            Actualizar fase
          </Button>
        ) : null
      }
    >
      <Stack spacing={2}>
        {notice ? (
          <Alert severity="success" role="status" onClose={() => setNotice(null)}>
            {notice}
          </Alert>
        ) : null}
        {phases.length > 0 ? (
          <Box sx={{ overflowX: 'auto' }}>
            <Stepper activeStep={activeStep} alternativeLabel aria-label="Fases del cliente">
              {phases.map((phase, index) => (
                <Step key={phase.id} completed={activeStep >= 0 && index < activeStep}>
                  <StepLabel>{phase.label}</StepLabel>
                </Step>
              ))}
            </Stepper>
          </Box>
        ) : null}
        <Box>
          <Stack direction="row" justifyContent="space-between" alignItems="baseline" spacing={1}>
            <Typography variant="body1" sx={{ fontWeight: 'fontWeightMedium' }}>
              {`Fase actual: ${project.phase.phase.label}`}
            </Typography>
            <Typography variant="body2">{`Avance ${progressText}`}</Typography>
          </Stack>
          <LinearProgress
            variant="determinate"
            value={progressBarValue(project.phase.progress)}
            aria-label={`Avance de la fase: ${progressText}`}
            sx={{ mt: 1 }}
          />
          <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>
            {`Actualizada el ${formatDateTime(project.phase.updatedAt)}`}
          </Typography>
          {project.phase.comment ? (
            <Typography variant="body2" sx={{ mt: 0.5, overflowWrap: 'anywhere' }}>
              {project.phase.comment}
            </Typography>
          ) : null}
        </Box>
        {!options ? null : phases.length === 0 ? (
          <EmptyState title="No hay fases configuradas" description="El administrador define las fases en el catálogo crm.fase_cliente." />
        ) : null}
      </Stack>

      <PhaseHistory projectId={project.id} />

      {project.capabilities.canEdit && options ? (
        <PhaseDialog
          open={open}
          project={project}
          options={options}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            setNotice('Fase actualizada.');
          }}
        />
      ) : null}
    </SectionCard>
  );
}
