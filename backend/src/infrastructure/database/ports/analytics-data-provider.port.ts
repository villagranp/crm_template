export const ANALYTICS_DATA_PROVIDER = Symbol('ANALYTICS_DATA_PROVIDER');

/**
 * Puerto de lectura analitica (ADR-015). Lo implementa el adaptador de Snowflake
 * u otra fuente analitica. NUNCA se usa para escrituras transaccionales ni dentro
 * de una transaccion OLTP.
 *
 * Cada proyecto define puertos especificos por caso de uso
 * (ReportingRepository, DataProvider, IntegrationRepository) en lugar de un
 * repositorio generico que filtre SQL al dominio.
 */
export interface AnalyticsQuery {
  /** Consulta parametrizada. Prohibido concatenar valores. */
  readonly statement: string;
  readonly bindings?: ReadonlyArray<string | number | boolean | Date | null>;
  readonly maxRows: number;
  readonly timeoutMs: number;
}

export interface AnalyticsDataProvider {
  execute<TRow>(query: AnalyticsQuery): Promise<readonly TRow[]>;
  isAvailable(): Promise<boolean>;
}
