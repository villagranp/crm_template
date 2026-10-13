import AttachFileOutlinedIcon from '@mui/icons-material/AttachFileOutlined';
import { Box } from '@mui/material';

export interface AttachmentCountProps {
  count: number;
}

/**
 * Columna "Adjuntos" de agenda, listados y seguimiento (04 §E.12): icono
 * `attach_file` + número, con un nombre accesible que no depende del icono.
 * Sin adjuntos, una raya.
 */
export function AttachmentCount({ count }: AttachmentCountProps) {
  if (count <= 0) {
    return <>—</>;
  }
  return (
    <Box
      component="span"
      aria-label={count === 1 ? '1 adjunto' : `${count} adjuntos`}
      sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
    >
      <AttachFileOutlinedIcon fontSize="inherit" aria-hidden />
      <span aria-hidden>{count}</span>
    </Box>
  );
}
