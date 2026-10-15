import { ApiProperty } from '@nestjs/swagger';

/** Referencia mínima a un usuario en una respuesta: id y nombre visible. */
export class UserRefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() displayName!: string;
}
