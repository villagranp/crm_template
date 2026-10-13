import { OmitType } from '@nestjs/swagger';

import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';

/**
 * Paginación estándar **sin** `search` para las colecciones del módulo que no buscan
 * por texto (agenda, historial, seguimiento, adjuntos): así OpenAPI no anuncia un
 * parámetro que se ignoraría y, con `forbidNonWhitelisted`, enviarlo responde `400`.
 */
export class PaginationWithoutSearchQueryDto extends OmitType(PaginationQueryDto, ['search'] as const) {}
