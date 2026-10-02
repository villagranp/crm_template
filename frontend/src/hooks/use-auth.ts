import { useAuthStore } from '@/stores/auth.store';

/**
 * Read-only view of the session for components.
 * Components must not import the store directly; this hook is the seam.
 */
export function useAuth() {
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const errorMessage = useAuthStore((state) => state.errorMessage);
  const signIn = useAuthStore((state) => state.signIn);
  const signOut = useAuthStore((state) => state.signOut);

  return {
    status,
    user,
    errorMessage,
    isAuthenticated: status === 'authenticated',
    signIn,
    signOut,
  };
}
