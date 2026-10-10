import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import {
  Alert,
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

import { AdminDialog, describeApiError, DetailSection, EmptyState } from '@/features/admin/common';
import { usePermission } from '@/hooks/use-permission';

import type { CatalogItem } from '../catalogs.api';
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
import { CATALOG_ITEM_ERRORS } from '../catalogs.errors';

const ITEM_COLUMNS = 5;

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

  useEffect(() => {
    setEditingId(null);
    createItem.reset();
    updateItem.reset();
    reorder.reset();
    // Sólo al cambiar de catálogo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogId]);

  const items = catalog.data?.items ?? [];
  const isBusy = createItem.isPending || updateItem.isPending || reorder.isPending;
  const failed = [createItem, updateItem, reorder].find((mutation) => mutation.isError);
  const errorMessage = failed ? describeApiError(failed.error, CATALOG_ITEM_ERRORS).message : null;

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
          {items.length === 0 ? (
            <EmptyState
              title="El catálogo no tiene elementos"
              description={canEdit ? 'Añade el primero abajo.' : undefined}
            />
          ) : (
            <TableContainer className="scroll-x">
              <Table size="small" aria-label="Elementos">
                <TableHead>
                  <TableRow>
                    <TableCell>Orden</TableCell>
                    <TableCell>Código</TableCell>
                    <TableCell>Etiqueta</TableCell>
                    <TableCell>Activo</TableCell>
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
                            isPending={updateItem.isPending}
                            onCancel={() => setEditingId(null)}
                            onSubmit={async (values) => {
                              await updateItem.mutateAsync({
                                itemId: item.id,
                                body: { label: values.label, metadata: values.metadata },
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
                        isFirst={index === 0}
                        isLast={index === items.length - 1}
                        canEdit={canEdit}
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
        {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}
        {canEdit ? (
          <DetailSection number={2} title="Añadir elemento">
            <CatalogItemForm
              item={null}
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
  isFirst: boolean;
  isLast: boolean;
  canEdit: boolean;
  disabled: boolean;
  onMove: (direction: -1 | 1) => void;
  onEdit: () => void;
  onToggleActive: (isActive: boolean) => void;
}

function ItemRow({
  item,
  isFirst,
  isLast,
  canEdit,
  disabled,
  onMove,
  onEdit,
  onToggleActive,
}: ItemRowProps) {
  const metadata = formatMetadata(item.metadata);
  return (
    <TableRow hover>
      <TableCell>
        {canEdit ? (
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
      <TableCell>{item.code}</TableCell>
      <TableCell>
        <Typography variant="body2">{item.label}</Typography>
        {metadata ? (
          <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
            {metadata}
          </Typography>
        ) : null}
      </TableCell>
      <TableCell>
        {canEdit ? (
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
