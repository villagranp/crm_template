import { customerCodeTakenError, duplicateBlockedError, fieldIssuesError, possibleDuplicateError } from './customer-errors';
import type { DuplicateCandidate, ValidationOutcome } from './customer-validation.service';
import { areWarningsAcknowledged } from './duplicate-rules';

/** `details` de `409 POSSIBLE_DUPLICATE` / `DUPLICATE_BLOCKED` (02 F.3 `PossibleDuplicateErrorDetails`). */
export function duplicateDetails(candidates: readonly DuplicateCandidate[]): Record<string, unknown>[] {
  return candidates.map((match) => ({ rule: match.rule, reason: match.reason, candidate: { ...match.candidate } }));
}

/**
 * Traduce el resultado de `CustomerValidationService` al contrato HTTP de F5/F6
 * (y a lo que la importación trata como error de fila), en este orden:
 *
 * 1. Incidencias de campo → `422` con el código de la primera y todas en `details`.
 * 2. Código de cliente ocupado → `409 CUSTOMER_CODE_TAKEN`.
 * 3. Regla en `BLOQUEAR` → `409 DUPLICATE_BLOCKED` (no se puede confirmar).
 * 4. Avisos sin confirmar → `409 POSSIBLE_DUPLICATE` (RN-02.14: la confirmación es
 *    la presencia de `acknowledgedDuplicateIds` con todos los candidatos visibles).
 */
export function assertCustomerOutcome(outcome: ValidationOutcome, acknowledgedDuplicateIds: readonly string[] | undefined): void {
  if (outcome.errors.length > 0) {
    throw fieldIssuesError(outcome.errors);
  }
  if (outcome.codeConflict) {
    throw customerCodeTakenError(outcome.codeConflict);
  }
  if (outcome.blockingDuplicates.length > 0) {
    throw duplicateBlockedError(duplicateDetails(outcome.blockingDuplicates));
  }
  const warningIds = outcome.duplicates.map((match) => match.candidate.id);
  if (!areWarningsAcknowledged(warningIds, acknowledgedDuplicateIds)) {
    throw possibleDuplicateError(duplicateDetails(outcome.duplicates));
  }
}
