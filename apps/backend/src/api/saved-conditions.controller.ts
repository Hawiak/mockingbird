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
import type { Config, SavedCondition, SavedConditionDto } from '@mockingbird/shared-types';
import { ConfigService } from '../config/config.service';
import { CreateSavedConditionBodyDto, UpdateSavedConditionBodyDto } from './dto';

@Controller('saved-conditions')
export class SavedConditionsController {
  constructor(private readonly configService: ConfigService) {}

  @Get()
  getAll(): SavedConditionDto[] {
    return this.configService.getCurrent()!.savedConditions ?? [];
  }

  @Post()
  async create(@Body() dto: CreateSavedConditionBodyDto): Promise<SavedConditionDto> {
    const config = this.configService.getCurrent()!;
    const updated: Config = JSON.parse(JSON.stringify(config));
    const savedCondition: SavedCondition = {
      id: randomUUID(),
      name: dto.name,
      condition: dto.condition,
    };
    if (!updated.savedConditions) updated.savedConditions = [];
    updated.savedConditions.push(savedCondition);
    await this.configService.write(updated);
    return savedCondition;
  }

  @Get(':id')
  getOne(@Param('id') id: string): SavedConditionDto {
    const cond = this.configService.getCurrent()!.savedConditions?.find(c => c.id === id);
    if (!cond) throw new NotFoundException(`Saved condition ${id} not found`);
    return cond;
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateSavedConditionBodyDto,
  ): Promise<SavedConditionDto> {
    const config = this.configService.getCurrent()!;
    const updated: Config = JSON.parse(JSON.stringify(config));
    const idx = updated.savedConditions?.findIndex(c => c.id === id) ?? -1;
    if (idx === -1) throw new NotFoundException(`Saved condition ${id} not found`);
    updated.savedConditions![idx] = { ...updated.savedConditions![idx], ...dto };
    await this.configService.write(updated);
    return updated.savedConditions![idx];
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<void> {
    const config = this.configService.getCurrent()!;
    const updated: Config = JSON.parse(JSON.stringify(config));
    const idx = updated.savedConditions?.findIndex(c => c.id === id) ?? -1;
    if (idx === -1) throw new NotFoundException(`Saved condition ${id} not found`);
    updated.savedConditions!.splice(idx, 1);
    await this.configService.write(updated);
  }
}
