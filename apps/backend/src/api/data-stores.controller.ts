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
import type { Config, DataStore, DataStoreDto, DataStoreRecordDto } from '@mockingbird/shared-types';
import { ConfigService } from '../config/config.service';
import { StateStoreService } from '../data-store/state-store.service';
import { CreateDataStoreBodyDto, UpdateDataStoreBodyDto } from './dto';

@Controller('data-stores')
export class DataStoresController {
  constructor(
    private readonly configService: ConfigService,
    private readonly stateStoreService: StateStoreService,
  ) {}

  private toDto(store: DataStore): DataStoreDto {
    return { ...store, recordCount: this.stateStoreService.recordCount(store.id) };
  }

  private findOrThrow(id: string): DataStore {
    const store = this.configService.getCurrent()!.dataStores?.find(s => s.id === id);
    if (!store) throw new NotFoundException(`Data store ${id} not found`);
    return store;
  }

  @Get()
  getAll(): DataStoreDto[] {
    return (this.configService.getCurrent()!.dataStores ?? []).map(s => this.toDto(s));
  }

  @Post()
  async create(@Body() dto: CreateDataStoreBodyDto): Promise<DataStoreDto> {
    const config = this.configService.getCurrent()!;
    const updated: Config = JSON.parse(JSON.stringify(config));
    const store: DataStore = {
      id: randomUUID(),
      name: dto.name,
      seedRecords: dto.seedRecords ?? {},
    };
    if (!updated.dataStores) updated.dataStores = [];
    updated.dataStores.push(store);
    await this.configService.write(updated);
    this.stateStoreService.ensureSeeded(store.id, store.seedRecords);
    return this.toDto(store);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateDataStoreBodyDto): Promise<DataStoreDto> {
    const config = this.configService.getCurrent()!;
    const updated: Config = JSON.parse(JSON.stringify(config));
    const idx = updated.dataStores?.findIndex(s => s.id === id) ?? -1;
    if (idx === -1) throw new NotFoundException(`Data store ${id} not found`);
    updated.dataStores[idx] = { ...updated.dataStores[idx], ...dto };
    await this.configService.write(updated);
    return this.toDto(updated.dataStores[idx]);
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<void> {
    const config = this.configService.getCurrent()!;
    const updated: Config = JSON.parse(JSON.stringify(config));
    const idx = updated.dataStores?.findIndex(s => s.id === id) ?? -1;
    if (idx === -1) throw new NotFoundException(`Data store ${id} not found`);
    updated.dataStores.splice(idx, 1);
    await this.configService.write(updated);
    this.stateStoreService.clearStore(id);
  }

  @Get(':id/records')
  getRecords(@Param('id') id: string): DataStoreRecordDto[] {
    this.findOrThrow(id);
    return Object.entries(this.stateStoreService.list(id)).map(([key, value]) => ({ key, value }));
  }

  @Delete(':id/records')
  clearRecords(@Param('id') id: string): void {
    this.findOrThrow(id);
    this.stateStoreService.clearStore(id);
  }

  @Delete(':id/records/:key')
  deleteRecord(@Param('id') id: string, @Param('key') key: string): void {
    this.findOrThrow(id);
    this.stateStoreService.delete(id, key);
  }

  @Post(':id/seed')
  async saveAsSeed(@Param('id') id: string): Promise<DataStoreDto> {
    const config = this.configService.getCurrent()!;
    const updated: Config = JSON.parse(JSON.stringify(config));
    const idx = updated.dataStores?.findIndex(s => s.id === id) ?? -1;
    if (idx === -1) throw new NotFoundException(`Data store ${id} not found`);
    updated.dataStores[idx].seedRecords = this.stateStoreService.list(id);
    await this.configService.write(updated);
    return this.toDto(updated.dataStores[idx]);
  }

  @Post(':id/records/reset')
  resetToSeed(@Param('id') id: string): void {
    const store = this.findOrThrow(id);
    this.stateStoreService.resetToSeed(id, store.seedRecords);
  }
}
