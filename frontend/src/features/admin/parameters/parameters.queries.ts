import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { createQueryKeys } from '@/features/admin/common';
import { UI_SETTINGS_QUERY_KEY } from '@/services/ui-settings';

import { getAuthenticationSettings, listCatalogOptions, listParameters, updateParameter } from './parameters.api';

export const parameterKeys = createQueryKeys('parameters');

export function useParameters() {
  return useQuery({ queryKey: parameterKeys.lists(), queryFn: listParameters });
}

export function useAuthenticationSettings() {
  return useQuery({ queryKey: [...parameterKeys.all, 'authentication'], queryFn: getAuthenticationSettings });
}

/**
 * Opciones activas de un catálogo para un editor estructurado. `enabled` va a
 * `false` sin `catalogos.ver` (ocultar es UX; el backend vuelve a validar los códigos).
 */
export function useCatalogOptions(catalogKey: string | null, enabled: boolean) {
  return useQuery({
    queryKey: [...parameterKeys.all, 'catalog-options', catalogKey ?? ''],
    queryFn: () => listCatalogOptions(catalogKey ?? ''),
    enabled: enabled && catalogKey !== null,
  });
}

export function useUpdateParameter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) => updateParameter(key, value),
    onSuccess: (_result, { key }) => {
      // Los parámetros `ui.*` alimentan `GET /me/ui-settings` (composición por defecto y barra superior).
      if (key.startsWith('ui.')) {
        void queryClient.invalidateQueries({ queryKey: UI_SETTINGS_QUERY_KEY });
      }
      return queryClient.invalidateQueries({ queryKey: parameterKeys.all });
    },
  });
}
