import { Autocomplete, Box, TextField, Typography } from '@mui/material';
import { useEffect, useState } from 'react';

import { SEARCH_DEBOUNCE_MS } from '@/components/data';

import { productLabel } from '../project-format';
import type { Product } from '../products/project-products.api';
import { useCatalogProducts } from '../products/project-products.queries';

export interface ProductPickerProps {
  label?: string;
  value: Product | null;
  onChange: (product: Product | null) => void;
  required?: boolean;
  disabled?: boolean;
  error?: boolean;
  helperText?: string;
  name?: string;
}

/**
 * Producto del catálogo local (03 §E.9, AC-03.59): búsqueda por SKU o
 * descripción en `GET /products`, sólo activos. Muestra la familia y la unidad
 * base de cada uno.
 */
export function ProductPicker({ label = 'Producto', value, onChange, required, disabled, error, helperText, name }: ProductPickerProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setSearch(input.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [input]);

  const effectiveSearch = value && search === productLabel(value) ? '' : search;
  const products = useCatalogProducts(effectiveSearch, open && !disabled);

  let noOptionsText = effectiveSearch ? 'Ningún producto activo coincide' : 'No hay productos en el catálogo';
  if (products.isError) {
    noOptionsText = 'No se pudo consultar el catálogo de productos.';
  }

  return (
    <Autocomplete<Product>
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      value={value}
      onChange={(_, product) => onChange(product)}
      inputValue={input}
      onInputChange={(_, text) => setInput(text)}
      options={products.data?.data ?? []}
      filterOptions={(all) => all}
      getOptionLabel={productLabel}
      isOptionEqualToValue={(option, selected) => option.id === selected.id}
      renderOption={(props, product) => {
        const { key, ...rest } = props as typeof props & { key: string };
        return (
          <li key={key} {...rest}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                {productLabel(product)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {`${product.family.name} · unidad base ${product.baseUnit.symbol}`}
              </Typography>
            </Box>
          </li>
        );
      }}
      loading={products.isFetching}
      loadingText="Buscando…"
      noOptionsText={noOptionsText}
      disabled={disabled}
      renderInput={(params) => (
        <TextField
          {...params}
          name={name}
          label={label}
          required={required}
          error={error}
          helperText={helperText ?? 'Busca por SKU o descripción.'}
        />
      )}
    />
  );
}
