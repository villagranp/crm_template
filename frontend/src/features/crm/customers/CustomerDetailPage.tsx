import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import RestoreIcon from '@mui/icons-material/Restore';
import SearchOffOutlinedIcon from '@mui/icons-material/SearchOffOutlined';
import { Alert, Button, Card, Skeleton, Stack } from '@mui/material';
import { useCallback, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import { ConfirmDialog, EmptyState } from '@/components/data';
import { PageHeader } from '@/components/layout/PageHeader';
import { CommercialActivitySection, NewActivityButton, PlanVisitButton } from '@/features/crm/commercial-activity/entry-points';
import { AttachmentsSection } from '@/features/crm/common/AttachmentsSection';
import { crmBreadcrumbs } from '@/features/crm/common/crm-breadcrumbs';
import { CRM_MODULE_OPTION_KEYS, useModuleAvailability } from '@/features/crm/common/use-module-availability';
import { useCan } from '@/hooks/use-permission';
import { describeApiError } from '@/lib/api-error-view';
import { ROUTE_PATHS } from '@/routes/route-paths';
import { ApiError } from '@/services/api/api-error';

import { CustomerContactsSection } from './components/CustomerContactsSection';
import { CustomerEditDrawer } from './components/CustomerEditDrawer';
import { CustomerGeneralSection } from './components/CustomerGeneralSection';
import { CustomerProjectsSection } from './components/CustomerProjectsSection';
import { CustomerStatusChip } from './components/CustomerStatusChip';
import type { CustomerCreatedState } from './CustomerCreatePage';
import { customerAttachmentsPath } from './customers.api';
import { CUSTOMER_ERROR_MESSAGES, describeDependencies, withReference } from './customers.errors';
import { CONTACT_PERMISSIONS, RELATED_PERMISSIONS } from './customers.permissions';
import { useCustomer, useCustomerFormOptions, useDeleteCustomer, useRestoreCustomer } from './customers.queries';
import { takePendingUploads } from './pending-uploads';

function isCreatedState(state: unknown): state is CustomerCreatedState {
  return typeof state === 'object' && state !== null && typeof (state as CustomerCreatedState).createdMessage === 'string';
}

/**
 * Ficha del cliente (02 §E.4, F-07 a F-09). Ruta protegida con `clientes.ver`.
 *
 * Cada sección carga y falla por separado. Las acciones salen de las
 * `capabilities` del cliente (las calcula el backend con la misma política que
 * aplica); ocultarlas es experiencia de usuario, no seguridad.
 */
export function CustomerDetailPage() {
  const { customerId = '' } = useParams<{ customerId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const can = useCan();
  const customer = useCustomer(customerId);
  const formOptions = useCustomerFormOptions(customer.isSuccess);
  const activities = useModuleAvailability(CRM_MODULE_OPTION_KEYS.activities);
  const removal = useDeleteCustomer(customerId);
  const restore = useRestoreCustomer();
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [notice, setNotice] = useState<string | null>(isCreatedState(location.state) ? location.state.createdMessage : null);
  const takeInitialFiles = useCallback(() => takePendingUploads(customerId), [customerId]);

  const breadcrumbs = crmBreadcrumbs({ label: 'Clientes', to: ROUTE_PATHS.crm.customers }, { label: 'Ficha' });

  if (customer.isPending) {
    return (
      <>
        <PageHeader title="Ficha del cliente" breadcrumbs={breadcrumbs} />
        <Card>
          <Stack role="status" aria-label="Cargando el cliente" spacing={1.5} sx={{ p: 3 }}>
            <Skeleton variant="text" sx={{ width: '40%' }} />
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} variant="text" />
            ))}
          </Stack>
        </Card>
      </>
    );
  }

  if (customer.isError) {
    const notFound = customer.error instanceof ApiError && customer.error.isNotFound;
    return (
      <>
        <PageHeader title="Ficha del cliente" breadcrumbs={breadcrumbs} />
        <Card>
          {notFound ? (
            <EmptyState
              icon={<SearchOffOutlinedIcon />}
              title="Este cliente no existe o no tienes acceso"
              description="Puede que lo hayan eliminado o que no esté en tu alcance."
              action={<Button onClick={() => navigate(ROUTE_PATHS.crm.customers)}>Volver a la búsqueda</Button>}
            />
          ) : (
            <EmptyState
              role="alert"
              title="No se pudo cargar el cliente"
              description={withReference(describeApiError(customer.error, CUSTOMER_ERROR_MESSAGES))}
              action={
                <Button variant="outlined" onClick={() => void customer.refetch()}>
                  Reintentar
                </Button>
              }
            />
          )}
        </Card>
      </>
    );
  }

  const data = customer.data;
  const { capabilities } = data;
  // Puntos de entrada del Módulo 4 (04 §E.11): cada uno se oculta sin su permiso.
  const showCommercialActivity = !data.isDeleted && activities.isAvailable;
  const phonePattern = formOptions.data?.countries.find((country) => country.id === data.country.id)?.phonePattern ?? null;
  const dependencies = describeDependencies(removal.error);
  const deleteError = removal.isError
    ? dependencies
      ? `No se puede eliminar: el cliente tiene ${dependencies}. Puedes desactivarlo cambiando su estado.`
      : withReference(describeApiError(removal.error, CUSTOMER_ERROR_MESSAGES))
    : null;
  const restoreError = restore.isError ? withReference(describeApiError(restore.error, CUSTOMER_ERROR_MESSAGES)) : null;

  const actions = (
    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
      {showCommercialActivity ? (
        <>
          <NewActivityButton customerId={data.id} />
          <PlanVisitButton customerId={data.id} />
        </>
      ) : null}
      {capabilities.canEdit && !data.isDeleted ? (
        <Button startIcon={<EditOutlinedIcon />} onClick={() => setEditing(true)}>
          Editar
        </Button>
      ) : null}
      {capabilities.canDelete && !data.isDeleted ? (
        <Button
          variant="outlined"
          color="error"
          startIcon={<DeleteOutlineIcon />}
          onClick={() => {
            removal.reset();
            setConfirmingDelete(true);
          }}
        >
          Eliminar
        </Button>
      ) : null}
      {data.isDeleted && capabilities.canRestore ? (
        <Button
          startIcon={<RestoreIcon />}
          disabled={restore.isPending}
          onClick={() => restore.mutate(data.id, { onSuccess: (saved) => setNotice(`Cliente ${saved.crmCode} restaurado.`) })}
        >
          Restaurar
        </Button>
      ) : null}
    </Stack>
  );

  return (
    <>
      <PageHeader
        title={data.legalName}
        context={data.crmCode}
        subtitle={`Responsable: ${data.salesOwner.displayName}`}
        breadcrumbs={breadcrumbs}
        actions={actions}
        metrics={
          data.isDeleted ? undefined : <CustomerStatusChip label={data.status.label} isActive={data.status.isActive} />
        }
      />

      <Stack spacing={2.5}>
        {notice ? (
          <Alert severity="success" role="status" onClose={() => setNotice(null)}>
            {notice}
          </Alert>
        ) : null}
        {data.isDeleted ? (
          <Alert severity="warning">
            {capabilities.canRestore
              ? 'Este cliente está eliminado. Puedes restaurarlo para que vuelva a las búsquedas.'
              : 'Este cliente está eliminado.'}
          </Alert>
        ) : null}
        {restoreError ? (
          <Alert severity="error" onClose={() => restore.reset()}>
            {`No se pudo restaurar el cliente. ${restoreError}`}
          </Alert>
        ) : null}

        <CustomerGeneralSection customer={data} />

        {can(CONTACT_PERMISSIONS.view) && !data.isDeleted ? <CustomerContactsSection customer={data} phonePattern={phonePattern} /> : null}

        {can(RELATED_PERMISSIONS.viewProjects) ? <CustomerProjectsSection customerId={data.id} /> : null}

        {showCommercialActivity ? <CommercialActivitySection customerId={data.id} /> : null}

        {!data.isDeleted ? (
          <AttachmentsSection
            basePath={customerAttachmentsPath(data.id)}
            canManage={capabilities.canManageAttachments}
            limits={formOptions.data?.attachments}
            emptyMessage="Este cliente no tiene adjuntos"
            takeInitialFiles={takeInitialFiles}
          />
        ) : null}
      </Stack>

      {capabilities.canEdit ? (
        <CustomerEditDrawer
          open={editing}
          customer={data}
          onClose={() => setEditing(false)}
          onSaved={(saved) => {
            setEditing(false);
            setNotice(`Cliente ${saved.crmCode} actualizado.`);
          }}
        />
      ) : null}

      <ConfirmDialog
        open={confirmingDelete}
        destructive
        title="Eliminar cliente"
        description={`«${data.legalName}» dejará de aparecer en las búsquedas. La eliminación es lógica: sus contactos, adjuntos e historia se conservan y se puede restaurar.`}
        confirmLabel="Eliminar"
        isPending={removal.isPending}
        errorMessage={deleteError}
        onConfirm={() =>
          removal.mutate(undefined, {
            onSuccess: () => navigate(ROUTE_PATHS.crm.customers),
          })
        }
        onClose={() => {
          setConfirmingDelete(false);
          removal.reset();
        }}
      />
    </>
  );
}
