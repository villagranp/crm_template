import { Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import { RequirePermission } from '@/common/decorators/require-permission.decorator';
import { ErrorResponseDto } from '@/common/dto/error-response.dto';
import type { AppRequest } from '@/common/types/request-context';

import { requestContext } from './auth.controller';
import { LocalAuthEnabledGuard } from './local-auth-enabled.guard';
import { AuthService } from './auth.service';

/**
 * Restablecimiento de contraseña por un administrador (PLAN-AUTH-LOCAL, D12).
 * Vive en el módulo de autenticación aunque la ruta cuelgue de /users: la
 * operación es sobre la credencial, no sobre los datos del usuario.
 */
@ApiTags('Administración · Usuarios')
@Controller('users')
@UseGuards(LocalAuthEnabledGuard)
export class UserPasswordController {
  constructor(private readonly authService: AuthService) {}

  @Post(':id/password/reset')
  @RequirePermission('usuarios.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Restablece la contraseña a la inicial (AUTH_DEFAULT_PASSWORD)',
    description:
      'Obliga a cambiarla en el siguiente acceso, levanta el bloqueo temporal y cierra todas sus sesiones. Sólo un administrador puede restablecerla, sea quien sea el usuario (ADR-020): la contraseña inicial es conocida y restablecerla equivale a dar acceso a la cuenta. 403 ADMIN_ONLY en otro caso.',
  })
  @ApiNoContentResponse()
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({
    type: ErrorResponseDto,
    description: 'PERMISSION_DENIED: falta usuarios.editar · ADMIN_ONLY: el actor no es administrador (ADR-020)',
  })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ type: ErrorResponseDto, description: 'DEFAULT_PASSWORD_NOT_CONFIGURED' })
  async reset(@Param('id', new ParseUUIDPipe()) userId: string, @Req() request: AppRequest): Promise<void> {
    await this.authService.resetPasswordByAdmin(userId, request.principal!, requestContext(request));
  }
}
