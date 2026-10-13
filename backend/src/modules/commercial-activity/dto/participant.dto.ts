import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength, registerDecorator, type ValidationOptions } from 'class-validator';

/** Máximo de participantes por visita o actividad (04 H.4). */
export const MAX_PARTICIPANTS = 50;

/**
 * Participante de entrada (04 F.1, RN-04.6): **exactamente uno** de contacto (del
 * mismo cliente), usuario o nombre externo. La regla la comprueba
 * `@IsParticipantList` sobre la lista (`ck_interaction_participants_subject` es la
 * última barrera).
 */
export class ParticipantInputDto {
  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'Contacto del mismo cliente (activo al añadirlo)' })
  @IsOptional()
  @IsUUID()
  contactId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'Usuario interno activo' })
  @IsOptional()
  @IsUUID()
  userId?: string | null;

  @ApiPropertyOptional({ maxLength: 160, nullable: true, description: 'Asistente externo (solo nombre; dato personal, se enmascara en la auditoría)' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  externalName?: string | null;
}

function subjectsOf(item: unknown): string[] {
  if (typeof item !== 'object' || item === null) return [];
  const record = item as Record<string, unknown>;
  const subjects: string[] = [];
  if (typeof record['contactId'] === 'string') subjects.push(`contact:${record['contactId'].toLowerCase()}`);
  if (typeof record['userId'] === 'string') subjects.push(`user:${record['userId'].toLowerCase()}`);
  if (typeof record['externalName'] === 'string' && record['externalName'].trim() !== '') {
    subjects.push(`external:${record['externalName'].trim().toLowerCase()}`);
  }
  return subjects;
}

/**
 * Lista de participantes válida: cada elemento con exactamente un sujeto y sin
 * repetidos (mismo contacto, usuario o nombre externo dos veces) → si no,
 * `400 VALIDATION_FAILED` (04 D.3).
 */
export function IsParticipantList(options?: ValidationOptions): PropertyDecorator {
  return (target: object, propertyName: string | symbol) => {
    registerDecorator({
      name: 'isParticipantList',
      target: target.constructor,
      propertyName: String(propertyName),
      options: {
        message: 'each participant needs exactly one of contactId, userId or externalName, without repetitions',
        ...options,
      },
      validator: {
        validate(value: unknown): boolean {
          if (value === undefined || value === null) return true;
          if (!Array.isArray(value)) return false;
          const keys = new Set<string>();
          for (const item of value) {
            const subjects = subjectsOf(item);
            if (subjects.length !== 1) return false;
            const key = subjects[0]!;
            if (keys.has(key)) return false;
            keys.add(key);
          }
          return true;
        },
      },
    });
  };
}

export class ParticipantDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: ['INVITED', 'ATTENDED'] }) role!: 'INVITED' | 'ATTENDED';
  @ApiProperty({ enum: ['CONTACT', 'USER', 'EXTERNAL'] }) kind!: 'CONTACT' | 'USER' | 'EXTERNAL';
  @ApiProperty({ format: 'uuid', nullable: true, type: String }) contactId!: string | null;
  @ApiProperty({ format: 'uuid', nullable: true, type: String }) userId!: string | null;
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Nombre del contacto, del usuario o externo. El de un contacto solo con `contactos.ver` (si no, `null`)',
  })
  displayName!: string | null;
}
