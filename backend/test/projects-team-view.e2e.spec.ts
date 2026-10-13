import { randomUUID } from 'node:crypto';

import {
  api,
  catalogItemId,
  type CrmUser,
  crmUser,
  insertCustomer,
  insertOpportunity,
  insertProject,
  insertTeam,
  testCountry,
  uniqueSuffix,
} from './support/crm-fixtures';
import { closeTestContext, createTestContext, type TestContext } from './support/test-app';

/**
 * Búsqueda (F-13) y vista de equipo (F-14) por alcance (03 H.1, H.2; AC-03.24,
 * AC-03.26 – AC-03.29; PF-03.34, PF-03.36 – PF-03.38): conjuntos exactos para
 * OWN, TEAM con subequipo, COUNTRY y ORGANIZATION; columna de equipo = equipo
 * principal del responsable; orden por última actualización; "ver ≠ editar" con un
 * rol propio; roles combinados; filtros que nunca amplían el alcance; selector de
 * equipos y de asesores.
 *
 * Los nombres de proyectos y usuarios llevan un sufijo único: cada consulta se
 * acota con `search` y se compara por igualdad. Países propios `R1`–`R4`.
 */

let context: TestContext;
let r1: string;
let r2: string;
let r3: string;
let r4: string;
let editorRoleCode: string;
let readerRoleCode: string;
let phaseDiseno: { id: string; code: string; label: string };

const ALL_CAPABILITIES = {
  canEdit: true,
  canAdminister: true,
  canDelete: true,
  canDuplicate: true,
  canCreateOpportunity: true,
  canEditForecast: true,
};

/** Rol propio de prueba con un alcance y una lista de permisos (ADR-020). Local: candidato a crm-fixtures. */
async function insertRole(dataScope: 'OWN' | 'TEAM' | 'COUNTRY' | 'ORGANIZATION', permissionCodes: string[], prefix: string): Promise<string> {
  const code = `${prefix}-${randomUUID().slice(0, 8)}`;
  const permissions = await context.prisma.permission.findMany({ where: { code: { in: permissionCodes } } });
  expect(permissions).toHaveLength(permissionCodes.length);
  await context.prisma.role.create({
    data: {
      code,
      name: `Rol de prueba ${code}`,
      dataScope,
      permissions: { create: permissions.map((permission) => ({ permissionId: permission.id })) },
    },
  });
  return code;
}

/** `{ id, code, name }` de un equipo, como lo devuelve la API. Local: candidato a crm-fixtures. */
async function teamRef(teamId: string): Promise<{ id: string; code: string; name: string }> {
  return context.prisma.team.findUniqueOrThrow({ where: { id: teamId }, select: { id: true, code: true, name: true } });
}

async function catalogRef(catalogKey: string, code: string): Promise<{ id: string; code: string; label: string }> {
  return context.prisma.catalogItem.findFirstOrThrow({ where: { code, catalog: { key: catalogKey } }, select: { id: true, code: true, label: true } });
}

/** Fecha a las 12:00 UTC: el mismo día de calendario en la zona del negocio (America/Guatemala). */
function noonUtc(date: string): Date {
  return new Date(`${date}T12:00:00.000Z`);
}

interface Scenario {
  suffix: string;
  users: Record<'manager' | 'subManager' | 'memberA' | 'memberB' | 'suspended' | 'outsider' | 'countryLead' | 'admin', CrmUser>;
  teams: Record<'parent' | 'child' | 'other' | 'secondary' | 'inactive', string>;
  projects: Record<'ofManager' | 'ofMemberA' | 'ofMemberB' | 'ofSubManager' | 'ofSuspended' | 'ofOutsiderR3' | 'ofOutsiderR2', string>;
  customer: { id: string; legalName: string };
  deletedId: string;
}

/**
 * Mismo juego de datos para los cuatro alcances (PF-03.34):
 * - equipo padre (manager) con `memberA` como miembro principal;
 * - subequipo (subManager) con `memberB` y `suspended` como miembros principales;
 * - equipo ajeno con `outsider` (país R3) como principal;
 * - equipo secundario donde `memberA` es miembro NO principal;
 * - subequipo inactivo del padre (con `outsider`), que no amplía nada.
 */
