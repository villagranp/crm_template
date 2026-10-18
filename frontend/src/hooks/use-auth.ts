import { useAuthStore } from '@/stores/auth.store';

/**
 * Read-only view of the session for components.
 * Components must not import the store directly; this hook is the seam.
 */
export function useAuth() {
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const passwordChangeRequired = useAuthStore((state) => state.passwordChangeRequired);
  const errorMessage = useAuthStore((state) => state.errorMessage);
  const signInError = useAuthStore((state) => state.signInError);
  const signIn = useAuthStore((state) => state.signIn);
  const signOut = useAuthStore((state) => state.signOut);
  const changePassword = useAuthStore((state) => state.changePassword);

  return {
    status,
    user,
    passwordChangeRequired,
    errorMessage,
    signInError,
    isAuthenticated: status === 'authenticated',
    signIn,
    signOut,
    changePassword,
  };
}
