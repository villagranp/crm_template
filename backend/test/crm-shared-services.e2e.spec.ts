import { randomUUID } from 'node:crypto';

import { CatalogReferenceValidator, INVALID_CATALOG_VALUE } from '@/modules/catalogs/catalog-reference.validator';
import { VisibilityScopeResolver } from '@/modules/access/visibility-scope.resolver';
import {
  SEQUENCE_GENERATOR,
  type SequenceGenerator,
  SequenceNotFoundError,
} from '@/infrastructure/database/ports/sequence-generator.port';
import { TRANSACTION_RUNNER, type TransactionRunner } from '@/infrastructure/database/ports/transaction.port';

import { closeTestContext, createTestContext, createTestUser, type TestContext, uniqueCode } from './support/test-app';

/**
 * Piezas transversales del CRM (02 §K.3 paso 1) contra PostgreSQL real:
 * `SequenceGenerator` (bloqueo de fila y transacción del llamador),
 * `CatalogReferenceValidator` (00 §3.5) y `VisibilityScopeResolver` (00 §4.2,
 * TEAM con subequipos, COUNTRY).
 *
 * Los datos se crean con claves únicas: los archivos corren en paralelo sobre el
 * mismo esquema.
 */

let context: TestContext;
let sequences: SequenceGenerator;
let transactions: TransactionRunner;

beforeAll(async () => {
  context = await createTestContext();
  sequences = context.app.get<SequenceGenerator>(SEQUENCE_GENERATOR);
  transactions = context.app.get<TransactionRunner>(TRANSACTION_RUNNER);
});

afterAll(async () => {
  await closeTestContext(context);
});

async function createSequence(overrides: { pattern?: string; padding?: number; resetPolicy?: string; periodKey?: string } = {}) {
  const key = `test.${randomUUID()}`;
  await context.prisma.sequence.create({
    data: {
      key,
      prefix: 'TST',
      pattern: overrides.pattern ?? '{prefix}-{seq}',
      padding: overrides.padding ?? 4,
      resetPolicy: overrides.resetPolicy ?? 'NONE',
      periodKey: overrides.periodKey ?? null,
    },
  });
  return key;
}

describe('SequenceGenerator (PostgreSQL)', () => {
  it('asigna números consecutivos y únicos a altas concurrentes (SELECT … FOR UPDATE)', async () => {
    const key = await createSequence();
    const total = 25;

    const codes = await Promise.all(
      Array.from({ length: total }, () => transactions.run((tx) => sequences.next(key, tx))),
    );

    expect(new Set(codes).size).toBe(total);
    const expected = Array.from({ length: total }, (_, index) => `TST-${String(index + 1).padStart(4, '0')}`);
    expect([...codes].sort()).toEqual(expected);
    const row = await context.prisma.sequence.findUniqueOrThrow({ where: { key } });
    expect(row.currentValue).toBe(total);
  });

  it('si la transacción del llamador se deshace, el número no se consume', async () => {
    const key = await createSequence();
    await expect(sequences.next(key)).resolves.toBe('TST-0001');

    await expect(
      transactions.run(async (tx) => {
        await sequences.next(key, tx);
        throw new Error('el alta falla después de pedir el folio');
      }),
    ).rejects.toThrow('el alta falla');

    await expect(transactions.run((tx) => sequences.next(key, tx))).resolves.toBe('TST-0002');
  });

  it('reinicia por año y guarda el periodo', async () => {
    const key = await createSequence({ pattern: '{prefix}-{year}-{seq}', padding: 5, resetPolicy: 'YEAR', periodKey: '2026' });
    await context.prisma.sequence.update({ where: { key }, data: { currentValue: 41 } });

    await expect(sequences.next(key, undefined, { at: new Date('2026-06-01T12:00:00Z') })).resolves.toBe('TST-2026-00042');
    await expect(sequences.next(key, undefined, { at: new Date('2027-01-02T12:00:00Z') })).resolves.toBe('TST-2027-00001');
    const row = await context.prisma.sequence.findUniqueOrThrow({ where: { key } });
    expect(row).toMatchObject({ currentValue: 1, periodKey: '2027' });
  });

  it('la semilla esencial deja lista la secuencia crm.cliente (CLI-000123)', async () => {
    // Dentro de una transacción que se deshace: no consume números del esquema compartido.
    let code = '';
    await transactions
      .run(async (tx) => {
        code = await sequences.next('crm.cliente', tx);
        throw new Error('rollback');
      })
      .catch(() => undefined);
    expect(code).toMatch(/^CLI-\d{6}$/);
  });

  it('una clave inexistente es SequenceNotFoundError', async () => {
    await expect(sequences.next(`no.existe.${randomUUID()}`)).rejects.toBeInstanceOf(SequenceNotFoundError);
  });
});

