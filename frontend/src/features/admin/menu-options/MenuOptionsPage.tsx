import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import ListAltOutlinedIcon from '@mui/icons-material/ListAltOutlined';
import ToggleOffOutlinedIcon from '@mui/icons-material/ToggleOffOutlined';
import ToggleOnOutlinedIcon from '@mui/icons-material/ToggleOnOutlined';
import {
  Alert,
  Box,
  Button,
  Chip,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { MaterialSymbol } from '@/components/layout/MaterialSymbol';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  AdminListCard,
  adminBreadcrumbs,
  ConfirmDialog,
  describeApiError,
  EmptyState,
  ListToolbar,
  recordsSubtitle,
  RefreshTool,
  subtleSurface,
} from '@/features/admin/common';
import { useCan } from '@/hooks/use-permission';

import { MenuOptionFormDialog, type MenuOptionFormMode } from './components/MenuOptionFormDialog';
import type { MenuOption } from './menu-options.api';
import { MENU_OPTION_PERMISSIONS } from './menu-options.permissions';
import {
  menuOptionKeys,
  useDeleteMenuOption,
  useMenuOptions,
  useReorderMenuOptions,
  useUpdateMenuOption,
} from './menu-options.queries';
import {
  buildMenuTree,
  MENU_OPTION_ERRORS,
  moveAmongSiblings,
  type MenuTreeNode,
} from './menu-tree';

const TITLE = 'Opciones de menú';
const DESCRIPTION = 'Estructura del menú y la ruta y el permiso de cada opción.';
/** Sangría por nivel, en unidades de espaciado del tema. */
const INDENT_PER_LEVEL = 3;

/** Pantalla de administración «Opciones de menú». Ruta y permiso en `features/admin/admin-routes.ts`. */
export function MenuOptionsPage() {
  const can = useCan();
  const options = useMenuOptions();
  const reorder = useReorderMenuOptions();
  const update = useUpdateMenuOption();
  const remove = useDeleteMenuOption();
  const queryClient = useQueryClient();
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
        <ListItem
          component="div"
          divider
          sx={{
            pl: { xs: 2 + node.depth * INDENT_PER_LEVEL, md: 2.5 + node.depth * INDENT_PER_LEVEL },
            py: 1,
            flexWrap: 'wrap',
            gap: 1,
          }}
        >
          <Box aria-hidden sx={{ display: 'flex', color: 'text.secondary' }}>
            {option.icon ? <MaterialSymbol name={option.icon} /> : null}
          </Box>
          <ListItemText
            sx={{ minWidth: 0, flex: '1 1 12rem' }}
            primary={
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                <span>{option.label}</span>
                <Chip
                  size="small"
                  variant="outlined"
                  label={option.kind === 'GROUP' ? 'Grupo' : 'Navegable'}
                />
                {option.isSystem ? <Chip size="small" variant="outlined" label="Sistema" /> : null}
                <Chip
                  size="small"
                  color={option.isActive ? 'success' : 'default'}
                  label={option.isActive ? 'Activa' : 'Inactiva'}
                />
              </Stack>
            }
            secondary={[option.key, option.path, option.requiredPermissionCode]
              .filter(Boolean)
              .join(' · ')}
            secondaryTypographyProps={{ sx: { overflowWrap: 'anywhere' } }}
          />
          {canEdit ? (
            <Stack direction="row" spacing={0.25} sx={{ color: 'text.secondary', ml: 'auto' }}>
              <IconButton
                aria-label={`Subir ${option.label}`}
                disabled={busy || index === 0}
                onClick={() => move(option, 'up')}
              >
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
              <IconButton
                aria-label={`Editar ${option.label}`}
                onClick={() => setForm({ kind: 'edit', option })}
              >
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
      <Stack role="status" aria-label="Cargando" spacing={1} sx={{ p: 2 }}>
        <Skeleton variant="text" />
        <Skeleton variant="text" />
        <Skeleton variant="text" />
      </Stack>
    );
  } else if (options.isError) {
    body = (
      <EmptyState
        role="alert"
        title="No se pudo cargar el menú"
        description={describeApiError(options.error).message}
        action={
          <Button variant="outlined" onClick={() => void options.refetch()}>
            Reintentar
          </Button>
        }
      />
    );
  } else if (tree.length === 0) {
    body = <EmptyState icon={<ListAltOutlinedIcon />} title="No hay opciones de menú" />;
  } else {
    body = tree.map((entry) => (
      <Box key={entry.module.id} component="section" aria-labelledby={`modulo-${entry.module.id}`}>
        <Typography
          id={`modulo-${entry.module.id}`}
          component="h3"
          sx={(theme) => ({
            ...theme.typography.overline,
            fontFamily: theme.typography.fontFamily,
            fontWeight: 700,
            color: theme.palette.text.secondary,
            bgcolor: subtleSurface(theme),
            px: { xs: 2, md: 2.5 },
            py: 1,
            borderBottom: 1,
            borderColor: 'divider',
          })}
        >
          {entry.module.name}
        </Typography>
        <List disablePadding component="ul" aria-label={`Opciones de ${entry.module.name}`}>
          {entry.nodes.map((node, index) => renderNode(node, entry.nodes, index))}
        </List>
      </Box>
    ));
  }

  return (
    <>
      <PageHeader title={TITLE} breadcrumbs={adminBreadcrumbs(TITLE)} />

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

      <AdminListCard
        icon={<ListAltOutlinedIcon />}
        title={TITLE}
        subtitle={recordsSubtitle(options.data?.length, DESCRIPTION, ['opción', 'opciones'])}
        tools={
          <RefreshTool
            busy={options.isFetching}
            onRefresh={() => void queryClient.invalidateQueries({ queryKey: menuOptionKeys.all })}
          />
        }
        toolbar={
          can(MENU_OPTION_PERMISSIONS.create) ? (
            <ListToolbar
              primaryAction={{ label: 'Nueva opción', onClick: () => setForm({ kind: 'create' }) }}
            />
          ) : undefined
        }
      >
        {body}
      </AdminListCard>

      <MenuOptionFormDialog
        mode={form}
        options={options.data ?? []}
        onClose={() => setForm(null)}
      />
      <ConfirmDialog
        open={toDelete !== null}
        title="Eliminar opción de menú"
        description={
          toDelete
            ? `Se eliminará «${toDelete.label}» y dejará de aparecer en el menú de quien la tenga asignada.`
            : undefined
        }
        confirmLabel="Eliminar"
        destructive
        isPending={remove.isPending}
        errorMessage={
          remove.isError ? describeApiError(remove.error, MENU_OPTION_ERRORS).message : null
        }
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
