import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import { Alert, AlertTitle, Box, Button, LinearProgress, Stack, Typography } from '@mui/material';
import { useEffect, useId, useRef, useState, type ChangeEvent, type DragEvent } from 'react';

import { brandSoft, DialogFooter, EntityDialog } from '@/components/data';

import type { CustomerImport, CustomerImportSettings } from '../customer-imports.api';
import { describeUploadError, importFileProblems, withReference } from '../customer-imports.errors';
import {
  describeFormats,
  formatCount,
  formatMegabytes,
  IMPORT_FILE_ACCEPT,
  precheckImportFile,
} from '../customer-imports-format';
import { useUploadCustomerImport } from '../customer-imports.queries';
import { TemplateDownloadButton } from './TemplateDownloadButton';

const BYTES_PER_MB = 1024 * 1024;
const FULL = 100;

export interface NewImportDialogProps {
  open: boolean;
  settings: CustomerImportSettings;
  /** Muestra el acceso a la plantilla (`importaciones.crear`). */
  canDownloadTemplate: boolean;
  onClose: () => void;
  /** `201`: la carga ya está validada; la pantalla navega a su detalle. */
  onCreated: (created: CustomerImport) => void;
}

interface UploadFailure {
  message: string;
  problems: string[];
}

/**
 * Nueva carga (06 §E.3): arrastrar-soltar o "Seleccionar archivo" de un único
 * `.csv`/`.xlsx`, comprobación previa (sólo comodidad, AC-06.3), subida con
 * barra de progreso y "Cancelar subida", y los errores de estructura de
 * `413`/`415`/`422`/`409` listados en el propio diálogo (PF-06.46).
 *
 * Estados: inicial, archivo elegido, subiendo, validando (el servidor responde
 * al terminar la validación) y error.
 */
