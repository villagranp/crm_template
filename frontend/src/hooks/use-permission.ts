import { hasPermission } from '@/services/auth';
import { useAuthStore } from '@/stores/auth.store';

/**
 * Checks a `resource.action` permission (ADR-008).
 *
 * UI permission checks only hide affordances. Authorization is always enforced
 * again by the backend guard; never treat this as a security control.
 */
export function usePermission(permission: string): boolean {
  return useAuthStore((state) => hasPermission(state.user, permission));
}