async function scenario(): Promise<Scenario> {
  const suffix = uniqueSuffix();
  const user = (displayName: string, roleCodes: string[], countryId: string | null, status?: 'SUSPENDED'): Promise<CrmUser> =>
    crmUser(context, { roleCodes, countryId, displayName: `${displayName} ${suffix}`, ...(status ? { status } : {}) });

  const users = {
    manager: await user('Ana Manager', ['manager'], r1),
    subManager: await user('Beto Submanager', ['manager'], r1),
    memberA: await user('Carla Miembro', ['asesor'], r1),
    memberB: await user('Dario Miembro', ['asesor'], r2),
    suspended: await user('Elena Suspendida', ['asesor'], r1, 'SUSPENDED'),
    outsider: await user('Fabio Ajeno', ['asesor'], r3),
    countryLead: await user('Gina Pais', ['responsable-pais'], r3),
    admin: await user('Hugo Admin', ['administrador'], null),
  };

  const parent = await insertTeam(context.prisma, { managerId: users.manager.id, primaryMemberIds: [users.memberA.id], name: `Equipo A ${suffix}` });
  const child = await insertTeam(context.prisma, {
    managerId: users.subManager.id,
    parentId: parent,
    primaryMemberIds: [users.memberB.id, users.suspended.id],
    name: `Equipo B ${suffix}`,
  });
  const other = await insertTeam(context.prisma, { primaryMemberIds: [users.outsider.id], name: `Equipo C ${suffix}` });
  const secondary = await insertTeam(context.prisma, { memberIds: [users.memberA.id], name: `Equipo D ${suffix}` });
  const inactive = await insertTeam(context.prisma, { parentId: parent, memberIds: [users.outsider.id], name: `Equipo E ${suffix}` });
  await context.prisma.team.update({ where: { id: inactive }, data: { isActive: false } });

  const customer = await insertCustomer(context.prisma, { salesOwnerId: users.admin.id, countryId: r4, legalName: `Cliente equipo ${suffix}` });
  const project = (label: string, ownerId: string, countryId: string, day: string, deletedAt: Date | null = null): Promise<string> =>
    insertProject(context.prisma, {
      customerId: customer.id,
      ownerId,
      countryId,
      name: `Obra ${label} ${suffix}`,
      lastActivityAt: noonUtc(day),
      deletedAt,
    });

  const projects = {
    ofManager: await project('del manager', users.manager.id, r2, '2026-09-01'),
    ofSubManager: await project('del submanager', users.subManager.id, r2, '2026-09-02'),
    ofMemberB: await project('del miembro B', users.memberB.id, r2, '2026-09-03'),
    ofOutsiderR3: await project('ajena en R3', users.outsider.id, r3, '2026-09-04'),
    ofMemberA: await project('del miembro A', users.memberA.id, r3, '2026-09-05'),
    ofOutsiderR2: await project('ajena en R2', users.outsider.id, r2, '2026-09-06'),
    ofSuspended: await project('de la suspendida', users.suspended.id, r2, '2026-09-07'),
  };
  // Eliminado: nunca aparece, ni para el administrador.
  const deletedId = await project('eliminada', users.memberA.id, r3, '2026-09-08', new Date());

  return { suffix, users, teams: { parent, child, other, secondary, inactive }, projects, customer, deletedId };
}

async function searchIds(user: CrmUser, query: string): Promise<string[]> {
  const response = await api(context, user.token).get(`/projects?pageSize=100&${query}`).expect(200);
  return (response.body.data as { id: string }[]).map((item) => item.id).sort();
}

async function teamViewIds(user: CrmUser, query: string): Promise<string[]> {
  const response = await api(context, user.token).get(`/projects/team-view?pageSize=100&${query}`).expect(200);
  return (response.body.data as { id: string }[]).map((item) => item.id);
}

beforeAll(async () => {
  context = await createTestContext();
  r1 = await testCountry(context.prisma, 'R1', { name: 'Proyectos Equipo Uno' });
  r2 = await testCountry(context.prisma, 'R2', { name: 'Proyectos Equipo Dos' });
  r3 = await testCountry(context.prisma, 'R3', { name: 'Proyectos Equipo Tres' });
  r4 = await testCountry(context.prisma, 'R4', { name: 'Proyectos Equipo Cuatro' });
  // AC-03.28: rol propio TEAM con ver + editar y sin administrar.
  editorRoleCode = await insertRole('TEAM', ['proyectos.ver', 'proyectos.editar'], 'editor-equipo');
  // Roles combinados: lectura ORGANIZATION sin ningún permiso de escritura.
  readerRoleCode = await insertRole('ORGANIZATION', ['proyectos.ver'], 'lector-proyectos');
  phaseDiseno = await catalogRef('crm.fase_cliente', 'DISENO');
});

