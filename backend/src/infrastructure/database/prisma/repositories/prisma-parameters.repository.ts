import { Injectable } from '@nestjs/common';
import type { SystemParameter } from '@prisma/client';

import type { ParametersRepository, SystemParameterRecord } from '@/modules/parameters/ports/parameters.repository.port';

import { PrismaService } from '../prisma.service';

function toRecord(row: SystemParameter): SystemParameterRecord {
  return {
    id: row.id,
    key: row.key,
    value: row.value,
    type: row.type,
    group: row.group,
    name: row.name,
    description: row.description,
    isPublic: row.isPublic,
    isSystem: row.isSystem,
    updatedAt: row.updatedAt,
    updatedById: row.updatedById,
  };
}

/** Adaptador Prisma de los parámetros del sistema (ADR-004). */
@Injectable()
export class PrismaParametersRepository implements ParametersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listAll(): Promise<SystemParameterRecord[]> {
    const rows = await this.prisma.systemParameter.findMany({ orderBy: [{ group: 'asc' }, { key: 'asc' }] });
    return rows.map(toRecord);
  }

  async findByKey(key: string): Promise<SystemParameterRecord | null> {
    const row = await this.prisma.systemParameter.findUnique({ where: { key } });
    return row ? toRecord(row) : null;
  }

  async updateValue(key: string, value: string, updatedById: string | null): Promise<SystemParameterRecord> {
    const row = await this.prisma.systemParameter.update({ where: { key }, data: { value, updatedById } });
    return toRecord(row);
  }
}
