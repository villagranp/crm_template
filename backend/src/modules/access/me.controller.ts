import { Controller, Get, UnauthorizedException } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AuthenticatedOnly } from '@/common/decorators/authenticated-only.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { AuthenticatedPrincipal } from '@/infrastructure/authentication/ports/authenticated-principal';

import { AccessService } from './access.service';
import { MenuModuleDto } from './dto/menu.dto';
import { ProfileResponseDto } from './dto/profile.dto';

/**
 * Autoservicio del usuario autenticado.
 *
 * Es el contrato del que vive el shell del frontend: quién soy, qué puedo hacer
 * y qué opciones veo. El menú se calcula aquí y no en el cliente, de modo que
 * la navegación y la autorización no pueden divergir.
 */
@ApiTags('Acceso')
@Controller()
export class MeController {
  constructor(private readonly accessService: AccessService) {}

  @Get('me')
  @AuthenticatedOnly('El recurso es el propio usuario de la sesión')
  @ApiOperation({ summary: 'Perfil y permisos efectivos del usuario autenticado' })
  @ApiOkResponse({ type: ProfileResponseDto })
  async getProfile(@CurrentUser() principal: AuthenticatedPrincipal | undefined): Promise<ProfileResponseDto> {
    const userId = await this.requireUserId(principal);
    const access = await this.accessService.getEffectiveAccess(userId);

    // Mapeo explícito de tipo de dominio a DTO: el contrato de la API no debe
    // cambiar sólo porque cambie un nombre de campo en el servicio.
    return {
      id: access.userId,
      displayName: access.displayName,
      email: access.email,
      roles: access.roles,
      permissions: access.permissions,
      teams: access.teams,
      dataScope: access.dataScope,
    };
  }

  @Get('me/menu')
  @AuthenticatedOnly('El recurso es el propio usuario de la sesión')
  @ApiOperation({ summary: 'Opciones de menú concedidas al usuario autenticado' })
  @ApiOkResponse({ type: [MenuModuleDto] })
  async getMenu(@CurrentUser() principal: AuthenticatedPrincipal | undefined): Promise<MenuModuleDto[]> {
    const userId = await this.requireUserId(principal);
    return this.accessService.getMenu(userId);
  }

  private async requireUserId(principal: AuthenticatedPrincipal | undefined): Promise<string> {
    if (!principal) {
      throw new UnauthorizedException('Se requiere autenticación');
    }

    const userId = await this.accessService.findUserIdForPrincipal(principal);

    if (!userId) {
      // El token es válido, pero no hay cuenta local utilizable. No se explica
      // más: el motivo exacto es información de la que el cliente no dispone.
      throw new UnauthorizedException('La cuenta no está habilitada en esta aplicación');
    }

    return userId;
  }
}
