import AddIcon from '@mui/icons-material/Add';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import ToggleOffOutlinedIcon from '@mui/icons-material/ToggleOffOutlined';
import ToggleOnOutlinedIcon from '@mui/icons-material/ToggleOnOutlined';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import { useMemo, useState } from 'react';

import { MaterialSymbol } from '@/components/layout/MaterialSymbol';
import { PageHeader } from '@/components/layout/PageHeader';
import { adminBreadcrumbs, ConfirmDialog, describeApiError, EmptyState } from '@/features/admin/common';
import { useCan } from '@/hooks/use-permission';

import { MenuOptionFormDialog, type MenuOptionFormMode } from './components/MenuOptionFormDialog';
import type { MenuOption } from './menu-options.api';
import { MENU_OPTION_PERMISSIONS } from './menu-options.permissions';
import { useDeleteMenuOption, useMenuOptions, useReorderMenuOptions, useUpdateMenuOption } from './menu-options.queries';
import { buildMenuTree, MENU_OPTION_ERRORS, moveAmongSiblings, type MenuTreeNode } from './menu-tree';

const TITLE = 'Opciones de menú';
/** Sangría por nivel, en unidades de espaciado del tema. */
const INDENT_PER_LEVEL = 3;

/** Pantalla de administración «Opciones de menú». Ruta y permiso en `features/admin/admin-routes.ts`. */
export function MenuOptionsPage() {
  const can = useCan();
  const options = useMenuOptions();
  const reorder = useReorderMenuOptions();
  const update = useUpdateMenuOption();
  const remove = useDeleteMenuOption();
  const [form, setForm] = useState<MenuOptionFormMode | null>(null);
  const [toDelete, setToDelete] = useState<MenuOption | null>(null);

  const tree = useMemo(() => buildMenuTree(options.data ?? []), [options.data]);
  const canEdit = can(MENU_OPTION_PERMISSIONS.edit);
  const canRemove = can(MENU_OPTION_PERMISSIONS.remove);
  const actionError = reorder.isError ? reorder.error : update.isError ? update.error : null;

  const move = (option: MenuOption, direction: 'up' | 'down') => {
    const items = moveAmongSiblings(options.data ?? [], option.id, direction);
    if (items.length > 0) {
      update.reset();
      reorder.mutate(items);
    }
  };

  const renderNode = (node: MenuTreeNode, siblings: MenuTreeNode[], index: number) => {
    const { option } = node;
    const busy = reorder.isPending || update.isPending;
    return (
      <Box key={option.id} component="li" sx={{ listStyle: 'none' }}>
        <ListItem component="div" divider sx={{ pl: 2 + node.depth * INDENT_PER_LEVEL, flexWrap: 'wrap', gap: 1 }}>
          <Box aria-hidden sx={{ display: 'flex', color: 'text.secondary' }}>
            {option.icon ? <MaterialSymbol name={option.icon} /> : null}
          </Box>
          <ListItemText
            sx={{ minWidth: 0, flex: '1 1 12rem' }}
            primary={
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                <span>{option.label}</span>
                <Chip size="small" variant="outlined" label={option.kind === 'GROUP' ? 'Grupo' : 'Navegable'} />
                {option.isSystem ? <Chip size="small" variant="outlined" label="Sistema" /> : null}
                <Chip size="small" color={option.isActive ? 'success' : 'default'} label={option.isActive ? 'Activa' : 'Inactiva'} />
              </Stack>
            }
            secondary={[option.key, option.path, option.requiredPermissionCode].filter(Boolean).join(' · ')}
            secondaryTypographyProps={{ sx: { overflowWrap: 'anywhere' } }}
          />
          {canEdit ? (
            <Stack direction="row" spacing={0.5}>
              <IconButton aria-label={`Subir ${option.label}`} disabled={busy || index === 0} onClick={() => move(option, 'up')}>
                <ArrowUpwardIcon />
              </IconButton>
              <IconButton
                aria-label={`Bajar ${option.label}`}
                disabled={busy || index === siblings.length - 1}
                onClick={() => move(option, 'down')}
              >
                <ArrowDownwardIcon />
              </IconButton>
              <IconButton
                aria-label={`${option.isActive ? 'Desactivar' : 'Activar'} ${option.label}`}
                disabled={busy}
                onClick={() => {
                  reorder.reset();
                  update.mutate({ id: option.id, body: { isActive: !option.isActive } });
                }}
              >
                {option.isActive ? <ToggleOnOutlinedIcon /> : <ToggleOffOutlinedIcon />}
              </IconButton>
              <IconButton aria-label={`Editar ${option.label}`} onClick={() => setForm({ kind: 'edit', option })}>
                <EditOutlinedIcon />
              </IconButton>
            </Stack>
          ) : null}
          {canRemove && !option.isSystem ? (
            <IconButton
              aria-label={`Eliminar ${option.label}`}
              onClick={() => {
                remove.reset();
                setToDelete(option);
              }}
            >
              <DeleteOutlineIcon />
            </IconButton>
          ) : null}
        </ListItem>
        {node.children.length > 0 ? (
          <Box component="ul" sx={{ m: 0, p: 0 }}>
            {node.children.map((child, childIndex) => renderNode(child, node.children, childIndex))}
          </Box>
        ) : null}
      </Box>
    );
  };

  let body;
  if (options.isPending) {
    body = (
      <Stack role="status" aria-label="Cargando" spacing={1}>
        <Skeleton variant="rectangular" />
        <Skeleton variant="rectangular" />
      </Stack>
    );
  } else if (options.isError) {
    body = (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" variant="text" onClick={() => void options.refetch()}>
            Reintentar
          </Button>
        }
      >
        {describeApiError(options.error).message}
      </Alert>
    );
  } else if (tree.length === 0) {
    body = <EmptyState title="No hay opciones de menú" />;
  } else {
    body = (
      <Stack spacing={2}>
        {tree.map((entry) => (
          <Card key={entry.module.id} component="section" aria-labelledby={`modulo-${entry.module.id}`}>
            <CardContent>
              <Typography id={`modulo-${entry.module.id}`} variant="h5" component="h2" sx={{ mb: 1 }}>
                {entry.module.name}
              </Typography>
              <List disablePadding component="ul" aria-label={`Opciones de ${entry.module.name}`}>
                {entry.nodes.map((node, index) => renderNode(node, entry.nodes, index))}
              </List>
            </CardContent>
          </Card>
        ))}
      </Stack>
    );
  }

  return (
    <>
      <PageHeader
        title={TITLE}
        subtitle="Estructura del menú y la ruta y el permiso de cada opción."
        breadcrumbs={adminBreadcrumbs(TITLE)}
        actions={
          can(MENU_OPTION_PERMISSIONS.create) ? (
            <Button startIcon={<AddIcon />} onClick={() => setForm({ kind: 'create' })}>
              Nueva opción
            </Button>
          ) : null
        }
      />

      {actionError ? (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          onClose={() => {
            reorder.reset();
            update.reset();
          }}
        >
          {describeApiError(actionError, MENU_OPTION_ERRORS).message}
        </Alert>
      ) : null}

      {body}

      <MenuOptionFormDialog mode={form} options={options.data ?? []} onClose={() => setForm(null)} />
      <ConfirmDialog
        open={toDelete !== null}
        title="Eliminar opción de menú"
        description={
          toDelete ? `Se eliminará «${toDelete.label}» y dejará de aparecer en el menú de quien la tenga asignada.` : undefined
        }
        confirmLabel="Eliminar"
        destructive
        isPending={remove.isPending}
        errorMessage={remove.isError ? describeApiError(remove.error, MENU_OPTION_ERRORS).message : null}
        onClose={() => setToDelete(null)}
        onConfirm={() => {
          if (toDelete) {
            remove.mutate(toDelete.id, { onSuccess: () => setToDelete(null) });
          }
        }}
      />
    </>
  );
}
