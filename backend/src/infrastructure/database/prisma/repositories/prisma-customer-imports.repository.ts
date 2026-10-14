import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { createPage, type Page } from '@/infrastructure/database/ports/pagination';
import type { TransactionContext } from '@/infrastructure/database/ports/transaction.port';
import { parseRowValues } from '@/modules/customer-imports/cell-sanitizer';
import type { ImportFileFormat } from '@/modules/customer-imports/file-signature';
import { parseStoredIssues, type StoredImportIssue } from '@/modules/customer-imports/import-issues';
import {
  ACTIVE_IMPORT_STATUSES,
  completionStatus,
  type ImportRowStatus,
  type ImportStatus,
  NOT_IMPORTED_ROW_STATUSES,
} from '@/modules/customer-imports/import-status';
import type {
  CustomerImportDetailRecord,
  CustomerImportRecord,
  CustomerImportRowRecord,
  CustomerImportRowStats,
  CustomerImportsRepository,
  ImportRowCriteria,
  ImportSearchCriteria,
  NewCustomerImport,
  NewImportRow,
  PendingImportRow,
  StaleImportFilter,
} from '@/modules/customer-imports/ports/customer-imports.repository.port';

import { prismaClientFor } from '../prisma-transaction';
import { PrismaService } from '../prisma.service';

const USER_REF = { select: { id: true, displayName: true } } as const;

const IMPORT_INCLUDE = { startedBy: USER_REF, confirmedBy: USER_REF } satisfies Prisma.CustomerImportInclude;
type ImportRow = Prisma.CustomerImportGetPayload<{ include: typeof IMPORT_INCLUDE }>;

const ROW_INCLUDE = {
  duplicateOf: { select: { id: true, crmCode: true, legalName: true, salesOwnerId: true, countryId: true, deletedAt: true } },
  customer: { select: { id: true, crmCode: true } },
} satisfies Prisma.CustomerImportRowInclude;
type RowRow = Prisma.CustomerImportRowGetPayload<{ include: typeof ROW_INCLUDE }>;

/** Filas con alguna advertencia (D-06.6). */
const HAS_WARNING: Prisma.CustomerImportRowWhereInput = { errors: { array_contains: [{ severity: 'WARNING' }] } };

/** Tamaño de lote del `INSERT` de filas: 5 000 filas en pocas sentencias, sin superar el límite de parámetros. */
const ROW_BATCH = 500;

