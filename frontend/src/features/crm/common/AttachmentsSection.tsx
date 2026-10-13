import AttachFileOutlinedIcon from '@mui/icons-material/AttachFileOutlined';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import {
  Alert,
  Box,
  Button,
  Card,
  IconButton,
  LinearProgress,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';

import { ConfirmDialog, DataTable, DEFAULT_PAGE_SIZE, type DataTableColumn } from '@/components/data';
import { describeApiError } from '@/lib/api-error-view';

import { attachmentTypeLabel, formatAttachmentDate, formatFileSize } from './attachment-format';
import type { AttachmentDto, AttachmentLimits } from './attachments.api';
import { useAttachments, useDeleteAttachment, useDownloadAttachment } from './attachments.queries';
import { useAttachmentUploads, type UploadItem } from './use-attachment-uploads';

export interface AttachmentsSectionProps {
  /** Ruta base de los adjuntos del dueño, p. ej. `/customers/{id}/attachments`. */
  basePath: string;
  /**
   * Puede subir y eliminar (`capabilities.canManageAttachments` del dueño).
   * Ocultar es experiencia de usuario: el backend vuelve a exigir el permiso.
   */
  canManage: boolean;
  /**
   * Puede eliminar; por defecto, lo mismo que `canManage`. Los adjuntos de un
   * evento de visita se suben pero no se eliminan (historia, 04 §F.4): ahí va `false`.
   */
  canDelete?: boolean;
  /** `form-options.attachments`: límites para ayudar antes de subir y para el selector de archivos. */
  limits?: AttachmentLimits;
  title?: string;
  /** Texto del estado vacío (p. ej. "Este cliente no tiene adjuntos"). */
  emptyMessage?: string;
  /**
   * Archivos elegidos antes de que existiera el dueño (p. ej. en el alta del
   * cliente, D-02.15): se llama una vez al montar y lo que devuelve se encola
   * como una subida más, con su progreso y su error por archivo en esta
   * sección. Debe "consumir" los archivos para no subirlos dos veces.
   */
  takeInitialFiles?: () => readonly File[];
}

function UploadRow({ upload, onDismiss }: { upload: UploadItem; onDismiss: (key: string) => void }) {
  if (upload.status === 'error') {
    return (
      <Alert
        severity="error"
        action={
          <IconButton aria-label={`Descartar el aviso de ${upload.fileName}`} size="small" onClick={() => onDismiss(upload.key)}>
            <CloseIcon fontSize="small" />
          </IconButton>
        }
      >
        <Typography variant="body2" component="span" sx={{ fontWeight: 'fontWeightMedium', overflowWrap: 'anywhere' }}>
          {upload.fileName}
        </Typography>
        {': '}
        {upload.errorMessage}
      </Alert>
    );
  }

  const label = upload.status === 'queued' ? 'En espera' : upload.percent === null ? 'Subiendo…' : `${upload.percent} %`;
  return (
    <Box>
      <Stack direction="row" spacing={1} justifyContent="space-between" alignItems="baseline">
        <Typography variant="body2" sx={{ overflowWrap: 'anywhere', minWidth: 0 }}>
          {upload.fileName}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
          {label}
        </Typography>
      </Stack>
      <LinearProgress
        aria-label={`Subiendo ${upload.fileName}`}
        variant={upload.status === 'uploading' && upload.percent !== null ? 'determinate' : 'indeterminate'}
        value={upload.percent ?? undefined}
        sx={{ mt: 0.5 }}
      />
    </Box>
  );
}

/**
 * Adjuntos de un registro del CRM (02 §E.4; reutilizable por Proyectos y
 * Actividad con su propia ruta base): lista con descarga, subida con progreso
 * y error por archivo, y eliminación con confirmación.
 *
 * Estados: cargando y error con reintento (los pinta `DataTable`), vacío,
 * subida en curso y fallo por archivo (`413 ATTACHMENT_TOO_LARGE`, `422
 * ATTACHMENT_TYPE_NOT_ALLOWED`). La descarga pasa por el cliente HTTP con el
 * token (nunca un `<a href>` a la API) y se guarda como archivo, nunca se abre
 * en línea (ADR-021).
 */
export function AttachmentsSection({
  basePath,
  canManage,
  canDelete = canManage,
  limits,
  title = 'Adjuntos',
  emptyMessage = 'Todavía no hay adjuntos.',
  takeInitialFiles,
}: AttachmentsSectionProps) {
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [toDelete, setToDelete] = useState<AttachmentDto | null>(null);

  const attachments = useAttachments(basePath, { page, pageSize });
  const deletion = useDeleteAttachment(basePath);
  const download = useDownloadAttachment(basePath);
  const { uploads, lastUploaded, enqueue, dismiss } = useAttachmentUploads(basePath, limits);

  // Sólo al montar: `takeInitialFiles` consume los archivos, así que una
  // segunda ejecución (modo estricto) no encuentra nada que subir.
  const takeInitialFilesRef = useRef(takeInitialFiles);
  useEffect(() => {
    const files = takeInitialFilesRef.current?.() ?? [];
    if (files.length > 0) {
      enqueue(files);
    }
  }, [enqueue]);

  const onFilesSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    // Se limpia para poder volver a elegir el mismo archivo tras un fallo.
    event.target.value = '';
    if (files.length > 0) {
      enqueue(files);
    }
  };

  const closeDelete = () => {
    setToDelete(null);
    deletion.reset();
  };

  const columns: DataTableColumn<AttachmentDto>[] = [
    {
      id: 'fileName',
      header: 'Nombre',
      primary: true,
      render: (attachment) => (
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 'fontWeightMedium', overflowWrap: 'anywhere' }}>
            {attachment.fileName}
          </Typography>
          {attachment.description ? (
            <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
              {attachment.description}
            </Typography>
          ) : null}
        </Box>
      ),
    },
    { id: 'contentType', header: 'Tipo', render: (attachment) => attachmentTypeLabel(attachment.contentType) },
    { id: 'sizeBytes', header: 'Tamaño', align: 'right', render: (attachment) => formatFileSize(attachment.sizeBytes) },
    {
      id: 'createdBy',
      header: 'Subido por',
      hideOnMobile: true,
      render: (attachment) => attachment.createdBy?.displayName ?? '—',
    },
    {
      id: 'createdAt',
      header: 'Fecha',
      hideOnMobile: true,
      render: (attachment) => formatAttachmentDate(attachment.createdAt),
    },
  ];

  const downloadError = download.isError ? describeApiError(download.error) : null;

  return (
    <Card component="section" aria-labelledby={titleId}>
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        justifyContent="space-between"
        flexWrap="wrap"
        useFlexGap
        sx={{ px: { xs: 2, sm: 2.5 }, py: 1.5, borderBottom: 1, borderColor: 'divider' }}
      >
        <Typography id={titleId} variant="h6" component="h2">
          {title}
        </Typography>
        {canManage ? (
          <>
            <Button
              variant="outlined"
              startIcon={<UploadFileOutlinedIcon />}
              onClick={() => inputRef.current?.click()}
            >
              Subir archivos
            </Button>
            <input
              ref={inputRef}
              type="file"
              multiple
              hidden
              aria-label="Seleccionar archivos para subir"
              accept={limits?.allowedTypes.join(',') || undefined}
              onChange={onFilesSelected}
            />
          </>
        ) : null}
      </Stack>

      {uploads.length > 0 || lastUploaded || downloadError ? (
        <Stack spacing={1.5} sx={{ px: { xs: 2, sm: 2.5 }, pt: 2 }}>
          {uploads.map((upload) => (
            <UploadRow key={upload.key} upload={upload} onDismiss={dismiss} />
          ))}
          {downloadError ? (
            <Alert severity="error" onClose={() => download.reset()}>
              {`No se pudo descargar el archivo. ${downloadError.message}`}
            </Alert>
          ) : null}
        </Stack>
      ) : null}
      <Typography role="status" variant="caption" color="text.secondary" sx={{ display: 'block', px: { xs: 2, sm: 2.5 } }}>
        {lastUploaded ? `Se subió «${lastUploaded}».` : ''}
      </Typography>

      <DataTable
        label={title}
        columns={columns}
        rows={attachments.data?.data}
        getRowId={(attachment) => attachment.id}
        totalItems={attachments.data?.pagination.totalItems ?? 0}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
        isLoading={attachments.isPending}
        isFetching={attachments.isFetching}
        errorMessage={attachments.isError ? describeApiError(attachments.error).message : null}
        onRetry={() => void attachments.refetch()}
        emptyTitle={emptyMessage}
        emptyIcon={<AttachFileOutlinedIcon />}
        rowActions={(attachment) => (
          <Stack direction="row" spacing={0.5} justifyContent="flex-end">
            <Tooltip title="Descargar">
              <span>
                <IconButton
                  aria-label={`Descargar ${attachment.fileName}`}
                  disabled={download.isPending && download.variables?.id === attachment.id}
                  onClick={() => download.mutate(attachment)}
                >
                  <FileDownloadOutlinedIcon />
                </IconButton>
              </span>
            </Tooltip>
            {canDelete ? (
              <Tooltip title="Eliminar">
                <IconButton aria-label={`Eliminar ${attachment.fileName}`} onClick={() => setToDelete(attachment)}>
                  <DeleteOutlineIcon />
                </IconButton>
              </Tooltip>
            ) : null}
          </Stack>
        )}
      />

      <ConfirmDialog
        open={toDelete !== null}
        title="Eliminar adjunto"
        description={
          toDelete
            ? `«${toDelete.fileName}» dejará de estar disponible para descargar. La eliminación queda registrada en la auditoría.`
            : undefined
        }
        confirmLabel="Eliminar"
        destructive
        isPending={deletion.isPending}
        errorMessage={deletion.isError ? describeApiError(deletion.error).message : null}
        onConfirm={() => {
          if (toDelete) {
            deletion.mutate(toDelete, { onSuccess: closeDelete });
          }
        }}
        onClose={closeDelete}
      />
    </Card>
  );
}
