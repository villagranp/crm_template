import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsString, MaxLength, ValidateNested } from 'class-validator';

import { THEME_VALUES, type ThemeValue } from '../user-preferences.rules';

/** Un elemento de la composición: clave (de las listas cerradas) y visibilidad (RN-AJ1.2). */
export class DashboardCardEntryDto {
  @ApiProperty({ example: 'hero', maxLength: 50, description: 'Clave de una de las listas cerradas; una desconocida es `422 INVALID_DASHBOARD_CARDS`' })
  @IsString()
  @MaxLength(50)
  key!: string;

  @ApiProperty({ description: 'Los bloques no ocultables (`safety-minute`) se normalizan a `true`' })
  @IsBoolean()
  visible!: boolean;
}

/** Composición del panel de Inicio: la lista completa de bloques y de indicadores, en orden (RN-AJ1.2). */
export class DashboardCardsDto {
  @ApiProperty({ type: [DashboardCardEntryDto], description: 'Todos los bloques, exactamente una vez cada uno; el orden es el de pantalla' })
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => DashboardCardEntryDto)
  blocks!: DashboardCardEntryDto[];

  @ApiProperty({ type: [DashboardCardEntryDto], description: 'Todos los indicadores K1–K9, exactamente una vez cada uno; el orden es el de pantalla' })
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => DashboardCardEntryDto)
  kpis!: DashboardCardEntryDto[];
}

export class SetThemeDto {
  @ApiProperty({ enum: THEME_VALUES, example: 'dark' })
  @IsIn(THEME_VALUES)
  value!: ThemeValue;
}

export class ThemePreferenceResponseDto {
  @ApiProperty({ enum: THEME_VALUES, example: 'dark' })
  theme!: ThemeValue;
}

export class UserPreferencesResponseDto {
  @ApiProperty({ enum: THEME_VALUES, nullable: true, description: '`null` si el usuario no ha elegido tema: el cliente usa el del navegador' })
  theme!: ThemeValue | null;

  @ApiProperty({
    type: DashboardCardsDto,
    nullable: true,
    description: 'La preferencia propia del panel de Inicio (normalizada); `null` si no existe o es ilegible. No es la composición efectiva: esa es `GET /me/ui-settings`',
  })
  dashboardCards!: DashboardCardsDto | null;
}
