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
  /** Editarlo exige además `parametros.configurar` (grupo `seguridad`). */
  requiresConfigurePermission: boolean;
  updatedAt: string;
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

export function updateParameter(key: string, value: string): Promise<SystemParameter> {
  return httpClient.patch<SystemParameter>(`${PARAMETERS_PATH}/${encodeURIComponent(key)}`, { body: { value } });
}
