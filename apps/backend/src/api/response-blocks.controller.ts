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
import type { Config, ResponseBlock, ResponseBlockDto } from '@mockingbird/shared-types';
import { ConfigService } from '../config/config.service';
import { CreateResponseBlockBodyDto, UpdateResponseBlockBodyDto } from './dto';

@Controller('response-blocks')
export class ResponseBlocksController {
  constructor(private readonly configService: ConfigService) {}

  @Get()
  getAll(): ResponseBlockDto[] {
    return this.configService.getCurrent()!.responseBlocks ?? [];
  }

  @Post()
  async create(@Body() dto: CreateResponseBlockBodyDto): Promise<ResponseBlockDto> {
    const config = this.configService.getCurrent()!;
    const updated: Config = JSON.parse(JSON.stringify(config));
    const block: ResponseBlock = {
      id: randomUUID(),
      name: dto.name,
      statusCode: dto.statusCode,
      headers: dto.headers ?? {},
      body: dto.body ?? '',
    };
    if (!updated.responseBlocks) updated.responseBlocks = [];
    updated.responseBlocks.push(block);
    await this.configService.write(updated);
    return block;
  }

  @Get(':id')
  getOne(@Param('id') id: string): ResponseBlockDto {
    const block = this.configService.getCurrent()!.responseBlocks?.find(b => b.id === id);
    if (!block) throw new NotFoundException(`Response block ${id} not found`);
    return block;
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateResponseBlockBodyDto,
  ): Promise<ResponseBlockDto> {
    const config = this.configService.getCurrent()!;
    const updated: Config = JSON.parse(JSON.stringify(config));
    const idx = updated.responseBlocks?.findIndex(b => b.id === id) ?? -1;
    if (idx === -1) throw new NotFoundException(`Response block ${id} not found`);
    updated.responseBlocks[idx] = { ...updated.responseBlocks[idx], ...dto };
    await this.configService.write(updated);
    return updated.responseBlocks[idx];
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<void> {
    const config = this.configService.getCurrent()!;
    const updated: Config = JSON.parse(JSON.stringify(config));
    const idx = updated.responseBlocks?.findIndex(b => b.id === id) ?? -1;
    if (idx === -1) throw new NotFoundException(`Response block ${id} not found`);
    updated.responseBlocks.splice(idx, 1);
    await this.configService.write(updated);
  }
}
