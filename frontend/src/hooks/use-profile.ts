import { useQuery } from '@tanstack/react-query';

import type { ApiError } from '@/services/api/api-error';
import { fetchProfile } from '@/services/access';
import type { Profile } from '@/services/access';
import { useAuth } from '@/hooks/use-auth';

export const PROFILE_QUERY_KEY = ['me', 'profile'] as const;

export function useProfile() {
  const { isAuthenticated } = useAuth();

  return useQuery<Profile, ApiError>({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: fetchProfile,
    enabled: isAuthenticated,
    staleTime: 5 * 60_000,
  });
}
