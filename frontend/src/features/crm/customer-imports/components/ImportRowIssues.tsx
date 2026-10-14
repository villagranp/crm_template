import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import { Box, Button, Collapse, Stack, Typography } from '@mui/material';
import { useId, useState } from 'react';

import type { ImportColumn, ImportRowIssue } from '../customer-imports.api';
import { issueFieldLabel, pluralize } from '../customer-imports-format';

export interface ImportRowIssuesProps {
  issues: readonly ImportRowIssue[];
  /** `settings.columns`: el campo se muestra con el encabezado de la plantilla. */
  columns: readonly ImportColumn[] | undefined;
  /** Contexto del botón para lectores de pantalla ("fila 7"). */
  rowLabel: string;
}

function summary(issues: readonly ImportRowIssue[]): string {
  const errors = issues.filter((issue) => issue.severity !== 'WARNING').length;
  const warnings = issues.length - errors;
  return [errors > 0 ? pluralize(errors, 'error', 'errores') : null, warnings > 0 ? pluralize(warnings, 'advertencia', 'advertencias') : null]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Incidencias de una fila (06 §E.4, AC-06.14): lista expandible con campo y
 * mensaje del servidor (en español, sin el valor de la celda). Las
 * advertencias se distinguen de los errores con texto e icono, no sólo color.
 */
export function ImportRowIssues({ issues, columns, rowLabel }: ImportRowIssuesProps) {
  const listId = useId();
  const [open, setOpen] = useState(false);

  if (issues.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        Sin incidencias
      </Typography>
    );
  }

  return (
    <Box sx={{ minWidth: 0, textAlign: 'left' }}>
      <Button
        size="small"
        variant="text"
        color="inherit"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={`${open ? 'Ocultar' : 'Ver'} incidencias de la ${rowLabel}: ${summary(issues)}`}
        endIcon={open ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        onClick={() => setOpen((value) => !value)}
        sx={{ px: 1, mx: -1 }}
      >
        {summary(issues)}
      </Button>
      <Collapse in={open} unmountOnExit>
        <Stack component="ul" id={listId} spacing={0.75} sx={{ listStyle: 'none', m: 0, mt: 0.5, p: 0 }}>
          {issues.map((issue, index) => {
            const isWarning = issue.severity === 'WARNING';
            return (
              <Stack key={`${issue.field}-${issue.code}-${index}`} component="li" direction="row" spacing={1} alignItems="flex-start">
                <Box aria-hidden sx={{ display: 'flex', pt: 0.25, color: isWarning ? 'warning.main' : 'error.main' }}>
                  {isWarning ? <WarningAmberOutlinedIcon fontSize="small" /> : <ErrorOutlineIcon fontSize="small" />}
                </Box>
                <Typography variant="body2" sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                  <Box component="span" sx={{ fontWeight: 'fontWeightMedium' }}>
                    {`${isWarning ? 'Advertencia' : 'Error'} · ${issueFieldLabel(issue.field, columns)}: `}
                  </Box>
                  {issue.message}
                </Typography>
              </Stack>
            );
          })}
        </Stack>
      </Collapse>
    </Box>
  );
}
