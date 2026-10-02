import { Box, CircularProgress, Typography } from '@mui/material';

interface FullPageLoaderProps {
  label?: string;
}

export function FullPageLoader({ label = 'Cargando…' }: FullPageLoaderProps) {
  return (
    <Box
      role="status"
      aria-live="polite"
      sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', bgcolor: 'background.default' }}
    >
      <Box sx={{ display: 'grid', justifyItems: 'center', gap: 2 }}>
        <CircularProgress size={28} />
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
      </Box>
    </Box>
  );
}
