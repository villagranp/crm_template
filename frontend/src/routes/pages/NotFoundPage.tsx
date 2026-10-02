import { Button, Stack, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

import { pageTitleSx } from '@/theme/typography';

export function NotFoundPage() {
  return (
    <Stack spacing={2} alignItems="flex-start" sx={{ py: 6 }}>
      <Typography variant="h1" sx={pageTitleSx}>
        Página no encontrada
      </Typography>
      <Typography variant="body1" color="text.secondary">
        La ruta solicitada no existe en esta aplicación.
      </Typography>
      <Button component={RouterLink} to="/">
        Volver al inicio
      </Button>
    </Stack>
  );
}
