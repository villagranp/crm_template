import CloseIcon from '@mui/icons-material/Close';
import {
  Box,
  Drawer,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { useId, type ReactNode } from 'react';

import type { AuditLogEntry } from '../audit.api';
import { describeActor, formatDateTime, toChangeRows, toMetadataRows } from '../audit-format';

export interface AuditDetailDrawerProps {
  entry: AuditLogEntry | null;
  onClose: () => void;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box sx={{ display: 'contents' }}>
      <Typography component="dt" variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography component="dd" variant="body2" sx={{ m: 0, minWidth: 0, overflowWrap: 'anywhere' }}>
        {children}
      </Typography>
    </Box>
  );
}

function RawJson({ value }: { value: unknown }) {
  return (
    <Box
      component="pre"
      className="scroll-x"
      sx={{ m: 0, p: 1.5, bgcolor: 'action.hover', borderRadius: 1, typography: 'body2', fontFamily: 'monospace' }}
    >
      {JSON.stringify(value, null, 2)}
    </Box>
  );
}

/** Detalle de un registro: datos del evento, diferencia antes → después y metadatos. */
export function AuditDetailDrawer({ entry, onClose }: AuditDetailDrawerProps) {
  const titleId = useId();
  const changeRows = entry ? toChangeRows(entry.changes) : null;
  const metadataRows = entry ? toMetadataRows(entry.metadata) : null;

  return (
    <Drawer
      anchor="right"
      open={Boolean(entry)}
      onClose={onClose}
      slotProps={{ paper: { 'aria-labelledby': titleId, sx: { width: { xs: '100%', sm: (theme) => theme.spacing(70) } } } }}
    >
      {entry ? (
        <Stack spacing={3} sx={{ p: 3 }}>
          <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
            <Box sx={{ minWidth: 0 }}>
              <Typography id={titleId} variant="h6" component="h2" sx={{ overflowWrap: 'anywhere' }}>
                {entry.event}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {formatDateTime(entry.occurredAt)}
              </Typography>
            </Box>
            <IconButton aria-label="Cerrar detalle" onClick={onClose}>
              <CloseIcon />
            </IconButton>
          </Stack>

          <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 2, rowGap: 1 }}>
            <Field label="Actor">{describeActor(entry)}</Field>
            {entry.subjectEmail && entry.subjectId ? <Field label="Id del actor">{entry.subjectId}</Field> : null}
            <Field label="Recurso">{entry.resourceType ?? '—'}</Field>
            <Field label="Id del recurso">{entry.resourceId ?? '—'}</Field>
            <Field label="IP">{entry.ipAddress ?? '—'}</Field>
            <Field label="Correlación">{entry.correlationId}</Field>
          </Box>

          <Box component="section" aria-label="Cambios">
            <Typography variant="subtitle2" component="h3" sx={{ mb: 1 }}>
              Cambios
            </Typography>
            {changeRows && changeRows.length > 0 ? (
              <TableContainer className="scroll-x">
                <Table size="small" aria-label="Cambios">
                  <TableHead>
                    <TableRow>
                      <TableCell>Campo</TableCell>
                      <TableCell>Antes</TableCell>
                      <TableCell>Después</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {changeRows.map((row) => (
                      <TableRow key={row.field}>
                        <TableCell sx={{ fontFamily: 'monospace' }}>{row.field}</TableCell>
                        <TableCell sx={{ color: 'text.secondary', overflowWrap: 'anywhere' }}>{row.before}</TableCell>
                        <TableCell sx={{ overflowWrap: 'anywhere' }}>{row.after}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : entry.changes !== null && changeRows === null ? (
              <RawJson value={entry.changes} />
            ) : (
              <Typography variant="body2" color="text.secondary">
                Este evento no registra cambios de datos.
              </Typography>
            )}
          </Box>

          <Box component="section" aria-label="Metadatos">
            <Typography variant="subtitle2" component="h3" sx={{ mb: 1 }}>
              Metadatos
            </Typography>
            {metadataRows ? (
              <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 2, rowGap: 0.5 }}>
                {metadataRows.map((row) => (
                  <Field key={row.key} label={row.key}>
                    {row.value}
                  </Field>
                ))}
              </Box>
            ) : entry.metadata !== null ? (
              <RawJson value={entry.metadata} />
            ) : (
              <Typography variant="body2" color="text.secondary">
                Sin metadatos.
              </Typography>
            )}
          </Box>
        </Stack>
      ) : null}
    </Drawer>
  );
}
