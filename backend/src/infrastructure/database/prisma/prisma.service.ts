import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AppLogger } from '@/infrastructure/logging/app-logger.service';

/**
 * Cliente Prisma. Se inyecta UNICAMENTE en repositorios de infrastructure/database.
 * Ningun caso de uso, controller o entidad de dominio debe conocer esta clase (ADR-004).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(private readonly logger: AppLogger) {
    super();
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.info('database_connected');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Verificacion ligera para el endpoint de readiness. */
  async checkConnection(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
