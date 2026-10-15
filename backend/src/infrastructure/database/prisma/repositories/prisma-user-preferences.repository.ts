import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import type { UserPreferenceKey, UserPreferencesRepository } from '@/modules/access/ports/user-preferences.repository.port';

import { PrismaService } from '../prisma.service';

/**
 * Adaptador de `UserPreferencesRepository` sobre `user_preferences`
 * (`uq_user_preferences_user_key`: una fila por usuario y clave). El valor es JSON.
 */
@Injectable()
export class PrismaUserPreferencesRepository implements UserPreferencesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(userId: string, keys: readonly UserPreferenceKey[]): Promise<ReadonlyMap<UserPreferenceKey, unknown>> {
    const rows = await this.prisma.userPreference.findMany({
      where: { userId, key: { in: [...keys] } },
      select: { key: true, value: true },
    });
    return new Map(rows.map((row) => [row.key as UserPreferenceKey, row.value as unknown]));
  }

  async upsert(userId: string, key: UserPreferenceKey, value: unknown): Promise<void> {
    const json = value as Prisma.InputJsonValue;
    const write = () =>
      this.prisma.userPreference.upsert({
        where: { userId_key: { userId, key } },
        create: { userId, key, value: json },
        update: { value: json },
      });
    try {
      await write();
    } catch (error) {
      // Dos PUT simultáneos del mismo usuario: ambos ven "no existe" y uno choca con el índice
      // único. Se reintenta una vez; ahora la fila existe y el upsert actualiza (gana el último).
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
      await write();
    }
  }

  async delete(userId: string, key: UserPreferenceKey): Promise<void> {
    await this.prisma.userPreference.deleteMany({ where: { userId, key } });
  }
}
