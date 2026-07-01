import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Config, Service, ServiceDto, OrphanedEndpointDto, ParsedSpec } from '@mockingbird/shared-types';
import { ConfigService } from '../config/config.service';
import { SwaggerLoaderService } from '../swagger/swagger-loader.service';
import { SpecDriftService } from '../swagger/spec-drift.service';
import { MockServerService } from '../mock/mock-server.service';
import {
  CreateServiceBodyDto,
  UpdateServiceBodyDto,
  RemapBodyDto,
} from './dto';

@Controller('services')
export class ServicesController {
  private readonly logger = new Logger(ServicesController.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly swaggerLoader: SwaggerLoaderService,
    private readonly specDrift: SpecDriftService,
    private readonly mockServer: MockServerService,
  ) {}

  @Get()
  getAll(): ServiceDto[] {
    return this.configService.getCurrent()!.services;
  }

  @Post()
  async create(@Body() dto: CreateServiceBodyDto): Promise<ServiceDto> {
    const service: Service = {
      id: randomUUID(),
      name: dto.name,
      port: dto.port,
      spec: dto.spec,
      cors: dto.cors,
      proxy: dto.proxy,
      endpoints: [],
    };

    if ((service.spec.type === 'upload' || service.spec.type === 'hosted') && dto.specContent) {
      this.swaggerLoader.saveSpecContent(service.id, dto.specContent);
    }

    // Resolve the spec and populate endpoints *before* writing, so the
    // persisted config already reflects them — mergeSpecEndpoints() only
    // updates in-memory state, and the config file watcher would otherwise
    // reload from disk shortly after write() and wipe an in-memory-only merge.
    let spec: ParsedSpec | null = null;
    try {
      spec = await this.swaggerLoader.load(service);
      service.endpoints = spec.endpoints.map(ep => ({
        id: randomUUID(),
        method: ep.method,
        path: ep.path,
        statements: [],
      }));
    } catch (e: unknown) {
      this.logger.warn(`Failed to load spec for new service "${service.name}": ${(e as Error).message}`);
    }

    const config = this.configService.getCurrent()!;
    const updated: Config = JSON.parse(JSON.stringify(config));
    updated.services.push(service);
    await this.configService.write(updated);

    if (spec) {
      try {
        await this.mockServer.start(service, spec);
      } catch (e: unknown) {
        this.logger.warn(`Failed to start mock server for new service "${service.name}": ${(e as Error).message}`);
      }
    }

    return service;
  }

  @Get(':id')
  getOne(@Param('id') id: string): ServiceDto {
    const service = this.configService.getCurrent()!.services.find(s => s.id === id);
    if (!service) throw new NotFoundException(`Service ${id} not found`);
    return service;
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateServiceBodyDto): Promise<ServiceDto> {
    const config = this.configService.getCurrent()!;
    const updated: Config = JSON.parse(JSON.stringify(config));
    const idx = updated.services.findIndex(s => s.id === id);
    if (idx === -1) throw new NotFoundException(`Service ${id} not found`);
    updated.services[idx] = { ...updated.services[idx], ...dto };
    await this.configService.write(updated);
    return updated.services[idx];
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<void> {
    const config = this.configService.getCurrent()!;
    const updated: Config = JSON.parse(JSON.stringify(config));
    const idx = updated.services.findIndex(s => s.id === id);
    if (idx === -1) throw new NotFoundException(`Service ${id} not found`);
    updated.services.splice(idx, 1);
    await this.configService.write(updated);
  }

  @Post(':id/spec/refresh')
  async refresh(@Param('id') id: string): Promise<{ endpointCount: number }> {
    const config = this.configService.getCurrent()!;
    const service = config.services.find(s => s.id === id);
    if (!service) throw new NotFoundException(`Service ${id} not found`);
    const spec = await this.swaggerLoader.load(service);
    return { endpointCount: spec.endpoints.length };
  }

  @Get(':id/orphaned-endpoints')
  getOrphaned(@Param('id') id: string): OrphanedEndpointDto[] {
    return this.specDrift.getOrphaned(id);
  }

  @Post(':id/endpoints/:eid/remap')
  async remapEndpoint(
    @Param('id') id: string,
    @Param('eid') eid: string,
    @Body() dto: RemapBodyDto,
  ): Promise<void> {
    const config = this.configService.getCurrent()!;
    const updated: Config = JSON.parse(JSON.stringify(config));
    const service = updated.services.find(s => s.id === id);
    if (!service) throw new NotFoundException(`Service ${id} not found`);

    const srcEndpoint = (service.endpoints ?? []).find(e => e.id === eid);
    if (!srcEndpoint) throw new NotFoundException(`Endpoint ${eid} not found`);

    const tgtEndpoint = (service.endpoints ?? []).find(
      e =>
        e.method.toUpperCase() === dto.targetMethod.toUpperCase() &&
        e.path === dto.targetPath,
    );
    if (!tgtEndpoint) {
      throw new NotFoundException(
        `Target endpoint ${dto.targetMethod} ${dto.targetPath} not found`,
      );
    }

    // Move statements to target
    tgtEndpoint.statements = [
      ...(tgtEndpoint.statements ?? []),
      ...(srcEndpoint.statements ?? []),
    ];

    // Move default response block if target doesn't already have one
    if (srcEndpoint.defaultResponseBlockId && !tgtEndpoint.defaultResponseBlockId) {
      tgtEndpoint.defaultResponseBlockId = srcEndpoint.defaultResponseBlockId;
    }

    // Remove source endpoint
    service.endpoints = service.endpoints.filter(e => e.id !== eid);

    await this.configService.write(updated);
    this.specDrift.clearOrphan(id, srcEndpoint.method, srcEndpoint.path);
  }
}
