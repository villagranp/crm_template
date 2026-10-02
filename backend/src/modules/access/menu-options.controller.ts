import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { RequirePermission } from '@/common/decorators/require-permission.decorator';

import { ACCESS_REPOSITORY, type AccessRepository, type MenuOptionRecord } from './ports/access.repository.port';

/**
 * Catálogo de opciones de menú.
 *
 * Es la lista completa, sin filtrar por el usuario que consulta: la usa la
 * pantalla de administración para decidir qué asignar a un rol o a una persona.
 * El menú propio de cada usuario es `GET /me/menu`.
 */
@ApiTags('Administración · Opciones de menú')
@Controller('menu-options')
export class MenuOptionsController {
  constructor(@Inject(ACCESS_REPOSITORY) private readonly repository: AccessRepository) {}

  @Get()
  @RequirePermission('opciones.ver')
  @ApiOperation({ summary: 'Catálogo completo de opciones, agrupadas por módulo' })
  list(): Promise<MenuOptionRecord[]> {
    return this.repository.listMenuOptions();
  }
}
