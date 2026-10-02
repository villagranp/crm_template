import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/infrastructure/database/prisma/prisma.service';
import { AppConfigService } from '@/config/app-config.service';

export interface LivenessStatus {
  readonly status: 'ok';
  readonly app: string;
  readonly timestamp: string;
}

export interface ReadinessStatus {
  readonly status: 'ready' | 'not_ready';
  readonly checks: ReadonlyArray<{ name: string; status: 'up' | 'down' }>;
  readonly timestamp: string;
}

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  /** Liveness: no consulta dependencias, para no provocar reinicios en cascada (ADR-016). */
  getLiveness(): LivenessStatus {
    return {
      status: 'ok',
      app: this.config.get('APP_NAME'),
      timestamp: new Date().toISOString(),
    };
  }

  /** Readiness: verifica las dependencias criticas para atender trafico. */
  async getReadiness(): Promise<ReadinessStatus> {
    const isDatabaseUp = await this.prisma.checkConnection();

    return {
      status: isDatabaseUp ? 'ready' : 'not_ready',
      checks: [{ name: 'database', status: isDatabaseUp ? 'up' : 'down' }],
      timestamp: new Date().toISOString(),
    };
  }
}
