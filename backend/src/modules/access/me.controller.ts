import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Put, UnauthorizedException } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import { AuthenticatedOnly } from '@/common/decorators/authenticated-only.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { ErrorResponseDto } from '@/common/dto/error-response.dto';
import type { AuthenticatedPrincipal } from '@/infrastructure/authentication/ports/authenticated-principal';

import { AccessService } from './access.service';
import { MenuModuleDto } from './dto/menu.dto';
import { ProfileResponseDto } from './dto/profile.dto';
import { UiSettingsResponseDto } from './dto/ui-settings.dto';
import { DashboardCardsDto, SetThemeDto, ThemePreferenceResponseDto, UserPreferencesResponseDto } from './dto/user-preferences.dto';
import { UiSettingsService } from './ui-settings.service';
import { UserPreferencesService } from './user-preferences.service';

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
  constructor(
    private readonly accessService: AccessService,
    private readonly uiSettings: UiSettingsService,
    private readonly preferences: UserPreferencesService,
  ) {}

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

  @Get('me/ui-settings')
  @AuthenticatedOnly('El recurso es la configuración de interfaz de la sesión')
  @ApiOperation({
    summary: 'AJ1-1, AJ1-6 · Configuración de interfaz del usuario autenticado',
    description:
      '`dashboard`: composición efectiva del usuario (su preferencia válida o, si no tiene, el parámetro por defecto `ui.inicio.tarjetas`), ' +
      'ya normalizada y con `safety-minute` siempre visible; NO filtra por permisos. `topbar`: visibilidad de los botones de la barra superior. ' +
      'No expone ningún otro parámetro.',
  })
  @ApiOkResponse({ type: UiSettingsResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'Sin sesión o token inválido' })
  async getUiSettings(@CurrentUser() principal: AuthenticatedPrincipal | undefined): Promise<UiSettingsResponseDto> {
    const userId = await this.requireUserId(principal);
    const settings = await this.uiSettings.get(userId);
    return {
      dashboard: {
        isCustomized: settings.dashboard.isCustomized,
        blocks: settings.dashboard.blocks.map(({ key, visible }) => ({ key, visible })),
        kpis: settings.dashboard.kpis.map(({ key, visible }) => ({ key, visible })),
      },
      topbar: { ...settings.topbar },
    };
  }

  @Get('me/preferences')
  @AuthenticatedOnly('El recurso son las preferencias del propio usuario de la sesión')
  @ApiOperation({
    summary: 'AJ1-1, AJ1-7 · Preferencias de interfaz del usuario autenticado',
    description:
      'La preferencia propia sin resolver con valores por defecto: `null` si no existe (o es ilegible). La composición efectiva del panel es `GET /me/ui-settings`.',
  })
  @ApiOkResponse({ type: UserPreferencesResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'Sin sesión o token inválido' })
  async getPreferences(@CurrentUser() principal: AuthenticatedPrincipal | undefined): Promise<UserPreferencesResponseDto> {
    const userId = await this.requireUserId(principal);
    const preferences = await this.preferences.get(userId);
    return {
      theme: preferences.theme,
      dashboardCards: preferences.dashboardCards
        ? {
            blocks: preferences.dashboardCards.blocks.map(({ key, visible }) => ({ key, visible })),
            kpis: preferences.dashboardCards.kpis.map(({ key, visible }) => ({ key, visible })),
          }
        : null,
    };
  }

  @Put('me/preferences/theme')
  @AuthenticatedOnly('El recurso es la preferencia de tema del propio usuario de la sesión')
  @ApiOperation({
    summary: 'AJ1-7 · Guarda el tema claro u oscuro del usuario',
    description: 'Crea o reemplaza la preferencia `ui.tema`. Es personal: no se audita ni se registra en logs (RN-AJ1.18).',
  })
  @ApiOkResponse({ type: ThemePreferenceResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'VALIDATION_FAILED: `value` distinto de `light`/`dark` o campos extra' })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'Sin sesión o token inválido' })
  async setTheme(
    @CurrentUser() principal: AuthenticatedPrincipal | undefined,
    @Body() dto: SetThemeDto,
  ): Promise<ThemePreferenceResponseDto> {
    const userId = await this.requireUserId(principal);
    return { theme: await this.preferences.setTheme(userId, dto.value) };
  }

  @Put('me/preferences/dashboard-cards')
  @AuthenticatedOnly('El recurso es la composición del panel del propio usuario de la sesión')
  @ApiOperation({
    summary: 'AJ1-1 · Guarda la composición del panel de Inicio del usuario',
    description:
      'Crea o reemplaza la lista COMPLETA de bloques e indicadores (cada clave exactamente una vez). `safety-minute` se guarda siempre visible. ' +
      'Es personal: no se audita ni se registra en logs (RN-AJ1.6b).',
  })
  @ApiOkResponse({ type: DashboardCardsDto, description: 'La composición guardada' })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'VALIDATION_FAILED: cuerpo mal formado o campos extra' })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'Sin sesión o token inválido' })
  @ApiUnprocessableEntityResponse({
    type: ErrorResponseDto,
    description: 'INVALID_DASHBOARD_CARDS: `details[].issue` ∈ `unknown_key`, `duplicated_key`, `missing_key` (con `field` y `key`)',
  })
  async setDashboardCards(
    @CurrentUser() principal: AuthenticatedPrincipal | undefined,
    @Body() dto: DashboardCardsDto,
  ): Promise<DashboardCardsDto> {
    const userId = await this.requireUserId(principal);
    const saved = await this.preferences.setDashboardCards(userId, dto);
    return {
      blocks: saved.blocks.map(({ key, visible }) => ({ key, visible })),
      kpis: saved.kpis.map(({ key, visible }) => ({ key, visible })),
    };
  }

  @Delete('me/preferences/dashboard-cards')
  @AuthenticatedOnly('El recurso es la composición del panel del propio usuario de la sesión')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'AJ1-1 · Restablece el panel de Inicio a la composición por defecto',
    description: 'Borra la preferencia del usuario. Sin preferencia previa también responde `204` (idempotente).',
  })
  @ApiNoContentResponse({ description: 'Restablecido' })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'Sin sesión o token inválido' })
  async resetDashboardCards(@CurrentUser() principal: AuthenticatedPrincipal | undefined): Promise<void> {
    const userId = await this.requireUserId(principal);
    await this.preferences.resetDashboardCards(userId);
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
