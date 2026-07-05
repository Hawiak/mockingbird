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
  UpdateSpecBodyDto,
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
      service.spec = { ...service.spec, specContent: dto.specContent };
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

  /** Pushes fresh spec content (upload/hosted) or a new URL, persists it, and re-parses/merges endpoints. */
  @Put(':id/spec')
  async updateSpec(@Param('id') id: string, @Body() dto: UpdateSpecBodyDto): Promise<{ endpointCount: number }> {
    const config = this.configService.getCurrent()!;
    const updated: Config = JSON.parse(JSON.stringify(config));
    const service = updated.services.find(s => s.id === id);
    if (!service) throw new NotFoundException(`Service ${id} not found`);

    if (dto.specContent !== undefined) service.spec = { ...service.spec, specContent: dto.specContent };
    if (dto.url !== undefined) service.spec = { ...service.spec, url: dto.url };

    const spec = await this.swaggerLoader.load(service);
    service.endpoints = spec.endpoints.map(ep => {
      const existing = service.endpoints.find(e => e.method === ep.method && e.path === ep.path);
      return existing ?? { id: randomUUID(), method: ep.method, path: ep.path };
    });

    await this.configService.write(updated);
    await this.mockServer.reload(service, spec);
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

    // Move the response config to target — if target doesn't have one yet, adopt
    // source's outright; otherwise chain source's onto the tail of target's
    // else-chain so target's existing behavior still takes priority.
    if (!tgtEndpoint.responseNode) {
      tgtEndpoint.responseNode = srcEndpoint.responseNode;
    } else if (srcEndpoint.responseNode) {
      let tail = tgtEndpoint.responseNode;
      while (tail.else) tail = tail.else;
      tail.else = srcEndpoint.responseNode;
    }

    // Remove source endpoint
    service.endpoints = service.endpoints.filter(e => e.id !== eid);

    await this.configService.write(updated);
    this.specDrift.clearOrphan(id, srcEndpoint.method, srcEndpoint.path);
  }
}
