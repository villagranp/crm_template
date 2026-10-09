export const PARAMETERS_REPOSITORY = Symbol('PARAMETERS_REPOSITORY');

export type ParameterValueType = 'STRING' | 'NUMBER' | 'BOOLEAN' | 'JSON' | 'DATE';

/** Parámetro del sistema tal como lo ve la aplicación (ADR-004: sin tipos del ORM). */
export interface SystemParameterRecord {
  id: string;
  key: string;
  value: string;
  type: ParameterValueType;
  group: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  isSystem: boolean;
  updatedAt: Date;
  updatedById: string | null;
}

/**
 * Puerto de parámetros (PLAN-ADMIN, D10). Sin altas ni bajas: un parámetro
 * existe porque el código lo lee, y llega por la semilla.
 */
export interface ParametersRepository {
  /** Todos, públicos o no, ordenados por grupo y clave. */
  listAll(): Promise<SystemParameterRecord[]>;
  findByKey(key: string): Promise<SystemParameterRecord | null>;
  updateValue(key: string, value: string, updatedById: string | null): Promise<SystemParameterRecord>;
}
