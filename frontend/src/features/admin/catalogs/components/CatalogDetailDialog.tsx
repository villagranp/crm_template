import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import {
  Alert,
  Box,
  Chip,
  DialogContentText,
  IconButton,
  Skeleton,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';

import {
  AdminDialog,
  describeApiError,
  DetailSection,
  EmptyState,
  FilterChips,
} from '@/features/admin/common';
import { usePermission } from '@/hooks/use-permission';

import { metadataFieldLabel, metadataValueLabel } from '../catalog-metadata';
import type { CatalogItem, CatalogItemMetadata } from '../catalogs.api';
import { CATALOG_PERMISSIONS } from '../catalogs.permissions';
import { formatMetadata } from '../catalogs.schemas';
import {
  useCatalog,
  useCreateCatalogItem,
  useReorderCatalogItems,
  useUpdateCatalogItem,
} from '../catalogs.queries';
import { planMove } from '../item-order';
import { CatalogItemForm } from './CatalogItemForm';
import { describeCatalogItemError } from '../catalogs.errors';

const ITEM_COLUMNS = 5;

type ItemFilter = '' | 'active';
const ITEM_FILTERS: readonly { value: ItemFilter; label: string }[] = [
  { value: '', label: 'Todos' },
  { value: 'active', label: 'Sólo activos' },
];

const CLOSED_SET_NOTE =
  'Conjunto cerrado: sus valores los usa el sistema. No se crean ni se desactivan; sólo cambian la etiqueta y el orden.';

/** `metadata` legible en la fila: "Etapa cerrada: sí · Resultado de la etapa: Ganada". */
function describeMetadata(metadata: CatalogItemMetadata | null, withSchema: boolean): string {
  if (!metadata) {
    return '';
  }
  if (!withSchema) {
    return formatMetadata(metadata);
  }
  return Object.entries(metadata)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([key, value]) => {
      let shown: string;
      if (typeof value === 'boolean') {
        shown = value ? 'sí' : 'no';
      } else if (Array.isArray(value)) {
        shown = value.map((item) => metadataValueLabel(String(item))).join(', ');
      } else {
        shown = metadataValueLabel(String(value));
      }
      return `${metadataFieldLabel(key)}: ${shown}`;
    })
    .join(' · ');
}

export interface CatalogDetailDialogProps {
  catalogId: string | null;
  onClose: () => void;
}

/**
 * Detalle de un catálogo con sus elementos: alta y edición en línea,
 * activar/desactivar y reordenar. Los elementos nunca se borran (D9).
 */
