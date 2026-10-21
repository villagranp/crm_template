import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/infrastructure/database/prisma/prisma.service';

/**
 * Las sondas son públicas (también desde internet): responden solo el estado y
 * la hora. Ni nombre de la aplicación, versión, host, dependencias ni errores
 * (ASVS anexo D, endurecimiento para internet).
 */
export interface LivenessStatus {
  readonly status: 'ok';
  readonly timestamp: string;
}

export interface ReadinessStatus {
  readonly status: 'ready' | 'not_ready';
  readonly timestamp: string;
}

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  /** Liveness: no consulta dependencias, para no provocar reinicios en cascada (ADR-016). */
  getLiveness(): LivenessStatus {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  /** Readiness: verifica las dependencias criticas para atender trafico, sin decir cuáles. */
  async getReadiness(): Promise<ReadinessStatus> {
    const isDatabaseUp = await this.prisma.checkConnection();

    return { status: isDatabaseUp ? 'ready' : 'not_ready', timestamp: new Date().toISOString() };
  }
}
