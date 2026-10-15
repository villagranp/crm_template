import StraightenOutlinedIcon from '@mui/icons-material/StraightenOutlined';
import { Box } from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import {
  describeApiError,
  useTableQueryState,
  type DataTableColumn,
} from '@/features/admin/common';

import type { UnitOfMeasure } from '../products.api';
import { DIMENSION_LABELS } from '../products-format';
import { productKeys, useSaveUnit, useUnits } from '../products.queries';
import { ActiveChip } from './ActiveChip';
import { MasterListCard } from './MasterListCard';
import { ToggleActiveDialog } from './ToggleActiveDialog';
import { UnitFormDialog } from './UnitFormDialog';

const FILTER_KEYS = ['isActive'] as const;
/** Lista blanca de `GET /units-of-measure`. */
const SORTABLE = ['code', 'name', 'sortOrder', 'dimension'] as const;

const COLUMNS: DataTableColumn<UnitOfMeasure>[] = [
  {
    id: 'name',
    header: 'Nombre',
    render: (unit) => (
      <Box component="span" sx={{ fontWeight: 600 }}>
        {unit.name}
      </Box>
    ),
    sortable: true,
    primary: true,
  },
  { id: 'code', header: 'Código', render: (unit) => unit.code, sortable: true },
  { id: 'symbol', header: 'Símbolo', render: (unit) => unit.symbol, hideOnMobile: true },
  {
    id: 'dimension',
    header: 'Dimensión',
    render: (unit) => DIMENSION_LABELS[unit.dimension] ?? unit.dimension,
    sortable: true,
  },
  { id: 'isActive', header: 'Estado', render: (unit) => <ActiveChip isActive={unit.isActive} /> },
];

type FormState = { open: false } | { open: true; unit: UnitOfMeasure | null };

/** Pestaña «Unidades» de Productos y unidades (07 E.5). */
export function UnitsTab({ canConfigure }: { canConfigure: boolean }) {
  const table = useTableQueryState<'isActive'>({
    filterKeys: FILTER_KEYS,
    sortableFields: SORTABLE,
    paramPrefix: 'unidades.',
  });
  const units = useUnits(table.apiQuery);
  const toggleMutation = useSaveUnit();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>({ open: false });
  const [toToggle, setToToggle] = useState<UnitOfMeasure | null>(null);

  return (
    <>
      <MasterListCard
        title="Unidades"
        description="Unidades de medida de productos, proyectos y reglas de conversión."
        icon={<StraightenOutlinedIcon />}
        table={table}
        query={units}
        columns={COLUMNS}
        nameOf={(unit) => unit.name}
        searchLabel="Buscar por código o nombre"
        createLabel="Nueva unidad"
        emptyTitle="No hay unidades"
        canConfigure={canConfigure}
        onRefresh={() => void queryClient.invalidateQueries({ queryKey: productKeys.all })}
        onCreate={() => setForm({ open: true, unit: null })}
        onEdit={(unit) => setForm({ open: true, unit })}
        onToggleActive={(unit) => {
          toggleMutation.reset();
          setToToggle(unit);
        }}
      />
      <UnitFormDialog
        open={form.open}
        unit={form.open ? form.unit : null}
        onClose={() => setForm({ open: false })}
      />
      <ToggleActiveDialog
        target={toToggle}
        noun="la unidad"
        deactivateHint="Los productos, reglas y líneas que ya la usan no cambian."
        isPending={toggleMutation.isPending}
        errorMessage={
          toggleMutation.isError ? describeApiError(toggleMutation.error).message : null
        }
        onConfirm={() => {
          if (toToggle) {
            toggleMutation.mutate(
              { id: toToggle.id, body: { isActive: !toToggle.isActive } },
              { onSuccess: () => setToToggle(null) },
            );
          }
        }}
        onClose={() => setToToggle(null)}
      />
    </>
  );
}