afterAll(async () => {
  await context?.prisma.role.deleteMany({ where: { code: { in: [editorRoleCode, readerRoleCode].filter(Boolean) } } });
  await closeTestContext(context);
});

describe('Alcances sobre el mismo juego de datos (PF-03.34, AC-03.24, AC-03.26)', () => {
  it('OWN, TEAM con subequipo, COUNTRY y ORGANIZATION ven exactamente su conjunto en /projects y en /projects/team-view', async () => {
    const { suffix, users, projects, deletedId } = await scenario();
    const p = projects;
    const all = Object.values(p);
    const expected: [CrmUser, string[]][] = [
      // OWN: solo lo propio.
      [users.memberA, [p.ofMemberA]],
      // TEAM: propios + miembros y responsables de sus equipos y subequipos activos.
      [users.manager, [p.ofManager, p.ofMemberA, p.ofMemberB, p.ofSubManager, p.ofSuspended]],
      // El responsable del subequipo ve su subequipo, no el padre.
      [users.subManager, [p.ofSubManager, p.ofMemberB, p.ofSuspended]],
      // COUNTRY: proyectos con country_id = su país (y los propios, que no tiene).
      [users.countryLead, [p.ofMemberA, p.ofOutsiderR3]],
      // ORGANIZATION: todos los no eliminados.
      [users.admin, all],
    ];

    for (const [user, ids] of expected) {
      expect(await searchIds(user, `search=${suffix}`)).toEqual([...ids].sort());
      expect([...(await teamViewIds(user, `search=${suffix}`))].sort()).toEqual([...ids].sort());
    }

    // El eliminado no aparece ni para ORGANIZATION.
    expect(await searchIds(users.admin, `search=${suffix}`)).not.toContain(deletedId);
    const totals = await api(context, users.manager.token).get(`/projects/team-view?search=${suffix}`).expect(200);
    expect(totals.body.pagination).toEqual({ page: 1, pageSize: 20, totalItems: 5, totalPages: 1 });
  });

  it('un filtro por asesor fuera del alcance devuelve vacío; dentro del alcance, se intersecta (AC-03.24, RN-03.18)', async () => {
    const { suffix, users, projects } = await scenario();

    expect(await searchIds(users.memberA, `search=${suffix}&ownerId=${users.outsider.id}`)).toEqual([]);
    expect(await searchIds(users.manager, `search=${suffix}&ownerId=${users.outsider.id}`)).toEqual([]);
    expect(await teamViewIds(users.manager, `search=${suffix}&ownerId=${users.outsider.id}`)).toEqual([]);
    expect(await searchIds(users.manager, `search=${suffix}&ownerId=${users.memberB.id},${users.outsider.id}`)).toEqual([projects.ofMemberB]);
    // Un filtro por país no amplía: el manager no ve los de R3 ajenos a su equipo.
    expect(await teamViewIds(users.manager, `search=${suffix}&countryId=${r3}`)).toEqual([projects.ofMemberA]);
    expect(await searchIds(users.countryLead, `search=${suffix}&countryId=${r2}`)).toEqual([]);
  });
});

