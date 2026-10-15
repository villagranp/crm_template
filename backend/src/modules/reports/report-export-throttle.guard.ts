import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { getStorageToken, ThrottlerException, type ThrottlerStorage } from '@nestjs/throttler';
import type { Response } from 'express';

import type { AppRequest } from '@/common/types/request-context';

/** F.4: como mucho 5 exportaciones por minuto **por usuario** (todas las rutas `/export` juntas). */
export const REPORT_EXPORT_THROTTLE = { limit: 5, ttlMs: 60_000 } as const;

const THROTTLER_NAME = 'reports-export';

/**
 * Limitador de las exportaciones de Reportes (05 F.4, PF-05.28). El limitador global
 * (`ThrottlerGuard`) cuenta por IP y corre **antes** de la autenticación; este guard de
 * ruta corre después de los guards globales, así que cuenta por la identidad autenticada
 * (`issuedBy` + `subjectId`) y solo las peticiones ya autorizadas. Ventana deslizante de
 * un minuto sobre el almacenamiento del `ThrottlerModule`; exceso → `429
 * RATE_LIMIT_EXCEEDED` con `Retry-After`.
 */
@Injectable()
export class ReportExportThrottleGuard implements CanActivate {
  constructor(@Inject(getStorageToken()) private readonly storage: ThrottlerStorage) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const principal = http.getRequest<AppRequest>().principal;
    // Sin identidad no se llega aquí (AuthenticationGuard global); deny-by-default igualmente.
    if (!principal) return false;
    const key = `${THROTTLER_NAME}:${principal.issuedBy}:${principal.subjectId}`;
    const record = await this.storage.increment(key, REPORT_EXPORT_THROTTLE.ttlMs, REPORT_EXPORT_THROTTLE.limit, 0, THROTTLER_NAME);
    if (record.isBlocked) {
      http.getResponse<Response>().setHeader('Retry-After', String(Math.max(record.timeToBlockExpire, 1)));
      throw new ThrottlerException();
    }
    return true;
  }
}
