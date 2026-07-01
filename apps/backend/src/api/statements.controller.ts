import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Param,
  Body,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Config, Statement, StatementDto } from '@mockingbird/shared-types';
import { ConfigService } from '../config/config.service';
import {
  CreateStatementBodyDto,
  UpdateStatementBodyDto,
  ReorderBodyDto,
} from './dto';

@Controller('services/:id/endpoints/:eid/statements')
export class StatementsController {
  constructor(private readonly configService: ConfigService) {}

  private findEndpoint(config: Config, serviceId: string, endpointId: string) {
    const service = config.services.find(s => s.id === serviceId);
    if (!service) throw new NotFoundException(`Service ${serviceId} not found`);
    const endpoint = (service.endpoints ?? []).find(e => e.id === endpointId);
    if (!endpoint) throw new NotFoundException(`Endpoint ${endpointId} not found`);
    return { service, endpoint };
  }

  @Get()
  getAll(@Param('id') id: string, @Param('eid') eid: string): StatementDto[] {
    const config = this.configService.getCurrent()!;
    const { endpoint } = this.findEndpoint(config, id, eid);
    return endpoint.statements ?? [];
  }

  @Post()
  async create(
    @Param('id') id: string,
    @Param('eid') eid: string,
    @Body() dto: CreateStatementBodyDto,
  ): Promise<StatementDto> {
    const config = this.configService.getCurrent()!;
    const updated: Config = JSON.parse(JSON.stringify(config));
    const { endpoint } = this.findEndpoint(updated, id, eid);

    const statement: Statement = {
      id: randomUUID(),
      name: dto.name,
      priority: dto.priority,
      enabled: true,
      condition: dto.condition,
      workflow: dto.workflow,
    };
    if (!endpoint.statements) endpoint.statements = [];
    endpoint.statements.push(statement);
    await this.configService.write(updated);
    return statement;
  }

  @Get(':sid')
  getOne(
    @Param('id') id: string,
    @Param('eid') eid: string,
    @Param('sid') sid: string,
  ): StatementDto {
    const config = this.configService.getCurrent()!;
    const { endpoint } = this.findEndpoint(config, id, eid);
    const statement = endpoint.statements?.find(s => s.id === sid);
    if (!statement) throw new NotFoundException(`Statement ${sid} not found`);
    return statement;
  }

  @Put(':sid')
  async update(
    @Param('id') id: string,
    @Param('eid') eid: string,
    @Param('sid') sid: string,
    @Body() dto: UpdateStatementBodyDto,
  ): Promise<StatementDto> {
    const config = this.configService.getCurrent()!;
    const updated: Config = JSON.parse(JSON.stringify(config));
    const { endpoint } = this.findEndpoint(updated, id, eid);
    const idx = endpoint.statements?.findIndex(s => s.id === sid) ?? -1;
    if (idx === -1) throw new NotFoundException(`Statement ${sid} not found`);
    endpoint.statements![idx] = { ...endpoint.statements![idx], ...dto };
    await this.configService.write(updated);
    return endpoint.statements![idx];
  }

  @Delete(':sid')
  async remove(
    @Param('id') id: string,
    @Param('eid') eid: string,
    @Param('sid') sid: string,
  ): Promise<void> {
    const config = this.configService.getCurrent()!;
    const updated: Config = JSON.parse(JSON.stringify(config));
    const { endpoint } = this.findEndpoint(updated, id, eid);
    const idx = endpoint.statements?.findIndex(s => s.id === sid) ?? -1;
    if (idx === -1) throw new NotFoundException(`Statement ${sid} not found`);
    endpoint.statements!.splice(idx, 1);
    await this.configService.write(updated);
  }

  @Patch(':sid/reorder')
  async reorder(
    @Param('id') id: string,
    @Param('eid') eid: string,
    @Param('sid') sid: string,
    @Body() dto: ReorderBodyDto,
  ): Promise<StatementDto> {
    const config = this.configService.getCurrent()!;
    const updated: Config = JSON.parse(JSON.stringify(config));
    const { endpoint } = this.findEndpoint(updated, id, eid);
    const idx = endpoint.statements?.findIndex(s => s.id === sid) ?? -1;
    if (idx === -1) throw new NotFoundException(`Statement ${sid} not found`);
    endpoint.statements![idx].priority = dto.priority;
    await this.configService.write(updated);
    return endpoint.statements![idx];
  }
}