describe('Vista de equipo: columnas, equipo principal y orden (PF-03.36, AC-03.27)', () => {
  it('cada fila trae proyecto, cliente, responsable, equipo principal, fase, estado comercial y lastActivityAt; orden por lastActivityAt desc', async () => {
    const { suffix, users, teams, projects, customer } = await scenario();
    const stage = await catalogRef('crm.etapa_oportunidad', 'COTIZANDO');
    await insertOpportunity(context.prisma, { projectId: projects.ofMemberB, ownerId: users.memberB.id, stageCode: 'COTIZANDO' });

    const response = await api(context, users.manager.token).get(`/projects/team-view?search=${suffix}`).expect(200);
    // Orden por defecto: última actualización descendente.
    expect(response.body.data.map((item: { id: string }) => item.id)).toEqual([
      projects.ofSuspended,
      projects.ofMemberA,
      projects.ofMemberB,
      projects.ofSubManager,
      projects.ofManager,
    ]);

    const byId = new Map<string, Record<string, unknown>>(response.body.data.map((item: { id: string }) => [item.id, item]));
    const memberAProject = await context.prisma.project.findUniqueOrThrow({ where: { id: projects.ofMemberA } });
    // Equipo = el PRINCIPAL del responsable (no el secundario donde también es miembro).
    expect(byId.get(projects.ofMemberA)).toEqual({
      id: projects.ofMemberA,
      code: memberAProject.code,
      name: `Obra del miembro A ${suffix}`,
      customer: { id: customer.id, legalName: customer.legalName },
      owner: { id: users.memberA.id, displayName: `Carla Miembro ${suffix}` },
      team: await teamRef(teams.parent),
      phase: { ...phaseDiseno, progress: '0.00' },
      commercialStatus: { kind: 'NO_OPPORTUNITIES', label: 'Sin oportunidades', stage: null },
      lastActivityAt: '2026-09-05T12:00:00.000Z',
      capabilities: ALL_CAPABILITIES,
    });
    expect(byId.get(projects.ofMemberB)).toMatchObject({
      team: await teamRef(teams.child),
      commercialStatus: { kind: 'OPEN_STAGE', label: stage.label, stage },
      lastActivityAt: '2026-09-03T12:00:00.000Z',
    });
    // El manager y el submanager responden de equipos, pero no son miembros principales de ninguno.
    expect(byId.get(projects.ofManager)).toMatchObject({ team: null });
    expect(byId.get(projects.ofSubManager)).toMatchObject({ team: null });

    const outsider = await api(context, users.admin.token).get(`/projects/team-view?search=${suffix}&ownerId=${users.outsider.id}`).expect(200);
    expect(outsider.body.data.map((item: { team: unknown }) => item.team)).toEqual([await teamRef(teams.other), await teamRef(teams.other)]);
  });

  it('ordena por nombre de responsable y por equipo cuando se pide', async () => {
    const { suffix, users, projects } = await scenario();
    const byOwner = await teamViewIds(users.manager, `search=${suffix}&sortBy=ownerName&sortOrder=asc`);
    expect(byOwner).toEqual([projects.ofManager, projects.ofSubManager, projects.ofMemberA, projects.ofMemberB, projects.ofSuspended]);
    // teamName asc con NULLS LAST; empate por id.
    const byTeam = await teamViewIds(users.manager, `search=${suffix}&sortBy=teamName&sortOrder=asc`);
    expect(byTeam.slice(0, 3)).toEqual([projects.ofMemberA, ...[projects.ofMemberB, projects.ofSuspended].sort()]);
    expect([...byTeam.slice(3)].sort()).toEqual([projects.ofManager, projects.ofSubManager].sort());
  });

  it('filtra por rango de última actualización (inclusive) y rechaza from > to con 422 INVALID_DATE_RANGE', async () => {
    const { suffix, users, projects } = await scenario();
    expect(await teamViewIds(users.manager, `search=${suffix}&lastActivityFrom=2026-09-02&lastActivityTo=2026-09-03`)).toEqual([
      projects.ofMemberB,
      projects.ofSubManager,
    ]);
    expect(await teamViewIds(users.manager, `search=${suffix}&lastActivityFrom=2026-09-05`)).toEqual([projects.ofSuspended, projects.ofMemberA]);

    const invalid = await api(context, users.manager.token)
      .get('/projects/team-view?lastActivityFrom=2026-09-04&lastActivityTo=2026-09-03')
      .expect(422);
    expect(invalid.body).toMatchObject({
      code: 'INVALID_DATE_RANGE',
      details: [{ field: 'lastActivityTo', code: 'INVALID_DATE_RANGE', message: 'The end date cannot be earlier than the start date' }],
    });
    // Igualdad: rango de un día, válido.
    expect(await teamViewIds(users.manager, `search=${suffix}&lastActivityFrom=2026-09-01&lastActivityTo=2026-09-01`)).toEqual([projects.ofManager]);
  });
});

