import { useQuery } from '@tanstack/react-query';

import { httpClient } from '@/services/api/http-client';
import type { ApiError } from '@/services/api/api-error';

export interface HealthResponse {
  status: string;
  timestamp: string;
}

export const HEALTH_QUERY_KEY = ['health'] as const;

/**
 * Reads the backend liveness endpoint. Kept in the Foundation because it is
 * infrastructure, not business data: it validates the API wiring of a new
 * project in one glance.
 */
export function useHealth() {
  return useQuery<HealthResponse, ApiError>({
    queryKey: HEALTH_QUERY_KEY,
    queryFn: () => httpClient.get<HealthResponse>('/health', { isPublic: true }),
    staleTime: 15_000,
  });
}
