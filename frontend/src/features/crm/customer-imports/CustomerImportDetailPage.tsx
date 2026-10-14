import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import SearchOffOutlinedIcon from '@mui/icons-material/SearchOffOutlined';
import { Alert, AlertTitle, Box, Button, Card, CircularProgress, LinearProgress, Skeleton, Stack, Typography } from '@mui/material';
import { useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { ConfirmDialog, DetailList, EmptyState, useTableQueryState } from '@/components/data';
import { PageHeader } from '@/components/layout/PageHeader';
import { crmBreadcrumbs } from '@/features/crm/common/crm-breadcrumbs';
import { useCan } from '@/hooks/use-permission';
import { saveFile } from '@/lib/save-file';
import { ROUTE_PATHS } from '@/routes/route-paths';
import { ApiError } from '@/services/api/api-error';

import { ConfirmImportDialog } from './components/ConfirmImportDialog';
import { ImportRowsTable, type RowFilterKey } from './components/ImportRowsTable';
import { ImportSteps } from './components/ImportSteps';
import { ImportStatusChip } from './components/ImportStatusChip';
import { ImportSummary } from './components/ImportSummary';
import {
  downloadCustomerImportErrorFile,
  type CustomerImport,
  type CustomerImportSettings,
} from './customer-imports.api';
import { describeFailureReason, describeImportError, withReference } from './customer-imports.errors';
import {
  formatCount,
  formatDateTime,
  formatImportFormat,
  importProgress,
  IMPORTS_DISABLED_NOTICE,
  pluralize,
  PURGED_VALUES_TEXT,
} from './customer-imports-format';
import { CUSTOMER_IMPORT_PERMISSIONS } from './customer-imports.permissions';
import {
  useCancelCustomerImport,
  useConfirmCustomerImport,
  useCustomerImport,
  useCustomerImportSettings,
  useRefreshRowsOnStatusChange,
} from './customer-imports.queries';

const TITLE = 'Detalle de carga';
const LIST_LABEL = 'Carga masiva de clientes';
const ROW_FILTER_KEYS: readonly RowFilterKey[] = ['view'];
const ROWS_PARAM_PREFIX = 'rows.';
const EXT_BY_FORMAT: Readonly<Record<string, string>> = { CSV: 'csv', XLSX: 'xlsx' };

function userAndDate(user: { displayName: string } | null, date: string | null): string {
  if (!user && !date) {
    return '—';
  }
  return [user?.displayName, date ? formatDateTime(date) : null].filter(Boolean).join(' · ');
}

interface StatusNoticeProps {
  data: CustomerImport;
  settings: CustomerImportSettings | undefined;
  onShowRejected: () => void;
}

/**
 * Aviso del estado de la carga (06 §E.4). Va dentro de una región `aria-live`:
 * el cambio de estado y el progreso de `IMPORTING` se anuncian.
 */
function StatusNotice({ data, settings, onShowRejected }: StatusNoticeProps): ReactNode {
  switch (data.status) {
    case 'UPLOADED':
    case 'VALIDATING':
      return (
        <Alert severity="info" role="status">
          <AlertTitle>Validando el archivo</AlertTitle>
          <LinearProgress aria-label="Validación en curso" sx={{ mt: 1 }} />
        </Alert>
      );
    case 'VALIDATED':
      if (data.validRows === 0) {
        return (
          <Alert severity="warning" role="status">
            <AlertTitle>No hay filas válidas para importar</AlertTitle>
            Revise las incidencias, corrija el archivo y súbalo de nuevo.
          </Alert>
        );
      }
      return (
        <Alert severity="info" role="status">
          <AlertTitle>Vista previa lista</AlertTitle>
          {settings && !settings.enabled
            ? `${IMPORTS_DISABLED_NOTICE}: la carga no se puede confirmar ni cancelar por ahora.`
            : 'Revise las filas y sus incidencias antes de confirmar la importación. Nada se crea hasta que confirme.'}
        </Alert>
      );
    case 'IMPORTING': {
      const progress = importProgress(data);
      return (
        <Alert severity="info" role="status">
          <AlertTitle>Importando clientes</AlertTitle>
          <Typography variant="body2">
            {`${formatCount(progress.processed)} de ${formatCount(progress.total)} filas procesadas (${formatCount(data.importedRows)} importadas, ${formatCount(data.rejectedRows)} rechazadas).`}
          </Typography>
          <LinearProgress variant="determinate" value={progress.percent} aria-label="Progreso de la importación" sx={{ mt: 1 }} />
        </Alert>
      );
    }
    case 'COMPLETED':
      return (
        <Alert severity="success" role="status">
          <AlertTitle>Importación completada</AlertTitle>
          {`Se crearon ${pluralize(data.importedRows, 'cliente', 'clientes')}.`}
        </Alert>
      );
    case 'COMPLETED_WITH_ERRORS':
      return (
        <Alert
          severity="warning"
          role="status"
          action={
            data.rejectedRows > 0 ? (
              <Button color="inherit" size="small" onClick={onShowRejected}>
                Ver rechazadas
              </Button>
            ) : undefined
          }
        >
          <AlertTitle>Importación completada con errores</AlertTitle>
          {`Se crearon ${pluralize(data.importedRows, 'cliente', 'clientes')}; ${pluralize(data.totalRows - data.importedRows, 'fila no se importó', 'filas no se importaron')}.`}
          {data.rejectedRows > 0 ? ` ${pluralize(data.rejectedRows, 'fila se rechazó', 'filas se rechazaron')} al confirmar.` : ''}
        </Alert>
      );
    case 'FAILED': {
      const reasons = describeFailureReason(data.failureReason, settings);
      return (
        <Alert severity="error" role="status">
          <AlertTitle>{data.confirmedAt ? 'La importación se interrumpió' : 'El archivo no se pudo validar'}</AlertTitle>
          {data.confirmedAt ? `Se importaron ${pluralize(data.importedRows, 'cliente', 'clientes')} antes del fallo.` : null}
          {reasons.length > 0 ? (
            <Box component="ul" aria-label="Motivo del fallo" sx={{ m: 0, mt: 1, pl: 2.5 }}>
              {reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </Box>
          ) : null}
        </Alert>
      );
    }
    case 'CANCELLED':
      return (
        <Alert severity="info" role="status">
          <AlertTitle>Carga cancelada</AlertTitle>
          No se importó ninguna fila. La vista previa es de solo lectura.
        </Alert>
      );
    default:
      return null;
  }
}

/**
 * Detalle de una carga (06 §E.4, AC-06.13–AC-06.15): vista previa,
 * confirmación y resultado en una sola pantalla según el estado. Mientras la
 * carga está en `IMPORTING` (o validándose) el detalle se consulta cada 2 s y
 * el progreso se anuncia. Las acciones salen de `canConfirm`/`canCancel`/
 * `hasErrorFile`, que el backend calcula con la misma regla que autoriza.
 */
export function CustomerImportDetailPage() {
  const { importId = '' } = useParams<{ importId: string }>();
  const navigate = useNavigate();
  const can = useCan();
  const detail = useCustomerImport(importId);
  const settings = useCustomerImportSettings();
  const confirm = useConfirmCustomerImport(importId);
  const cancel = useCancelCustomerImport(importId);
  const rowsTable = useTableQueryState<RowFilterKey>({ filterKeys: ROW_FILTER_KEYS, paramPrefix: ROWS_PARAM_PREFIX });
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [downloadingErrors, setDownloadingErrors] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  useRefreshRowsOnStatusChange(importId, detail.data?.status);

  const breadcrumbs = crmBreadcrumbs({ label: LIST_LABEL, to: ROUTE_PATHS.crm.customerImports.list }, { label: TITLE });

  if (detail.isPending) {
    return (
      <>
        <PageHeader title={TITLE} breadcrumbs={breadcrumbs} />
        <Card>
          <Stack role="status" aria-label="Cargando la carga" spacing={1.5} sx={{ p: 3 }}>
            <Skeleton variant="text" sx={{ width: '40%' }} />
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} variant="text" />
            ))}
          </Stack>
        </Card>
      </>
    );
  }

  if (detail.isError) {
    const notFound = detail.error instanceof ApiError && detail.error.isNotFound;
    return (
      <>
        <PageHeader title={TITLE} breadcrumbs={breadcrumbs} />
        <Card>
          {notFound ? (
            <EmptyState
              icon={<SearchOffOutlinedIcon />}
              title="Esta carga no existe o no tiene acceso"
              description="Puede que sea de otro usuario o que el enlace no sea correcto."
              action={<Button onClick={() => navigate(ROUTE_PATHS.crm.customerImports.list)}>Volver al historial</Button>}
            />
          ) : (
            <EmptyState
              role="alert"
              title="No se pudo cargar la carga"
              description={withReference(describeImportError(detail.error))}
              action={
                <Button variant="outlined" onClick={() => void detail.refetch()}>
                  Reintentar
                </Button>
              }
            />
          )}
        </Card>
      </>
    );
  }

  const data = detail.data;
  const isValidated = data.status === 'VALIDATED';
  const canCreate = can(CUSTOMER_IMPORT_PERMISSIONS.create);
  const canConfirmAction = isValidated && canCreate && can(CUSTOMER_IMPORT_PERMISSIONS.customersCreate);
  const showConfirm = canConfirmAction && (data.canConfirm || data.canCancel);
  const showCancel = isValidated && canCreate && data.canCancel;
  const showErrorFile = data.hasErrorFile && !data.isPurged;

  const downloadErrors = async () => {
    setDownloadError(null);
    setDownloadingErrors(true);
    try {
      const file = await downloadCustomerImportErrorFile(data.id);
      saveFile(file.blob, file.fileName ?? `errores-${data.code}.${EXT_BY_FORMAT[data.format] ?? 'csv'}`);
    } catch (error) {
      setDownloadError(`No se pudo descargar el archivo de errores. ${withReference(describeImportError(error))}`);
    } finally {
      setDownloadingErrors(false);
    }
  };

  const headerActions =
    showConfirm || showCancel || showErrorFile ? (
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
        {showErrorFile ? (
          <Button
            variant="outlined"
            color="inherit"
            startIcon={downloadingErrors ? <CircularProgress size="1em" color="inherit" /> : <DownloadOutlinedIcon />}
            onClick={() => void downloadErrors()}
            disabled={downloadingErrors}
            sx={{ borderColor: 'divider' }}
          >
            Descargar archivo de errores
          </Button>
        ) : null}
        {showCancel ? (
          <Button variant="outlined" color="error" onClick={() => setCancelling(true)}>
            Cancelar carga
          </Button>
        ) : null}
        {showConfirm ? (
          <Button
            onClick={() => {
              confirm.reset();
              setConfirming(true);
            }}
            disabled={!data.canConfirm}
          >
            Confirmar importación
          </Button>
        ) : null}
      </Stack>
    ) : undefined;

  return (
    <>
      <PageHeader title={TITLE} context={data.code} breadcrumbs={breadcrumbs} actions={headerActions} />

      <Stack spacing={2.5}>
        <Box aria-live="polite">
          <StatusNotice data={data} settings={settings.data} onShowRejected={() => rowsTable.setFilter('view', 'REJECTED')} />
        </Box>

        {data.isPurged ? (
          <Alert severity="info">
            {`${PURGED_VALUES_TEXT}: los estados, las incidencias y los contadores siguen visibles; el archivo de errores ya no está disponible.`}
          </Alert>
        ) : null}
        {downloadError ? (
          <Alert severity="error" onClose={() => setDownloadError(null)}>
            {downloadError}
          </Alert>
        ) : null}
        {cancel.isSuccess ? (
          <Alert severity="success" role="status" onClose={() => cancel.reset()}>
            {`Carga ${data.code} cancelada.`}
          </Alert>
        ) : null}

        <Card sx={{ p: { xs: 2, md: 2.5 } }}>
          <ImportSteps data={data} />
          <Box sx={{ mt: 2 }}>
            <DetailList
              items={[
                { label: 'Código', value: data.code },
                { label: 'Estado', value: <ImportStatusChip status={data.status} /> },
                { label: 'Archivo', value: data.originalFileName },
                { label: 'Formato', value: formatImportFormat(data.format) },
                { label: 'Iniciada por', value: userAndDate(data.startedBy, data.createdAt) },
                { label: 'Confirmada por', value: userAndDate(data.confirmedBy, data.confirmedAt) },
                { label: 'Terminada', value: formatDateTime(data.completedAt) },
              ]}
            />
          </Box>
        </Card>

        <ImportSummary data={data} />

        <ImportRowsTable
          importId={data.id}
          table={rowsTable}
          columns={settings.data?.columns}
          canViewCustomers={can(CUSTOMER_IMPORT_PERMISSIONS.customersView)}
        />
      </Stack>

      <ConfirmImportDialog
        open={confirming}
        data={data}
        isPending={confirm.isPending}
        errorMessage={confirm.isError ? withReference(describeImportError(confirm.error)) : null}
        onClose={() => setConfirming(false)}
        onConfirm={(input) => confirm.mutate(input, { onSuccess: () => setConfirming(false) })}
      />

      <ConfirmDialog
        open={cancelling}
        title={`¿Cancelar la carga ${data.code}?`}
        description="La carga quedará cancelada y no se importará ninguna fila. Esta acción no se puede deshacer."
        confirmLabel="Cancelar carga"
        cancelLabel="Volver"
        destructive
        isPending={cancel.isPending}
        errorMessage={cancel.isError ? withReference(describeImportError(cancel.error)) : null}
        onClose={() => {
          setCancelling(false);
          cancel.reset();
        }}
        onConfirm={() => cancel.mutate(undefined, { onSuccess: () => setCancelling(false) })}
      />
    </>
  );
}
