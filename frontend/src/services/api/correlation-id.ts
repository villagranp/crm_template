export const CORRELATION_ID_HEADER = 'X-Correlation-ID';

/**
 * Generates a correlation ID for an outbound request.
 *
 * The backend preserves a safe incoming `X-Correlation-ID` and generates one
 * otherwise (see ADR-016). Sending it from the browser lets a user-reported
 * problem be traced end to end.
 */
export function createCorrelationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  const randomSuffix = Math.random().toString(16).slice(2, 10);
  return `${Date.now().toString(16)}-${randomSuffix}`;
}
