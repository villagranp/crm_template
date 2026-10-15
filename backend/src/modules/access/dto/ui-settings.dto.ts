import { ApiProperty } from '@nestjs/swagger';

import { DashboardCardEntryDto } from './user-preferences.dto';

export class DashboardSettingsDto {
  @ApiProperty({ description: '`true` si la composición viene de la preferencia del propio usuario (habilita «Restablecer»)' })
  isCustomized!: boolean;

  @ApiProperty({ type: [DashboardCardEntryDto], description: 'Bloques de Inicio en orden de pantalla; ya normalizados; `safety-minute` siempre visible' })
  blocks!: DashboardCardEntryDto[];

  @ApiProperty({ type: [DashboardCardEntryDto], description: 'Indicadores K1–K9 en orden de pantalla; ya normalizados' })
  kpis!: DashboardCardEntryDto[];
}

export class TopbarSettingsDto {
  @ApiProperty({ description: '`ui.barra_superior.buscar` (sembrado `false`: aún sin función)' }) search!: boolean;
  @ApiProperty({ description: '`ui.barra_superior.pantalla_completa` (sembrado `true`)' }) fullscreen!: boolean;
  @ApiProperty({ description: '`ui.barra_superior.notificaciones` (sembrado `false`: aún sin función)' }) notifications!: boolean;
}

export class UiSettingsResponseDto {
  @ApiProperty({ type: DashboardSettingsDto, description: 'Composición efectiva del usuario. NO filtra por permisos: el cliente combina visibilidad y permiso' })
  dashboard!: DashboardSettingsDto;

  @ApiProperty({ type: TopbarSettingsDto }) topbar!: TopbarSettingsDto;
}
