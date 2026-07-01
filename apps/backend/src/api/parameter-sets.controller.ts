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
import type { Config, ParameterSet, ParameterSetDto } from '@mockingbird/shared-types';
import { ConfigService } from '../config/config.service';
import { CreateParameterSetBodyDto, UpdateParameterSetBodyDto } from './dto';

@Controller('parameter-sets')
export class ParameterSetsController {
  constructor(private readonly configService: ConfigService) {}

  @Get()
  getAll(): ParameterSetDto[] {
    return this.configService.getCurrent()!.parameterSets ?? [];
  }

  @Post()
  async create(@Body() dto: CreateParameterSetBodyDto): Promise<ParameterSetDto> {
    const config = this.configService.getCurrent()!;
    const updated: Config = JSON.parse(JSON.stringify(config));
    const ps: ParameterSet = {
      id: randomUUID(),
      name: dto.name,
      values: dto.values,
    };
    if (!updated.parameterSets) updated.parameterSets = [];
    updated.parameterSets.push(ps);
    await this.configService.write(updated);
    return ps;
  }

  @Get(':id')
  getOne(@Param('id') id: string): ParameterSetDto {
    const ps = this.configService.getCurrent()!.parameterSets?.find(p => p.id === id);
    if (!ps) throw new NotFoundException(`Parameter set ${id} not found`);
    return ps;
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateParameterSetBodyDto,
  ): Promise<ParameterSetDto> {
    const config = this.configService.getCurrent()!;
    const updated: Config = JSON.parse(JSON.stringify(config));
    const idx = updated.parameterSets?.findIndex(p => p.id === id) ?? -1;
    if (idx === -1) throw new NotFoundException(`Parameter set ${id} not found`);
    updated.parameterSets[idx] = { ...updated.parameterSets[idx], ...dto };
    await this.configService.write(updated);
    return updated.parameterSets[idx];
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<void> {
    const config = this.configService.getCurrent()!;
    const updated: Config = JSON.parse(JSON.stringify(config));
    const idx = updated.parameterSets?.findIndex(p => p.id === id) ?? -1;
    if (idx === -1) throw new NotFoundException(`Parameter set ${id} not found`);
    updated.parameterSets.splice(idx, 1);
    await this.configService.write(updated);
  }
}
