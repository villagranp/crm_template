import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { createScopedQueryKeys, type ListQuery } from '@/lib/query-keys';

import {
  clearPrimaryContact,
  createContact,
  createCustomer,
  deleteContact,
  deleteCustomer,
  getCustomer,
  getCustomerFormOptions,
  listContacts,
  listCustomerProjects,
  listCustomers,
  listSalesOwnerOptions,
  restoreContact,
  restoreCustomer,
  setPrimaryContact,
  updateContact,
  updateCustomer,
  type CreateContactInput,
  type CreateCustomerInput,
  type UpdateContactInput,
  type UpdateCustomerInput,
} from './customers.api';

/** Claves bajo `['crm', 'customers']`; contactos y proyectos cuelgan del cliente. */
const base = createScopedQueryKeys('crm', 'customers');

export const customerKeys = {
  ...base,
  formOptions: () => [...base.all, 'form-options'] as const,
  salesOwners: (query: ListQuery) => [...base.all, 'sales-owners', query] as const,
  contacts: (customerId: string) => [...base.all, 'contacts', customerId] as const,
  contactList: (customerId: string, query: ListQuery) => [...base.all, 'contacts', customerId, query] as const,
  projects: (customerId: string, query: ListQuery) => [...base.all, 'projects', customerId, query] as const,
};

/** Las opciones cambian poco (catálogos y parámetros): se reutilizan durante la sesión de pantalla. */
const FORM_OPTIONS_STALE_TIME_MS = 5 * 60_000;

export function useCustomers(query: ListQuery, enabled = true) {
  return useQuery({
    queryKey: customerKeys.list(query),
    queryFn: () => listCustomers(query),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useCustomer(customerId: string | undefined) {
  return useQuery({
    queryKey: customerKeys.detail(customerId ?? ''),
    queryFn: () => getCustomer(customerId ?? ''),
    enabled: Boolean(customerId),
  });
}

export function useCustomerFormOptions(enabled = true) {
  return useQuery({
    queryKey: customerKeys.formOptions(),
    queryFn: getCustomerFormOptions,
    staleTime: FORM_OPTIONS_STALE_TIME_MS,
    enabled,
  });
}

export function useSalesOwnerOptions(search: string, enabled: boolean) {
  const query: ListQuery = { search: search || undefined, page: 1, pageSize: 20 };
  return useQuery({
    queryKey: customerKeys.salesOwners(query),
    queryFn: () => listSalesOwnerOptions(query),
    enabled,
    placeholderData: keepPreviousData,
  });
}

export function useCreateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCustomerInput) => createCustomer(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: customerKeys.lists() }),
  });
}

export function useUpdateCustomer(customerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateCustomerInput) => updateCustomer(customerId, input),
    onSuccess: (customer) => {
      queryClient.setQueryData(customerKeys.detail(customerId), customer);
      return queryClient.invalidateQueries({ queryKey: customerKeys.lists() });
    },
  });
}

export function useDeleteCustomer(customerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => deleteCustomer(customerId),
    // Quien elimina vuelve a la búsqueda: la ficha se quita de la caché (no se vuelve a pedir
    // ni se muestra obsoleta si se reabre) y las listas se recargan.
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: customerKeys.detail(customerId) });
      return queryClient.invalidateQueries({ queryKey: customerKeys.lists() });
    },
  });
}

/** Restaurar desde la lista de eliminados o desde la ficha (D-02.6). */
export function useRestoreCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (customerId: string) => restoreCustomer(customerId),
    onSuccess: (customer) => {
      queryClient.setQueryData(customerKeys.detail(customer.id), customer);
      return queryClient.invalidateQueries({ queryKey: customerKeys.lists() });
    },
  });
}

// --- Contactos ---

export function useContacts(customerId: string, query: ListQuery, enabled = true) {
  return useQuery({
    queryKey: customerKeys.contactList(customerId, query),
    queryFn: () => listContacts(customerId, query),
    placeholderData: keepPreviousData,
    enabled,
  });
}

/**
 * Tras cambiar contactos se recargan la lista y la ficha (su `primaryContact`
 * puede haber cambiado, p. ej. al desactivar el principal, RN-02.26).
 */
function useInvalidateContacts(customerId: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: customerKeys.contacts(customerId) }),
      queryClient.invalidateQueries({ queryKey: customerKeys.detail(customerId) }),
    ]);
}

export function useCreateContact(customerId: string) {
  const invalidate = useInvalidateContacts(customerId);
  return useMutation({
    mutationFn: (input: CreateContactInput) => createContact(customerId, input),
    onSuccess: invalidate,
  });
}

export function useUpdateContact(customerId: string) {
  const invalidate = useInvalidateContacts(customerId);
  return useMutation({
    mutationFn: ({ contactId, input }: { contactId: string; input: UpdateContactInput }) =>
      updateContact(customerId, contactId, input),
    onSuccess: invalidate,
  });
}

export function useSetPrimaryContact(customerId: string) {
  const invalidate = useInvalidateContacts(customerId);
  return useMutation({
    mutationFn: (contactId: string) => setPrimaryContact(customerId, contactId),
    onSuccess: invalidate,
  });
}

export function useClearPrimaryContact(customerId: string) {
  const invalidate = useInvalidateContacts(customerId);
  return useMutation({
    mutationFn: () => clearPrimaryContact(customerId),
    onSuccess: invalidate,
  });
}

export function useDeleteContact(customerId: string) {
  const invalidate = useInvalidateContacts(customerId);
  return useMutation({
    mutationFn: (contactId: string) => deleteContact(customerId, contactId),
    onSuccess: invalidate,
  });
}

export function useRestoreContact(customerId: string) {
  const invalidate = useInvalidateContacts(customerId);
  return useMutation({
    mutationFn: (contactId: string) => restoreContact(customerId, contactId),
    onSuccess: invalidate,
  });
}

// --- Proyectos del cliente (contrato del Módulo 3) ---

export function useCustomerProjects(customerId: string, query: ListQuery, enabled: boolean) {
  return useQuery({
    queryKey: customerKeys.projects(customerId, query),
    queryFn: () => listCustomerProjects(customerId, query),
    placeholderData: keepPreviousData,
    enabled,
  });
}
