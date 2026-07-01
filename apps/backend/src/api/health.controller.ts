import { Controller, Get } from '@nestjs/common';
import type { HealthDto } from '@mockingbird/shared-types';
import { ConfigService } from '../config/config.service';
import { MockServerService } from '../mock/mock-server.service';
import { ModuleRegistryService } from '../module-registry/module-registry.service';
import { SwaggerLoaderService } from '../swagger/swagger-loader.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly configService: ConfigService,
    private readonly mockServer: MockServerService,
    private readonly moduleRegistry: ModuleRegistryService,
    private readonly swaggerLoader: SwaggerLoaderService,
  ) {}

  @Get()
  async getHealth(): Promise<HealthDto> {
    const config = this.configService.getCurrent()!;

    const servicesHealth = config.services.map(s => ({
      id: s.id,
      name: s.name,
      port: s.port,
      running: this.mockServer.isRunning(s.id),
      specLoaded: this.swaggerLoader.isLoaded(s.id),
    }));

    const healthChecks = await this.moduleRegistry.runHealthChecks();
    const modulesHealth = (config.modules ?? []).map(m => {
      const h = healthChecks[m.id];
      const health: 'healthy' | 'unhealthy' | 'checking' | 'unchecked' = h
        ? h.healthy
          ? 'healthy'
          : 'unhealthy'
        : 'unchecked';
      return { id: m.id, name: m.name, health };
    });

    const allRunning = servicesHealth.every(s => s.running);
    const allHealthy = modulesHealth.every(
      m => m.health === 'healthy' || m.health === 'unchecked',
    );

    return {
      status: allRunning && allHealthy ? 'ok' : 'degraded',
      services: servicesHealth,
      modules: modulesHealth,
    };
  }
}
