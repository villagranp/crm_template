import { env } from '@/config/env';

import type { AuthProvider } from './auth-provider';
import { EntraAuthProvider } from './entra-auth.provider';
import { LocalAuthProvider } from './local-auth.provider';

/**
 * Selects the authentication adapter from configuration (VITE_AUTH_PROVIDER).
 * No other module may instantiate a provider directly.
 */
export function createAuthProvider(): AuthProvider {
  switch (env.VITE_AUTH_PROVIDER) {
    case 'entra':
      return new EntraAuthProvider();
    case 'local':
      return new LocalAuthProvider();
    default: {
      const exhaustiveCheck: never = env.VITE_AUTH_PROVIDER;
      throw new Error(`Unsupported VITE_AUTH_PROVIDER: ${String(exhaustiveCheck)}`);
    }
  }
}
