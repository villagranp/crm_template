import { useQuery } from '@tanstack/react-query';

import type { ApiError } from '@/services/api/api-error';
import { fetchMenu } from '@/services/access';
import type { MenuModule } from '@/services/access';
import { useAuth } from '@/hooks/use-auth';

export const MENU_QUERY_KEY = ['me', 'menu'] as const;

const MENU_STALE_TIME_MS = 5 * 60_000;

/**
 * Menú del usuario autenticado. No se consulta si no hay sesión: el endpoint
 * exige autenticación y un 401 en el arranque sólo generaría ruido.
 */
export function useMenu() {
  const { isAuthenticated } = useAuth();

  return useQuery<MenuModule[], ApiError>({
    queryKey: MENU_QUERY_KEY,
    queryFn: fetchMenu,
    enabled: isAuthenticated,
    staleTime: MENU_STALE_TIME_MS,
  });
}
