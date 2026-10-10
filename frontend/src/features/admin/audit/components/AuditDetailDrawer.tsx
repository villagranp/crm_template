import {
  Box,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { AdminDrawer, DetailList, DetailSection } from '@/features/admin/common';

import type { AuditLogEntry } from '../audit.api';
import { describeActor, formatDateTime, toChangeRows, toMetadataRows } from '../audit-format';

export interface AuditDetailDrawerProps {
  entry: AuditLogEntry | null;
  onClose: () => void;
}

function RawJson({ value }: { value: unknown }) {
  return (
    <Box
      component="pre"
      className="scroll-x"
      sx={{
        m: 0,
        p: 1.5,
        bgcolor: 'action.hover',
        borderRadius: 1,
        typography: 'body2',
        fontFamily: 'monospace',
      }}
    >
      {JSON.stringify(value, null, 2)}
    </Box>
  );
}

/** Detalle de un registro: datos del evento, diferencia antes → después y metadatos. */
export function AuditDetailDrawer({ entry, onClose }: AuditDetailDrawerProps) {
  const changeRows = entry ? toChangeRows(entry.changes) : null;
  const metadataRows = entry ? toMetadataRows(entry.metadata) : null;

  return (
    <AdminDrawer
      open={Boolean(entry)}
      onClose={onClose}
      title={entry?.event ?? 'Registro de auditoría'}
      subtitle={entry ? `Auditoría · ${formatDateTime(entry.occurredAt)}` : 'Auditoría'}
    >
      {entry ? (
        <Stack spacing={3}>
          <DetailSection number={1} title="Evento">
            <DetailList
              items={[
                { label: 'Actor', value: describeActor(entry) },
                ...(entry.subjectEmail && entry.subjectId
                  ? [{ label: 'Id del actor', value: entry.subjectId }]
                  : []),
                { label: 'Recurso', value: entry.resourceType ?? '—' },
                { label: 'Id del recurso', value: entry.resourceId ?? '—' },
                { label: 'IP', value: entry.ipAddress ?? '—' },
                { label: 'Correlación', value: entry.correlationId, wide: true },
              ]}
            />
          </DetailSection>

          <DetailSection number={2} title="Cambios">
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
                        <TableCell sx={{ color: 'text.secondary', overflowWrap: 'anywhere' }}>
                          {row.before}
                        </TableCell>
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
          </DetailSection>

          <DetailSection number={3} title="Metadatos">
            {metadataRows ? (
              <DetailList
                items={metadataRows.map((row) => ({ label: row.key, value: row.value }))}
              />
            ) : entry.metadata !== null ? (
              <RawJson value={entry.metadata} />
            ) : (
              <Typography variant="body2" color="text.secondary">
                Sin metadatos.
              </Typography>
            )}
          </DetailSection>
        </Stack>
      ) : null}
    </AdminDrawer>
  );
}
