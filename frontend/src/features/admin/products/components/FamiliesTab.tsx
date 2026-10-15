import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import { Box } from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import {
  describeApiError,
  useTableQueryState,
  type DataTableColumn,
} from '@/features/admin/common';

import type { ProductFamily } from '../products.api';
import { productKeys, useProductFamilies, useSaveProductFamily } from '../products.queries';
import { ActiveChip } from './ActiveChip';
import { FamilyFormDialog } from './FamilyFormDialog';
import { MasterListCard } from './MasterListCard';
import { ToggleActiveDialog } from './ToggleActiveDialog';

const FILTER_KEYS = ['isActive'] as const;
/** Lista blanca de `GET /product-families`. */
const SORTABLE = ['code', 'name', 'sortOrder', 'createdAt', 'updatedAt'] as const;

const COLUMNS: DataTableColumn<ProductFamily>[] = [
  {
    id: 'name',
    header: 'Nombre',
    render: (family) => (
      <Box component="span" sx={{ fontWeight: 600 }}>
        {family.name}
      </Box>
    ),
    sortable: true,
    primary: true,
  },
  { id: 'code', header: 'Código', render: (family) => family.code, sortable: true },
  {
    id: 'description',
    header: 'Descripción',
    render: (family) => family.description ?? '—',
    hideOnMobile: true,
  },
  {
    id: 'isActive',
    header: 'Estado',
    render: (family) => <ActiveChip isActive={family.isActive} />,
  },
];

type FormState = { open: false } | { open: true; family: ProductFamily | null };

/** Pestaña «Familias» de Productos y unidades (07 E.5). */
export function FamiliesTab({ canConfigure }: { canConfigure: boolean }) {
  const table = useTableQueryState<'isActive'>({
    filterKeys: FILTER_KEYS,
    sortableFields: SORTABLE,
    paramPrefix: 'familias.',
  });
  const families = useProductFamilies(table.apiQuery);
  const toggleMutation = useSaveProductFamily();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>({ open: false });
  const [toToggle, setToToggle] = useState<ProductFamily | null>(null);

  return (
    <>
      <MasterListCard
        title="Familias"
        description="Agrupan los productos y sirven de ámbito a las reglas de conversión."
        icon={<FolderOutlinedIcon />}
        table={table}
        query={families}
        columns={COLUMNS}
        nameOf={(family) => family.name}
        searchLabel="Buscar por código o nombre"
        createLabel="Nueva familia"
        emptyTitle="No hay familias"
        canConfigure={canConfigure}
        onRefresh={() => void queryClient.invalidateQueries({ queryKey: productKeys.all })}
        onCreate={() => setForm({ open: true, family: null })}
        onEdit={(family) => setForm({ open: true, family })}
        onToggleActive={(family) => {
          toggleMutation.reset();
          setToToggle(family);
        }}
      />
      <FamilyFormDialog
        open={form.open}
        family={form.open ? form.family : null}
        onClose={() => setForm({ open: false })}
      />
      <ToggleActiveDialog
        target={toToggle}
        noun="la familia"
        deactivateHint="Sus productos y reglas existentes no cambian."
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
