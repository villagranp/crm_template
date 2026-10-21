import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '@/common/decorators/public.decorator';
import { ErrorResponseDto } from '@/common/dto/error-response.dto';
import { ServiceUnavailableError } from '@/common/errors/application-error';
import { HealthService, type LivenessStatus, type ReadinessStatus } from './health.service';

const STATUS_SCHEMA = (status: string) => ({
  type: 'object',
  required: ['status', 'timestamp'],
  properties: {
    status: { type: 'string', enum: [status] },
    timestamp: { type: 'string', format: 'date-time' },
  },
});

/**
 * Endpoints de salud bajo el prefijo global: /api/v1/health y /api/v1/ready (ADR-016).
 * Publicos y minimos: estado y marca de tiempo, nada que identifique versiones,
 * host o dependencias.
 */
@ApiTags('health')
@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('health')
  @HttpCode(HttpStatus.OK)
  // Publico: las sondas de liveness no portan credenciales y la respuesta
  // no expone informacion del sistema.
  @Public('Liveness probe consumida por el orquestador de contenedores')
  @ApiOperation({ summary: 'Liveness probe' })
  @ApiOkResponse({ description: 'El proceso esta vivo', schema: STATUS_SCHEMA('ok') })
  getHealth(): LivenessStatus {
    return this.healthService.getLiveness();
  }

  @Get('ready')
  @HttpCode(HttpStatus.OK)
  @Public('Readiness probe consumida por el orquestador de contenedores')
  @ApiOperation({ summary: 'Readiness probe' })
  @ApiOkResponse({ description: 'Listo para recibir trafico', schema: STATUS_SCHEMA('ready') })
  @ApiServiceUnavailableResponse({
    type: ErrorResponseDto,
    description: 'SERVICE_NOT_READY: alguna dependencia critica no responde (no se dice cual)',
  })
  async getReady(): Promise<ReadinessStatus> {
    const readiness = await this.healthService.getReadiness();

    if (readiness.status !== 'ready') {
      throw new ServiceUnavailableError('SERVICE_NOT_READY', 'El servicio no está listo');
    }

    return readiness;
  }
}