export function CatalogDetailDialog({ catalogId, onClose }: CatalogDetailDialogProps) {
  const canEdit = usePermission(CATALOG_PERMISSIONS.edit);
  const catalog = useCatalog(catalogId);
  const createItem = useCreateCatalogItem(catalogId ?? '');
  const updateItem = useUpdateCatalogItem(catalogId ?? '');
  const reorder = useReorderCatalogItems(catalogId ?? '');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [itemFilter, setItemFilter] = useState<ItemFilter>('');

  useEffect(() => {
    setEditingId(null);
    setItemFilter('');
    createItem.reset();
    updateItem.reset();
    reorder.reset();
    // Sólo al cambiar de catálogo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogId]);

  const allItems = catalog.data?.items ?? [];
  const items = itemFilter === 'active' ? allItems.filter((item) => item.isActive) : allItems;
  const closedSet = catalog.data?.closedSet ?? false;
  const metadataSchema = catalog.data?.metadataSchema ?? null;
  // Con el filtro de activos el orden visible no es el real: subir y bajar se ofrecen sólo con "Todos".
  const canReorder = canEdit && itemFilter === '';
  const isBusy = createItem.isPending || updateItem.isPending || reorder.isPending;
  // El error que se muestra es el de la última operación que falló.
  const failed = [createItem, updateItem, reorder]
    .filter((mutation) => mutation.isError)
    .sort((a, b) => b.submittedAt - a.submittedAt)[0];
  const itemError = failed ? describeCatalogItemError(failed.error) : null;

  const move = (index: number, direction: -1 | 1) => {
    const changes = planMove(items, index, direction);
    if (changes.length > 0) {
      reorder.mutate(changes);
    }
  };

  let body;
  if (catalog.isError) {
    body = <Alert severity="error">{describeApiError(catalog.error).message}</Alert>;
  } else if (catalog.isPending) {
    body = (
      <Stack role="status" aria-label="Cargando" spacing={1}>
        <Skeleton variant="text" />
        <Skeleton variant="text" />
      </Stack>
    );
  } else {
    body = (
      <Stack spacing={3}>
        <DetailSection number={1} title="Elementos">
          {closedSet ? (
            <Alert severity="info" icon={false} sx={{ mb: 2 }}>
              <Chip size="small" color="info" label="Conjunto cerrado" sx={{ mr: 1 }} />
              {CLOSED_SET_NOTE}
            </Alert>
          ) : null}
          {allItems.length > 0 ? (
            <Box sx={{ mb: 1.5 }}>
              <FilterChips
                label="Filtrar elementos por estado"
                value={itemFilter}
                onChange={(value) => setItemFilter(value === 'active' ? 'active' : '')}
                options={ITEM_FILTERS.map((filter) => ({ ...filter }))}
              />
            </Box>
          ) : null}
          {items.length === 0 ? (
            <EmptyState
              title={
                allItems.length === 0 ? 'El catálogo no tiene elementos' : 'No hay elementos activos'
              }
              description={canEdit && !closedSet && allItems.length === 0 ? 'Añade el primero abajo.' : undefined}
            />
          ) : (
            <TableContainer className="scroll-x">
              <Table size="small" aria-label="Elementos">
                <TableHead>
                  <TableRow>
                    <TableCell>Código</TableCell>
                    <TableCell>Etiqueta</TableCell>
                    <TableCell>Orden</TableCell>
                    <TableCell>Estado</TableCell>
                    <TableCell align="right">Acciones</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {items.map((item, index) =>
                    editingId === item.id ? (
                      <TableRow key={item.id}>
                        <TableCell colSpan={ITEM_COLUMNS}>
                          <CatalogItemForm
                            item={item}
                            metadataSchema={metadataSchema}
                            metadataLocked={closedSet}
                            isPending={updateItem.isPending}
                            onCancel={() => setEditingId(null)}
                            onSubmit={async (values) => {
                              await updateItem.mutateAsync({
                                itemId: item.id,
                                // Conjunto cerrado: sólo cambia la etiqueta (RN-07.25).
                                body: closedSet
                                  ? { label: values.label }
                                  : { label: values.label, metadata: values.metadata },
                              });
                              setEditingId(null);
                            }}
                          />
                        </TableCell>
                      </TableRow>
                    ) : (
                      <ItemRow
                        key={item.id}
                        item={item}
                        metadataText={describeMetadata(item.metadata, metadataSchema !== null)}
                        isFirst={index === 0}
                        isLast={index === items.length - 1}
                        canEdit={canEdit}
                        canReorder={canReorder}
                        canToggle={canEdit && !closedSet}
                        disabled={isBusy}
                        onMove={(direction) => move(index, direction)}
                        onEdit={() => setEditingId(item.id)}
                        onToggleActive={(isActive) =>
                          updateItem.mutate({ itemId: item.id, body: { isActive } })
                        }
                      />
                    ),
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DetailSection>
        {itemError ? (
          <Alert severity="error">
            {itemError.message}
            {itemError.details.length > 0 ? (
              <ul>
                {itemError.details.map((detail) => (
                  <li key={detail}>{detail}</li>
                ))}
              </ul>
            ) : null}
          </Alert>
        ) : null}
        {canEdit && !closedSet ? (
          <DetailSection number={2} title="Añadir elemento">
            <CatalogItemForm
              item={null}
              metadataSchema={metadataSchema}
              isPending={createItem.isPending}
              onSubmit={(values) => createItem.mutateAsync(values)}
            />
          </DetailSection>
        ) : null}
      </Stack>
    );
  }

  return (
    <AdminDialog
      open={catalogId !== null}
      onClose={onClose}
      title={catalog.data ? `Catálogo ${catalog.data.name}` : 'Catálogo'}
      subtitle="Catálogos"
      maxWidth="lg"
      fullScreenBelow="md"
    >
      {catalog.data ? (
        <DialogContentText variant="body2" sx={{ mb: 2.5 }}>
          {`Clave: ${catalog.data.key}${catalog.data.isSystem ? ' · Catálogo del sistema' : ''}. Los elementos no se borran: se desactivan.`}
        </DialogContentText>
      ) : null}
      {body}
    </AdminDialog>
  );
}

interface ItemRowProps {
  item: CatalogItem;
  metadataText: string;
  isFirst: boolean;
  isLast: boolean;
  canEdit: boolean;
  canReorder: boolean;
  /** Activar/desactivar (no en un conjunto cerrado). */
  canToggle: boolean;
  disabled: boolean;
  onMove: (direction: -1 | 1) => void;
  onEdit: () => void;
  onToggleActive: (isActive: boolean) => void;
}

function ItemRow({
  item,
  metadataText,
  isFirst,
  isLast,
  canEdit,
  canReorder,
  canToggle,
  disabled,
  onMove,
  onEdit,
  onToggleActive,
}: ItemRowProps) {
  return (
    <TableRow hover>
      <TableCell>{item.code}</TableCell>
      <TableCell>
        <Typography variant="body2">{item.label}</Typography>
        {metadataText ? (
          <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
            {metadataText}
          </Typography>
        ) : null}
      </TableCell>
      <TableCell>
        {canReorder ? (
          <Stack direction="row" spacing={0.5}>
            <IconButton
              aria-label={`Subir ${item.label}`}
              disabled={disabled || isFirst}
              onClick={() => onMove(-1)}
            >
              <ArrowUpwardIcon fontSize="small" />
            </IconButton>
            <IconButton
              aria-label={`Bajar ${item.label}`}
              disabled={disabled || isLast}
              onClick={() => onMove(1)}
            >
              <ArrowDownwardIcon fontSize="small" />
            </IconButton>
          </Stack>
        ) : (
          item.sortOrder
        )}
      </TableCell>
      <TableCell>
        {canToggle ? (
          <Switch
            checked={item.isActive}
            disabled={disabled}
            onChange={(event) => onToggleActive(event.target.checked)}
            inputProps={{
              'aria-label': `${item.isActive ? 'Desactivar' : 'Activar'} ${item.label}`,
            }}
          />
        ) : (
          <Chip
            size="small"
            color={item.isActive ? 'success' : 'default'}
            label={item.isActive ? 'Activo' : 'Inactivo'}
          />
        )}
      </TableCell>
      <TableCell align="right">
        {canEdit ? (
          <IconButton aria-label={`Editar ${item.label}`} disabled={disabled} onClick={onEdit}>
            <EditOutlinedIcon />
          </IconButton>
        ) : null}
      </TableCell>
    </TableRow>
  );
}
