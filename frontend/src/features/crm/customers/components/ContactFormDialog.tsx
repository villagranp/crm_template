import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Checkbox, FormControlLabel, FormHelperText, Box, Switch, TextField, Typography } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';

import { DialogFooter, EntityDialog, FormSection, FullRow } from '@/components/data';
import { DUPLICATE_ERROR_CODES, isDuplicateError, parseDuplicateCandidates, type DuplicateCandidate } from '@/features/crm/common/duplicates';
import { PossibleDuplicateDialog } from '@/features/crm/common/PossibleDuplicateDialog';
import { describeApiError } from '@/lib/api-error-view';

import type { Contact, CreateContactInput, UpdateContactInput } from '../customers.api';
import { CUSTOMER_ERROR_MESSAGES, fieldErrorsFromApiError, withReference } from '../customers.errors';
import { useClearPrimaryContact, useCreateContact, useSetPrimaryContact, useUpdateContact } from '../customers.queries';
import { buildContactFormSchema, CONTACT_LIMITS, type ContactFormValues } from '../customers.schemas';

export interface ContactFormDialogProps {
  open: boolean;
  customer: { id: string; legalName: string; crmCode: string };
  /** Patrón de teléfono del país del cliente (`form-options.countries[].phonePattern`). */
  phonePattern?: string | null;
  /** `null` = alta. */
  contact: Contact | null;
  onClose: () => void;
  /** Tras guardar, con el nombre del contacto para el aviso. */
  onSaved?: (fullName: string) => void;
}

interface DuplicatePrompt {
  candidates: DuplicateCandidate[];
  blocked: boolean;
}

const CONTACT_FIELDS: readonly (keyof ContactFormValues)[] = ['firstName', 'lastName', 'jobTitle', 'phone', 'email', 'comments', 'isActive', 'isPrimary'];

function defaults(contact: Contact | null): ContactFormValues {
  return {
    firstName: contact?.firstName ?? '',
    lastName: contact?.lastName ?? '',
    jobTitle: contact?.jobTitle ?? '',
    phone: contact?.phone ?? '',
    email: contact?.email ?? '',
    isActive: contact?.isActive ?? true,
    comments: contact?.comments ?? '',
    isPrimary: contact?.isPrimary ?? false,
  };
}

function optional(value: string): string | null {
  return value.trim() ? value.trim() : null;
}

function toCreateInput(values: ContactFormValues): CreateContactInput {
  return {
    firstName: values.firstName.trim(),
    lastName: values.lastName.trim(),
    jobTitle: optional(values.jobTitle),
    phone: optional(values.phone),
    email: optional(values.email),
    isActive: values.isActive,
    comments: optional(values.comments),
    isPrimary: values.isPrimary,
  };
}

/** Sólo lo que cambió (el principal se cambia aparte, con F13/F14). */
function toUpdateInput(contact: Contact, values: ContactFormValues): UpdateContactInput {
  const before = defaults(contact);
  const input: UpdateContactInput = {};
  if (values.firstName.trim() !== before.firstName) input.firstName = values.firstName.trim();
  if (values.lastName.trim() !== before.lastName) input.lastName = values.lastName.trim();
  if (optional(values.jobTitle) !== optional(before.jobTitle)) input.jobTitle = optional(values.jobTitle);
  if (optional(values.phone) !== optional(before.phone)) input.phone = optional(values.phone);
  if (optional(values.email) !== optional(before.email)) input.email = optional(values.email);
  if (optional(values.comments) !== optional(before.comments)) input.comments = optional(values.comments);
  if (values.isActive !== before.isActive) input.isActive = values.isActive;
  return input;
}

/**
 * Alta y edición de un contacto del cliente (02 §E.5). El cliente es fijo (el
 * de la ficha). `CONTACT_EMAIL_TAKEN` se pinta en el correo; `POSSIBLE_DUPLICATE`
 * abre la confirmación y reenvía con `acknowledgedDuplicateIds`.
 */
