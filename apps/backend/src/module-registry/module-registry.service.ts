import { Injectable, Logger } from '@nestjs/common';
import type { ModuleConfig } from '@mockingbird/shared-types';
import { MockingbirdModule, HealthResult } from './module-registry.interface';
import { KafkaModuleImpl } from './modules/kafka.module-impl';
import { HttpModuleImpl } from './modules/http.module-impl';

@Injectable()
export class ModuleRegistryService {
  private readonly logger = new Logger(ModuleRegistryService.name);
  private readonly registry = new Map<string, MockingbirdModule>();
  private readonly healthCache = new Map<string, HealthResult & { checkedAt: number }>();

  async configure(moduleConfig: ModuleConfig): Promise<void> {
    let impl: MockingbirdModule;
    if (moduleConfig.type === 'kafka') impl = new KafkaModuleImpl();
    else if (moduleConfig.type === 'http') impl = new HttpModuleImpl();
    else throw new Error(`Unknown module type: ${moduleConfig.type}`);
    await impl.configure(moduleConfig.config as Record<string, unknown>);
    this.registry.set(moduleConfig.id, impl);
    this.logger.log(`Module "${moduleConfig.id}" (${moduleConfig.type}) configured`);
  }

  get(id: string): MockingbirdModule | undefined {
    return this.registry.get(id);
  }

  async runHealthChecks(): Promise<Record<string, HealthResult>> {
    const results: Record<string, HealthResult> = {};
    for (const [id, mod] of this.registry) {
      try {
        const result = await Promise.race([
          mod.healthCheck(),
          new Promise<HealthResult>((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), 5000),
          ),
        ]);
        results[id] = result;
      } catch (e: unknown) {
        results[id] = { healthy: false, message: (e as Error).message };
      }
      this.healthCache.set(id, { ...results[id], checkedAt: Date.now() });
    }
    return results;
  }

  getCachedHealth(id: string): (HealthResult & { checkedAt: number }) | undefined {
    return this.healthCache.get(id);
  }

  getAll(): Array<{ id: string; type: string }> {
    return Array.from(this.registry.entries()).map(([id, mod]) => ({ id, type: mod.type }));
  }
}
