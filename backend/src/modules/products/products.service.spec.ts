import type { UnitConversionResolver } from '@/modules/unit-conversions/unit-conversion.resolver';

import type { ProductCatalogReader } from './ports/product-catalog.reader.port';
import { ProductsService } from './products.service';

function setup() {
  const catalog = {
    searchProducts: jest.fn().mockResolvedValue({ items: [], totalItems: 0, page: 1, pageSize: 20 }),
    findUnit: jest.fn().mockResolvedValue({ id: 'unit-kg', code: 'KG', name: 'Kilogramo', symbol: 'kg', dimension: 'MASS', isActive: true }),
  };
  const conversions = { resolve: jest.fn().mockResolvedValue(null) };
  const service = new ProductsService(catalog as unknown as ProductCatalogReader, conversions as unknown as UnitConversionResolver);
  return { service, catalog, conversions };
}

describe('ProductsService (03 F.4)', () => {
  it('search: texto normalizado y solo activos por defecto', async () => {
    const { service, catalog } = setup();
    await service.search({ page: 1, pageSize: 20, search: '  Várilla  #3 ' });
    expect(catalog.searchProducts).toHaveBeenCalledWith({ page: 1, pageSize: 20, search: 'varilla #3', familyId: null, isActive: true });
    await service.search({ page: 2, pageSize: 5, familyId: 'fam', isActive: false });
    expect(catalog.searchProducts).toHaveBeenLastCalledWith({ page: 2, pageSize: 5, search: null, familyId: 'fam', isActive: false });
  });

  it('resolveConversion: misma precedencia que los casos de uso; sin regla → null', async () => {
    const { service, conversions } = setup();
    expect(await service.resolveConversion({ fromUnitId: 'unit-kg', productId: 'p-1' })).toEqual({ rule: null });
    expect(conversions.resolve).toHaveBeenCalledWith({ fromUnitId: 'unit-kg', productId: 'p-1', projectTypeId: null });

    const rule = { ruleId: 'r', scope: 'GLOBAL', factor: '0.00100000', fromUnitId: 'unit-kg', toUnit: { id: 'ton', code: 'TON', symbol: 't' } };
    conversions.resolve.mockResolvedValue(rule);
    expect(await service.resolveConversion({ fromUnitId: 'unit-kg' })).toEqual({
      rule: { ...rule, fromUnit: { id: 'unit-kg', code: 'KG', name: 'Kilogramo', symbol: 'kg', dimension: 'MASS', isActive: true } },
    });
  });
});
