import { httpClient } from '@/services/api';

/**
 * Cliente de `/parameters` (PLAN-ADMIN, D10). Los tipos reflejan los DTO del
 * backend (`backend/src/modules/parameters/dto/parameter.dto.ts`).
 */

export type ParameterType = 'STRING' | 'NUMBER' | 'BOOLEAN' | 'JSON' | 'DATE';

export interface SystemParameter {
  key: string;
  /** Siempre texto; se interpreta según `type`. */
  value: string;
  type: ParameterType;
  group: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  isSystem: boolean;
  /** Editarlo exige además `parametros.configurar` (grupo `seguridad`). Alias de `requiresConfigure`. */
  requiresConfigurePermission: boolean;
  /** Editarlo exige además `parametros.configurar` (07 RN-07.32). */
  requiresConfigure: boolean;
  /** No se edita desde la interfaz (p. ej. `crm.moneda_base`, 07 RN-07.46). */
  readOnly: boolean;
  /** Lista cerrada de valores admitidos, si la hay. */
  allowedValues: string[] | null;
  /** Editor sugerido por el registro de reglas del backend (`parameter-rules.registry.ts`). */
  editor: ParameterEditor | null;
  /**
   * Listas cerradas que necesita el editor (`GET /parameters`). Hoy sólo `ui.inicio.tarjetas`:
   * `blocks`, `kpis` y `lockedVisibleBlocks` (los bloques que no se pueden ocultar).
   */
  editorOptions: Record<string, string[]> | null;
  /** Rango numérico admitido, si lo hay. */
  range: { min: number; max: number } | null;
  updatedAt: string;
}

/**
 * Editores que conoce la interfaz (`ParameterEditor` del backend). Un valor
 * desconocido se trata como `null`: el diálogo cae al control por tipo.
 */
export type ParameterEditor =
  | 'number'
  | 'boolean'
  | 'text'
  | 'select'
  | 'timezone'
  | 'required-fields'
  | 'catalog-defaults'
  | 'priority-map'
  | 'stage-transitions'
  | 'progress-rules'
  | 'duplicate-rules'
  | 'mime-types'
  | 'dashboard-cards'
  | (string & {});

/** Proveedor de autenticación del despliegue (`AUTH_PROVIDER`, ADR-019). */
export type AuthProvider = 'local' | 'entra' | 'hybrid';

/** `GET /parameters/authentication` (07 F.5): sólo lectura, sin secretos. */
export interface AuthenticationSettings {
  provider: AuthProvider;
  /** `true` si el inicio de sesión local está disponible (`local` o `hybrid`). */
  localLoginEnabled: boolean;
  /** Claves de los parámetros de inicio de sesión local (`seguridad.*`). */
  securityParameterKeys: string[];
}

export interface ParameterGroup {
  group: string;
  parameters: SystemParameter[];
}

const PARAMETERS_PATH = '/parameters';

export async function listParameters(): Promise<ParameterGroup[]> {
  const response = await httpClient.get<{ data: ParameterGroup[] }>(PARAMETERS_PATH);
  return response.data;
}

export function getAuthenticationSettings(): Promise<AuthenticationSettings> {
  return httpClient.get<AuthenticationSettings>(`${PARAMETERS_PATH}/authentication`);
}

export function updateParameter(key: string, value: string): Promise<SystemParameter> {
  return httpClient.patch<SystemParameter>(`${PARAMETERS_PATH}/${encodeURIComponent(key)}`, { body: { value } });
}

/** Elemento de catálogo que ofrecen los editores estructurados (código y etiqueta). */
export interface CatalogOption {
  code: string;
  label: string;
}

interface CatalogSummary {
  id: string;
  key: string;
}

interface CatalogDetailItems {
  items: { code: string; label: string; isActive: boolean; sortOrder: number }[];
}

/** Tope de la búsqueda de un catálogo por clave (`pageSize` máximo de la API). */
const CATALOG_SEARCH_PAGE_SIZE = 100;

/**
 * Elementos **activos** del catálogo `catalogKey`, por `sortOrder`, para los
 * editores de parámetros que referencian códigos (`catalog-defaults`,
 * `priority-map`, `stage-transitions`, `progress-rules`).
 *
 * Usa los endpoints de catálogos (`catalogos.ver`): no hay un endpoint de
 * opciones propio de parámetros. Sin ese permiso el llamador no lo invoca y el
 * editor trabaja con los códigos que ya tiene el valor. `null` = el catálogo
 * no existe.
 */
export async function listCatalogOptions(catalogKey: string): Promise<CatalogOption[] | null> {
  const page = await httpClient.get<{ data: CatalogSummary[] }>('/catalogs', {
    query: { search: catalogKey, pageSize: CATALOG_SEARCH_PAGE_SIZE },
  });
  const catalog = page.data.find((candidate) => candidate.key === catalogKey);
  if (!catalog) {
    return null;
  }
  const detail = await httpClient.get<CatalogDetailItems>(`/catalogs/${catalog.id}`);
  return detail.items
    .filter((item) => item.isActive)
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map(({ code, label }) => ({ code, label }));
}