describe('Ver ≠ editar (PF-03.37, AC-03.28)', () => {
  it('rol propio TEAM con ver + editar: ve los del equipo, los ajenos en solo lectura, y el PATCH ajeno da 403', async () => {
    const suffix = uniqueSuffix();
    const editor = await crmUser(context, { roleCodes: [editorRoleCode], countryId: r1 });
    const member = await crmUser(context, { roleCodes: ['asesor'], countryId: r1 });
    const stranger = await crmUser(context, { roleCodes: ['asesor'], countryId: r1 });
    await insertTeam(context.prisma, { managerId: editor.id, primaryMemberIds: [member.id] });
    const customer = await insertCustomer(context.prisma, { salesOwnerId: member.id, countryId: r1 });
    const own = await insertProject(context.prisma, { customerId: customer.id, ownerId: editor.id, countryId: r1, name: `Propia ${suffix}` });
    const ofMember = await insertProject(context.prisma, { customerId: customer.id, ownerId: member.id, countryId: r1, name: `Del miembro ${suffix}` });
    await insertProject(context.prisma, { customerId: customer.id, ownerId: stranger.id, countryId: r1, name: `Ajena ${suffix}` });
    const client = api(context, editor.token);

    const view = await client.get(`/projects/team-view?search=${suffix}`).expect(200);
    const capabilities = Object.fromEntries(view.body.data.map((item: { id: string; capabilities: unknown }) => [item.id, item.capabilities]));
    expect(capabilities).toEqual({
      [own]: { canEdit: true, canAdminister: false, canDelete: false, canDuplicate: false, canCreateOpportunity: false, canEditForecast: false },
      [ofMember]: { canEdit: false, canAdminister: false, canDelete: false, canDuplicate: false, canCreateOpportunity: false, canEditForecast: false },
    });

    const denied = await client.patch(`/projects/${ofMember}`).send({ name: 'Renombrada' }).expect(403);
    expect(denied.body).toMatchObject({ code: 'PERMISSION_DENIED', details: [{ requiredPermission: 'proyectos.administrar' }] });
    expect((await context.prisma.project.findUniqueOrThrow({ where: { id: ofMember } })).name).toBe(`Del miembro ${suffix}`);

    // Control: el propio sí se edita.
    const edited = await client.patch(`/projects/${own}`).send({ name: `Propia renombrada ${suffix}` }).expect(200);
    expect(edited.body.name).toBe(`Propia renombrada ${suffix}`);
  });
});

describe('Roles combinados: manager TEAM + lector ORGANIZATION (03 H.2, AGENTS §9.4)', () => {
  it('ve el proyecto ajeno al equipo en solo lectura; PATCH → 403 administrar y DELETE → 403 eliminar', async () => {
    const suffix = uniqueSuffix();
    const manager = await crmUser(context, { roleCodes: ['manager', readerRoleCode], countryId: r1 });
    const member = await crmUser(context, { roleCodes: ['asesor'], countryId: r1 });
    const stranger = await crmUser(context, { roleCodes: ['asesor'], countryId: r2 });
    await insertTeam(context.prisma, { managerId: manager.id, primaryMemberIds: [member.id] });
    const customer = await insertCustomer(context.prisma, { salesOwnerId: stranger.id, countryId: r2 });
    const foreign = await insertProject(context.prisma, { customerId: customer.id, ownerId: stranger.id, countryId: r2, name: `Ajena ${suffix}` });
    const ofMember = await insertProject(context.prisma, { customerId: customer.id, ownerId: member.id, countryId: r2, name: `Del miembro ${suffix}` });
    const client = api(context, manager.token);

    const view = await client.get(`/projects/team-view?search=${suffix}`).expect(200);
    const capabilities = Object.fromEntries(view.body.data.map((item: { id: string; capabilities: unknown }) => [item.id, item.capabilities]));
    expect(capabilities).toEqual({
      [foreign]: { canEdit: false, canAdminister: false, canDelete: false, canDuplicate: true, canCreateOpportunity: false, canEditForecast: false },
      [ofMember]: ALL_CAPABILITIES,
    });

    const edit = await client.patch(`/projects/${foreign}`).send({ name: 'Renombrada' }).expect(403);
    expect(edit.body).toMatchObject({ code: 'PERMISSION_DENIED', details: [{ requiredPermission: 'proyectos.administrar' }] });
    const removal = await client.delete(`/projects/${foreign}`).expect(403);
    expect(removal.body).toMatchObject({ code: 'PERMISSION_DENIED', details: [{ requiredPermission: 'proyectos.eliminar' }] });
    expect(await context.prisma.project.findUniqueOrThrow({ where: { id: foreign } })).toMatchObject({ name: `Ajena ${suffix}`, deletedAt: null });

    // Sin el rol de lectura, el mismo proyecto queda fuera del alcance.
    const plainManager = await crmUser(context, { roleCodes: ['manager'], countryId: r1 });
    await insertTeam(context.prisma, { managerId: plainManager.id, primaryMemberIds: [member.id] });
    expect(await teamViewIds(plainManager, `search=${suffix}`)).toEqual([ofMember]);
    await api(context, plainManager.token).patch(`/projects/${foreign}`).send({ name: 'X' }).expect(404);
  });
});

