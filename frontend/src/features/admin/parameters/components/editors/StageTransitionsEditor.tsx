import {
  Box,
  Checkbox,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';

import { useCatalogOptions } from '../../parameters.queries';
import type { CatalogEditorProps } from './editor-props';
import { parseJsonObject, STAGE_CATALOG } from './editor-metadata';

type Transitions = Record<string, string[]>;

function toTransitions(value: Record<string, unknown>): Transitions {
  return Object.fromEntries(
    Object.entries(value).map(([from, targets]) => [
      from,
      Array.isArray(targets)
        ? targets.filter((target): target is string => typeof target === 'string')
        : [],
    ]),
  );
}

/**
 * `crm.oportunidades.transiciones_etapa` (editor `stage-transitions`): matriz
 * etapa origen × etapa destino. Las etapas son las activas de
 * `crm.etapa_oportunidad` más las que ya figuran en el valor; sin acceso a
 * catálogos, sólo estas últimas.
 */
export function StageTransitionsEditor({
  value,
  onChange,
  disabled,
  catalogsEnabled,
}: CatalogEditorProps) {
  const transitions = toTransitions(parseJsonObject(value) ?? {});
  const options = useCatalogOptions(STAGE_CATALOG, catalogsEnabled);
  const labels = new Map((options.data ?? []).map((option) => [option.code, option.label]));

  const stages = [
    ...new Set([
      ...(options.data ?? []).map((option) => option.code),
      ...Object.keys(transitions),
      ...Object.values(transitions).flat(),
    ]),
  ];
  const labelOf = (code: string) => labels.get(code) ?? code;

  const toggle = (from: string, to: string, checked: boolean) => {
    const current = new Set(transitions[from] ?? []);
    if (checked) {
      current.add(to);
    } else {
      current.delete(to);
    }
    const next: Transitions = {
      ...transitions,
      [from]: stages.filter((stage) => current.has(stage)),
    };
    onChange(JSON.stringify(next));
  };

  return (
    <Stack spacing={1.5}>
      <Typography variant="body2" color="text.secondary">
        Marca a qué etapas se puede pasar desde cada etapa. Una etapa sin destinos es final.
      </Typography>
      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small" aria-label="Transiciones de etapa">
          <TableHead>
            <TableRow>
              <TableCell component="th" scope="col">
                Desde \ Hacia
              </TableCell>
              {stages.map((to) => (
                <TableCell key={to} component="th" scope="col" align="center">
                  {labelOf(to)}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {stages.map((from) => (
              <TableRow key={from}>
                <TableCell component="th" scope="row">
                  {labelOf(from)}
                </TableCell>
                {stages.map((to) => (
                  <TableCell key={to} align="center" padding="checkbox">
                    {from === to ? null : (
                      <Checkbox
                        checked={(transitions[from] ?? []).includes(to)}
                        disabled={disabled}
                        onChange={(event) => toggle(from, to, event.target.checked)}
                        slotProps={{
                          input: { 'aria-label': `De ${labelOf(from)} a ${labelOf(to)}` },
                        }}
                      />
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
    </Stack>
  );
}