export function NewImportDialog({ open, settings, canDownloadTemplate, onClose, onCreated }: NewImportDialogProps) {
  const inputId = useId();
  const helpId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const upload = useUploadCustomerImport();
  const resetUpload = upload.reset;

  const [file, setFile] = useState<File | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [failure, setFailure] = useState<UploadFailure | null>(null);
  const [percent, setPercent] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);

  const uploading = upload.isPending;
  const validating = uploading && percent === FULL;

  useEffect(() => {
    if (open) {
      setFile(null);
      setSelectionError(null);
      setFailure(null);
      setPercent(null);
      setTemplateError(null);
      resetUpload();
    }
  }, [open, resetUpload]);

  // Cerrar la pantalla a mitad de subida la cancela.
  useEffect(() => () => abortRef.current?.abort(), []);

  const choose = (files: FileList | null) => {
    setFailure(null);
    if (!files || files.length === 0) {
      return;
    }
    if (files.length > 1) {
      setFile(null);
      setSelectionError('Seleccione un solo archivo.');
      return;
    }
    const [chosen] = files;
    if (!chosen) {
      return;
    }
    const problem = precheckImportFile(chosen, settings);
    setFile(problem ? null : chosen);
    setSelectionError(problem);
  };

  const onInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    choose(event.target.files);
    // Permite volver a elegir el mismo archivo tras un error.
    event.target.value = '';
  };

  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragging(false);
    if (!uploading) {
      choose(event.dataTransfer.files);
    }
  };

  const chooseAnother = () => {
    setFile(null);
    setFailure(null);
    setSelectionError(null);
    inputRef.current?.click();
  };

  const submit = () => {
    if (!file || uploading) {
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setFailure(null);
    setPercent(0);
    upload.mutate(
      { file, signal: controller.signal, onProgress: (progress) => setPercent(progress.percent) },
      {
        onSuccess: (created) => onCreated(created),
        onError: (error) => {
          setPercent(null);
          if (controller.signal.aborted) {
            return;
          }
          const view = describeUploadError(error, settings);
          setFailure({
            message: withReference(view),
            problems: importFileProblems(error, settings),
          });
        },
        onSettled: () => {
          if (abortRef.current === controller) {
            abortRef.current = null;
          }
        },
      },
    );
  };

  const cancelUpload = () => {
    abortRef.current?.abort();
    setPercent(null);
  };

  return (
    <EntityDialog
      open={open}
      onClose={uploading ? undefined : onClose}
      title="Nueva carga de clientes"
      subtitle="Carga masiva de clientes"
      describedBy={helpId}
      maxWidth="sm"
      actions={
        uploading ? (
          <Button variant="outlined" color="inherit" onClick={cancelUpload} disabled={validating} sx={{ borderColor: 'divider' }}>
            Cancelar subida
          </Button>
        ) : (
          <DialogFooter onCancel={onClose} submitLabel="Subir y validar" onSubmit={submit} submitDisabled={!file} />
        )
      }
    >
      <Stack spacing={2}>
        <Box id={helpId}>
          <Typography variant="body2">
            {`Formatos admitidos: ${describeFormats(settings.formats)}. Tamaño máximo: ${formatMegabytes(settings.maxFileSizeMb)}. Máximo ${formatCount(settings.maxRows)} filas por archivo.`}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Use la plantilla sin cambiar sus encabezados. Si trabaja con CSV, guarde el CSV como UTF-8.
          </Typography>
        </Box>
        {canDownloadTemplate ? (
          <Box>
            <TemplateDownloadButton
              formats={settings.formats}
              templateVersion={settings.templateVersion}
              onError={setTemplateError}
              disabled={uploading}
              variant="text"
            />
            {templateError ? (
              <Alert severity="error" sx={{ mt: 1 }} onClose={() => setTemplateError(null)}>
                {templateError}
              </Alert>
            ) : null}
          </Box>
        ) : null}

        <Box
          onDragOver={(event) => {
            event.preventDefault();
            if (!uploading) {
              setDragging(true);
            }
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          sx={{
            border: 2,
            borderStyle: 'dashed',
            borderColor: dragging ? 'primary.main' : 'divider',
            borderRadius: 1,
            bgcolor: dragging ? brandSoft : 'transparent',
            px: 2,
            py: 3,
            textAlign: 'center',
          }}
        >
          <Stack spacing={1} alignItems="center">
            <Box aria-hidden sx={{ color: 'primary.main', display: 'flex' }}>
              <UploadFileOutlinedIcon fontSize="large" />
            </Box>
            <Typography variant="body2">Arrastre aquí el archivo o</Typography>
            <input
              ref={inputRef}
              id={inputId}
              type="file"
              accept={IMPORT_FILE_ACCEPT}
              aria-label="Archivo de clientes"
              hidden
              tabIndex={-1}
              disabled={uploading}
              onChange={onInputChange}
            />
            <Button variant="outlined" onClick={() => inputRef.current?.click()} disabled={uploading}>
              Seleccionar archivo
            </Button>
          </Stack>
        </Box>

        {file ? (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
            <InsertDriveFileOutlinedIcon aria-hidden fontSize="small" color="action" />
            <Typography variant="body2" sx={{ overflowWrap: 'anywhere', minWidth: 0 }}>
              {`Archivo elegido: ${file.name} (${formatMegabytes(file.size / BYTES_PER_MB)})`}
            </Typography>
          </Stack>
        ) : null}

        {selectionError ? (
          <Alert severity="error" role="alert">
            {selectionError}
          </Alert>
        ) : null}

        {uploading ? (
          <Box role="status" aria-live="polite">
            <Typography variant="body2" sx={{ mb: 1 }}>
              {validating
                ? 'Validando el archivo… Esto puede tardar unos segundos.'
                : `Subiendo el archivo${percent !== null ? ` (${percent} %)` : ''}…`}
            </Typography>
            <LinearProgress
              variant={validating || percent === null ? 'indeterminate' : 'determinate'}
              value={percent ?? 0}
              aria-label={validating ? 'Validando el archivo' : 'Progreso de la subida'}
            />
          </Box>
        ) : null}

        {failure ? (
          <Alert
            severity="error"
            role="alert"
            action={
              <Button color="inherit" size="small" onClick={chooseAnother}>
                Elegir otro archivo
              </Button>
            }
          >
            <AlertTitle>No se pudo cargar el archivo</AlertTitle>
            {failure.message}
            {failure.problems.length > 0 ? (
              <Box component="ul" aria-label="Problemas del archivo" sx={{ m: 0, mt: 1, pl: 2.5 }}>
                {failure.problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </Box>
            ) : null}
          </Alert>
        ) : null}
      </Stack>
    </EntityDialog>
  );
}
