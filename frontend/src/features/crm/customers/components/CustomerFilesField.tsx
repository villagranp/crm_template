import CloseIcon from '@mui/icons-material/Close';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import { Box, Button, IconButton, Stack, Typography } from '@mui/material';
import { useRef, type ChangeEvent } from 'react';

import { FormSection } from '@/components/data';
import { formatFileSize, precheckAttachment } from '@/features/crm/common/attachment-format';
import type { AttachmentLimits } from '@/features/crm/common/attachments.api';

export interface CustomerFilesFieldProps {
  files: readonly File[];
  onChange: (files: File[]) => void;
  /** `form-options.attachments`: sólo para avisar antes de subir; el backend decide. */
  limits: AttachmentLimits;
  disabled?: boolean;
}

/**
 * Selección de adjuntos en el alta (02 §E.3). Los archivos no se suben aquí:
 * se suben en la ficha después de crear el cliente (D-02.15). Un archivo que no
 * pasa la comprobación previa se avisa, pero se deja en la lista: su error se
 * mostrará en la ficha sin deshacer el alta.
 */
export function CustomerFilesField({ files, onChange, limits, disabled }: CustomerFilesFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const onSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (selected.length > 0) {
      onChange([...files, ...selected]);
    }
  };

  return (
    <Box sx={{ mt: 3 }}>
      <FormSection number={4} title="Adjuntos" columns={1}>
        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            {`Se suben al guardar el cliente. Máximo ${limits.maxMb} MB por archivo.`}
          </Typography>
          <Button
            variant="outlined"
            startIcon={<UploadFileOutlinedIcon />}
            onClick={() => inputRef.current?.click()}
            disabled={disabled}
          >
            Elegir archivos
          </Button>
          <input
            ref={inputRef}
            type="file"
            multiple
            hidden
            aria-label="Elegir archivos para adjuntar"
            accept={limits.allowedTypes.join(',') || undefined}
            onChange={onSelect}
          />
          {files.length > 0 ? (
            <Stack component="ul" aria-label="Archivos elegidos" spacing={1} sx={{ listStyle: 'none', p: 0, m: 0, mt: 2 }}>
              {files.map((file, index) => {
                const warning = precheckAttachment(file, limits);
                return (
                  <Stack
                    component="li"
                    key={`${file.name}-${index}`}
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    sx={{ py: 0.5, borderBottom: 1, borderColor: 'divider' }}
                  >
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                        {file.name}
                      </Typography>
                      <Typography variant="caption" color={warning ? 'error' : 'text.secondary'}>
                        {warning ?? formatFileSize(file.size)}
                      </Typography>
                    </Box>
                    <IconButton
                      aria-label={`Quitar ${file.name}`}
                      disabled={disabled}
                      onClick={() => onChange(files.filter((_, position) => position !== index))}
                    >
                      <CloseIcon />
                    </IconButton>
                  </Stack>
                );
              })}
            </Stack>
          ) : null}
        </Box>
      </FormSection>
    </Box>
  );
}