describe('Filtro y selector de equipos (PF-03.38, AC-03.29)', () => {
  it('un equipo fuera del alcance da vacío (200, no 403); uno del alcance filtra por equipo principal del responsable', async () => {
    const { suffix, users, teams, projects } = await scenario();

    const outOfScope = await api(context, users.manager.token).get(`/projects/team-view?search=${suffix}&teamId=${teams.other}`).expect(200);
    expect(outOfScope.body).toEqual({ data: [], pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } });
    expect(await teamViewIds(users.memberA, `search=${suffix}&teamId=${teams.child}`)).toEqual([]);

    expect(await teamViewIds(users.manager, `search=${suffix}&teamId=${teams.parent}`)).toEqual([projects.ofMemberA]);
    expect(await teamViewIds(users.manager, `search=${suffix}&teamId=${teams.child}`)).toEqual([projects.ofSuspended, projects.ofMemberB]);
    // El equipo secundario de memberA no es su principal: no lo trae.
    expect(await teamViewIds(users.admin, `search=${suffix}&teamId=${teams.secondary}`)).toEqual([]);
    expect(await teamViewIds(users.admin, `search=${suffix}&teamId=${teams.other}`)).toEqual([projects.ofOutsiderR2, projects.ofOutsiderR3]);
  });

  it('/projects/team-options solo ofrece equipos del alcance', async () => {
    const { users, teams } = await scenario();
    const options = async (user: CrmUser): Promise<{ id: string; code: string; name: string; parentId: string | null }[]> =>
      (await api(context, user.token).get('/projects/team-options').expect(200)).body.data;
    const option = async (teamId: string): Promise<{ id: string; code: string; name: string; parentId: string | null }> => ({
      ...(await teamRef(teamId)),
      parentId: (await context.prisma.team.findUniqueOrThrow({ where: { id: teamId } })).parentId,
    });

    // TEAM: sus equipos y subequipos activos (y los principales de los usuarios del alcance, que son esos mismos).
    expect(await options(users.manager)).toEqual([await option(teams.parent), await option(teams.child)]);
    expect(await options(users.subManager)).toEqual([await option(teams.child)]);
    // OWN: el equipo principal propio, no el secundario.
    expect(await options(users.memberA)).toEqual([await option(teams.parent)]);
    // COUNTRY: equipos principales de los usuarios de su país (R3: outsider).
    const countryIds = (await options(users.countryLead)).map((team) => team.id);
    expect(countryIds).toContain(teams.other);
    for (const excluded of [teams.parent, teams.child, teams.secondary, teams.inactive]) expect(countryIds).not.toContain(excluded);
    // ORGANIZATION: todos los activos.
    const adminIds = (await options(users.admin)).map((team) => team.id);
    for (const included of [teams.parent, teams.child, teams.other, teams.secondary]) expect(adminIds).toContain(included);
    expect(adminIds).not.toContain(teams.inactive);
  });
});