function toImportRecord(row: ImportRow): CustomerImportRecord {
  return {
    id: row.id,
    code: row.code,
    format: row.format as ImportFileFormat,
    originalFileName: row.originalFileName,
    status: row.status as ImportStatus,
    templateVersion: row.templateVersion,
    totalRows: row.totalRows,
    validRows: row.validRows,
    invalidRows: row.invalidRows,
    importedRows: row.importedRows,
    failureReason: row.failureReason,
    startedBy: row.startedBy,
    validatedAt: row.validatedAt,
    confirmedBy: row.confirmedBy,
    confirmedAt: row.confirmedAt,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toRowRecord(row: RowRow): CustomerImportRowRecord {
  return {
    id: row.id,
    rowNumber: row.rowNumber,
    status: row.status as ImportRowStatus,
    values: parseRowValues(row.rawData),
    issues: parseStoredIssues(row.errors),
    duplicateOfRowNumber: row.duplicateOfRowNumber,
    duplicateOf: row.duplicateOf
      ? {
          id: row.duplicateOf.id,
          crmCode: row.duplicateOf.crmCode,
          legalName: row.duplicateOf.legalName,
          salesOwnerId: row.duplicateOf.salesOwnerId,
          countryId: row.duplicateOf.countryId,
          isDeleted: row.duplicateOf.deletedAt !== null,
        }
      : null,
    customer: row.customer,
  };
}

function issuesJson(issues: readonly StoredImportIssue[]): Prisma.InputJsonValue {
  return issues.map((issue) => ({ ...issue })) as unknown as Prisma.InputJsonValue;
}

/** Adaptador Prisma de la carga masiva (06 L.2). */
@Injectable()
export class PrismaCustomerImportsRepository implements CustomerImportsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async lockStarter(userId: string, tx: TransactionContext): Promise<void> {
    await prismaClientFor(this.prisma, tx).$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR NO KEY UPDATE`;
  }

  async hasActiveImport(userId: string, tx: TransactionContext, excludeImportId?: string): Promise<boolean> {
    const count = await prismaClientFor(this.prisma, tx).customerImport.count({
      where: { startedById: userId, status: { in: [...ACTIVE_IMPORT_STATUSES] }, ...(excludeImportId ? { id: { not: excludeImportId } } : {}) },
    });
    return count > 0;
  }

  async create(input: NewCustomerImport, tx: TransactionContext): Promise<string> {
    const created = await prismaClientFor(this.prisma, tx).customerImport.create({
      data: { ...input, status: 'VALIDATING' },
      select: { id: true },
    });
    return created.id;
  }

  async saveValidation(importId: string, rows: readonly NewImportRow[]): Promise<boolean> {
    const validRows = rows.filter((row) => row.status === 'VALID').length;
    return this.prisma.$transaction(
      async (tx) => {
        for (let start = 0; start < rows.length; start += ROW_BATCH) {
          await tx.customerImportRow.createMany({
            data: rows.slice(start, start + ROW_BATCH).map((row) => ({
              importId,
              rowNumber: row.rowNumber,
              rawData: { ...row.values } as Prisma.InputJsonObject,
              status: row.status,
              errors: issuesJson(row.issues),
              duplicateOfRowNumber: row.duplicateOfRowNumber,
              duplicateOfCustomerId: row.duplicateOfCustomerId,
            })),
          });
        }
        const updated = await tx.customerImport.updateMany({
          where: { id: importId, status: 'VALIDATING' },
          data: {
            status: 'VALIDATED',
            totalRows: rows.length,
            validRows,
            invalidRows: rows.length - validRows,
            importedRows: 0,
            validatedAt: new Date(),
          },
        });
        if (updated.count !== 1) {
          // Otra petición la marcó interrumpida: se deshacen las filas.
          throw new ImportStateChangedError();
        }
        return true;
      },
      { timeout: 60_000 },
    ).catch((error: unknown) => {
      if (error instanceof ImportStateChangedError) return false;
      throw error;
    });
  }

  async fail(importId: string, from: readonly ImportStatus[], failureReason: string): Promise<boolean> {
    const updated = await this.prisma.customerImport.updateMany({
      where: { id: importId, status: { in: [...from] } },
      data: { status: 'FAILED', failureReason: failureReason.slice(0, 500), completedAt: new Date() },
    });
    return updated.count === 1;
  }

  async findById(importId: string): Promise<CustomerImportDetailRecord | null> {
    const row = await this.prisma.customerImport.findUnique({ where: { id: importId }, include: IMPORT_INCLUDE });
    if (!row) return null;
    return { ...toImportRecord(row), stats: await this.rowStats(importId) };
  }

  private async rowStats(importId: string): Promise<CustomerImportRowStats> {
    const notImported = Prisma.join(NOT_IMPORTED_ROW_STATUSES.map((status) => Prisma.sql`${status}::import_row_status`));
    const [stats] = await this.prisma.$queryRaw<{ rejected: bigint; warnings: bigint; not_imported: bigint; purged: boolean | null }[]>`
      SELECT count(*) FILTER (WHERE status = 'REJECTED') AS rejected,
             count(*) FILTER (WHERE errors @> '[{"severity":"WARNING"}]'::jsonb) AS warnings,
             count(*) FILTER (WHERE status IN (${notImported})) AS not_imported,
             bool_or(raw_data = '{}'::jsonb) AS purged
        FROM customer_import_rows
       WHERE import_id = ${importId}::uuid`;
    return {
      rejectedRows: Number(stats?.rejected ?? 0),
      warningRows: Number(stats?.warnings ?? 0),
      notImportedRows: Number(stats?.not_imported ?? 0),
      isPurged: stats?.purged === true,
    };
  }

  async search(criteria: ImportSearchCriteria): Promise<Page<CustomerImportRecord>> {
    const conditions: Prisma.CustomerImportWhereInput[] = [];
    if (criteria.visibleStarterId !== null) conditions.push({ startedById: criteria.visibleStarterId });
    if (criteria.startedById) conditions.push({ startedById: criteria.startedById });
    if (criteria.statuses && criteria.statuses.length > 0) conditions.push({ status: { in: [...criteria.statuses] } });
    if (criteria.createdFrom) conditions.push({ createdAt: { gte: criteria.createdFrom } });
    if (criteria.createdTo) conditions.push({ createdAt: { lte: criteria.createdTo } });
    const search = criteria.search?.trim();
    if (search) {
      conditions.push({
        OR: [{ code: { contains: search, mode: 'insensitive' } }, { originalFileName: { contains: search, mode: 'insensitive' } }],
      });
    }
    const where: Prisma.CustomerImportWhereInput = { AND: conditions };
    const direction = criteria.sortOrder ?? 'desc';
    const orderBy: Prisma.CustomerImportOrderByWithRelationInput[] = [{ [criteria.sortBy ?? 'createdAt']: direction }, { id: direction }];
    const [rows, total] = await Promise.all([
      this.prisma.customerImport.findMany({
        where,
        include: IMPORT_INCLUDE,
        orderBy,
        skip: (criteria.page - 1) * criteria.pageSize,
        take: criteria.pageSize,
      }),
      this.prisma.customerImport.count({ where }),
    ]);
    return createPage(rows.map(toImportRecord), total, criteria);
  }

  async findRows(importId: string, criteria: ImportRowCriteria): Promise<Page<CustomerImportRowRecord>> {
    const conditions: Prisma.CustomerImportRowWhereInput[] = [{ importId }];
    if (criteria.statuses && criteria.statuses.length > 0) conditions.push({ status: { in: [...criteria.statuses] } });
    if (criteria.hasWarnings === true) conditions.push(HAS_WARNING);
    // `NOT (NULL @> …)` es NULL: las filas sin incidencias (`errors` nulo) se incluyen aparte.
    if (criteria.hasWarnings === false) conditions.push({ OR: [{ errors: { equals: Prisma.DbNull } }, { NOT: HAS_WARNING }] });
    const where: Prisma.CustomerImportRowWhereInput = { AND: conditions };
    const [rows, total] = await Promise.all([
      this.prisma.customerImportRow.findMany({
        where,
        include: ROW_INCLUDE,
        orderBy: { rowNumber: 'asc' },
        skip: (criteria.page - 1) * criteria.pageSize,
        take: criteria.pageSize,
      }),
      this.prisma.customerImportRow.count({ where }),
    ]);
    return createPage(rows.map(toRowRecord), total, criteria);
  }

  async listNotImportedRows(importId: string): Promise<CustomerImportRowRecord[]> {
    const rows = await this.prisma.customerImportRow.findMany({
      where: { importId, status: { in: [...NOT_IMPORTED_ROW_STATUSES] } },
      include: ROW_INCLUDE,
      orderBy: { rowNumber: 'asc' },
    });
    return rows.map(toRowRecord);
  }

  async startImporting(importId: string, confirmedById: string, tx: TransactionContext): Promise<boolean> {
    const updated = await prismaClientFor(this.prisma, tx).customerImport.updateMany({
      where: { id: importId, status: 'VALIDATED' },
      data: { status: 'IMPORTING', confirmedById, confirmedAt: new Date() },
    });
    return updated.count === 1;
  }

  async cancel(importId: string): Promise<boolean> {
    const updated = await this.prisma.customerImport.updateMany({
      where: { id: importId, status: 'VALIDATED' },
      data: { status: 'CANCELLED', completedAt: new Date() },
    });
    return updated.count === 1;
  }

  async listPendingRows(importId: string): Promise<PendingImportRow[]> {
    const rows = await this.prisma.customerImportRow.findMany({
      where: { importId, status: 'VALID' },
      select: { id: true, rowNumber: true, rawData: true, errors: true },
      orderBy: { rowNumber: 'asc' },
    });
    return rows.map((row) => ({ id: row.id, rowNumber: row.rowNumber, values: parseRowValues(row.rawData), issues: parseStoredIssues(row.errors) }));
  }

  async markRowImported(rowId: string, customerId: string, tx: TransactionContext): Promise<boolean> {
    const updated = await prismaClientFor(this.prisma, tx).customerImportRow.updateMany({
      where: { id: rowId, status: 'VALID' },
      data: { status: 'IMPORTED', customerId },
    });
    return updated.count === 1;
  }

  async markRowRejected(rowId: string, issues: readonly StoredImportIssue[], duplicateOfCustomerId: string | null): Promise<boolean> {
    const updated = await this.prisma.customerImportRow.updateMany({
      where: { id: rowId, status: 'VALID' },
      data: { status: 'REJECTED', errors: issuesJson(issues), duplicateOfCustomerId },
    });
    return updated.count === 1;
  }

  async touch(importId: string): Promise<void> {
    await this.prisma.customerImport.updateMany({ where: { id: importId, status: 'IMPORTING' }, data: { updatedAt: new Date() } });
  }

  async complete(importId: string): Promise<ImportStatus | null> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.customerImport.findUnique({ where: { id: importId }, select: { totalRows: true } });
      if (!current) return null;
      const importedRows = await tx.customerImportRow.count({ where: { importId, status: 'IMPORTED' } });
      const status = completionStatus({ totalRows: current.totalRows, importedRows });
      const updated = await tx.customerImport.updateMany({
        where: { id: importId, status: 'IMPORTING' },
        data: { status, importedRows, completedAt: new Date() },
      });
      return updated.count === 1 ? status : null;
    });
  }

  async failStale(filter: StaleImportFilter, interruptedIssue: StoredImportIssue): Promise<string[]> {
    const active = Prisma.join(ACTIVE_IMPORT_STATUSES.map((status) => Prisma.sql`${status}::import_status`));
    return this.prisma.$transaction(async (tx) => {
      const stale = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM customer_imports
         WHERE status IN (${active})
           AND updated_at < ${filter.staleBefore}
           ${filter.importId ? Prisma.sql`AND id = ${filter.importId}::uuid` : Prisma.empty}
           ${filter.startedById ? Prisma.sql`AND started_by_id = ${filter.startedById}::uuid` : Prisma.empty}
         FOR UPDATE SKIP LOCKED`;
      const ids = stale.map((row) => row.id);
      if (ids.length === 0) return [];
      const issue = JSON.stringify([interruptedIssue]);
      await tx.$executeRaw`
        UPDATE customer_import_rows
           SET status = 'REJECTED', errors = COALESCE(errors, '[]'::jsonb) || ${issue}::jsonb, updated_at = now()
         WHERE import_id = ANY(${ids}::uuid[]) AND status = 'VALID'`;
      await tx.$executeRaw`
        UPDATE customer_imports i
           SET status = 'FAILED', failure_reason = 'PROCESS_INTERRUPTED', completed_at = now(), updated_at = now(),
               imported_rows = (SELECT count(*) FROM customer_import_rows r WHERE r.import_id = i.id AND r.status = 'IMPORTED')
         WHERE i.id = ANY(${ids}::uuid[])`;
      return ids;
    });
  }

  async purgeRowData(before: Date): Promise<number> {
    const active = Prisma.join(ACTIVE_IMPORT_STATUSES.map((status) => Prisma.sql`${status}::import_status`));
    return this.prisma.$executeRaw`
      UPDATE customer_import_rows r
         SET raw_data = '{}'::jsonb, updated_at = now()
        FROM customer_imports i
       WHERE r.import_id = i.id
         AND i.status NOT IN (${active})
         AND COALESCE(i.completed_at, i.created_at) < ${before}
         AND r.raw_data <> '{}'::jsonb`;
  }
}

class ImportStateChangedError extends Error {}
