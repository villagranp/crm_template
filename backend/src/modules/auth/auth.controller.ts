import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';

import { AllowPendingPasswordChange } from '@/common/decorators/allow-pending-password-change.decorator';
import { AuthenticatedOnly } from '@/common/decorators/authenticated-only.decorator';
import { Public } from '@/common/decorators/public.decorator';
import { RequireRequestedWithHeader } from '@/common/decorators/require-requested-with-header.decorator';
import { ErrorResponseDto } from '@/common/dto/error-response.dto';
import { AuthenticationFailedError } from '@/common/errors/application-error';
import type { AppRequest } from '@/common/types/request-context';
import { AppConfigService } from '@/config/app-config.service';

import { type AuthRequestContext, type AuthSession, AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { LocalAuthEnabledGuard } from './local-auth-enabled.guard';
import { SessionResponseDto } from './dto/session-response.dto';
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from './refresh-cookie';

/** Límite por IP de los endpoints que verifican contraseñas. El bloqueo por cuenta es D8. */
const PASSWORD_ENDPOINT_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

export function requestContext(request: AppRequest): AuthRequestContext {
  return {
    correlationId: request.correlationId,
    ipAddress: request.ip ?? null,
    userAgent: request.header('user-agent') ?? null,
  };
}

/**
 * Autenticación local (PLAN-AUTH-LOCAL §3). Sin lógica: valida, delega en
 * `AuthService` y traduce el resultado a cuerpo + cookie.
 */
@ApiTags('Autenticación')
@Controller('auth')
@UseGuards(LocalAuthEnabledGuard)
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: AppConfigService,
  ) {}

  @Post('login')
  @Public('Es la puerta de entrada: quien llama todavía no tiene sesión')
  @Throttle(PASSWORD_ENDPOINT_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Inicia sesión con correo y contraseña. Fija la cookie de refresco.' })
  @ApiOkResponse({ type: SessionResponseDto })
  @ApiUnauthorizedResponse({
    type: ErrorResponseDto,
    description: 'INVALID_CREDENTIALS. Idéntica para correo inexistente, contraseña incorrecta y cuenta bloqueada temporalmente.',
  })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: 'ACCOUNT_DISABLED: contraseña correcta, cuenta suspendida' })
  @ApiTooManyRequestsResponse({ type: ErrorResponseDto, description: 'Más de 10 intentos por minuto desde la misma IP' })
  async login(
    @Body() dto: LoginDto,
    @Req() request: AppRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionResponseDto> {
    const session = await this.authService.login(dto.email, dto.password, requestContext(request));
    return this.respondWithSession(response, session);
  }

  @Post('refresh')
  @Public('La credencial es la cookie HttpOnly de refresco, no un access token, que puede haber caducado')
  @RequireRequestedWithHeader()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renueva el access token y rota la cookie de refresco (D3).' })
  @ApiOkResponse({ type: SessionResponseDto })
  @ApiUnauthorizedResponse({
    type: ErrorResponseDto,
    description:
      'INVALID_REFRESH_TOKEN: ausente, caducado, revocado o reutilizado. Si fue reutilizado, todas las sesiones del usuario quedan revocadas (D4).',
  })
  async refresh(
    @Req() request: AppRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionResponseDto> {
    try {
      const session = await this.authService.refresh(readRefreshCookie(request, this.config), requestContext(request));
      return this.respondWithSession(response, session);
    } catch (error) {
      // Una cookie que ya no sirve se borra para que el navegador deje de enviarla.
      if (error instanceof AuthenticationFailedError || error instanceof UnauthorizedException) {
        clearRefreshCookie(response, this.config);
      }
      throw error;
    }
  }

  @Post('logout')
  @Public('Debe funcionar con el access token caducado: revoca la sesión de la cookie')
  @RequireRequestedWithHeader()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cierra la sesión de la cookie y la borra. 204 con la cabecera anti-CSRF, haya o no sesión.' })
  @ApiNoContentResponse()
  async logout(@Req() request: AppRequest, @Res({ passthrough: true }) response: Response): Promise<void> {
    await this.authService.logout(readRefreshCookie(request, this.config));
    clearRefreshCookie(response, this.config);
  }

  @Post('password/change')
  @AuthenticatedOnly('El recurso es la propia contraseña del usuario')
  @AllowPendingPasswordChange()
  @Throttle(PASSWORD_ENDPOINT_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Cambia la propia contraseña',
    description: 'Revoca todas las sesiones del usuario y devuelve una nueva, con su cookie.',
  })
  @ApiOkResponse({ type: SessionResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'Sin sesión' })
  @ApiUnprocessableEntityResponse({
    type: ErrorResponseDto,
    description: 'INVALID_CURRENT_PASSWORD, o PASSWORD_POLICY_VIOLATION con los motivos en details[].issue',
  })
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @Req() request: AppRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionResponseDto> {
    // El guard global garantiza que hay principal en un endpoint no público.
    const userId = request.principal!.subjectId;
    const session = await this.authService.changePassword(
      userId,
      dto.currentPassword,
      dto.newPassword,
      requestContext(request),
    );
    return this.respondWithSession(response, session);
  }

  private respondWithSession(response: Response, session: AuthSession): SessionResponseDto {
    setRefreshCookie(response, this.config, session.refreshToken, session.refreshTokenExpiresAt);
    return {
      accessToken: session.accessToken,
      expiresAt: session.accessTokenExpiresAt.toISOString(),
      passwordChangeRequired: session.passwordChangeRequired,
      user: session.user,
    };
  }
}
