import { ApiProperty } from '@nestjs/swagger';

/**
 * Formato unico de error de toda la API (API-STANDARDS.md seccion 8).
 */
export class ErrorResponseDto {
  @ApiProperty({ example: 400 })
  statusCode!: number;

  @ApiProperty({ example: 'VALIDATION_FAILED', description: 'Codigo estable y accionable' })
  code!: string;

  @ApiProperty({ example: 'Request validation failed' })
  message!: string;

  @ApiProperty({ type: 'array', items: { type: 'object' }, default: [] })
  details!: ReadonlyArray<Record<string, unknown>>;

  @ApiProperty({ example: '01HXYZ3K4M5N6P7Q8R9S0T1U2V' })
  correlationId!: string;
}
