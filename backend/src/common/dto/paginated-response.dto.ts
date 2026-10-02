import { ApiProperty } from '@nestjs/swagger';

export class PaginationMetaDto {
  @ApiProperty({ example: 1 }) page!: number;
  @ApiProperty({ example: 20 }) pageSize!: number;
  @ApiProperty({ example: 125 }) totalItems!: number;
  @ApiProperty({ example: 7 }) totalPages!: number;
}

/**
 * Envoltorio unico de colecciones: { data, pagination }.
 * Los recursos individuales se devuelven SIN envoltorio.
 */
export class PaginatedResponseDto<T> {
  data!: T[];

  @ApiProperty({ type: PaginationMetaDto })
  pagination!: PaginationMetaDto;

  static of<T>(data: T[], page: number, pageSize: number, totalItems: number): PaginatedResponseDto<T> {
    const response = new PaginatedResponseDto<T>();
    response.data = data;
    response.pagination = {
      page,
      pageSize,
      totalItems,
      totalPages: pageSize > 0 ? Math.ceil(totalItems / pageSize) : 0,
    };
    return response;
  }
}