export function ContactFormDialog({ open, customer, phonePattern, contact, onClose, onSaved }: ContactFormDialogProps) {
  const isEdit = contact !== null;
  const createMutation = useCreateContact(customer.id);
  const updateMutation = useUpdateContact(customer.id);
  const setPrimary = useSetPrimaryContact(customer.id);
  const clearPrimary = useClearPrimaryContact(customer.id);
  const mutation = isEdit ? updateMutation : createMutation;
  const [duplicates, setDuplicates] = useState<DuplicatePrompt | null>(null);
  const [pendingValues, setPendingValues] = useState<ContactFormValues | null>(null);

  const schema = useMemo(() => buildContactFormSchema(phonePattern), [phonePattern]);
  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    watch,
    formState: { errors },
  } = useForm<ContactFormValues>({ resolver: zodResolver(schema), defaultValues: defaults(contact) });

  useEffect(() => {
    if (open) {
      reset(defaults(contact));
      createMutation.reset();
      updateMutation.reset();
      setPrimary.reset();
      clearPrimary.reset();
      setDuplicates(null);
      setPendingValues(null);
    }
    // Se reinicia sólo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, contact, reset]);

  const finish = (fullName: string) => {
    setDuplicates(null);
    onSaved?.(fullName);
    onClose();
  };

  const onError = (error: unknown) => {
    if (isDuplicateError(error)) {
      setDuplicates({ candidates: parseDuplicateCandidates(error.details), blocked: error.code === DUPLICATE_ERROR_CODES.duplicateBlocked });
      return;
    }
    setDuplicates(null);
    for (const [field, message] of Object.entries(fieldErrorsFromApiError(error))) {
      if ((CONTACT_FIELDS as readonly string[]).includes(field)) {
        setError(field as keyof ContactFormValues, { type: 'server', message });
      }
    }
  };

  const send = (values: ContactFormValues, acknowledgedDuplicateIds?: string[]) => {
    setPendingValues(values);
    if (!contact) {
      const input = toCreateInput(values);
      createMutation.mutate(acknowledgedDuplicateIds ? { ...input, acknowledgedDuplicateIds } : input, {
        onSuccess: (saved) => finish(saved.fullName),
        onError,
      });
      return;
    }
    const input = toUpdateInput(contact, values);
    const primaryChanged = values.isPrimary !== contact.isPrimary;
    const afterUpdate = (saved: Contact) => {
      if (!primaryChanged || (!values.isActive && !values.isPrimary)) {
        finish(saved.fullName);
        return;
      }
      const primaryMutation = values.isPrimary
        ? () => setPrimary.mutate(contact.id, { onSuccess: () => finish(saved.fullName) })
        : () => clearPrimary.mutate(undefined, { onSuccess: () => finish(saved.fullName) });
      primaryMutation();
    };
    if (Object.keys(input).length === 0) {
      afterUpdate(contact);
      return;
    }
    updateMutation.mutate(
      { contactId: contact.id, input: acknowledgedDuplicateIds ? { ...input, acknowledgedDuplicateIds } : input },
      { onSuccess: afterUpdate, onError },
    );
  };

  const isActive = watch('isActive');
  const isPending = mutation.isPending || setPrimary.isPending || clearPrimary.isPending;
  const primaryError = setPrimary.isError ? setPrimary.error : clearPrimary.isError ? clearPrimary.error : null;
  const visibleError = (mutation.isError && !duplicates ? mutation.error : null) ?? primaryError;
  const errorView = visibleError ? describeApiError(visibleError, CUSTOMER_ERROR_MESSAGES) : null;

  return (
    <>
      <EntityDialog
        open={open && duplicates === null}
        onClose={isPending ? undefined : onClose}
        title={isEdit ? `Editar contacto ${contact.fullName}` : 'Nuevo contacto'}
        subtitle={`${customer.crmCode} · ${customer.legalName}`}
        requiredNote
        onSubmit={(event) => {
          void handleSubmit((values) => send(values))(event);
        }}
        actions={<DialogFooter onCancel={onClose} submitLabel={isEdit ? 'Guardar cambios' : 'Crear contacto'} pending={isPending} />}
      >
        {errorView ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {withReference(errorView)}
          </Alert>
        ) : null}
        <FormSection number={1} title="Datos del contacto">
          <TextField
            {...register('firstName')}
            label="Nombre"
            required
            disabled={isPending}
            error={Boolean(errors.firstName)}
            helperText={errors.firstName?.message}
            slotProps={{ htmlInput: { maxLength: CONTACT_LIMITS.firstName } }}
          />
          <TextField
            {...register('lastName')}
            label="Apellidos"
            required
            disabled={isPending}
            error={Boolean(errors.lastName)}
            helperText={errors.lastName?.message}
            slotProps={{ htmlInput: { maxLength: CONTACT_LIMITS.lastName } }}
          />
          <TextField
            {...register('jobTitle')}
            label="Cargo"
            disabled={isPending}
            error={Boolean(errors.jobTitle)}
            helperText={errors.jobTitle?.message}
            slotProps={{ htmlInput: { maxLength: CONTACT_LIMITS.jobTitle } }}
          />
          <TextField
            {...register('phone')}
            label="Teléfono"
            type="tel"
            disabled={isPending}
            error={Boolean(errors.phone)}
            helperText={errors.phone?.message}
            slotProps={{ htmlInput: { maxLength: CONTACT_LIMITS.phone } }}
          />
          <FullRow>
            <TextField
              {...register('email')}
              label="Correo electrónico"
              type="email"
              disabled={isPending}
              error={Boolean(errors.email)}
              helperText={errors.email?.message ?? 'No puede repetirse entre los contactos de este cliente.'}
              slotProps={{ htmlInput: { maxLength: CONTACT_LIMITS.email } }}
            />
          </FullRow>
          <FullRow>
            <TextField
              {...register('comments')}
              label="Comentarios"
              multiline
              minRows={2}
              disabled={isPending}
              error={Boolean(errors.comments)}
              helperText={errors.comments?.message}
              slotProps={{ htmlInput: { maxLength: CONTACT_LIMITS.comments } }}
            />
          </FullRow>
        </FormSection>
        <FormSection number={2} title="Estado">
          <Box>
            <Typography variant="body2" color="text.secondary">
              Cliente
            </Typography>
            <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{`${customer.crmCode} · ${customer.legalName}`}</Typography>
          </Box>
          <Controller
            control={control}
            name="isActive"
            render={({ field }) => (
              <FormControlLabel
                control={<Switch checked={field.value} onChange={(event) => field.onChange(event.target.checked)} disabled={isPending} />}
                label="Activo"
              />
            )}
          />
          <FullRow>
            <Controller
              control={control}
              name="isPrimary"
              render={({ field }) => (
                <Box>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={field.value}
                        onChange={(event) => field.onChange(event.target.checked)}
                        disabled={isPending || !isActive}
                      />
                    }
                    label="Marcar como principal"
                  />
                  <FormHelperText error={Boolean(errors.isPrimary)}>
                    {errors.isPrimary?.message ??
                      (isActive ? 'Sustituye al contacto principal actual, si lo hay.' : 'Un contacto inactivo no puede ser el principal.')}
                  </FormHelperText>
                </Box>
              )}
            />
          </FullRow>
        </FormSection>
      </EntityDialog>

      <PossibleDuplicateDialog
        open={open && duplicates !== null}
        entity="contact"
        candidates={duplicates?.candidates ?? []}
        blocked={duplicates?.blocked}
        isPending={isPending}
        onReview={() => {
          setDuplicates(null);
          mutation.reset();
        }}
        onConfirm={(ids) => {
          if (pendingValues) {
            send(pendingValues, ids);
          }
        }}
      />
    </>
  );
}
