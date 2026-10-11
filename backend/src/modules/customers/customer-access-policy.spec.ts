import {
  canAssignSalesOwner,
  canDeleteCustomer,
  canEditCustomer,
  canRestoreCustomer,
  CUSTOMER_EDITABLE_FIELDS,
  customerCapabilities,
  type CustomerPolicyActor,
  type CustomerPolicySubject,
  isCustomerWritableForContacts,
  missingEditPermission,
} from './customer-access-policy';

const ASESOR = ['clientes.ver', 'clientes.crear', 'clientes.editar', 'contactos.ver', 'contactos.crear', 'contactos.editar'];
const MANAGER = [...ASESOR, 'clientes.eliminar', 'clientes.administrar', 'contactos.eliminar'];

function actor(permissions: string[], userId: string | null = 'me'): CustomerPolicyActor {
  return { userId, permissions: new Set(permissions) };
}

function customer(overrides: Partial<CustomerPolicySubject> = {}): CustomerPolicySubject {
  return { salesOwnerId: 'me', access: 'DIRECT', isDeleted: false, inAdministerScope: true, inDeleteScope: true, ...overrides };
}

describe('CustomerAccessPolicy (H.2, DM-34, D-02.7, D-02.9; PF-02.28)', () => {
  it('asesor: edita lo propio, no lo ajeno ni lo heredado; nunca elimina ni administra', () => {
    const seller = actor(ASESOR);
    expect(canEditCustomer(seller, customer())).toBe(true);
    expect(canEditCustomer(seller, customer({ salesOwnerId: 'other' }))).toBe(false);
    expect(canEditCustomer(seller, customer({ salesOwnerId: 'other', access: 'INHERITED' }))).toBe(false);
    expect(canDeleteCustomer(seller, customer())).toBe(false);
    expect(customerCapabilities(seller, customer())).toEqual({
      canEdit: true,
      canDelete: false,
      canRestore: false,
      canManageAttachments: true,
      canManageContacts: true,
      canReassignOwner: false,
      editableFields: [...CUSTOMER_EDITABLE_FIELDS],
    });
  });

  it('manager con administrar: edita ajenos de su alcance directo y los campos reservados', () => {
    const manager = actor(MANAGER);
    const foreign = customer({ salesOwnerId: 'other' });
    const capabilities = customerCapabilities(manager, foreign);
    expect(capabilities).toMatchObject({ canEdit: true, canDelete: true, canReassignOwner: true, canManageContacts: true });
    expect(capabilities.editableFields).toEqual(expect.arrayContaining(['customerCode', 'salesOwnerId', 'countryId', 'legalName']));
  });

  it('la herencia es solo lectura, también con administrar (D-02.9)', () => {
    const manager = actor(MANAGER);
    const inherited = customer({ salesOwnerId: 'other', access: 'INHERITED' });
    expect(customerCapabilities(manager, inherited)).toEqual({
      canEdit: false,
      canDelete: false,
      canRestore: false,
      canManageAttachments: false,
      canManageContacts: false,
      canReassignOwner: false,
      editableFields: [],
    });
    expect(isCustomerWritableForContacts(manager, inherited)).toBe(false);
  });

  it('administrar sin editar no edita (F.1)', () => {
    const odd = actor(['clientes.ver', 'clientes.administrar']);
    expect(canEditCustomer(odd, customer({ salesOwnerId: 'other' }))).toBe(false);
    expect(missingEditPermission(odd, customer({ salesOwnerId: 'other' }))).toBe('clientes.editar');
  });

  it('permiso que falta para editar: editar si no lo tiene o es suyo; administrar si es ajeno', () => {
    expect(missingEditPermission(actor(['clientes.ver']), customer())).toBe('clientes.editar');
    expect(missingEditPermission(actor(ASESOR), customer({ salesOwnerId: 'other' }))).toBe('clientes.administrar');
  });

  it('eliminado: no se edita ni se elimina; se restaura con eliminar y alcance directo', () => {
    const manager = actor(MANAGER);
    const deleted = customer({ isDeleted: true });
    expect(canEditCustomer(manager, deleted)).toBe(false);
    expect(canDeleteCustomer(manager, deleted)).toBe(false);
    expect(canRestoreCustomer(manager, deleted)).toBe(true);
    expect(canRestoreCustomer(manager, customer())).toBe(false);
    expect(canRestoreCustomer(manager, { ...deleted, access: 'INHERITED' })).toBe(false);
    expect(canRestoreCustomer(actor(ASESOR), deleted)).toBe(false);
  });

  it('contactos (D-02.7): propio o ajeno con administrar; sin permisos de contactos no se gestionan', () => {
    expect(isCustomerWritableForContacts(actor(['clientes.ver']), customer())).toBe(true);
    expect(isCustomerWritableForContacts(actor(ASESOR), customer({ salesOwnerId: 'other' }))).toBe(false);
    expect(isCustomerWritableForContacts(actor(['clientes.administrar']), customer({ salesOwnerId: 'other' }))).toBe(true);
    expect(customerCapabilities(actor(['clientes.ver', 'clientes.editar', 'contactos.ver']), customer()).canManageContacts).toBe(false);
  });

  describe('cada operación usa el alcance de SU permiso, no el de clientes.ver (roles combinados)', () => {
    // Manager TEAM (editar/administrar/eliminar) + rol de solo lectura ORGANIZATION:
    // ve el cliente ajeno con acceso DIRECT, pero queda fuera de sus alcances operativos.
    const manager = actor(MANAGER);
    const outsideScopes = customer({ salesOwnerId: 'other', inAdministerScope: false, inDeleteScope: false });

    it('fuera del alcance de administrar: no edita, no toca reservados ni contactos de un ajeno', () => {
      expect(canEditCustomer(manager, outsideScopes)).toBe(false);
      expect(missingEditPermission(manager, outsideScopes)).toBe('clientes.administrar');
      expect(isCustomerWritableForContacts(manager, outsideScopes)).toBe(false);
    });

    it('fuera del alcance de eliminar: no elimina ni restaura', () => {
      expect(canDeleteCustomer(manager, outsideScopes)).toBe(false);
      expect(canRestoreCustomer(manager, { ...outsideScopes, isDeleted: true })).toBe(false);
    });

    it('las capabilities salen del mismo cálculo: todo en false', () => {
      expect(customerCapabilities(manager, outsideScopes)).toEqual({
        canEdit: false,
        canDelete: false,
        canRestore: false,
        canManageAttachments: false,
        canManageContacts: false,
        canReassignOwner: false,
        editableFields: [],
      });
    });

    it('cada alcance es independiente: dentro de administrar pero fuera de eliminar', () => {
      const capabilities = customerCapabilities(manager, customer({ salesOwnerId: 'other', inDeleteScope: false }));
      expect(capabilities).toMatchObject({ canEdit: true, canReassignOwner: true, canManageContacts: true, canDelete: false });
    });

    it('lo propio se edita (y sus contactos) aunque quede fuera del alcance de administrar, sin campos reservados', () => {
      const own = customer({ inAdministerScope: false, inDeleteScope: false });
      expect(canEditCustomer(manager, own)).toBe(true);
      expect(isCustomerWritableForContacts(manager, own)).toBe(true);
      expect(customerCapabilities(manager, own)).toMatchObject({ canReassignOwner: false, canDelete: false });
      expect(customerCapabilities(manager, own).editableFields).toEqual([...CUSTOMER_EDITABLE_FIELDS]);
    });
  });

  it('sin usuario local no es dueño de nada', () => {
    expect(canEditCustomer(actor(ASESOR, null), customer({ salesOwnerId: 'me' }))).toBe(false);
  });

  it('responsable en el alta (RN-02.11): sin administrar, solo él mismo', () => {
    expect(canAssignSalesOwner(actor(ASESOR), 'me')).toBe(true);
    expect(canAssignSalesOwner(actor(ASESOR), 'other')).toBe(false);
    expect(canAssignSalesOwner(actor(MANAGER), 'other')).toBe(true);
    expect(canAssignSalesOwner(actor(ASESOR, null), 'me')).toBe(false);
  });
});
