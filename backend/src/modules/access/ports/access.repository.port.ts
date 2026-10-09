export const ACCESS_REPOSITORY = Symbol('ACCESS_REPOSITORY');

/** Alcance de datos de un rol. Refleja el enum `DataScope` del esquema. */
export type DataScope = 'OWN' | 'TEAM' | 'TERRITORY' | 'ORGANIZATION';

export type AssignmentEffect = 'GRANT' | 'DENY';

export type UserStatus = 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'LOCKED';

export type SortOrder = 'asc' | 'desc';

export interface AccessUserRecord {
  id: string;
  email: string;
  displayName: string;
  status: UserStatus;
  jobTitle: string | null;
  teams: { id: string; name: string; isPrimary: boolean }[];
}

/** Fila de la lista y de la exportación de usuarios. */
export interface UserListItem extends AccessUserRecord {
  roles: string[];
  lastLoginAt: Date | null;
  createdAt: Date;
}

/** Asignación directa tal como se guarda: con su razón y su vigencia. */
export interface DirectAssignmentRecord {
  targetId: string;
  effect: AssignmentEffect;
  reason: string;
  expiresAt: Date | null;
  createdAt: Date;
}

/** Detalle de un usuario para la pantalla de administración. */
export interface UserDetailRecord {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
  jobTitle: string | null;
  phone: string | null;
  status: UserStatus;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  teams: { id: string; name: string; isPrimary: boolean }[];
  roles: { id: string; code: string; name: string; isSystem: boolean; expiresAt: Date | null }[];
  directPermissions: (DirectAssignmentRecord & { code: string; name: string })[];
  directMenuOptions: (DirectAssignmentRecord & { key: string; label: string })[];
  /**
   * La persona fijó alguna vez su propia contraseña (desde el último
   * restablecimiento) o entró por un proveedor externo. Decide si reactivar
   * devuelve `ACTIVE` o `INVITED` (PLAN-ADMIN D4).
   */
  hasCompletedActivation: boolean;
}

/**
 * Todo lo que hace falta para calcular el acceso efectivo de un usuario, en
 * una sola lectura. Se devuelve plano a propósito: el cálculo vive en el
 * servicio, no en la consulta, para que sea verificable con pruebas unitarias
 * sin base de datos.
 */
export interface UserAccessSnapshot {
  user: AccessUserRecord;
  /** Roles vigentes, con los permisos que aporta cada uno (origen, D5). */
  roles: { id: string; code: string; name: string; dataScope: DataScope; permissionCodes: string[] }[];
  /** Permisos que llegan por rol. */
  rolePermissionCodes: string[];
  /** Excepciones directas sobre el usuario, ya filtradas por vigencia. */
  directPermissions: { code: string; effect: AssignmentEffect; reason: string; expiresAt: Date | null }[];
  /** Opciones de menú concedidas por rol. */
  roleMenuOptionIds: string[];
  /** Excepciones directas de opciones de menú, ya filtradas por vigencia. */
  directMenuOptions: { menuOptionId: string; effect: AssignmentEffect }[];
}

export type MenuOptionKind = 'LINK' | 'GROUP';

export interface MenuOptionRecord {
  id: string;
  key: string;
  parentId: string | null;
  label: string;
  description: string | null;
  icon: string | null;
  path: string | null;
  kind: MenuOptionKind;
  sortOrder: number;
  requiredPermissionId: string | null;
  requiredPermissionCode: string | null;
  isPublic: boolean;
  isSystem: boolean;
  isActive: boolean;
  module: { id: string; key: string; name: string; icon: string | null; sortOrder: number };
}

export interface ModuleRecord {
  id: string;
  key: string;
  name: string;
  icon: string | null;
  sortOrder: number;
  isSystem: boolean;
  isActive: boolean;
}

export interface CreateMenuOptionInput {
  moduleId: string;
  parentId: string | null;
  key: string;
  label: string;
  description: string | null;
  icon: string | null;
  kind: MenuOptionKind;
  path: string | null;
  sortOrder: number;
  requiredPermissionId: string | null;
  isPublic: boolean;
  isActive: boolean;
}

/** Campos editables de una opción. `key` y módulo son inmutables (D7). */
export interface UpdateMenuOptionInput {
  parentId?: string | null;
  label?: string;
  description?: string | null;
  icon?: string | null;
  kind?: MenuOptionKind;
  path?: string | null;
  sortOrder?: number;
  requiredPermissionId?: string | null;
  isPublic?: boolean;
  isActive?: boolean;
}

export interface MenuOrderItem {
  id: string;
  parentId: string | null;
  sortOrder: number;
}

export const USER_SORT_FIELDS = ['displayName', 'email', 'status', 'createdAt', 'lastLoginAt'] as const;
export type UserSortField = (typeof USER_SORT_FIELDS)[number];

export interface ListUsersFilter {
  page: number;
  pageSize: number;
  search?: string;
  status?: UserStatus;
  roleCode?: string;
  teamId?: string;
  sortBy?: UserSortField;
  sortOrder?: SortOrder;
}

export const ROLE_SORT_FIELDS = ['name', 'code', 'createdAt'] as const;
export type RoleSortField = (typeof ROLE_SORT_FIELDS)[number];

