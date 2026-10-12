import type { VisibilityScope } from '@/modules/access/visibility-scope';

import {
  canCreateOpportunityIn,
  isOpportunityInScope,
  missingEditPermission,
  opportunityCapabilities,
  opportunityPolicySubject,
} from './opportunity-access-policy';

const NONE: VisibilityScope = { kind: 'FILTERED', userId: 'me', dataScope: 'NONE', ownerIds: [], teamIds: [], countryIds: [] };
const TEAM: VisibilityScope = { kind: 'FILTERED', userId: 'me', dataScope: 'TEAM', ownerIds: ['me', 'member'], teamIds: ['t'], countryIds: [] };
const COUNTRY: VisibilityScope = { kind: 'FILTERED', userId: 'me', dataScope: 'COUNTRY', ownerIds: ['me'], teamIds: [], countryIds: ['gt'] };

const ADVISOR = ['oportunidades.ver', 'oportunidades.crear', 'oportunidades.editar', 'oportunidades.cerrar'];
const SUPERVISOR = [...ADVISOR, 'oportunidades.eliminar', 'oportunidades.administrar'];

function actor(permissions: string[]) {
  return { userId: 'me', permissions: new Set(permissions) };
}

function subject(ownerId: string, options: { projectOwner?: string; country?: string; closed?: boolean; administer?: VisibilityScope; remove?: VisibilityScope } = {}) {
  return opportunityPolicySubject(
    { ownerId, project: { ownerId: options.projectOwner ?? ownerId, countryId: options.country ?? 'sv' }, isClosed: options.closed ?? false },
    { administer: options.administer ?? NONE, delete: options.remove ?? NONE },
  );
}

describe('opportunity-access-policy (03 H.1, DM-13, DM-34)', () => {
  it('alcance: asesor de la oportunidad o proyecto (asesor o país)', () => {
    expect(isOpportunityInScope(TEAM, { ownerId: 'member', project: { ownerId: 'x', countryId: 'sv' } })).toBe(true);
    expect(isOpportunityInScope(TEAM, { ownerId: 'x', project: { ownerId: 'member', countryId: 'sv' } })).toBe(true);
    expect(isOpportunityInScope(COUNTRY, { ownerId: 'x', project: { ownerId: 'y', countryId: 'gt' } })).toBe(true);
    expect(isOpportunityInScope(TEAM, { ownerId: 'x', project: { ownerId: 'y', countryId: 'gt' } })).toBe(false);
  });

  it('asesor: edita y cierra lo propio; no reabre ni elimina; nada sobre lo ajeno', () => {
    expect(opportunityCapabilities(actor(ADVISOR), subject('me'))).toEqual({ canEdit: true, canClose: true, canReopen: false, canDelete: false });
    expect(opportunityCapabilities(actor(ADVISOR), subject('other'))).toEqual({ canEdit: false, canClose: false, canReopen: false, canDelete: false });
    expect(missingEditPermission(actor(ADVISOR), subject('other'))).toBe('oportunidades.administrar');
    expect(missingEditPermission(actor(['oportunidades.ver']), subject('me'))).toBe('oportunidades.editar');
  });

  it('sin `cerrar` no cierra aunque edite', () => {
    const capabilities = opportunityCapabilities(actor(ADVISOR.filter((code) => code !== 'oportunidades.cerrar')), subject('me'));
    expect(capabilities).toMatchObject({ canEdit: true, canClose: false });
  });

  it('manager: lo ajeno dentro del alcance de cada permiso; reabrir solo cerradas; eliminar solo abiertas', () => {
    const inScope = { administer: TEAM, remove: TEAM };
    expect(opportunityCapabilities(actor(SUPERVISOR), subject('member', inScope))).toEqual({ canEdit: true, canClose: true, canReopen: false, canDelete: true });
    expect(opportunityCapabilities(actor(SUPERVISOR), subject('member', { ...inScope, closed: true }))).toEqual({
      canEdit: true,
      canClose: true,
      canReopen: true,
      canDelete: false,
    });
    // Roles combinados: el alcance de `eliminar` no amplía el de `administrar`.
    expect(opportunityCapabilities(actor(SUPERVISOR), subject('member', { administer: NONE, remove: TEAM }))).toEqual({
      canEdit: false,
      canClose: false,
      canReopen: false,
      canDelete: true,
    });
  });

  it('crear en un proyecto: propio, o `administrar` con el proyecto en su alcance (misma regla que la ficha)', () => {
    expect(canCreateOpportunityIn(actor(ADVISOR), { ownerId: 'me', countryId: 'sv' }, NONE)).toBe(true);
    expect(canCreateOpportunityIn(actor(ADVISOR), { ownerId: 'member', countryId: 'sv' }, TEAM)).toBe(false);
    expect(canCreateOpportunityIn(actor(SUPERVISOR), { ownerId: 'member', countryId: 'sv' }, TEAM)).toBe(true);
    expect(canCreateOpportunityIn(actor(SUPERVISOR), { ownerId: 'x', countryId: 'sv' }, TEAM)).toBe(false);
  });
});
