import { Autocomplete, TextField } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';

import { SEARCH_DEBOUNCE_MS } from '@/components/data';
import { describeApiError } from '@/lib/api-error-view';

import { customerLabel } from '../customer-format';
import type { CustomerListItem } from '../customers.api';
import { useCustomer, useCustomers } from '../customers.queries';

/** Lo que recibe el formulario que usa el selector (02 §E.7). */
export interface CustomerPickerValue {
  id: string;
  crmCode: string;
  legalName: string;
  countryId: string;
}

export interface CustomerPickerProps {
  label?: string;
  /** Cliente elegido. Puede llegar sólo con el id (p. ej. desde la ficha): se resuelve con `GET /customers/{id}`. */
  value: CustomerPickerValue | { id: string } | null;
  onChange: (customer: CustomerPickerValue | null) => void;
  required?: boolean;
  disabled?: boolean;
  error?: boolean;
  helperText?: string;
  name?: string;
}

/** Resultados por búsqueda (02 §E.7). */
const PICKER_PAGE_SIZE = 10;

function toValue(customer: Pick<CustomerListItem, 'id' | 'crmCode' | 'legalName'> & { country: { id: string } }): CustomerPickerValue {
  return { id: customer.id, crmCode: customer.crmCode, legalName: customer.legalName, countryId: customer.country.id };
}

function isComplete(value: CustomerPickerProps['value']): value is CustomerPickerValue {
  return value !== null && 'crmCode' in value && 'legalName' in value;
}

/**
 * Selector de cliente para los formularios de Proyectos y Actividad (02 §E.7,
 * F-05). Busca con `GET /customers?search=…&pageSize=10&activeOnly=true`, así
 * que sólo ofrece clientes visibles y con estado activo (AC-02.10, AC-02.30).
 */
export function CustomerPicker({
  label = 'Cliente',
  value,
  onChange,
  required,
  disabled,
  error,
  helperText,
  name,
}: CustomerPickerProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setSearch(input.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [input]);

  const preselectedId = value && !isComplete(value) ? value.id : undefined;
  const preselected = useCustomer(preselectedId);
  const selected = useMemo<CustomerPickerValue | null>(() => {
    if (isComplete(value)) return value;
    return preselected.data ? toValue(preselected.data) : null;
  }, [value, preselected.data]);

  const selectedLabel = selected ? customerLabel(selected) : '';
  const effectiveSearch = search === selectedLabel ? '' : search;
  const query = useMemo(
    () => ({ search: effectiveSearch || undefined, page: 1, pageSize: PICKER_PAGE_SIZE, activeOnly: 'true' }),
    [effectiveSearch],
  );
  const customers = useCustomers(query, open && !disabled);
  const options = useMemo(() => (customers.data?.data ?? []).map(toValue), [customers.data]);

  let noOptionsText = effectiveSearch ? 'Ningún cliente activo coincide' : 'Escribe para buscar';
  if (customers.isError) {
    noOptionsText = `No se pudo buscar clientes. ${describeApiError(customers.error).message}`;
  }

  return (
    <Autocomplete<CustomerPickerValue>
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      value={selected}
      onChange={(_, customer) => onChange(customer)}
      inputValue={input}
      onInputChange={(_, text) => setInput(text)}
      options={options}
      filterOptions={(all) => all}
      getOptionLabel={customerLabel}
      isOptionEqualToValue={(option, current) => option.id === current.id}
      loading={customers.isFetching || preselected.isFetching}
      loadingText="Buscando…"
      noOptionsText={noOptionsText}
      disabled={disabled}
      renderInput={(params) => (
        <TextField
          {...params}
          name={name}
          label={label}
          required={required}
          error={error || preselected.isError}
          helperText={preselected.isError ? 'No se pudo cargar el cliente seleccionado.' : helperText}
        />
      )}
    />
  );
}
