import { Controller, Get, HttpCode, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '@/common/decorators/public.decorator';
import { HealthService, type LivenessStatus, type ReadinessStatus } from './health.service';

/**
 * Endpoints de salud bajo el prefijo global: /api/v1/health y /api/v1/ready (ADR-016).
 */
@ApiTags('health')
@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('health')
  @HttpCode(HttpStatus.OK)
  // Publico: las sondas de liveness no portan credenciales y la respuesta
  // no expone informacion sensible del sistema.
  @Public('Liveness probe consumida por el orquestador de contenedores')
  @ApiOperation({ summary: 'Liveness probe' })
  @ApiOkResponse({ description: 'El proceso esta vivo' })
  getHealth(): LivenessStatus {
    return this.healthService.getLiveness();
  }

  @Get('ready')
  @HttpCode(HttpStatus.OK)
  @Public('Readiness probe consumida por el orquestador de contenedores')
  @ApiOperation({ summary: 'Readiness probe' })
  @ApiOkResponse({ description: 'Listo para recibir trafico' })
  @ApiServiceUnavailableResponse({ description: 'Alguna dependencia critica no responde' })
  async getReady(): Promise<ReadinessStatus> {
    const readiness = await this.healthService.getReadiness();

    if (readiness.status !== 'ready') {
      throw new ServiceUnavailableException('Service is not ready');
    }

    return readiness;
  }
}
