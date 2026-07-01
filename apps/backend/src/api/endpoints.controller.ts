import {
  Controller,
  Get,
  Put,
  Param,
  Body,
  NotFoundException,
} from '@nestjs/common';
import type { Config, EndpointDto } from '@mockingbird/shared-types';
import { ConfigService } from '../config/config.service';
import { MockServerService } from '../mock/mock-server.service';
import { UpdateEndpointBodyDto } from './dto';

@Controller('services/:id/endpoints')
export class EndpointsController {
  constructor(
    private readonly configService: ConfigService,
    private readonly mockServer: MockServerService,
  ) {}

  @Get()
  getAll(@Param('id') id: string): EndpointDto[] {
    const config = this.configService.getCurrent()!;
    const service = config.services.find(s => s.id === id);
    if (!service) throw new NotFoundException(`Service ${id} not found`);
    return (service.endpoints ?? []).map(e => ({
      ...e,
      serviceId: id,
      callCount: this.mockServer.getCallCount(id, e.path, e.method),
    }));
  }

  @Get(':eid')
  getOne(@Param('id') id: string, @Param('eid') eid: string): EndpointDto {
    const config = this.configService.getCurrent()!;
    const service = config.services.find(s => s.id === id);
    if (!service) throw new NotFoundException(`Service ${id} not found`);
    const endpoint = service.endpoints.find(e => e.id === eid);
    if (!endpoint) throw new NotFoundException(`Endpoint ${eid} not found`);
    return {
      ...endpoint,
      serviceId: id,
      callCount: this.mockServer.getCallCount(id, endpoint.path, endpoint.method),
    };
  }

  @Put(':eid')
  async update(
    @Param('id') id: string,
    @Param('eid') eid: string,
    @Body() dto: UpdateEndpointBodyDto,
  ): Promise<EndpointDto> {
    const config = this.configService.getCurrent()!;
    const updated: Config = JSON.parse(JSON.stringify(config));
    const service = updated.services.find(s => s.id === id);
    if (!service) throw new NotFoundException(`Service ${id} not found`);
    const idx = service.endpoints.findIndex(e => e.id === eid);
    if (idx === -1) throw new NotFoundException(`Endpoint ${eid} not found`);
    service.endpoints[idx] = { ...service.endpoints[idx], ...dto };
    await this.configService.write(updated);
    return {
      ...service.endpoints[idx],
      serviceId: id,
      callCount: this.mockServer.getCallCount(id, service.endpoints[idx].path, service.endpoints[idx].method),
    };
  }
}
