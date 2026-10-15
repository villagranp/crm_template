import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import { Box } from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import {
  describeApiError,
  useTableQueryState,
  type DataTableColumn,
} from '@/features/admin/common';

import type { Product } from '../products.api';
import { productKeys, useProducts, useSaveProduct } from '../products.queries';
import { ActiveChip } from './ActiveChip';
import { MasterListCard } from './MasterListCard';
import { ProductFormDialog } from './ProductFormDialog';
import { ToggleActiveDialog } from './ToggleActiveDialog';

const FILTER_KEYS = ['isActive'] as const;
/** Lista blanca de `GET /products` (la columna ordenable es el SKU). */
const SORTABLE = ['sku', 'createdAt', 'updatedAt'] as const;

const COLUMNS: DataTableColumn<Product>[] = [
  {
    id: 'sku',
    header: 'SKU',
    render: (product) => (
      <Box component="span" sx={{ fontWeight: 600 }}>
        {product.sku}
      </Box>
    ),
    sortable: true,
    primary: true,
  },
  { id: 'description', header: 'Descripción', render: (product) => product.description },
  { id: 'family', header: 'Familia', render: (product) => product.family.name, hideOnMobile: true },
  {
    id: 'baseUnit',
    header: 'Unidad base',
    render: (product) => `${product.baseUnit.code} (${product.baseUnit.symbol})`,
    hideOnMobile: true,
  },
  {
    id: 'isActive',
    header: 'Estado',
    render: (product) => <ActiveChip isActive={product.isActive} />,
  },
];

type FormState = { open: false } | { open: true; product: Product | null };

/** Pestaña «Productos» de Productos y unidades (07 E.5). */
export function ProductsTab({ canConfigure }: { canConfigure: boolean }) {
  const table = useTableQueryState<'isActive'>({
    filterKeys: FILTER_KEYS,
    sortableFields: SORTABLE,
    paramPrefix: 'productos.',
  });
  const products = useProducts(table.apiQuery);
  const toggleMutation = useSaveProduct();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>({ open: false });
  const [toToggle, setToToggle] = useState<Product | null>(null);

  return (
    <>
      <MasterListCard
        title="Productos"
        description="Maestro local de productos con su familia y unidad base."
        icon={<Inventory2OutlinedIcon />}
        table={table}
        query={products}
        columns={COLUMNS}
        nameOf={(product) => product.sku}
        searchLabel="Buscar por SKU o descripción"
        createLabel="Nuevo producto"
        emptyTitle="No hay productos"
        canConfigure={canConfigure}
        onRefresh={() => void queryClient.invalidateQueries({ queryKey: productKeys.all })}
        onCreate={() => setForm({ open: true, product: null })}
        onEdit={(product) => setForm({ open: true, product })}
        onToggleActive={(product) => {
          toggleMutation.reset();
          setToToggle(product);
        }}
      />
      <ProductFormDialog
        open={form.open}
        product={form.open ? form.product : null}
        onClose={() => setForm({ open: false })}
      />
      <ToggleActiveDialog
        target={toToggle ? { name: toToggle.sku, isActive: toToggle.isActive } : null}
        noun="el producto"
        deactivateHint="Las líneas de proyectos y forecast que ya lo usan no cambian."
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
