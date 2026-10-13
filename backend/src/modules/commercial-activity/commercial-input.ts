import type { TransactionContext } from '@/infrastructure/database/ports/transaction.port';
import type { VisibilityScope } from '@/modules/access/visibility-scope';
import type { CustomerReferenceGuard } from '@/modules/customers/customer-reference.guard';

import { COMMERCIAL_ERROR_CODES, issueError } from './commercial-activity-errors';
import type { ParticipantRole, ParticipantWrite } from './ports/activity.repository.port';
import type { CommercialLinkReader } from './ports/commercial-link.reader.port';
import type { CommercialUsersReader } from './ports/commercial-users.reader.port';

/**
 * Piezas compartidas por los casos de uso de visitas y actividades: normalización de
 * la entrada, participantes (RN-04.6) y vínculos con proyecto y oportunidad
 * (RN-04.1, RN-04.2). Las reglas son las mismas para las dos entidades.
 */

export interface ParticipantInput {
  readonly contactId?: string | null;
  readonly userId?: string | null;
  readonly externalName?: string | null;
}

export interface NormalizedParticipant {
  readonly contactId: string | null;
  readonly userId: string | null;
  readonly externalName: string | null;
}

/** Texto recortado; vacío → `null`. */
export function text(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Instante ISO 8601 con zona (lo exige el DTO) → `Date`. */
export function instant(value: string | null | undefined): Date | null {
  return value ? new Date(value) : null;
}

/** `YYYY-MM-DD` → medianoche UTC (columna `date`). */
export function calendarDate(value: string | null | undefined): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

export function sameInstant(a: Date | null, b: Date | null): boolean {
  return (a?.getTime() ?? null) === (b?.getTime() ?? null);
}

export function normalizeParticipants(list: readonly ParticipantInput[]): NormalizedParticipant[] {
  return list.map((participant) => ({
    contactId: participant.contactId ?? null,
    userId: participant.userId ?? null,
    externalName: text(participant.externalName),
  }));
}

export function participantKey(participant: NormalizedParticipant): string {
  if (participant.contactId) return `contact:${participant.contactId}`;
  if (participant.userId) return `user:${participant.userId}`;
  return `external:${(participant.externalName ?? '').toLowerCase()}`;
}

export function sameParticipants(a: readonly NormalizedParticipant[], b: readonly NormalizedParticipant[]): boolean {
  const keys = (list: readonly NormalizedParticipant[]): string => list.map(participantKey).sort().join('|');
  return keys(a) === keys(b);
}

export interface ParticipantValidationDeps {
  readonly customers: CustomerReferenceGuard;
  readonly users: CommercialUsersReader;
}

/**
 * RN-04.6: contacto del mismo cliente (activo al añadirlo; uno que ya figuraba se
 * conserva aunque se haya desactivado), usuario existente y activo (salvo que ya
 * figurara), o nombre externo. `kept` = participantes guardados del mismo cliente
 * que la lista puede conservar; `field` = nombre del campo en los `details`.
 */
export async function validateParticipants(
  deps: ParticipantValidationDeps,
  list: readonly NormalizedParticipant[],
  customerId: string,
  kept: { readonly customerId: string; readonly participants: readonly NormalizedParticipant[] } | null,
  role: ParticipantRole,
  field: string,
  tx: TransactionContext,
): Promise<ParticipantWrite[]> {
  const keptContacts = new Set(kept?.customerId === customerId ? kept.participants.map((item) => item.contactId) : []);
  const keptUsers = new Set(kept?.participants.map((item) => item.userId) ?? []);
  for (const [index, participant] of list.entries()) {
    if (participant.contactId) {
      await deps.customers.assertContactOfCustomer(participant.contactId, customerId, {
        requireActive: !keptContacts.has(participant.contactId),
        field: `${field}.${index}.contactId`,
        tx,
      });
    }
  }
  const userIds = list.map((item) => item.userId).filter((id): id is string => id !== null);
  if (userIds.length > 0) {
    const states = new Map((await deps.users.findUserStates(userIds, tx)).map((state) => [state.id, state.isActive]));
    for (const [index, participant] of list.entries()) {
      if (!participant.userId) continue;
      const userField = `${field}.${index}.userId`;
      const active = states.get(participant.userId);
      if (active === undefined) throw issueError(userField, COMMERCIAL_ERROR_CODES.unknownReference);
      if (!active && !keptUsers.has(participant.userId)) throw issueError(userField, COMMERCIAL_ERROR_CODES.inactiveReference);
    }
  }
  return list.map((participant) => ({ ...participant, role }));
}

/**
 * RN-04.1, RN-04.2: proyecto del cliente. Uno nuevo debe existir, ser visible y no
 * estar eliminado; uno que se conserva solo debe seguir siendo del cliente final.
 */
export async function assertProjectLink(
  links: CommercialLinkReader,
  link: { readonly projectId: string | null; readonly customerId: string },
  current: { readonly projectId: string | null; readonly customerId: string } | null,
  projectScope: VisibilityScope,
  tx: TransactionContext,
): Promise<void> {
  if (!link.projectId) return;
  const isNew = !current || current.projectId !== link.projectId;
  if (!isNew && link.customerId === current?.customerId) return;
  const project = await links.findProject(link.projectId, projectScope, tx);
  if (!project || (isNew && !project.isVisible)) throw issueError('projectId', COMMERCIAL_ERROR_CODES.unknownReference);
  if (isNew && project.isDeleted) throw issueError('projectId', COMMERCIAL_ERROR_CODES.inactiveReference);
  if (project.customerId !== link.customerId) throw issueError('projectId', COMMERCIAL_ERROR_CODES.projectCustomerMismatch);
}
