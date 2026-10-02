export const ACCESS_REPOSITORY = Symbol('ACCESS_REPOSITORY');

/** Alcance de datos de un rol. Refleja el enum `DataScope` del esquema. */
export type DataScope = 'OWN' | 'TEAM' | 'TERRITORY' | 'ORGANIZATION';

export type AssignmentEffect = 'GRANT' | 'DENY';

export interface AccessUserRecord {
  id: string;
  email: string;
  displayName: string;
  status: 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'LOCKED';
  jobTitle: string | null;
  teams: { id: string; name: string; isPrimary: boolean }[];
}

/**
 * Todo lo que hace falta para calcular el acceso efectivo de un usuario, en
 * una sola lectura. Se devuelve plano a propósito: el cálculo vive en el
 * servicio, no en la consulta, para que sea verificable con pruebas unitarias
 * sin base de datos.
 */
export interface UserAccessSnapshot {
  user: AccessUserRecord;
  roles: { id: string; code: string; name: string; dataScope: DataScope }[];
  /** Permisos que llegan por rol. */
  rolePermissionCodes: string[];
  /** Excepciones directas sobre el usuario, ya filtradas por vigencia. */
  directPermissions: { code: string; effect: AssignmentEffect }[];
  /** Opciones de menú concedidas por rol. */
  roleMenuOptionIds: string[];
  /** Excepciones directas de opciones de menú, ya filtradas por vigencia. */
  directMenuOptions: { menuOptionId: string; effect: AssignmentEffect }[];
}

export interface MenuOptionRecord {
  id: string;
  key: string;
  parentId: string | null;
  label: string;
  icon: string | null;
  path: string | null;
  kind: 'LINK' | 'GROUP';
  sortOrder: number;
  requiredPermissionCode: string | null;
  isPublic: boolean;
  isActive: boolean;
  module: { key: string; name: string; icon: string | null; sortOrder: number };
}

export interface ListUsersFilter {
  page: number;
  pageSize: number;
  search?: string;
  status?: AccessUserRecord['status'];
  roleCode?: string;
  teamId?: string;
}

export interface Paginated<TItem> {
  items: TItem[];
  totalItems: number;
}

export interface CreateUserInput {
  email: string;
  firstName: string;
  lastName: string;
  jobTitle?: string;
  phone?: string;
  roleIds: string[];
  teamIds: string[];
  createdById: string | null;
}

export interface UpdateUserInput {
  firstName?: string;
  lastName?: string;
  jobTitle?: string | null;
  phone?: string | null;
  status?: AccessUserRecord['status'];
  updatedById: string | null;
}

export interface DirectAssignmentInput {
  targetId: string;
  effect: AssignmentEffect;
  reason: string;
  expiresAt?: Date | null;
}

export interface RoleRecord {
  id: string;
  code: string;
  name: string;
  description: string | null;
  dataScope: DataScope;
  isSystem: boolean;
  isActive: boolean;
  permissionCodes: string[];
  menuOptionIds: string[];
  userCount: number;
}

export interface PermissionRecord {
  id: string;
  code: string;
  resource: string;
  action: string;
  name: string;
  moduleKey: string | null;
}

/**
 * Puerto de acceso a los datos de gestión (ADR-004).
 *
 * El módulo de acceso depende de esta interfaz, nunca de Prisma. Cambiar de
 * motor o de ORM es escribir otro adaptador, no tocar las reglas.
 */
export interface AccessRepository {
  /** Devuelve el usuario por el sujeto del proveedor de identidad. */
  findUserBySubject(provider: 'LOCAL' | 'ENTRA_ID', subject: string): Promise<AccessUserRecord | null>;
  findUserByEmail(email: string): Promise<AccessUserRecord | null>;

  /** Instantánea completa de acceso, con vigencias ya aplicadas. */
  getUserAccessSnapshot(userId: string): Promise<UserAccessSnapshot | null>;

  /** Catálogo de opciones activas, ordenado por módulo y posición. */
  listMenuOptions(): Promise<MenuOptionRecord[]>;

  listUsers(filter: ListUsersFilter): Promise<Paginated<AccessUserRecord & { roles: string[] }>>;
  createUser(input: CreateUserInput): Promise<AccessUserRecord>;
  updateUser(userId: string, input: UpdateUserInput): Promise<AccessUserRecord>;

  replaceUserRoles(userId: string, roleIds: string[], actorId: string | null): Promise<void>;
  replaceUserPermissions(userId: string, assignments: DirectAssignmentInput[], actorId: string | null): Promise<void>;
  replaceUserMenuOptions(userId: string, assignments: DirectAssignmentInput[], actorId: string | null): Promise<void>;

  listRoles(): Promise<RoleRecord[]>;
  findRoleById(roleId: string): Promise<RoleRecord | null>;
  replaceRolePermissions(roleId: string, permissionIds: string[], actorId: string | null): Promise<void>;
  replaceRoleMenuOptions(roleId: string, menuOptionIds: string[], actorId: string | null): Promise<void>;

  listPermissions(): Promise<PermissionRecord[]>;
}
