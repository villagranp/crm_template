import { Avatar, Box, Stack, Typography } from '@mui/material';

import { initialsOf } from './admin-format';
import { neutralSoft, ROW_AVATAR_SIZE } from './admin-surfaces';

export interface RowIdentityProps {
  name: string;
  /** Línea secundaria (correo, código…). */
  secondary?: string | null;
}

/**
 * Celda de una fila que es una persona o un equipo: avatar de iniciales y
 * nombre en negrita (`cell-user` del prototipo). El avatar es decorativo: el
 * nombre ya está en el texto.
 */
export function RowIdentity({ name, secondary }: RowIdentityProps) {
  return (
    <Stack
      direction="row"
      spacing={1.25}
      alignItems="center"
      sx={{ minWidth: 0, textAlign: 'left' }}
    >
      <Avatar
        aria-hidden
        sx={{
          width: (theme) => theme.spacing(ROW_AVATAR_SIZE),
          height: (theme) => theme.spacing(ROW_AVATAR_SIZE),
          bgcolor: neutralSoft,
          color: 'text.primary',
          typography: 'caption',
          fontWeight: 600,
        }}
      >
        {initialsOf(name)}
      </Avatar>
      <Box sx={{ minWidth: 0 }}>
        <Typography
          variant="body2"
          component="span"
          sx={{ display: 'block', fontWeight: 600, overflowWrap: 'anywhere' }}
        >
          {name}
        </Typography>
        {secondary ? (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'block', overflowWrap: 'anywhere' }}
          >
            {secondary}
          </Typography>
        ) : null}
      </Box>
    </Stack>
  );
}
