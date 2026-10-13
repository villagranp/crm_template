import { type DuplicationOptions, duplicationPlan, type DuplicationSource } from './duplication-plan';

const SOURCE: DuplicationSource = {
  name: 'Torre Norte',
  customerId: 'customer-1',
  countryId: 'country-gt',
  city: 'Guatemala',
  address: 'Zona 10',
  description: 'Edificio de 12 niveles',
  estimatedStartDate: '2026-11-01',
  estimatedEndDate: '2027-06-30',
  estimatedDecisionDate: '2026-10-30',
  classification: {
    projectTypeId: 'type-vivienda',
    projectTypeActive: true,
    sectorId: 'sector-res',
    sectorActive: true,
    measureUnitId: 'unit-m2',
    measureUnitActive: true,
    estimatedQuantity: '1200.0000',
    mode: 'RULE',
    estimatedTonnage: '42.0000',
  },
  products: [
    { productId: 'product-a', productActive: true, unitId: 'unit-var', unitActive: true, quantity: '10.0000' },
    { productId: 'product-a', productActive: true, unitId: 'unit-kg', unitActive: true, quantity: '99.0000' },
    { productId: 'product-b', productActive: false, unitId: 'unit-var', unitActive: true, quantity: '5.0000' },
    { productId: 'product-c', productActive: true, unitId: 'unit-old', unitActive: false, quantity: '5.0000' },
    { productId: 'product-d', productActive: true, unitId: 'unit-kg', unitActive: true, quantity: '7.5000' },
  ],
};

const DEFAULTS: DuplicationOptions = { location: true, description: true, classification: true, products: false };

describe('duplicationPlan (03 C.4, PF-03.25)', () => {
  it('casillas por defecto: copia ubicación, descripción y clasificación; productos no; nombre confirmado', () => {
    expect(duplicationPlan(SOURCE, DEFAULTS, { name: '  Torre Norte II ' })).toEqual({
      name: 'Torre Norte II',
      customerId: 'customer-1',
      countryId: 'country-gt',
      city: 'Guatemala',
      address: 'Zona 10',
      description: 'Edificio de 12 niveles',
      estimatedStartDate: '2026-11-01',
      estimatedEndDate: '2027-06-30',
      estimatedDecisionDate: '2026-10-30',
      // RULE: el tonelaje NO se copia; lo recalcula el servicio con la regla vigente (RN-03.21).
      classification: {
        projectTypeId: 'type-vivienda',
        sectorId: 'sector-res',
        measureUnitId: 'unit-m2',
        estimatedQuantity: '1200.0000',
        mode: 'RULE',
        manualTonnage: null,
      },
      products: [],
    });
  });

  it('sin ubicación ni descripción ni clasificación: país por defecto (el del cliente) y nada más', () => {
    const plan = duplicationPlan(SOURCE, { location: false, description: false, classification: false, products: false }, { name: 'Copia' });
    expect(plan).toMatchObject({ countryId: null, city: null, address: null, description: null, classification: null, products: [] });
  });

  it('cliente y fechas confirmados o cambiados (null = vaciar)', () => {
    const plan = duplicationPlan(SOURCE, DEFAULTS, {
      name: 'Copia',
      customerId: 'customer-2',
      estimatedStartDate: null,
      estimatedDecisionDate: '2027-01-15',
    });
    expect(plan).toMatchObject({
      customerId: 'customer-2',
      estimatedStartDate: null,
      estimatedEndDate: '2027-06-30',
      estimatedDecisionDate: '2027-01-15',
    });
  });

  it('productos marcados: solo activos con unidad activa, uno por producto (el primero), sin oportunidad', () => {
    const plan = duplicationPlan(SOURCE, { ...DEFAULTS, products: true }, { name: 'Copia' });
    expect(plan.products).toEqual([
      { productId: 'product-a', unitId: 'unit-var', quantity: '10.0000' },
      { productId: 'product-d', unitId: 'unit-kg', quantity: '7.5000' },
    ]);
  });

  it('clasificación manual se copia como manual; valores desactivados no se escriben', () => {
    const plan = duplicationPlan(
      {
        ...SOURCE,
        classification: { ...SOURCE.classification, mode: 'MANUAL', estimatedTonnage: '50.0000', projectTypeActive: false, measureUnitActive: false },
      },
      DEFAULTS,
      { name: 'Copia' },
    );
    expect(plan.classification).toEqual({
      projectTypeId: null,
      sectorId: 'sector-res',
      measureUnitId: null,
      estimatedQuantity: '1200.0000',
      mode: 'MANUAL',
      manualTonnage: '50.0000',
    });
  });

  it('RULE sin unidad activa queda sin estimación; clasificación vacía = null', () => {
    const noUnit = duplicationPlan(SOURCE, DEFAULTS, { name: 'Copia' }).classification;
    expect(noUnit?.mode).toBe('RULE');
    const inactiveUnit = duplicationPlan({ ...SOURCE, classification: { ...SOURCE.classification, measureUnitActive: false } }, DEFAULTS, { name: 'Copia' });
    expect(inactiveUnit.classification?.mode).toBe('NONE');
    const empty = duplicationPlan(
      {
        ...SOURCE,
        classification: {
          projectTypeId: null,
          projectTypeActive: false,
          sectorId: null,
          sectorActive: false,
          measureUnitId: null,
          measureUnitActive: false,
          estimatedQuantity: null,
          mode: 'NONE',
          estimatedTonnage: null,
        },
      },
      DEFAULTS,
      { name: 'Copia' },
    );
    expect(empty.classification).toBeNull();
  });
});
