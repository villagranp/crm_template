/**
 * Contratos del módulo de acceso (identidad, permisos y opciones de menú).
 *
 * Reflejan la API del backend documentada en `docs/api/` y respaldada por el
 * modelo de datos de `docs/database/data-model.md`.
 */

export interface MenuOptionNode {
  id: string;
  key: string;
  label: string;
  /** Nombre del icono de Material Symbols declarado en la base de datos. */
  icon: string | null;
  /** Ruta del frontend. `null` en un nodo que sólo agrupa hijos. */
  path: string | null;
  order: number;
  /** Permiso que el backend ya evaluó para incluir esta opción. */
  requiredPermission: string | null;
  children: MenuOptionNode[];
}

export interface MenuModule {
  key: string;
  label: string;
  icon: string | null;
  order: number;
  /**
   * Módulo de sistema (administración, configuración): el shell lo agrupa en
   * la sección "Sistema" del menú lateral, separado de los módulos de negocio.
   */
  isSystem: boolean;
  options: MenuOptionNode[];
}

export interface ProfileTeam {
  id: string;
  name: string;
}

export interface Profile {
  id: string;
  displayName: string;
  email: string;
  roles: string[];
  permissions: string[];
  teams: ProfileTeam[];
  /** Alcance de datos más amplio entre los roles del usuario. */
  dataScope: 'OWN' | 'TEAM' | 'TERRITORY' | 'ORGANIZATION';
}
