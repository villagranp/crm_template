import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { createQueryKeys, type ListQuery } from '@/features/admin/common';

import {
  createProduct,
  createProductFamily,
  createUnit,
  listProductFamilies,
  listProducts,
  listUnits,
  updateProduct,
  updateProductFamily,
  updateUnit,
  type CreateProductFamilyRequest,
  type CreateProductRequest,
  type CreateUnitRequest,
  type UpdateProductFamilyRequest,
  type UpdateProductRequest,
  type UpdateUnitRequest,
} from './products.api';

/** Claves de los tres recursos, todas bajo `['admin', 'products']` para invalidarlas juntas. */
export const productKeys = createQueryKeys('products');
export const familyKeys = {
  list: (query: ListQuery) => [...productKeys.all, 'families', 'list', query] as const,
};
export const unitKeys = {
  list: (query: ListQuery) => [...productKeys.all, 'units', 'list', query] as const,
};

/** Tope de las listas de opciones de los selectores: `pageSize` máximo de la API. */
export const OPTIONS_PAGE_SIZE = 100;
const ACTIVE_OPTIONS_QUERY: ListQuery = { isActive: 'true', pageSize: OPTIONS_PAGE_SIZE };

export function useProductFamilies(query: ListQuery) {
  return useQuery({
    queryKey: familyKeys.list(query),
    queryFn: () => listProductFamilies(query),
    placeholderData: keepPreviousData,
  });
}

export function useProducts(query: ListQuery) {
  return useQuery({
    queryKey: productKeys.list(query),
    queryFn: () => listProducts(query),
    placeholderData: keepPreviousData,
  });
}

export function useUnits(query: ListQuery) {
  return useQuery({
    queryKey: unitKeys.list(query),
    queryFn: () => listUnits(query),
    placeholderData: keepPreviousData,
  });
}

/** Familias activas para el selector del producto. */
export function useFamilyOptions(enabled: boolean) {
  return useQuery({
    queryKey: familyKeys.list(ACTIVE_OPTIONS_QUERY),
    queryFn: () => listProductFamilies(ACTIVE_OPTIONS_QUERY),
    enabled,
  });
}

/** Unidades activas para el selector de unidad base. */
export function useUnitOptions(enabled: boolean) {
  return useQuery({
    queryKey: unitKeys.list(ACTIVE_OPTIONS_QUERY),
    queryFn: () => listUnits(ACTIVE_OPTIONS_QUERY),
    enabled,
  });
}

/** Cualquier cambio invalida los tres recursos: la lista de productos muestra familia y unidad. */
function useInvalidateProducts() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: productKeys.all });
}

export type SaveInput<TCreate, TUpdate> =
  { id: null; body: TCreate } | { id: string; body: TUpdate };

export function useSaveProductFamily() {
  const invalidate = useInvalidateProducts();
  return useMutation({
    mutationFn: (input: SaveInput<CreateProductFamilyRequest, UpdateProductFamilyRequest>) =>
      input.id === null
        ? createProductFamily(input.body)
        : updateProductFamily(input.id, input.body),
    onSuccess: invalidate,
  });
}

export function useSaveProduct() {
  const invalidate = useInvalidateProducts();
  return useMutation({
    mutationFn: (input: SaveInput<CreateProductRequest, UpdateProductRequest>) =>
      input.id === null ? createProduct(input.body) : updateProduct(input.id, input.body),
    onSuccess: invalidate,
  });
}

export function useSaveUnit() {
  const invalidate = useInvalidateProducts();
  return useMutation({
    mutationFn: (input: SaveInput<CreateUnitRequest, UpdateUnitRequest>) =>
      input.id === null ? createUnit(input.body) : updateUnit(input.id, input.body),
    onSuccess: invalidate,
  });
}
