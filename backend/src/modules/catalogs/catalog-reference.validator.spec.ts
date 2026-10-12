import { BusinessRuleViolationError } from '@/common/errors/application-error';
import type { TransactionContext } from '@/infrastructure/database/ports/transaction.port';

import { CatalogReferenceValidator, INVALID_CATALOG_VALUE } from './catalog-reference.validator';
import type { CatalogItemRef, CatalogReferenceReader } from './ports/catalog-reference.port';

const ACTIVE_ID = '11111111-1111-4111-8111-111111111111';
const INACTIVE_ID = '22222222-2222-4222-8222-222222222222';

const ITEMS: CatalogItemRef[] = [
  { id: ACTIVE_ID, catalogKey: 'crm.estado_cliente', code: 'ACTIVO', label: 'Activo', isActive: true, metadata: { isActive: true } },
  { id: INACTIVE_ID, catalogKey: 'crm.estado_cliente', code: 'VIEJO', label: 'Viejo', isActive: false, metadata: null },
];

function setup() {
  const findItem = jest.fn<ReturnType<CatalogReferenceReader['findItem']>, Parameters<CatalogReferenceReader['findItem']>>(
    async (catalogKey, lookup) =>
      ITEMS.find((item) => item.catalogKey === catalogKey && (lookup.by === 'id' ? item.id : item.code) === lookup.value) ??
      null,
  );
  return { findItem, validator: new CatalogReferenceValidator({ findItem }) };
}

describe('CatalogReferenceValidator', () => {
  it('devuelve el elemento activo del catálogo esperado', async () => {
    const { validator } = setup();

    await expect(validator.assertItem('crm.estado_cliente', ACTIVE_ID, { field: 'statusId' })).resolves.toMatchObject({
      id: ACTIVE_ID,
      code: 'ACTIVO',
    });
  });

  it('rechaza con 422 INVALID_CATALOG_VALUE un elemento de otro catálogo, con el campo y sin el valor', async () => {
    const { validator } = setup();

    const error = await validator
      .assertItem('crm.prioridad', ACTIVE_ID, { field: 'priorityId' })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BusinessRuleViolationError);
    expect(error).toMatchObject({
      code: INVALID_CATALOG_VALUE,
      details: [{ field: 'priorityId', catalogKey: 'crm.prioridad', reason: 'NOT_FOUND' }],
    });
    expect(JSON.stringify((error as BusinessRuleViolationError).details)).not.toContain(ACTIVE_ID);
  });

  it('en el alta exige elemento activo', async () => {
    const { validator } = setup();

    await expect(validator.check('crm.estado_cliente', INACTIVE_ID, { field: 'statusId' })).resolves.toEqual({
      ok: false,
      issue: expect.objectContaining({ field: 'statusId', code: INVALID_CATALOG_VALUE, reason: 'INACTIVE' }),
    });
  });

  it('en la edición conserva el valor actual aunque esté desactivado', async () => {
    const { validator } = setup();

    await expect(
      validator.check('crm.estado_cliente', INACTIVE_ID, { field: 'statusId', currentId: INACTIVE_ID }),
    ).resolves.toMatchObject({ ok: true, item: { id: INACTIVE_ID } });
  });

  it('en la edición no admite cambiar a otro valor desactivado', async () => {
    const { validator } = setup();

    await expect(
      validator.check('crm.estado_cliente', INACTIVE_ID, { field: 'statusId', currentId: ACTIVE_ID }),
    ).resolves.toMatchObject({ ok: false, issue: { reason: 'INACTIVE' } });
  });

  it('con requireActive=false admite elementos inactivos (lecturas, filtros)', async () => {
    const { validator } = setup();

    await expect(
      validator.check('crm.estado_cliente', INACTIVE_ID, { field: 'statusId', requireActive: false }),
    ).resolves.toMatchObject({ ok: true });
  });

  it('busca por código en la importación y pasa la transacción del llamador', async () => {
    const { validator, findItem } = setup();
    const tx = {} as TransactionContext;

    await expect(
      validator.assertItem('crm.estado_cliente', ' ACTIVO ', { field: 'status', by: 'code', tx }),
    ).resolves.toMatchObject({ id: ACTIVE_ID });
    expect(findItem).toHaveBeenCalledWith('crm.estado_cliente', { by: 'code', value: 'ACTIVO' }, tx);
  });

  it('un id que no es UUID o vacío no consulta la base y es NOT_FOUND', async () => {
    const { validator, findItem } = setup();

    await expect(validator.check('crm.estado_cliente', 'no-es-uuid', { field: 'statusId' })).resolves.toMatchObject({
      ok: false,
      issue: { reason: 'NOT_FOUND' },
    });
    await expect(validator.check('crm.estado_cliente', '  ', { field: 'statusId', by: 'code' })).resolves.toMatchObject({
      ok: false,
    });
    expect(findItem).not.toHaveBeenCalled();
  });
});
