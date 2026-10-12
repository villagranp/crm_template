import ContactsOutlinedIcon from '@mui/icons-material/ContactsOutlined';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { Alert, Box, Button, Card, Chip, IconButton, ListItemText, Menu, MenuItem, Stack, Typography } from '@mui/material';
import { useId, useState } from 'react';

import { ConfirmDialog, DataTable, FilterChips, ListToolbar, useTableQueryState, type DataTableColumn } from '@/components/data';
import { useCan } from '@/hooks/use-permission';
import { describeApiError } from '@/lib/api-error-view';

import { orDash } from '../customer-format';
import { CONTACT_SORT_FIELDS, type Contact, type Customer } from '../customers.api';
import { CUSTOMER_ERROR_CODES, CUSTOMER_ERROR_MESSAGES, hasErrorCode, withReference } from '../customers.errors';
import { CONTACT_PERMISSIONS } from '../customers.permissions';
import {
  useClearPrimaryContact,
  useContacts,
  useDeleteContact,
  useRestoreContact,
  useSetPrimaryContact,
  useUpdateContact,
} from '../customers.queries';

import { ContactFormDialog } from './ContactFormDialog';

const FILTER_KEYS = ['status', 'deleted'] as const;
type ContactFilterKey = (typeof FILTER_KEYS)[number];
const DEFAULT_SORT = { field: 'lastName', direction: 'asc' } as const;
const DELETED_VIEW = 'DELETED';

export interface CustomerContactsSectionProps {
  customer: Customer;
  /** Patrón de teléfono del país del cliente, si `form-options` lo trae. */
  phonePattern?: string | null;
}

type PendingAction =
  | { kind: 'delete'; contact: Contact }
  | { kind: 'deactivate'; contact: Contact }
  | null;

/**
 * Contactos dentro de la ficha (02 §E.5, F-09). La pantalla sólo la monta con
 * `contactos.ver`. Las acciones de escritura dependen de
 * `capabilities.canManageContacts` (cliente editable por el usuario, D-02.7)
 * y del permiso de cada operación; el backend lo vuelve a comprobar.
 */
