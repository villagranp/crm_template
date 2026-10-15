import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';

import { AuthenticatedOnly } from '@/common/decorators/authenticated-only.decorator';
import { ErrorResponseDto } from '@/common/dto/error-response.dto';

import { TodaySafetyMinuteResponseDto } from './dto/safety-minute.dto';
import { SafetyMinutesService } from './safety-minutes.service';

/**
 * `GET /me/safety-minute` (Ajustes 1, §6.3): el mensaje del día para cualquier sesión (D-AJ1.9).
 * Vive en este módulo, y no en `MeController`, para que `AccessModule` no dependa de
 * `SafetyMinutesModule` (que ya depende de `AccessModule` por el usuario local de quien escribe).
 */
@ApiTags('Acceso')
@ApiBearerAuth()
@Controller('me')
export class MeSafetyMinuteController {
  constructor(private readonly safetyMinutes: SafetyMinutesService) {}

  @Get('safety-minute')
  @AuthenticatedOnly('Mensaje institucional visible para toda sesión (D-AJ1.9)')
  @ApiOperation({
    summary: 'AJ1-2 · Minuto de seguridad de hoy',
    description:
      '"Hoy" en la zona `crm.zona_horaria_negocio`. Respuesta mínima: sin autor ni identificadores internos. ' +
      'Sin mensaje hoy responde `200 { "safetyMinute": null }`: la ausencia no es un error.',
  })
  @ApiOkResponse({ type: TodaySafetyMinuteResponseDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'Sin sesión o token inválido' })
  async today(): Promise<TodaySafetyMinuteResponseDto> {
    return { safetyMinute: await this.safetyMinutes.findToday() };
  }
}
