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
import type {
  Config,
  ModuleConfig,
  ModuleDto,
  TestConnectionResultDto,
  KafkaModuleConfig,
  TemplateContext,
} from '@mockingbird/shared-types';
import { ConfigService } from '../config/config.service';
import { ModuleRegistryService } from '../module-registry/module-registry.service';
import { KafkaListenerService } from '../kafka-listener/kafka-listener.service';
import { TemplateService } from '../workflow/template.service';
import { CreateModuleBodyDto, UpdateModuleBodyDto } from './dto';

@Controller('modules')
export class ModulesController {
  constructor(
    private readonly configService: ConfigService,
    private readonly moduleRegistry: ModuleRegistryService,
    private readonly kafkaListener: KafkaListenerService,
    private readonly templateService: TemplateService,
  ) {}

  private toDto(mod: ModuleConfig, config: Config): ModuleDto {
    const cached = this.moduleRegistry.getCachedHealth(mod.id);
    const health = cached
      ? cached.healthy
        ? 'healthy'
        : 'unhealthy'
      : 'unchecked';

    let usedByCount = 0;
    for (const svc of config.services) {
      for (const ep of svc.endpoints) {
        for (const stmt of ep.statements ?? []) {
          for (const action of stmt.workflow ?? []) {
            if (action.module === mod.id) usedByCount++;
          }
        }
      }
    }

    return { ...mod, health, usedByCount };
  }

  @Get()
  getAll(): ModuleDto[] {
    const config = this.configService.getCurrent()!;
    return (config.modules ?? []).map(m => this.toDto(m, config));
  }

  @Post()
  async create(@Body() dto: CreateModuleBodyDto): Promise<ModuleDto> {
    const config = this.configService.getCurrent()!;
    const updated: Config = JSON.parse(JSON.stringify(config));
    const mod: ModuleConfig = {
      id: randomUUID(),
      name: dto.name,
      type: dto.type,
      scope: dto.scope,
      config: dto.config as ModuleConfig['config'],
    };
    if (!updated.modules) updated.modules = [];
    updated.modules.push(mod);
    await this.configService.write(updated);
    try {
      await this.moduleRegistry.configure(mod);
      if (mod.type === 'kafka') await this.kafkaListener.reload(mod);
    } catch {
      // non-fatal: module is saved, just not yet connected
    }
    return this.toDto(mod, updated);
  }

  @Get(':id')
  getOne(@Param('id') id: string): ModuleDto {
    const config = this.configService.getCurrent()!;
    const mod = config.modules?.find(m => m.id === id);
    if (!mod) throw new NotFoundException(`Module ${id} not found`);
    return this.toDto(mod, config);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateModuleBodyDto): Promise<ModuleDto> {
    const config = this.configService.getCurrent()!;
    const updated: Config = JSON.parse(JSON.stringify(config));
    const idx = updated.modules?.findIndex(m => m.id === id) ?? -1;
    if (idx === -1) throw new NotFoundException(`Module ${id} not found`);
    if (dto.config !== undefined) {
      updated.modules[idx] = {
        ...updated.modules[idx],
        ...dto,
        config: dto.config as ModuleConfig['config'],
      };
    } else {
      updated.modules[idx] = { ...updated.modules[idx], ...dto };
    }
    await this.configService.write(updated);
    try {
      await this.moduleRegistry.configure(updated.modules[idx]);
      if (updated.modules[idx].type === 'kafka') await this.kafkaListener.reload(updated.modules[idx]);
    } catch {
      // non-fatal
    }
    return this.toDto(updated.modules[idx], updated);
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<void> {
    const config = this.configService.getCurrent()!;
    const updated: Config = JSON.parse(JSON.stringify(config));
    const idx = updated.modules?.findIndex(m => m.id === id) ?? -1;
    if (idx === -1) throw new NotFoundException(`Module ${id} not found`);
    updated.modules.splice(idx, 1);
    await this.configService.write(updated);
    await this.kafkaListener.stop(id);
  }

  @Get(':id/health')
  async getHealth(@Param('id') id: string): Promise<TestConnectionResultDto> {
    const config = this.configService.getCurrent()!;
    const mod = config.modules?.find(m => m.id === id);
    if (!mod) throw new NotFoundException(`Module ${id} not found`);

    // Return cached result if available
    const cached = this.moduleRegistry.getCachedHealth(id);
    if (cached) {
      return {
        success: cached.healthy,
        message: cached.message,
        latencyMs: cached.latencyMs,
      };
    }

    // Run health checks if no cached result
    const results = await this.moduleRegistry.runHealthChecks();
    const result = results[id];
    if (!result) {
      return { success: false, message: 'Module not configured in registry' };
    }
    return {
      success: result.healthy,
      message: result.message,
      latencyMs: result.latencyMs,
    };
  }

  @Post(':id/triggers/:triggerId/fire')
  async fireTrigger(
    @Param('id') id: string,
    @Param('triggerId') triggerId: string,
  ): Promise<TestConnectionResultDto> {
    const config = this.configService.getCurrent()!;
    const mod = config.modules?.find(m => m.id === id);
    if (!mod || mod.type !== 'kafka') throw new NotFoundException(`Kafka module ${id} not found`);

    const trigger = (mod.config as KafkaModuleConfig).triggers?.find(t => t.id === triggerId);
    if (!trigger) throw new NotFoundException(`Trigger ${triggerId} not found`);

    const kafkaMod = this.moduleRegistry.get(id);
    if (!kafkaMod) return { success: false, message: 'Module is not connected' };

    const ctx: TemplateContext = {
      request: {
        method: 'MANUAL', path: '', pathParams: {}, queryParams: {}, headers: {}, body: '', callCount: 0,
      },
      parameterSets: {},
    };

    const start = Date.now();
    try {
      await kafkaMod.execute(
        {
          topic: this.templateService.render(trigger.topic, ctx).output,
          key: this.templateService.render(trigger.key ?? '', ctx).output,
          payload: this.templateService.render(trigger.payload, ctx).output,
        },
        ctx,
      );
      return { success: true, latencyMs: Date.now() - start };
    } catch (e: unknown) {
      return { success: false, message: (e as Error).message };
    }
  }
}
