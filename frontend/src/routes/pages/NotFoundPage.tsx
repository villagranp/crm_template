import { Button, Stack, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

import { PageHeader } from '@/components/layout/PageHeader';

export function NotFoundPage() {
  return (
    <>
      <PageHeader
        title="Página no encontrada"
        breadcrumbs={[{ label: 'Inicio', to: '/' }, { label: 'Página no encontrada' }]}
      />
      <Stack spacing={2} alignItems="flex-start">
        <Typography variant="body1" color="text.secondary">
          La ruta solicitada no existe en esta aplicación.
        </Typography>
        <Button component={RouterLink} to="/">
          Volver al inicio
        </Button>
      </Stack>
    </>
  );
}