describe('CatalogReferenceValidator (PostgreSQL)', () => {
  let validator: CatalogReferenceValidator;
  let catalogKey: string;
  let activeId: string;
  let inactiveId: string;

  beforeAll(async () => {
    validator = context.app.get(CatalogReferenceValidator);
    catalogKey = `test.${randomUUID()}`;
    const catalog = await context.prisma.catalog.create({
      data: {
        key: catalogKey,
        name: 'Catálogo de prueba',
        items: {
          create: [
            { code: 'ACTIVO', label: 'Activo', isActive: true },
            { code: 'RETIRADO', label: 'Retirado', isActive: false },
          ],
        },
      },
      include: { items: true },
    });
    activeId = catalog.items.find((item) => item.code === 'ACTIVO')?.id ?? '';
    inactiveId = catalog.items.find((item) => item.code === 'RETIRADO')?.id ?? '';
  });

  it('acepta un elemento activo del catálogo, por id y por código', async () => {
    await expect(validator.assertItem(catalogKey, activeId, { field: 'statusId' })).resolves.toMatchObject({
      id: activeId,
      catalogKey,
      code: 'ACTIVO',
    });
    await expect(validator.assertItem(catalogKey, 'ACTIVO', { field: 'status', by: 'code' })).resolves.toMatchObject({
      id: activeId,
    });
  });

  it('rechaza con 422 un elemento que pertenece a OTRO catálogo (un estado no es una prioridad)', async () => {
    const priority = await context.prisma.catalogItem.findFirstOrThrow({ where: { catalog: { key: 'crm.prioridad' } } });

    await expect(validator.assertItem(catalogKey, priority.id, { field: 'statusId' })).rejects.toMatchObject({
      code: INVALID_CATALOG_VALUE,
      details: [{ field: 'statusId', catalogKey, reason: 'NOT_FOUND' }],
    });
  });

  it('exige activo en el alta y conserva el valor desactivado actual en la edición', async () => {
    await expect(validator.assertItem(catalogKey, inactiveId, { field: 'statusId' })).rejects.toMatchObject({
      details: [{ reason: 'INACTIVE' }],
    });
    await expect(
      validator.assertItem(catalogKey, inactiveId, { field: 'statusId', currentId: inactiveId }),
    ).resolves.toMatchObject({ id: inactiveId, isActive: false });
  });

  it('valida dentro de la transacción del llamador', async () => {
    const result = await transactions.run((tx) => validator.check(catalogKey, activeId, { field: 'statusId', tx }));
    expect(result.ok).toBe(true);
  });

  it('un id inexistente con forma de UUID es NOT_FOUND', async () => {
    await expect(validator.check(catalogKey, randomUUID(), { field: 'statusId' })).resolves.toMatchObject({
      ok: false,
      issue: { reason: 'NOT_FOUND' },
    });
  });
});

