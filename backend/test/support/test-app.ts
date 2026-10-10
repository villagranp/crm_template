import { randomUUID } from 'node:crypto';

import { type INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';

import { AppModule } from '@/app.module';
import { PasswordService } from '@/modules/auth/password.service';

/**
 * Utilidades de las pruebas de integración (PostgreSQL real, esquema
 * `integration_test`). Cada archivo de pruebas crea su app y sus usuarios con
 * correo único: los archivos corren en paralelo sobre la misma base, así que
 * ninguna prueba debe depender de totales globales ni borrar datos ajenos.
 */

export const TEST_PASSWORD = 'una-contrasena-de-prueba-larga';

export interface TestContext {
  app: INestApplication;
  prisma: PrismaClient;
}

export async function createTestContext(): Promise<TestContext> {
  const prisma = new PrismaClient();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>();
  // Mismo arranque que main.ts en lo que afecta a las pruebas.
  app.set('trust proxy', 1);
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();

  return { app, prisma };
}

export async function closeTestContext(context: TestContext | undefined): Promise<void> {
  await context?.app.close();
  await context?.prisma.$disconnect();
}

let ipCounter = 0;
/** IP única por llamada: el límite de intentos de login es por IP. */
export function uniqueIp(): string {
  ipCounter += 1;
  return `198.51.${Math.floor(ipCounter / 250) % 250}.${(ipCounter % 250) + 1}`;
}

export interface TestUser {
  id: string;
  email: string;
}

const passwordService = new PasswordService();

/** Crea un usuario con credencial y los roles indicados (por código). */
export async function createTestUser(
  prisma: PrismaClient,
  options: { roleCodes?: string[]; status?: 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'LOCKED' } = {},
): Promise<TestUser> {
  const email = `persona-${randomUUID()}@integration.test`;
  const roles = await prisma.role.findMany({ where: { code: { in: options.roleCodes ?? ['usuario'] } } });

  const user = await prisma.user.create({
    data: {
      email,
      emailNormalized: email,
      firstName: 'Persona',
      lastName: 'De prueba',
      displayName: 'Persona De prueba',
      status: options.status ?? 'ACTIVE',
      roles: { create: roles.map((role) => ({ roleId: role.id })) },
      credential: {
        create: { passwordHash: await passwordService.hash(TEST_PASSWORD), mustChangePassword: false },
      },
    },
  });
  return { id: user.id, email };
}

/** Inicia sesión y devuelve el access token. */
export async function accessTokenFor(app: INestApplication, user: TestUser): Promise<string> {
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .set('X-Forwarded-For', uniqueIp())
    .send({ email: user.email, password: TEST_PASSWORD })
    .expect(200);
  return response.body.accessToken as string;
}

/** Usuario nuevo con esos roles, ya con sesión. Atajo para pruebas de 403 y de éxito. */
export async function tokenWithRoles(
  context: TestContext,
  roleCodes: string[],
): Promise<{ user: TestUser; token: string }> {
  const user = await createTestUser(context.prisma, { roleCodes });
  return { user, token: await accessTokenFor(context.app, user) };
}

/** Prefijo único para códigos y claves de recursos creados en una prueba. */
export function uniqueCode(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}
