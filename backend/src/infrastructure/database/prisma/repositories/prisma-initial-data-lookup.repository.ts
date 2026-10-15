import { Injectable } from '@nestjs/common';

import { toCalendarDate, fromCalendarDate } from '@/common/calendar-date';
import { normalizeName } from '@/modules/customers/customer-normalization';
import type {
  InitialDataLookup,
  LookupCustomer,
  LookupExistingProject,
  LookupFamily,
  LookupProduct,
  LookupReference,
  LookupUser,
  TemplateValueSet,
} from '@/modules/initial-data-load/ports/initial-data-lookup.port';

import { PrismaService } from '../prisma.service';

const PROJECT_TYPE_CATALOG = 'crm.tipo_proyecto';
const PROJECT_SECTOR_CATALOG = 'crm.sector_proyecto';

/**
 * Adaptador Prisma del puerto de **solo lectura** de la carga inicial por scripts. Ninguna
 * escritura: crear proyectos, familias, productos y minutos es trabajo de los servicios de
 * aplicación (auditoría, folios, unicidad, visibilidad).
 */
@Injectable()
export class PrismaInitialDataLookupRepository implements InitialDataLookup {
  constructor(private readonly prisma: PrismaService) {}

  async findUsers(identifiers: { readonly emails: readonly string[]; readonly employeeCodes: readonly string[] }): Promise<LookupUser[]> {
    if (identifiers.emails.length === 0 && identifiers.employeeCodes.length === 0) return [];
    const rows = await this.prisma.user.findMany({
      where: {
        OR: [
          ...(identifiers.emails.length > 0 ? [{ emailNormalized: { in: [...identifiers.emails] } }] : []),
          ...(identifiers.employeeCodes.length > 0 ? [{ employeeCode: { in: [...identifiers.employeeCodes] } }] : []),
        ],
      },
      select: { id: true, email: true, emailNormalized: true, employeeCode: true, status: true, deletedAt: true },
    });
    return rows.map((row) => ({
      id: row.id,
      email: row.emailNormalized,
      employeeCode: row.employeeCode,
      status: row.status,
      isDeleted: row.deletedAt !== null,
    }));
  }

  async findCustomersByCrmCode(crmCodes: readonly string[]): Promise<LookupCustomer[]> {
    if (crmCodes.length === 0) return [];
    // `crm_code` sale siempre del folio `CLI-nnnnnn` (mayúsculas), pero se compara sin distinguirlas por si acaso.
    const rows = await this.prisma.customer.findMany({
      where: { OR: crmCodes.map((code) => ({ crmCode: { equals: code, mode: 'insensitive' as const } })) },
      select: { id: true, crmCode: true, deletedAt: true },
    });
    return rows.map((row) => ({ id: row.id, crmCode: row.crmCode, isDeleted: row.deletedAt !== null }));
  }

  async findCountriesByIso(isoCodes: readonly string[]): Promise<LookupReference[]> {
    if (isoCodes.length === 0) return [];
    const rows = await this.prisma.country.findMany({ where: { isoCode: { in: [...isoCodes] } }, select: { id: true, isoCode: true, isActive: true } });
    return rows.map((row) => ({ id: row.id, code: row.isoCode, isActive: row.isActive }));
  }

  async findCatalogItems(catalogKey: string, codes: readonly string[]): Promise<LookupReference[]> {
    if (codes.length === 0) return [];
    const rows = await this.prisma.catalogItem.findMany({
      where: { catalog: { key: catalogKey }, OR: codes.map((code) => ({ code: { equals: code, mode: 'insensitive' as const } })) },
      select: { id: true, code: true, isActive: true },
    });
    return rows;
  }

  async findFamilies(codes: readonly string[]): Promise<LookupFamily[]> {
    if (codes.length === 0) return [];
    return this.prisma.productFamily.findMany({
      where: { code: { in: [...codes] } },
      select: { id: true, code: true, isActive: true, name: true, description: true, sortOrder: true },
    });
  }

  async findUnits(codes: readonly string[]): Promise<LookupReference[]> {
    if (codes.length === 0) return [];
    return this.prisma.unitOfMeasure.findMany({ where: { code: { in: [...codes] } }, select: { id: true, code: true, isActive: true } });
  }

  async findProducts(skus: readonly string[]): Promise<LookupProduct[]> {
    if (skus.length === 0) return [];
    const rows = await this.prisma.product.findMany({
      where: { sku: { in: [...skus] } },
      select: { sku: true, description: true, family: { select: { code: true } }, baseUnit: { select: { code: true } } },
    });
    return rows.map((row) => ({ sku: row.sku, description: row.description, familyCode: row.family.code, baseUnitCode: row.baseUnit.code }));
  }

  async findProjectsByCodes(codes: readonly string[]): Promise<LookupExistingProject[]> {
    if (codes.length === 0) return [];
    const rows = await this.prisma.project.findMany({ where: { code: { in: [...codes] } }, select: { code: true, customerId: true, name: true } });
    return rows.flatMap((row) => [{ code: row.code, customerId: row.customerId, nameNormalized: normalizeName(row.name) ?? '' }]);
  }

  async findProjectsOfCustomers(customerIds: readonly string[]): Promise<LookupExistingProject[]> {
    if (customerIds.length === 0) return [];
    const rows = await this.prisma.project.findMany({ where: { customerId: { in: [...customerIds] }, deletedAt: null }, select: { code: true, customerId: true, name: true } });
    return rows.flatMap((row) => {
      const nameNormalized = normalizeName(row.name);
      return nameNormalized ? [{ code: row.code, customerId: row.customerId, nameNormalized }] : [];
    });
  }

  async findExistingSafetyMinuteDates(dates: readonly string[]): Promise<string[]> {
    if (dates.length === 0) return [];
    const rows = await this.prisma.safetyMinute.findMany({ where: { displayDate: { in: dates.map((date) => fromCalendarDate(date)) } }, select: { displayDate: true } });
    return rows.map((row) => toCalendarDate(row.displayDate));
  }

  async listTemplateValues(): Promise<TemplateValueSet> {
    const [countries, projectTypes, sectors, units, families] = await Promise.all([
      this.prisma.country.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { isoCode: 'asc' }], select: { isoCode: true, name: true } }),
      this.catalogValues(PROJECT_TYPE_CATALOG),
      this.catalogValues(PROJECT_SECTOR_CATALOG),
      this.prisma.unitOfMeasure.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }], select: { code: true, name: true } }),
      this.prisma.productFamily.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }], select: { code: true, name: true } }),
    ]);
    return {
      countries: countries.map((row) => ({ code: row.isoCode, label: row.name })),
      projectTypes,
      sectors,
      units: units.map((row) => ({ code: row.code, label: row.name })),
      families: families.map((row) => ({ code: row.code, label: row.name })),
    };
  }

  private async catalogValues(catalogKey: string): Promise<{ code: string; label: string }[]> {
    const rows = await this.prisma.catalogItem.findMany({
      where: { catalog: { key: catalogKey }, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
      select: { code: true, label: true },
    });
    return rows;
  }
}
