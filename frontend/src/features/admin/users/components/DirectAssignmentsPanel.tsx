import { zodResolver } from '@hookform/resolvers/zod';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import {
  Alert,
  Autocomplete,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
  type Theme,
} from '@mui/material';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { Controller, useForm } from 'react-hook-form';

import { ConfirmDialog, EmptyState, REASON_MIN_LENGTH } from '@/features/admin/common';

import { EFFECT_LABEL, formatDate } from '../users-format';
import type { AssignmentEffect, DirectAssignmentRequest } from '../users.api';
import { directAssignmentSchema, type DirectAssignmentFormValues } from '../users.schemas';

export interface AssignmentItem {
  targetId: string;
  label: string;
  secondary: string;
  effect: AssignmentEffect;
  reason: string;
  expiresAt: string | null;
}

export interface AssignmentTarget {
  id: string;
  label: string;
  group?: string;
}

export interface DirectAssignmentsPanelProps {
  /** "permiso" u "opción de menú", para los textos. */
  noun: string;
  items: AssignmentItem[];
  targets: AssignmentTarget[];
  canEdit: boolean;
  isPending: boolean;
  errorMessage: string | null;
  /** Reemplaza el conjunto completo; `onDone` cierra el diálogo abierto. */
  onReplace: (assignments: DirectAssignmentRequest[], onDone: () => void) => void;
  onResetError: () => void;
}

function isExpired(item: AssignmentItem): boolean {
  return item.expiresAt !== null && new Date(item.expiresAt).getTime() <= Date.now();
}

/** Las vigentes, listas para reenviar: una caducada ya no tiene efecto y el backend no admite caducidades pasadas. */
function currentRequests(items: AssignmentItem[], exceptTargetId?: string): DirectAssignmentRequest[] {
  return items
    .filter((item) => !isExpired(item) && item.targetId !== exceptTargetId)
    .map((item) => ({
      targetId: item.targetId,
      effect: item.effect,
      reason: item.reason,
      ...(item.expiresAt ? { expiresAt: item.expiresAt } : {}),
    }));
}

const EMPTY_FORM: DirectAssignmentFormValues = { targetId: '', effect: 'GRANT', reason: '', expiresAt: '' };

/**
 * Excepciones directas sobre el modelo de roles (ADR-018 §4, PLAN-ADMIN D5):
 * cada una con efecto (conceder o denegar), razón obligatoria y caducidad
 * opcional. Se guardan reemplazando el conjunto completo.
 */
export function DirectAssignmentsPanel({
  noun,
  items,
  targets,
  canEdit,
  isPending,
  errorMessage,
  onReplace,
  onResetError,
}: DirectAssignmentsPanelProps) {
  const [adding, setAdding] = useState(false);
  const [toRemove, setToRemove] = useState<AssignmentItem | null>(null);

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between">
        <Typography variant="body2" color="text.secondary">
          Una denegación gana siempre sobre lo que concedan sus roles.
        </Typography>
        {canEdit ? (
          <Button
            startIcon={<AddIcon />}
            variant="outlined"
            onClick={() => {
              onResetError();
              setAdding(true);
            }}
          >
            Añadir excepción
          </Button>
        ) : null}
      </Stack>

      {items.length === 0 ? (
        <EmptyState title="Sin excepciones" description={`No tiene ningún ${noun} asignado directamente.`} />
      ) : (
        <List aria-label={`Excepciones de ${noun}`} disablePadding>
          {items.map((item) => (
            <ListItem
              key={item.targetId}
              divider
              secondaryAction={
                canEdit ? (
                  <IconButton
                    edge="end"
                    aria-label={`Quitar ${item.label}`}
                    onClick={() => {
                      onResetError();
                      setToRemove(item);
                    }}
                  >
                    <DeleteOutlineIcon />
                  </IconButton>
                ) : undefined
              }
            >
              <ListItemText
                primary={
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                    <span>{item.label}</span>
                    <Chip size="small" color={item.effect === 'DENY' ? 'error' : 'success'} label={EFFECT_LABEL[item.effect]} />
                    {isExpired(item) ? <Chip size="small" variant="outlined" label="Caducada" /> : null}
                  </Stack>
                }
                secondary={`${item.secondary} · ${item.reason} · ${item.expiresAt ? `Hasta ${formatDate(item.expiresAt)}` : 'Sin caducidad'}`}
              />
            </ListItem>
          ))}
        </List>
      )}

      <AssignmentFormDialog
        open={adding}
        noun={noun}
        targets={targets}
        isPending={isPending}
        errorMessage={errorMessage}
        onClose={() => setAdding(false)}
        onSubmit={(values) =>
          onReplace(
            [
              ...currentRequests(items, values.targetId),
              {
                targetId: values.targetId,
                effect: values.effect,
                reason: values.reason.trim(),
                ...(values.expiresAt ? { expiresAt: new Date(values.expiresAt).toISOString() } : {}),
              },
            ],
            () => setAdding(false),
          )
        }
      />

      <ConfirmDialog
        open={toRemove !== null}
        title={`Quitar ${noun}`}
        description={toRemove ? `Se retirará la excepción sobre «${toRemove.label}». El cambio queda en la bitácora.` : undefined}
        confirmLabel="Quitar"
        destructive
        isPending={isPending}
        errorMessage={toRemove ? errorMessage : null}
        onClose={() => setToRemove(null)}
        onConfirm={() => {
          if (toRemove) {
            onReplace(currentRequests(items, toRemove.targetId), () => setToRemove(null));
          }
        }}
      />
    </Stack>
  );
}