describe('Selector de asesores (03 F.1 owner-options, D-03.16)', () => {
  it('ASSIGN: el asesor sin administrar solo se ve a sí mismo; el manager, los ACTIVE de su equipo con proyectos.ver', async () => {
    const { suffix, users, teams } = await scenario();
    const parent = await teamRef(teams.parent);

    const own = await api(context, users.memberA.token).get('/projects/owner-options').expect(200);
    expect(own.body).toEqual({
      data: [{ id: users.memberA.id, displayName: `Carla Miembro ${suffix}`, countryId: r1, primaryTeam: parent }],
      pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
    });
    const explicit = await api(context, users.memberA.token).get('/projects/owner-options?purpose=ASSIGN').expect(200);
    expect(explicit.body.data.map((item: { id: string }) => item.id)).toEqual([users.memberA.id]);

    const team = await api(context, users.manager.token).get(`/projects/owner-options?purpose=ASSIGN&search=${suffix}&pageSize=100`).expect(200);
    // Sin la suspendida (no ACTIVE) ni el ajeno; ordenados por nombre.
    expect(team.body.data).toEqual([
      { id: users.manager.id, displayName: `Ana Manager ${suffix}`, countryId: r1, primaryTeam: null },
      { id: users.subManager.id, displayName: `Beto Submanager ${suffix}`, countryId: r1, primaryTeam: null },
      { id: users.memberA.id, displayName: `Carla Miembro ${suffix}`, countryId: r1, primaryTeam: parent },
      { id: users.memberB.id, displayName: `Dario Miembro ${suffix}`, countryId: r2, primaryTeam: await teamRef(teams.child) },
    ]);
  });

  it('ASSIGN excluye a quien tiene proyectos.ver denegado aunque esté en el alcance', async () => {
    const suffix = uniqueSuffix();
    const manager = await crmUser(context, { roleCodes: ['manager'], countryId: r1, displayName: `Ana Jefa ${suffix}` });
    const denied = await crmUser(context, { roleCodes: ['asesor'], countryId: r1, deny: ['proyectos.ver'], displayName: `Bruno Sin ver ${suffix}` });
    await insertTeam(context.prisma, { managerId: manager.id, primaryMemberIds: [denied.id] });

    const response = await api(context, manager.token).get(`/projects/owner-options?search=${suffix}`).expect(200);
    expect(response.body.data.map((item: { id: string }) => item.id)).toEqual([manager.id]);
  });

  it('FILTER: responsables (de cualquier estado) de proyectos visibles', async () => {
    const { suffix, users } = await scenario();
    const ids = async (user: CrmUser): Promise<string[]> =>
      (await api(context, user.token).get(`/projects/owner-options?purpose=FILTER&search=${suffix}&pageSize=100`).expect(200)).body.data.map(
        (item: { id: string }) => item.id,
      );

    expect(await ids(users.memberA)).toEqual([users.memberA.id]);
    // Incluye a la suspendida (su proyecto es visible); el manager y el submanager tienen proyectos propios.
    expect(await ids(users.manager)).toEqual([users.manager.id, users.subManager.id, users.memberA.id, users.memberB.id, users.suspended.id]);
    expect(await ids(users.countryLead)).toEqual([users.memberA.id, users.outsider.id]);
  });

  it('valida purpose (400 VALIDATION_FAILED)', async () => {
    const seller = await crmUser(context, { roleCodes: ['asesor'], countryId: r1 });
    const response = await api(context, seller.token).get('/projects/owner-options?purpose=ALL').expect(400);
    expect(response.body.code).toBe('VALIDATION_FAILED');
  });
});

describe('Autenticación y permiso (proyectos.ver)', () => {
  const paths = ['/projects/team-view', '/projects/team-options', '/projects/owner-options', '/projects/owner-options?purpose=FILTER'];

  it('401 UNAUTHENTICATED sin token', async () => {
    for (const path of paths) {
      const response = await api(context).get(path).expect(401);
      expect(response.body.code).toBe('UNAUTHENTICATED');
    }
  });

  it('403 PERMISSION_DENIED sin proyectos.ver (rol usuario y asesor con denegación directa)', async () => {
    const plain = await crmUser(context, { roleCodes: ['usuario'] });
    const denied = await crmUser(context, { roleCodes: ['asesor'], countryId: r1, deny: ['proyectos.ver'] });
    for (const user of [plain, denied]) {
      for (const path of paths) {
        const response = await api(context, user.token).get(path).expect(403);
        expect(response.body.code).toBe('PERMISSION_DENIED');
      }
    }
  });
});

describe('Validación de la vista de equipo', () => {
  it('sortBy fuera de la lista blanca, teamId no UUID y fecha mal formada → 400 VALIDATION_FAILED', async () => {
    const seller = await crmUser(context, { roleCodes: ['asesor'], countryId: r1 });
    const client = api(context, seller.token);
    for (const query of ['sortBy=code', 'teamId=no-es-uuid', 'lastActivityFrom=2026-13-01', `phaseId=${await catalogItemId(context.prisma, 'crm.fase_cliente', 'DISENO')},x`]) {
      const response = await client.get(`/projects/team-view?${query}`).expect(400);
      expect(response.body.code).toBe('VALIDATION_FAILED');
    }
  });
});