describe('VisibilityScopeResolver (PostgreSQL)', () => {
  let resolver: VisibilityScopeResolver;

  beforeAll(() => {
    resolver = context.app.get(VisibilityScopeResolver);
  });

  async function team(options: { parentId?: string; managerId?: string; memberIds?: string[]; isActive?: boolean; deleted?: boolean }) {
    const created = await context.prisma.team.create({
      data: {
        code: uniqueCode('EQ'),
        name: 'Equipo de prueba',
        parentId: options.parentId ?? null,
        managerId: options.managerId ?? null,
        isActive: options.isActive ?? true,
        deletedAt: options.deleted ? new Date() : null,
        members: { create: (options.memberIds ?? []).map((userId) => ({ userId })) },
      },
    });
    return created.id;
  }

  it('TEAM incluye miembros y responsables del equipo y de TODOS sus subequipos activos, nada más', async () => {
    const manager = await createTestUser(context.prisma, { roleCodes: ['manager'] });
    const user = () => createTestUser(context.prisma);
    const [peer, childMember, grandChildMember, childManager, inactiveMember, deletedMember, outsider] = await Promise.all([
      user(),
      user(),
      user(),
      user(),
      user(),
      user(),
      user(),
    ]);

    const root = await team({ memberIds: [manager.id, peer.id] });
    const child = await team({ parentId: root, managerId: childManager.id, memberIds: [childMember.id] });
    const grandChild = await team({ parentId: child, memberIds: [grandChildMember.id] });
    await team({ parentId: child, isActive: false, memberIds: [inactiveMember.id] });
    await team({ parentId: root, deleted: true, memberIds: [deletedMember.id] });
    await team({ memberIds: [outsider.id] });

    const scope = await resolver.resolve(manager.id, 'clientes.ver');

    expect(scope.kind).toBe('FILTERED');
    if (scope.kind !== 'FILTERED') return;
    expect(scope.dataScope).toBe('TEAM');
    expect([...scope.teamIds].sort()).toEqual([root, child, grandChild].sort());
    expect([...scope.ownerIds].sort()).toEqual(
      [manager.id, peer.id, childMember.id, grandChildMember.id, childManager.id].sort(),
    );
    expect(scope.ownerIds).not.toContain(inactiveMember.id);
    expect(scope.ownerIds).not.toContain(deletedMember.id);
    expect(scope.ownerIds).not.toContain(outsider.id);
  });

  it('TEAM también alcanza los equipos que el usuario solo dirige (manager_id), con subequipos', async () => {
    const manager = await createTestUser(context.prisma, { roleCodes: ['manager'] });
    const [member, subMember] = await Promise.all([createTestUser(context.prisma), createTestUser(context.prisma)]);
    const led = await team({ managerId: manager.id, memberIds: [member.id] });
    await team({ parentId: led, memberIds: [subMember.id] });

    const scope = await resolver.resolve(manager.id, 'clientes.ver');

    expect(scope.kind === 'FILTERED' && [...scope.ownerIds].sort()).toEqual([manager.id, member.id, subMember.id].sort());
  });

  it('un ciclo corrupto en la jerarquía no cuelga la consulta', async () => {
    const manager = await createTestUser(context.prisma, { roleCodes: ['manager'] });
    const first = await team({ memberIds: [manager.id] });
    const second = await team({ parentId: first });
    // Ciclo creado por fuera de la API (la API lo impide, PLAN-ADMIN D8).
    await context.prisma.team.update({ where: { id: first }, data: { parentId: second } });

    const scope = await resolver.resolve(manager.id, 'clientes.ver');
    expect(scope.kind === 'FILTERED' && [...scope.teamIds].sort()).toEqual([first, second].sort());
  });

  it('COUNTRY usa el país del usuario; sin país se degrada a OWN (D-02.8)', async () => {
    const guatemala = await context.prisma.country.findUniqueOrThrow({ where: { isoCode: 'GT' } });
    const withCountry = await createTestUser(context.prisma, { roleCodes: ['responsable-pais'] });
    await context.prisma.user.update({ where: { id: withCountry.id }, data: { countryId: guatemala.id } });
    const withoutCountry = await createTestUser(context.prisma, { roleCodes: ['responsable-pais'] });

    await expect(resolver.resolve(withCountry.id, 'clientes.ver')).resolves.toMatchObject({
      kind: 'FILTERED',
      dataScope: 'COUNTRY',
      ownerIds: [withCountry.id],
      countryIds: [guatemala.id],
    });
    await expect(resolver.resolve(withoutCountry.id, 'clientes.ver')).resolves.toMatchObject({
      dataScope: 'OWN',
      ownerIds: [withoutCountry.id],
      countryIds: [],
    });
  });

  it('OWN para el asesor, ALL para el administrador y nada sin el permiso', async () => {
    const advisor = await createTestUser(context.prisma, { roleCodes: ['asesor'] });
    const admin = await createTestUser(context.prisma, { roleCodes: ['administrador'] });
    const plain = await createTestUser(context.prisma, { roleCodes: ['usuario'] });

    await expect(resolver.resolve(advisor.id, 'clientes.ver')).resolves.toMatchObject({ dataScope: 'OWN', ownerIds: [advisor.id] });
    await expect(resolver.resolve(admin.id, 'clientes.ver')).resolves.toEqual({
      kind: 'ALL',
      userId: admin.id,
      dataScope: 'ORGANIZATION',
    });
    await expect(resolver.resolve(plain.id, 'clientes.ver')).resolves.toMatchObject({ dataScope: 'NONE', ownerIds: [] });
  });
});
