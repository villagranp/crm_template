import { Alert, Button, Card, CardContent, Link, Skeleton, Stack } from '@mui/material';
import { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';

import { EmptyState } from '@/components/data';
import { PageHeader } from '@/components/layout/PageHeader';
import { crmBreadcrumbs } from '@/features/crm/common/crm-breadcrumbs';
import { DUPLICATE_ERROR_CODES, isDuplicateError, parseDuplicateCandidates, type DuplicateCandidate } from '@/features/crm/common/duplicates';
import { PossibleDuplicateDialog } from '@/features/crm/common/PossibleDuplicateDialog';
import { useCan, usePermission } from '@/hooks/use-permission';
import { describeApiError } from '@/lib/api-error-view';
import { ROUTE_PATHS } from '@/routes/route-paths';
import { useAuthStore } from '@/stores/auth.store';

import { CustomerFilesField } from './components/CustomerFilesField';
import { CustomerForm, FormErrorAlert } from './components/CustomerForm';
import { emptyCustomerValues, toCreateCustomerInput } from './customer-form-values';
import { customerDetailPath } from './customer-paths';
import type { CreateCustomerInput } from './customers.api';
import { CUSTOMER_ERROR_MESSAGES, customerCodeConflict, fieldErrorsFromApiError } from './customers.errors';
import { CUSTOMER_PERMISSIONS } from './customers.permissions';
import { useCreateCustomer, useCustomerFormOptions } from './customers.queries';
import type { CustomerFormValues } from './customers.schemas';
import { stashPendingUploads } from './pending-uploads';

const TITLE = 'Nuevo cliente';

interface DuplicatePrompt {
  candidates: DuplicateCandidate[];
  blocked: boolean;
}

/** Estado de navegación que la ficha muestra como aviso al llegar. */
export interface CustomerCreatedState {
  createdMessage: string;
}

/**
 * Alta de cliente (02 §E.3, F-06). Ruta protegida con `clientes.crear`.
 *
 * Ante `409 POSSIBLE_DUPLICATE` pide confirmación y reenvía con
 * `acknowledgedDuplicateIds` (su presencia confirma, también los candidatos
 * que el usuario no ve). Los archivos elegidos se suben en la ficha después
 * del `201` (D-02.15).
 */
export function CustomerCreatePage() {
  const navigate = useNavigate();
  const can = useCan();
  const canChooseOwner = usePermission(CUSTOMER_PERMISSIONS.administer);
  const currentUserName = useAuthStore((state) => state.user?.displayName ?? '');
  const options = useCustomerFormOptions();
  const creation = useCreateCustomer();
  const [files, setFiles] = useState<File[]>([]);
  const [lastInput, setLastInput] = useState<CreateCustomerInput | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicatePrompt | null>(null);

  const goToList = () => navigate(ROUTE_PATHS.crm.customers);

  const send = (input: CreateCustomerInput) => {
    setLastInput(input);
    creation.mutate(input, {
      onSuccess: (customer) => {
        setDuplicates(null);
        stashPendingUploads(customer.id, files);
        const state: CustomerCreatedState = { createdMessage: `Cliente ${customer.crmCode} creado.` };
        navigate(customerDetailPath(customer.id), { state });
      },
      onError: (error) => {
        if (isDuplicateError(error)) {
          setDuplicates({
            candidates: parseDuplicateCandidates(error.details),
            blocked: error.code === DUPLICATE_ERROR_CODES.duplicateBlocked,
          });
        } else {
          setDuplicates(null);
        }
      },
    });
  };

  const onSubmit = (values: CustomerFormValues) => send(toCreateCustomerInput(values, canChooseOwner));

  const header = (
    <PageHeader title={TITLE} breadcrumbs={crmBreadcrumbs({ label: 'Clientes', to: ROUTE_PATHS.crm.customers }, { label: TITLE })} />
  );

  if (options.isPending) {
    return (
      <>
        {header}
        <Card>
          <CardContent>
            <Stack role="status" aria-label="Cargando el formulario" spacing={2}>
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} variant="rounded" sx={{ height: (theme) => theme.spacing(7) }} />
              ))}
            </Stack>
          </CardContent>
        </Card>
      </>
    );
  }

  if (options.isError) {
    const view = describeApiError(options.error);
    return (
      <>
        {header}
        <Card>
          <EmptyState
            role="alert"
            title="No se pudo cargar el formulario"
            description={`${view.message}${view.correlationId ? ` Referencia: ${view.correlationId}` : ''}`}
            action={
              <Button variant="outlined" onClick={() => void options.refetch()}>
                Reintentar
              </Button>
            }
          />
        </Card>
      </>
    );
  }

  const error = creation.isError && !duplicates ? creation.error : null;
  const errorView = error ? describeApiError(error, CUSTOMER_ERROR_MESSAGES) : null;
  const conflict = customerCodeConflict(error);
  const taxIdLabel = options.data.countries.find((country) => country.id === lastInput?.countryId)?.taxIdLabel;

  let conflictAction = null;
  if (conflict?.customerId) {
    const canRestore = conflict.isDeleted && can(CUSTOMER_PERMISSIONS.delete);
    if (!conflict.isDeleted || canRestore) {
      conflictAction = (
        <Link component={RouterLink} to={customerDetailPath(conflict.customerId)} sx={{ whiteSpace: 'nowrap', alignSelf: 'center' }}>
          {canRestore ? `Ver y restaurar ${conflict.crmCode ?? 'el cliente'}` : `Ver ${conflict.crmCode ?? 'el cliente'}`}
        </Link>
      );
    }
  }

  return (
    <>
      {header}
      <Card>
        <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
          <CustomerForm
            mode="create"
            options={options.data}
            initialValues={emptyCustomerValues(options.data)}
            canChooseOwner={canChooseOwner}
            fixedOwnerName={currentUserName}
            serverFieldErrors={error ? fieldErrorsFromApiError(error) : undefined}
            formError={
              errorView ? (
                <FormErrorAlert
                  message={
                    conflict?.isDeleted
                      ? 'Ese código de cliente lo tiene un cliente eliminado del mismo país.'
                      : errorView.message
                  }
                  correlationId={errorView.correlationId}
                  action={conflictAction}
                />
              ) : null
            }
            isPending={creation.isPending}
            submitLabel="Crear cliente"
            onCancel={goToList}
            onSubmit={onSubmit}
          >
            {options.data.attachments.enabled ? (
              <CustomerFilesField files={files} onChange={setFiles} limits={options.data.attachments} disabled={creation.isPending} />
            ) : (
              <Alert severity="info" sx={{ mt: 3 }}>
                Los adjuntos no están disponibles en este momento.
              </Alert>
            )}
          </CustomerForm>
        </CardContent>
      </Card>

      <PossibleDuplicateDialog
        open={duplicates !== null}
        entity="customer"
        candidates={duplicates?.candidates ?? []}
        blocked={duplicates?.blocked}
        taxIdLabel={taxIdLabel}
        getCandidateHref={customerDetailPath}
        isPending={creation.isPending}
        onReview={() => {
          setDuplicates(null);
          creation.reset();
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
