import { BusinessRuleViolationError, ServiceUnavailableError } from '@/common/errors/application-error';

/**
 * Errores de los indicadores compartidos (05 F.5). Mensajes fijos: nunca repiten
 * valores de la consulta ni detalles de SQL (API-STANDARDS §8, SECURITY.md).
 */
export const COMMERCIAL_METRICS_ERROR_CODES = {
  invalidCatalogSemantics: 'INVALID_CATALOG_SEMANTICS',
  reportTimeout: 'REPORT_TIMEOUT',
} as const;

export interface CatalogSemanticsIssue {
  /** `Catalog.key` afectado (`crm.etapa_oportunidad`…). */
  readonly catalog: string;
  /** Código del elemento, o `null` si es un invariante del catálogo. */
  readonly itemCode: string | null;
  readonly issue: string;
}

/**
 * `422 INVALID_CATALOG_SEMANTICS`: un catálogo con semántica no cumple los invariantes
 * de 00 §3.3 (p. ej. etapa sin `order`); se responde con el catálogo afectado en lugar
 * de calcular cifras erróneas (05 G.4).
 */
export function invalidCatalogSemanticsError(issues: readonly CatalogSemanticsIssue[]): BusinessRuleViolationError {
  return new BusinessRuleViolationError(
    COMMERCIAL_METRICS_ERROR_CODES.invalidCatalogSemantics,
    'A catalog does not satisfy its semantic invariants; the figures cannot be computed',
    issues.map((issue) => ({ field: issue.catalog, code: COMMERCIAL_METRICS_ERROR_CODES.invalidCatalogSemantics, itemCode: issue.itemCode, message: issue.issue })),
  );
}

/** `503 REPORT_TIMEOUT`: la consulta superó el `statement_timeout` (05 D.3, F.5). */
export function reportTimeoutError(): ServiceUnavailableError {
  return new ServiceUnavailableError(COMMERCIAL_METRICS_ERROR_CODES.reportTimeout, 'The query took too long; narrow the filters');
}
