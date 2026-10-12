import { Button, Skeleton, Stack } from '@mui/material';
import { useMemo, useState } from 'react';

import { EmptyState, EntityDrawer } from '@/components/data';
import { DUPLICATE_ERROR_CODES, isDuplicateError, parseDuplicateCandidates, type DuplicateCandidate } from '@/features/crm/common/duplicates';
import { PossibleDuplicateDialog } from '@/features/crm/common/PossibleDuplicateDialog';
import { describeApiError } from '@/lib/api-error-view';

import { customerToFormValues, toUpdateCustomerInput } from '../customer-form-values';
import { customerDetailPath } from '../customer-paths';
import type { Customer, UpdateCustomerInput } from '../customers.api';
import { CUSTOMER_ERROR_MESSAGES, fieldErrorsFromApiError, withReference } from '../customers.errors';
import { useCustomerFormOptions, useUpdateCustomer } from '../customers.queries';
import type { CustomerFormValues } from '../customers.schemas';

import { CustomerForm, FormErrorAlert } from './CustomerForm';

export interface CustomerEditDrawerProps {
  open: boolean;
  customer: Customer;
  onClose: () => void;
  onSaved: (customer: Customer) => void;
}

interface DuplicatePrompt {
  candidates: DuplicateCandidate[];
  blocked: boolean;
}

/**
 * Edición del cliente en la ficha (02 §E.4). Los campos fuera de
 * `capabilities.editableFields` quedan deshabilitados con su explicación. Se
 * envía sólo lo que cambió, así que el aviso de NIT repetido sólo aparece si
 * se cambia el NIT o el país (RN-02.14).
 */
export function CustomerEditDrawer({ open, customer, onClose, onSaved }: CustomerEditDrawerProps) {
  const options = useCustomerFormOptions(open);
  const update = useUpdateCustomer(customer.id);
  const [lastInput, setLastInput] = useState<UpdateCustomerInput | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicatePrompt | null>(null);
  // Se recalculan al abrir para partir siempre de la ficha vigente.
  const initialValues = useMemo(() => customerToFormValues(customer), [customer]);

  const close = () => {
    update.reset();
    setDuplicates(null);
    onClose();
  };

  const send = (input: UpdateCustomerInput) => {
    setLastInput(input);
    update.mutate(input, {
      onSuccess: (saved) => {
        setDuplicates(null);
        update.reset();
        onSaved(saved);
      },
      onError: (error) => {
        setDuplicates(
          isDuplicateError(error)
            ? { candidates: parseDuplicateCandidates(error.details), blocked: error.code === DUPLICATE_ERROR_CODES.duplicateBlocked }
            : null,
        );
      },
    });
  };

  const onSubmit = (values: CustomerFormValues) => {
    const input = toUpdateCustomerInput(initialValues, values);
    if (Object.keys(input).length === 0) {
      close();
      return;
    }
    send(input);
  };

  const error = update.isError && !duplicates ? update.error : null;
  const errorView = error ? describeApiError(error, CUSTOMER_ERROR_MESSAGES) : null;
  const countryId = lastInput?.countryId ?? customer.country.id;
  const taxIdLabel = options.data?.countries.find((country) => country.id === countryId)?.taxIdLabel ?? customer.country.taxIdLabel;

  let body;
  if (options.isPending) {
    body = (
      <Stack role="status" aria-label="Cargando el formulario" spacing={2}>
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} variant="rounded" sx={{ height: (theme) => theme.spacing(7) }} />
        ))}
      </Stack>
    );
  } else if (options.isError) {
    body = (
      <EmptyState
        role="alert"
        title="No se pudo cargar el formulario"
        description={withReference(describeApiError(options.error))}
        action={
          <Button variant="outlined" onClick={() => void options.refetch()}>
            Reintentar
          </Button>
        }
      />
    );
  } else {
    body = (
      <CustomerForm
        key={customer.updatedAt}
        mode="edit"
        options={options.data}
        initialValues={initialValues}
        canChooseOwner={customer.capabilities.canReassignOwner}
        editableFields={customer.capabilities.editableFields}
        currentValues={{
          companyTypeId: customer.companyType,
          statusId: customer.status,
          ratingId: customer.rating,
        }}
        serverFieldErrors={error ? fieldErrorsFromApiError(error) : undefined}
        formError={errorView ? <FormErrorAlert message={errorView.message} correlationId={errorView.correlationId} /> : null}
        isPending={update.isPending}
        submitLabel="Guardar cambios"
        onCancel={close}
        onSubmit={onSubmit}
      />
    );
  }

  return (
    <>
      <EntityDrawer open={open} onClose={update.isPending ? () => undefined : close} title="Editar cliente" subtitle={`${customer.crmCode} · ${customer.legalName}`}>
        {body}
      </EntityDrawer>
      <PossibleDuplicateDialog
        open={open && duplicates !== null}
        entity="customer"
        candidates={duplicates?.candidates ?? []}
        blocked={duplicates?.blocked}
        taxIdLabel={taxIdLabel}
        getCandidateHref={customerDetailPath}
        isPending={update.isPending}
        onReview={() => {
          setDuplicates(null);
          update.reset();
        }}
        onConfirm={(ids) => {
          if (lastInput) {
            send({ ...lastInput, acknowledgedDuplicateIds: ids });
          }
        }}
      />
    </>
  );
}
