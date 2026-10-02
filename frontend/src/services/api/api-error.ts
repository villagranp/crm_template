import type { ApiErrorBody } from '@/types/api';

/**
 * Normalised transport error.
 *
 * Every failure that leaves the API layer is an `ApiError`, so UI code never
 * has to branch on `fetch` rejections vs. non-2xx responses.
 */
export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details: unknown[];
  readonly correlationId?: string;

  constructor(body: ApiErrorBody) {
    super(body.message);
    this.name = 'ApiError';
    this.statusCode = body.statusCode;
    this.code = body.code;
    this.details = body.details ?? [];
    this.correlationId = body.correlationId;
  }

  get isUnauthorized(): boolean {
    return this.statusCode === 401;
  }

  get isForbidden(): boolean {
    return this.statusCode === 403;
  }

  get isNotFound(): boolean {
    return this.statusCode === 404;
  }

  /** 4xx other than 401/403/408/429 will not become correct by retrying. */
  get isRetryable(): boolean {
    if (this.statusCode >= 500) {
      return true;
    }
    return this.statusCode === 408 || this.statusCode === 429;
  }
}

export const NETWORK_ERROR_CODE = 'NETWORK_ERROR';
