import { applyDecorators, UseGuards } from '@nestjs/common';
import { ApiForbiddenResponse, ApiHeader } from '@nestjs/swagger';

import { ErrorResponseDto } from '@/common/dto/error-response.dto';
import {
  CSRF_HEADER_REQUIRED,
  REQUESTED_WITH_HEADER,
  REQUESTED_WITH_VALUE,
  RequestedWithHeaderGuard,
} from '@/common/guards/requested-with-header.guard';

/**
 * Exige `X-Requested-With: XMLHttpRequest` (ASVS G-20) y lo documenta en OpenAPI.
 * Para endpoints cuya única credencial es una cookie; los que exigen
 * `Authorization` ya disparan la comprobación previa de CORS y no lo necesitan.
 */
export const RequireRequestedWithHeader = (): MethodDecorator & ClassDecorator =>
  applyDecorators(
    UseGuards(RequestedWithHeaderGuard),
    ApiHeader({
      name: REQUESTED_WITH_HEADER,
      required: true,
      enum: [REQUESTED_WITH_VALUE],
      description: `Defensa anti-CSRF: debe valer exactamente \`${REQUESTED_WITH_VALUE}\`.`,
    }),
    ApiForbiddenResponse({
      type: ErrorResponseDto,
      description: `${CSRF_HEADER_REQUIRED}: falta la cabecera ${REQUESTED_WITH_HEADER} o su valor no es ${REQUESTED_WITH_VALUE}. Sin efectos.`,
    }),
  );
