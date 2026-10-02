import { QueryClient } from '@tanstack/react-query';

import { ApiError } from './api-error';

const MAX_QUERY_RETRIES = 2;
const STALE_TIME_MS = 30_000;

/**
 * TanStack Query owns all server state (ADR-001). Zustand is only for client
 * state that has no server counterpart.
 *
 * Retry policy: never retry a deterministic client error (400/401/403/404/409),
 * because it will fail identically and only delays the error being shown.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: STALE_TIME_MS,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (error instanceof ApiError && !error.isRetryable) {
          return false;
        }
        return failureCount < MAX_QUERY_RETRIES;
      },
    },
    mutations: {
      retry: false,
    },
  },
});