export function CustomerContactsSection({ customer, phonePattern }: CustomerContactsSectionProps) {
  const titleId = useId();
  const can = useCan();
  const writable = customer.capabilities.canManageContacts && !customer.isDeleted;
  const canCreate = writable && can(CONTACT_PERMISSIONS.create);
  const canEdit = writable && can(CONTACT_PERMISSIONS.edit);
  const canDelete = writable && can(CONTACT_PERMISSIONS.delete);
  const canSeeDeleted = can(CONTACT_PERMISSIONS.delete);

  const table = useTableQueryState<ContactFilterKey>({
    filterKeys: FILTER_KEYS,
    sortableFields: CONTACT_SORT_FIELDS,
    defaultSort: DEFAULT_SORT,
    paramPrefix: 'contacts.',
  });
  const showDeleted = canSeeDeleted && table.state.filters.deleted === 'true';
  const apiQuery = { ...table.apiQuery, deleted: showDeleted ? 'true' : undefined, status: showDeleted ? 'ALL' : table.apiQuery.status };
  const contacts = useContacts(customer.id, apiQuery);

  const [formContact, setFormContact] = useState<Contact | null | undefined>(undefined);
  const [menu, setMenu] = useState<{ anchor: HTMLElement; contact: Contact } | null>(null);
  const [pending, setPending] = useState<PendingAction>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const update = useUpdateContact(customer.id);
  const setPrimary = useSetPrimaryContact(customer.id);
  const clearPrimary = useClearPrimaryContact(customer.id);
  const remove = useDeleteContact(customer.id);
  const restore = useRestoreContact(customer.id);
  const rowMutations = [setPrimary, clearPrimary, restore];
  const rowError = rowMutations.find((mutation) => mutation.isError)?.error ?? (update.isError && !pending ? update.error : null);

  const chipValue = showDeleted ? DELETED_VIEW : (table.state.filters.status ?? '');
  const chipOptions = [
    { value: '', label: 'Activos' },
    { value: 'INACTIVE', label: 'Inactivos' },
    { value: 'ALL', label: 'Todos' },
    ...(canSeeDeleted ? [{ value: DELETED_VIEW, label: 'Eliminados' }] : []),
  ];

  const closePending = () => {
    setPending(null);
    remove.reset();
    update.reset();
  };

  const setActive = (contact: Contact, isActive: boolean, onDone?: () => void) => {
    update.mutate(
      { contactId: contact.id, input: { isActive } },
      {
        onSuccess: () => {
          setNotice(isActive ? `${contact.fullName} está activo.` : `${contact.fullName} está inactivo.`);
          onDone?.();
        },
      },
    );
  };

  const columns: DataTableColumn<Contact>[] = [
    {
      id: 'lastName',
      header: 'Nombre',
      sortable: true,
      primary: true,
      render: (contact) => (
        <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
          <Typography variant="body2" sx={{ fontWeight: 'fontWeightMedium', overflowWrap: 'anywhere' }}>
            {contact.fullName}
          </Typography>
          {contact.isPrimary ? <Chip size="small" color="primary" label="Principal" /> : null}
        </Stack>
      ),
    },
    { id: 'jobTitle', header: 'Cargo', sortable: true, render: (contact) => orDash(contact.jobTitle) },
    { id: 'phone', header: 'Teléfono', hideOnMobile: true, render: (contact) => orDash(contact.phone) },
    {
      id: 'email',
      header: 'Correo',
      hideOnMobile: true,
      render: (contact) => <Box sx={{ overflowWrap: 'anywhere' }}>{orDash(contact.email)}</Box>,
    },
    {
      id: 'status',
      header: 'Estado',
      render: (contact) =>
        contact.isDeleted ? (
          <Chip size="small" variant="outlined" color="error" label="Eliminado" />
        ) : (
          <Chip size="small" variant={contact.isActive ? 'filled' : 'outlined'} label={contact.isActive ? 'Activo' : 'Inactivo'} />
        ),
    },
  ];

  const hasRowActions = showDeleted ? canDelete : canEdit || canDelete;
  const menuContact = menu?.contact ?? null;

  let pendingDialog = null;
  if (pending?.kind === 'delete') {
    const hasHistory = hasErrorCode(remove.error, CUSTOMER_ERROR_CODES.contactHasHistory);
    pendingDialog = hasHistory ? (
      <ConfirmDialog
        open
        title="No se puede eliminar el contacto"
        description="Este contacto participa en visitas o actividades; puedes desactivarlo para que deje de ofrecerse."
        confirmLabel="Desactivar"
        isPending={update.isPending}
        errorMessage={update.isError ? withReference(describeApiError(update.error, CUSTOMER_ERROR_MESSAGES)) : null}
        onConfirm={() => setActive(pending.contact, false, closePending)}
        onClose={closePending}
      />
    ) : (
      <ConfirmDialog
        open
        destructive
        title="Eliminar contacto"
        description={`«${pending.contact.fullName}» dejará de mostrarse. La eliminación es lógica: su historia se conserva.${
          pending.contact.isPrimary ? ' El cliente quedará sin contacto principal.' : ''
        }`}
        confirmLabel="Eliminar"
        isPending={remove.isPending}
        errorMessage={remove.isError ? withReference(describeApiError(remove.error, CUSTOMER_ERROR_MESSAGES)) : null}
        onConfirm={() =>
          remove.mutate(pending.contact.id, {
            onSuccess: () => {
              setNotice(`${pending.contact.fullName} eliminado.`);
              closePending();
            },
          })
        }
        onClose={closePending}
      />
    );
  } else if (pending?.kind === 'deactivate') {
    pendingDialog = (
      <ConfirmDialog
        open
        title="Desactivar contacto principal"
        description={`«${pending.contact.fullName}» es el contacto principal. Al desactivarlo, el cliente quedará sin contacto principal.`}
        confirmLabel="Desactivar"
        isPending={update.isPending}
        errorMessage={update.isError ? withReference(describeApiError(update.error, CUSTOMER_ERROR_MESSAGES)) : null}
        onConfirm={() => setActive(pending.contact, false, closePending)}
        onClose={closePending}
      />
    );
  }

  return (
    <Card component="section" aria-labelledby={titleId}>
      <Box sx={{ px: { xs: 2, sm: 2.5 }, pt: 1.5 }}>
        <Typography id={titleId} variant="h6" component="h2">
          Contactos
        </Typography>
      </Box>
      <ListToolbar
        filters={
          <FilterChips
            label="Filtrar contactos por estado"
            options={chipOptions}
            value={chipValue}
            onChange={(value) =>
              value === DELETED_VIEW
                ? table.setFilters({ deleted: 'true', status: undefined })
                : table.setFilters({ status: value || undefined, deleted: undefined })
            }
          />
        }
        search={{ value: table.searchInput, onChange: table.setSearchInput, label: 'Buscar contactos por nombre, apellidos, correo o cargo' }}
        primaryAction={canCreate ? { label: 'Nuevo contacto', onClick: () => setFormContact(null) } : undefined}
      />

      {rowError ? (
        <Alert severity="error" sx={{ mx: 2, mt: 2 }} onClose={() => {
            rowMutations.forEach((mutation) => mutation.reset());
            update.reset();
          }}>
          {withReference(describeApiError(rowError, CUSTOMER_ERROR_MESSAGES))}
        </Alert>
      ) : null}
      <Typography role="status" variant="caption" color="text.secondary" sx={{ display: 'block', px: { xs: 2, sm: 2.5 } }}>
        {notice ?? ''}
      </Typography>

      <DataTable
        label="Contactos"
        columns={columns}
        rows={contacts.data?.data}
        getRowId={(contact) => contact.id}
        totalItems={contacts.data?.pagination.totalItems ?? 0}
        page={table.state.page}
        pageSize={table.state.pageSize}
        onPageChange={table.setPage}
        onPageSizeChange={table.setPageSize}
        sort={table.state.sort}
        onSortChange={table.setSort}
        isLoading={contacts.isPending}
        isFetching={contacts.isFetching}
        errorMessage={contacts.isError ? withReference(describeApiError(contacts.error, CUSTOMER_ERROR_MESSAGES)) : null}
        onRetry={() => void contacts.refetch()}
        emptyTitle={table.state.search ? 'Ningún contacto coincide' : 'Este cliente no tiene contactos'}
        emptyDescription={table.state.search ? 'Prueba con otra búsqueda.' : undefined}
        emptyIcon={<ContactsOutlinedIcon />}
        emptyAction={
          canCreate && !table.state.search && !showDeleted ? <Button onClick={() => setFormContact(null)}>Nuevo contacto</Button> : undefined
        }
        rowActions={
          hasRowActions
            ? (contact) => (
                <IconButton aria-label={`Acciones de ${contact.fullName}`} onClick={(event) => setMenu({ anchor: event.currentTarget, contact })}>
                  <MoreVertIcon />
                </IconButton>
              )
            : undefined
        }
      />

      <Menu anchorEl={menu?.anchor ?? null} open={menu !== null} onClose={() => setMenu(null)}>
        {menuContact && menuContact.isDeleted && canDelete ? (
          <MenuItem
            onClick={() => {
              setMenu(null);
              restore.mutate(menuContact.id, { onSuccess: () => setNotice(`${menuContact.fullName} restaurado.`) });
            }}
          >
            Restaurar
          </MenuItem>
        ) : null}
        {menuContact && !menuContact.isDeleted && canEdit ? (
          <MenuItem
            onClick={() => {
              setMenu(null);
              setFormContact(menuContact);
            }}
          >
            Editar
          </MenuItem>
        ) : null}
        {menuContact && !menuContact.isDeleted && canEdit && !menuContact.isPrimary ? (
          <MenuItem
            disabled={!menuContact.isActive}
            onClick={() => {
              setMenu(null);
              setPrimary.mutate(menuContact.id, { onSuccess: () => setNotice(`${menuContact.fullName} es ahora el contacto principal.`) });
            }}
          >
            <ListItemText
              primary="Marcar como principal"
              secondary={menuContact.isActive ? undefined : 'Un contacto inactivo no puede ser el principal.'}
            />
          </MenuItem>
        ) : null}
        {menuContact && !menuContact.isDeleted && canEdit && menuContact.isPrimary ? (
          <MenuItem
            onClick={() => {
              setMenu(null);
              clearPrimary.mutate(undefined, { onSuccess: () => setNotice('El cliente ya no tiene contacto principal.') });
            }}
          >
            Quitar como principal
          </MenuItem>
        ) : null}
        {menuContact && !menuContact.isDeleted && canEdit ? (
          <MenuItem
            onClick={() => {
              setMenu(null);
              if (menuContact.isActive && menuContact.isPrimary) {
                setPending({ kind: 'deactivate', contact: menuContact });
              } else {
                setActive(menuContact, !menuContact.isActive);
              }
            }}
          >
            {menuContact.isActive ? 'Desactivar' : 'Activar'}
          </MenuItem>
        ) : null}
        {menuContact && !menuContact.isDeleted && canDelete ? (
          <MenuItem
            onClick={() => {
              setMenu(null);
              remove.reset();
              setPending({ kind: 'delete', contact: menuContact });
            }}
            sx={{ color: 'error.main' }}
          >
            Eliminar
          </MenuItem>
        ) : null}
      </Menu>

      {pendingDialog}

      <ContactFormDialog
        open={formContact !== undefined}
        customer={customer}
        phonePattern={phonePattern}
        contact={formContact ?? null}
        onClose={() => setFormContact(undefined)}
        onSaved={(fullName) => setNotice(`Contacto ${fullName} guardado.`)}
      />
    </Card>
  );
}
