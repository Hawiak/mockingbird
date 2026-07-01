import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { AppModule } from './app/app.module';
import { ConfigService } from './config/config.service';
import { ConfigWatcherService } from './config/config-watcher.service';
import { MockServerService } from './mock/mock-server.service';
import { ModuleRegistryService } from './module-registry/module-registry.service';
import { SwaggerLoaderService } from './swagger/swagger-loader.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.useWebSocketAdapter(new IoAdapter(app));
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);

  // Enable global validation pipe
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const configService = app.get(ConfigService);
  await configService.load(process.env.CONFIG_PATH ?? 'mockingbird.yaml');

  const config = configService.getCurrent()!;
  const mockService = app.get(MockServerService);
  const swaggerLoader = app.get(SwaggerLoaderService);

  // Initialize module registry from config
  const moduleRegistry = app.get(ModuleRegistryService);
  for (const mod of config.modules ?? []) {
    try {
      await moduleRegistry.configure(mod);
    } catch (e: unknown) {
      Logger.warn(
        `Failed to configure module "${mod.name}": ${(e as Error).message}`,
        'Bootstrap',
      );
    }
  }

  // Reconfigure modules on config reload
  const watcher = app.get(ConfigWatcherService);
  watcher.changes.subscribe(async ({ new: newConfig }) => {
    for (const mod of newConfig.modules ?? []) {
      try {
        await moduleRegistry.configure(mod);
      } catch {
        // silently swallow — config watcher service already logs errors
      }
    }
  });

  for (const svc of config.services) {
    try {
      const spec = await swaggerLoader.load(svc);
      configService.mergeSpecEndpoints(svc.id, spec.endpoints);
      await mockService.start(svc, spec);
    } catch (e: unknown) {
      Logger.warn(`Failed to start mock server for service "${svc.name}": ${(e as Error).message}`);
    }
  }

  const uiPort = config.settings?.uiPort ?? 9000;
  await app.listen(uiPort);
  Logger.log(
    `Application is running on: http://localhost:${uiPort}/${globalPrefix}`,
    'Bootstrap',
  );
}

bootstrap();