interface AssignmentFormDialogProps {
  open: boolean;
  noun: string;
  targets: AssignmentTarget[];
  isPending: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onSubmit: (values: DirectAssignmentFormValues) => void;
}

function AssignmentFormDialog({ open, noun, targets, isPending, errorMessage, onClose, onSubmit }: AssignmentFormDialogProps) {
  const titleId = useId();
  const fullScreen = useMediaQuery((theme: Theme) => theme.breakpoints.down('sm'));
  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<DirectAssignmentFormValues>({ resolver: zodResolver(directAssignmentSchema), defaultValues: EMPTY_FORM });

  useEffect(() => {
    if (open) {
      reset(EMPTY_FORM);
    }
  }, [open, reset]);

  const submit = handleSubmit(onSubmit);

  return (
    <Dialog
      open={open}
      onClose={isPending ? undefined : onClose}
      aria-labelledby={titleId}
      fullScreen={fullScreen}
      fullWidth
      maxWidth="sm"
      PaperProps={{
        component: 'form',
        noValidate: true,
        onSubmit: (event: FormEvent<HTMLFormElement>) => {
          void submit(event);
        },
      }}
    >
      <DialogTitle id={titleId}>Nueva excepción de {noun}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Controller
            control={control}
            name="targetId"
            render={({ field }) => (
              <Autocomplete
                options={targets}
                groupBy={(option) => option.group ?? ''}
                getOptionLabel={(option) => option.label}
                value={targets.find((target) => target.id === field.value) ?? null}
                onChange={(_, value) => field.onChange(value?.id ?? '')}
                disabled={isPending}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label={noun.charAt(0).toUpperCase() + noun.slice(1)}
                    required
                    error={Boolean(errors.targetId)}
                    helperText={errors.targetId?.message}
                  />
                )}
              />
            )}
          />
          <Controller
            control={control}
            name="effect"
            render={({ field }) => (
              <RadioGroup row aria-label="Efecto" value={field.value} onChange={(event) => field.onChange(event.target.value)}>
                <FormControlLabel value="GRANT" control={<Radio />} label="Conceder" disabled={isPending} />
                <FormControlLabel value="DENY" control={<Radio />} label="Denegar" disabled={isPending} />
              </RadioGroup>
            )}
          />
          <TextField
            {...register('reason')}
            label="Razón"
            required
            multiline
            minRows={2}
            disabled={isPending}
            error={Boolean(errors.reason)}
            helperText={errors.reason?.message ?? `Obligatoria, mínimo ${REASON_MIN_LENGTH} caracteres. Queda en la bitácora.`}
          />
          <TextField
            {...register('expiresAt')}
            label="Caduca el"
            type="date"
            disabled={isPending}
            InputLabelProps={{ shrink: true }}
            error={Boolean(errors.expiresAt)}
            helperText={errors.expiresAt?.message ?? 'Opcional. Vacío = sin caducidad.'}
          />
          {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button variant="text" onClick={onClose} disabled={isPending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isPending}>
          Añadir
        </Button>
      </DialogActions>
    </Dialog>
  );
}