export interface ListRolesFilter {
  page: number;
  pageSize: number;
  search?: string;
  isSystem?: boolean;
  sortBy?: RoleSortField;
  sortOrder?: SortOrder;
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

/** Datos editables. El estado NO va aquí: sólo cambia por suspender/reactivar (D3, D4). */
export interface UpdateUserInput {
  firstName?: string;
  lastName?: string;
  jobTitle?: string | null;
  phone?: string | null;
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
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateRoleInput {
  code: string;
  name: string;
  description: string | null;
  dataScope: DataScope;
  permissionIds: string[];
  menuOptionIds: string[];
  actorId: string | null;
}

export interface UpdateRoleInput {
  name?: string;
  description?: string | null;
  dataScope?: DataScope;
  isActive?: boolean;
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
  /**
   * Sección crítica del invariante de administración (PLAN-ADMIN D3).
   *
   * Ejecuta `work` en una única transacción serializada frente a cualquier otra
   * llamada a este mismo método: el adaptador toma un bloqueo exclusivo antes
   * de invocar `work` y lo libera al terminar. `work` recibe un repositorio
   * ligado a esa transacción; todo lo que lea y escriba con él es atómico, y si
   * lanza, nada se aplica. Así la comprobación del invariante y la escritura no
   * pueden intercalarse con las de otra petición.
   */
  withAdminInvariantLock<T>(work: (repository: AccessRepository) => Promise<T>): Promise<T>;
  /** Igual que `withAdminInvariantLock`, para la jerarquía de opciones de menú (D7, sin ciclos). */
  withMenuHierarchyLock<T>(work: (repository: AccessRepository) => Promise<T>): Promise<T>;

  /** Devuelve el usuario por el sujeto del proveedor de identidad. */
  findUserBySubject(provider: 'LOCAL' | 'ENTRA_ID', subject: string): Promise<AccessUserRecord | null>;
  findUserByEmail(email: string): Promise<AccessUserRecord | null>;

  /** Instantánea completa de acceso, con vigencias ya aplicadas. */
  getUserAccessSnapshot(userId: string): Promise<UserAccessSnapshot | null>;

  /** Catálogo de opciones (activas e inactivas, sin las borradas), ordenado por módulo y posición. */
  listMenuOptions(): Promise<MenuOptionRecord[]>;

  listUsers(filter: ListUsersFilter): Promise<Paginated<UserListItem>>;
  findUserDetail(userId: string): Promise<UserDetailRecord | null>;
  createUser(input: CreateUserInput): Promise<AccessUserRecord>;
  updateUser(userId: string, input: UpdateUserInput): Promise<AccessUserRecord>;
  setUserStatus(userId: string, status: UserStatus, actorId: string | null): Promise<void>;
  /**
   * Ids de los usuarios `ACTIVE`, no borrados, con el rol `roleCode` vigente
   * (rol activo y asignación sin caducar), sin contar `excludingUserId`.
   * Candidatos de D3: el servicio decide con sus permisos efectivos.
   */
  listActiveUserIdsWithRole(roleCode: string, excludingUserId: string | null): Promise<string[]>;

  replaceUserRoles(userId: string, roleIds: string[], actorId: string | null): Promise<void>;
  replaceUserPermissions(userId: string, assignments: DirectAssignmentInput[], actorId: string | null): Promise<void>;
  replaceUserMenuOptions(userId: string, assignments: DirectAssignmentInput[], actorId: string | null): Promise<void>;

  listRoles(filter: ListRolesFilter): Promise<Paginated<RoleRecord>>;
  findRoleById(roleId: string): Promise<RoleRecord | null>;
  /** Incluye los roles borrados: su código sigue reservado. */
  roleCodeExists(code: string): Promise<boolean>;
  createRole(input: CreateRoleInput): Promise<RoleRecord>;
  updateRole(roleId: string, input: UpdateRoleInput): Promise<void>;
  /** Borrado lógico (D2). */
  softDeleteRole(roleId: string): Promise<void>;
  replaceRolePermissions(roleId: string, permissionIds: string[], actorId: string | null): Promise<void>;
  replaceRoleMenuOptions(roleId: string, menuOptionIds: string[], actorId: string | null): Promise<void>;

  listPermissions(): Promise<PermissionRecord[]>;

  /** De los identificadores dados, los que existen (roles: sólo activos y no borrados). */
  existingRoleIds(ids: string[]): Promise<string[]>;
  existingPermissionIds(ids: string[]): Promise<string[]>;
  existingMenuOptionIds(ids: string[]): Promise<string[]>;
  /** Equipos no borrados. */
  existingTeamIds(ids: string[]): Promise<string[]>;
  /** De los roles dados, los que conceden al menos un permiso (ADR-020, alta por un no administrador). */
  findRoleIdsGrantingPermissions(roleIds: string[]): Promise<string[]>;

  findMenuOptionById(menuOptionId: string): Promise<MenuOptionRecord | null>;
  /** Incluye las opciones borradas: su clave sigue reservada. */
  menuOptionKeyExists(key: string): Promise<boolean>;
  createMenuOption(input: CreateMenuOptionInput): Promise<MenuOptionRecord>;
  updateMenuOption(menuOptionId: string, input: UpdateMenuOptionInput): Promise<MenuOptionRecord>;
  /** Borrado lógico (D7). */
  softDeleteMenuOption(menuOptionId: string): Promise<void>;
  /** Hijas no borradas de una opción. */
  countMenuOptionChildren(menuOptionId: string): Promise<number>;
  /** Aplica orden y padre en bloque, en una transacción. */
  reorderMenuOptions(items: MenuOrderItem[]): Promise<void>;

  listModules(): Promise<ModuleRecord[]>;
}
