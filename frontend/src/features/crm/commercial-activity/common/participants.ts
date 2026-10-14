import type { ParticipantDto, ParticipantInput, ParticipantKind, ParticipantRole } from './commercial-activity.api';

/**
 * Participante en un formulario (RN-04.6): exactamente un sujeto —contacto del
 * cliente, usuario interno o nombre externo— con el nombre para mostrarlo.
 */
export interface ParticipantValue {
  kind: ParticipantKind;
  contactId?: string;
  userId?: string;
  externalName?: string;
  /** El de un contacto puede llegar `null` sin `contactos.ver` (02 H.5). */
  displayName: string | null;
}

/** Clave estable del sujeto (evita repetidos, como `@IsParticipantList` del backend). */
export function participantKey(participant: ParticipantValue): string {
  switch (participant.kind) {
    case 'CONTACT':
      return `contact:${participant.contactId ?? ''}`;
    case 'USER':
      return `user:${participant.userId ?? ''}`;
    default:
      return `external:${(participant.externalName ?? '').trim().toLowerCase()}`;
  }
}

/** Cuerpo de la API: un único sujeto por participante. */
export function toParticipantInputs(participants: readonly ParticipantValue[]): ParticipantInput[] {
  return participants.map((participant) => {
    if (participant.kind === 'CONTACT') {
      return { contactId: participant.contactId ?? '' };
    }
    if (participant.kind === 'USER') {
      return { userId: participant.userId ?? '' };
    }
    return { externalName: (participant.externalName ?? '').trim() };
  });
}

/** Participantes de la respuesta como valores del formulario (opcionalmente sólo de un rol). */
export function participantValuesFrom(participants: readonly ParticipantDto[], role?: ParticipantRole): ParticipantValue[] {
  return participants
    .filter((participant) => !role || participant.role === role)
    .map((participant) => {
      if (participant.kind === 'CONTACT') {
        return { kind: 'CONTACT', contactId: participant.contactId ?? undefined, displayName: participant.displayName };
      }
      if (participant.kind === 'USER') {
        return { kind: 'USER', userId: participant.userId ?? undefined, displayName: participant.displayName };
      }
      return { kind: 'EXTERNAL', externalName: participant.displayName ?? '', displayName: participant.displayName };
    });
}

/** Quita los contactos (al cambiar de cliente: los del cliente anterior ya no valen, E.7). */
export function withoutContacts(participants: readonly ParticipantValue[]): ParticipantValue[] {
  return participants.filter((participant) => participant.kind !== 'CONTACT');
}

export const PARTICIPANT_KIND_LABELS: Record<ParticipantKind, string> = {
  CONTACT: 'Contacto del cliente',
  USER: 'Usuario interno',
  EXTERNAL: 'Externo',
};

/** Nombre a mostrar; un contacto sin `contactos.ver` aparece sin nombre. */
export function participantLabel(participant: Pick<ParticipantValue, 'kind' | 'displayName'>): string {
  return participant.displayName?.trim() || (participant.kind === 'CONTACT' ? 'Contacto (sin acceso a su nombre)' : 'Sin nombre');
}
