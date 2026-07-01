import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Config, ResponseWorkflow, ResponseWorkflowDto } from '@mockingbird/shared-types';
import { ConfigService } from '../config/config.service';
import { CreateResponseWorkflowBodyDto, UpdateResponseWorkflowBodyDto } from './dto';

@Controller('response-workflows')
export class ResponseWorkflowsController {
  constructor(private readonly configService: ConfigService) {}

  @Get()
  getAll(): ResponseWorkflowDto[] {
    return this.configService.getCurrent()!.responseWorkflows ?? [];
  }

  @Post()
  async create(@Body() dto: CreateResponseWorkflowBodyDto): Promise<ResponseWorkflowDto> {
    const config = this.configService.getCurrent()!;
    const updated: Config = JSON.parse(JSON.stringify(config));
    const workflow: ResponseWorkflow = {
      id: randomUUID(),
      name: dto.name,
      steps: dto.steps ?? [],
    };
    if (!updated.responseWorkflows) updated.responseWorkflows = [];
    updated.responseWorkflows.push(workflow);
    await this.configService.write(updated);
    return workflow;
  }

  @Get(':id')
  getOne(@Param('id') id: string): ResponseWorkflowDto {
    const workflow = this.configService.getCurrent()!.responseWorkflows?.find(w => w.id === id);
    if (!workflow) throw new NotFoundException(`Response workflow ${id} not found`);
    return workflow;
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateResponseWorkflowBodyDto,
  ): Promise<ResponseWorkflowDto> {
    const config = this.configService.getCurrent()!;
    const updated: Config = JSON.parse(JSON.stringify(config));
    const idx = updated.responseWorkflows?.findIndex(w => w.id === id) ?? -1;
    if (idx === -1) throw new NotFoundException(`Response workflow ${id} not found`);
    updated.responseWorkflows![idx] = { ...updated.responseWorkflows![idx], ...dto };
    await this.configService.write(updated);
    return updated.responseWorkflows![idx];
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<void> {
    const config = this.configService.getCurrent()!;
    const updated: Config = JSON.parse(JSON.stringify(config));
    const idx = updated.responseWorkflows?.findIndex(w => w.id === id) ?? -1;
    if (idx === -1) throw new NotFoundException(`Response workflow ${id} not found`);
    updated.responseWorkflows!.splice(idx, 1);
    await this.configService.write(updated);
  }
}
