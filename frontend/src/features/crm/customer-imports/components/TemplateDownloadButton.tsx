import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import { Button, CircularProgress, Menu, MenuItem, type ButtonProps } from '@mui/material';
import { useId, useState } from 'react';

import { saveFile } from '@/lib/save-file';

import { downloadCustomerImportTemplate, type ImportFileFormat } from '../customer-imports.api';
import { describeImportError, withReference } from '../customer-imports.errors';
import { IMPORT_FORMAT_LABELS } from '../customer-imports-format';

const EXTENSIONS: Readonly<Record<ImportFileFormat, string>> = { CSV: 'csv', XLSX: 'xlsx' };

export interface TemplateDownloadButtonProps {
  /** Formatos admitidos (`settings.formats`). */
  formats: readonly ImportFileFormat[];
  /** Versión de la plantilla, para el nombre por defecto del archivo. */
  templateVersion: string;
  /** Recibe el mensaje ya traducido de un fallo de descarga. */
  onError: (message: string) => void;
  disabled?: boolean;
  variant?: ButtonProps['variant'];
}

/**
 * "Descargar plantilla" (06 §E.2): menú CSV / Excel. Descarga con
 * `httpClient.download` y `saveFile`; el nombre llega en `Content-Disposition`
 * (`plantilla-clientes-v1.xlsx`). Requiere `importaciones.crear`: la pantalla
 * decide si lo muestra.
 */
export function TemplateDownloadButton({
  formats,
  templateVersion,
  onError,
  disabled = false,
  variant = 'outlined',
}: TemplateDownloadButtonProps) {
  const menuId = useId();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [downloading, setDownloading] = useState<ImportFileFormat | null>(null);

  const download = async (format: ImportFileFormat) => {
    setAnchor(null);
    setDownloading(format);
    try {
      const file = await downloadCustomerImportTemplate(format);
      saveFile(file.blob, file.fileName ?? `plantilla-clientes-v${templateVersion}.${EXTENSIONS[format]}`);
    } catch (error) {
      onError(`No se pudo descargar la plantilla. ${withReference(describeImportError(error))}`);
    } finally {
      setDownloading(null);
    }
  };

  return (
    <>
      <Button
        variant={variant}
        color="inherit"
        startIcon={downloading ? <CircularProgress size="1em" color="inherit" /> : <DownloadOutlinedIcon />}
        endIcon={<ArrowDropDownIcon />}
        aria-haspopup="menu"
        aria-controls={anchor ? menuId : undefined}
        aria-expanded={Boolean(anchor)}
        aria-busy={downloading !== null}
        disabled={disabled || downloading !== null || formats.length === 0}
        onClick={(event) => setAnchor(event.currentTarget)}
        sx={{ borderColor: 'divider' }}
      >
        {downloading ? 'Descargando…' : 'Descargar plantilla'}
      </Button>
      <Menu id={menuId} anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        {formats.map((format) => (
          <MenuItem key={format} onClick={() => void download(format)}>
            {format === 'XLSX' ? `Plantilla ${IMPORT_FORMAT_LABELS[format]}` : `Plantilla ${IMPORT_FORMAT_LABELS[format]} (UTF-8)`}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
