/**
 * Escritura de la semilla esencial del CRM (00 §8.2). Idempotente: `upsert` por
 * clave natural. Criterio de qué se actualiza al re-ejecutar:
 *
 * | Entidad              | Clave natural                     | Al re-ejecutar                                         |
 * |----------------------|-----------------------------------|--------------------------------------------------------|
 * | Moneda               | code                              | nombre, símbolo y decimales (solo lectura en la UI)    |
 * | País                 | isoCode                           | datos descriptivos; nunca `isActive` ni los patrones   |
 * | Tipo de cambio       | (currencyCode, effectiveDate)     | nada: no pisa una tasa corregida en Administración     |
 * | Unidad de medida     | code                              | nada (mantenible desde Administración, D-07.9)         |
 * | Regla de conversión  | (fromUnit, toUnit, scopeKey)      | nada (el factor lo mantiene el negocio)                |
 * | Secuencia            | key                               | nada: `currentValue` nunca se pisa                     |
 * | Catálogo             | key                               | nombre, descripción, `isSystem = true`                 |
 * | Elemento de catálogo | (catalogId, code)                 | nada: etiqueta, orden, metadata e isActive son del admin |
 */
import type { PrismaClient } from '@prisma/client';

import { CRM_CATALOGS } from './crm-catalogs';
import { INITIAL_EXCHANGE_RATES } from './crm-exchange-rates';
import { COUNTRIES, CRM_SEQUENCES, CURRENCIES, GLOBAL_CONVERSIONS, UNITS_OF_MEASURE } from './crm-masters';

type Log = (message: string) => void;

export async function seedCurrencies(prisma: PrismaClient): Promise<number> {
  for (const currency of CURRENCIES) {
    const { code, ...descriptive } = currency;
    await prisma.currency.upsert({ where: { code }, update: descriptive, create: currency });
  }
  return CURRENCIES.length;
}

export async function seedCountries(prisma: PrismaClient): Promise<number> {
  for (const country of COUNTRIES) {
    const { isoCode, ...descriptive } = country;
    await prisma.country.upsert({ where: { isoCode }, update: descriptive, create: country });
  }
  return COUNTRIES.length;
}

export async function seedExchangeRates(prisma: PrismaClient): Promise<number> {
  for (const rate of INITIAL_EXCHANGE_RATES) {
    const effectiveDate = new Date(`${rate.effectiveDate}T00:00:00.000Z`);
    await prisma.exchangeRate.upsert({
      where: { currencyCode_effectiveDate: { currencyCode: rate.currencyCode, effectiveDate } },
      update: {},
      create: {
        currencyCode: rate.currencyCode,
        effectiveDate,
        ratePerUsd: rate.ratePerUsd,
        source: rate.source,
        notes: rate.notes ?? null,
      },
    });
  }
  return INITIAL_EXCHANGE_RATES.length;
}

export async function seedUnits(prisma: PrismaClient): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const unit of UNITS_OF_MEASURE) {
    const saved = await prisma.unitOfMeasure.upsert({ where: { code: unit.code }, update: {}, create: unit });
    ids.set(unit.code, saved.id);
  }
  return ids;
}

export async function seedGlobalConversions(prisma: PrismaClient, unitIds: Map<string, string>): Promise<number> {
  for (const rule of GLOBAL_CONVERSIONS) {
    const fromUnitId = requireId(unitIds, rule.fromUnit, 'unidad');
    const toUnitId = requireId(unitIds, rule.toUnit, 'unidad');
    await prisma.unitConversionRule.upsert({
      where: { fromUnitId_toUnitId_scopeKey: { fromUnitId, toUnitId, scopeKey: 'GLOBAL' } },
      update: {},
      create: { fromUnitId, toUnitId, factor: rule.factor, scope: 'GLOBAL', scopeKey: 'GLOBAL', description: rule.description },
    });
  }
  return GLOBAL_CONVERSIONS.length;
}

export async function seedSequences(prisma: PrismaClient): Promise<number> {
  for (const sequence of CRM_SEQUENCES) {
    await prisma.sequence.upsert({ where: { key: sequence.key }, update: {}, create: sequence });
  }
  return CRM_SEQUENCES.length;
}

export async function seedCatalogs(prisma: PrismaClient): Promise<{ catalogs: number; items: number }> {
  let items = 0;
  for (const catalog of CRM_CATALOGS) {
    const saved = await prisma.catalog.upsert({
      where: { key: catalog.key },
      update: { name: catalog.name, description: catalog.description, isSystem: true },
      create: { key: catalog.key, name: catalog.name, description: catalog.description, isSystem: true },
    });

    for (const [index, item] of catalog.items.entries()) {
      await prisma.catalogItem.upsert({
        where: { catalogId_code: { catalogId: saved.id, code: item.code } },
        update: {},
        create: {
          catalogId: saved.id,
          code: item.code,
          label: item.label,
          sortOrder: (index + 1) * 10,
          ...(item.metadata ? { metadata: item.metadata } : {}),
        },
      });
      items += 1;
    }
  }
  return { catalogs: CRM_CATALOGS.length, items };
}

/** Siembra todos los maestros y catálogos del CRM en orden de dependencias. */
export async function seedCrmEssentials(prisma: PrismaClient, log: Log): Promise<void> {
  log(`monedas: ${await seedCurrencies(prisma)}`);
  log(`países: ${await seedCountries(prisma)}`);
  const rates = await seedExchangeRates(prisma);
  log(`tipos de cambio iniciales: ${rates}${rates === 0 ? ' (pendientes de entrega del negocio)' : ''}`);
  const unitIds = await seedUnits(prisma);
  log(`unidades de medida: ${unitIds.size}`);
  log(`reglas de conversión globales: ${await seedGlobalConversions(prisma, unitIds)}`);
  log(`secuencias del CRM: ${await seedSequences(prisma)}`);
  const catalogs = await seedCatalogs(prisma);
  log(`catálogos del CRM: ${catalogs.catalogs} (${catalogs.items} elementos)`);
}

function requireId(ids: Map<string, string>, key: string, kind: string): string {
  const id = ids.get(key);
  if (!id) {
    throw new Error(`Falta ${kind} "${key}" en la semilla.`);
  }
  return id;
}
