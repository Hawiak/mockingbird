import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Consumer } from 'kafkajs';
import type {
  ModuleConfig,
  KafkaModuleConfig,
  KafkaListener,
  RequestContext,
  TemplateContext,
  WorkflowLogEntry,
  LogEntryDto,
} from '@mockingbird/shared-types';
import { ModuleRegistryService } from '../module-registry/module-registry.service';
import { KafkaModuleImpl } from '../module-registry/modules/kafka.module-impl';
import { ConfigService } from '../config/config.service';
import { StatementMatcherService } from '../statement/statement-matcher.service';
import { WorkflowExecutorService } from '../workflow/workflow-executor.service';
import { LogService } from '../log/log.service';
import { LogGateway } from '../log/log.gateway';

@Injectable()
export class KafkaListenerService {
  private readonly logger = new Logger(KafkaListenerService.name);
  private readonly consumers = new Map<string, Consumer>();
  private readonly callCounts = new Map<string, number>();

  constructor(
    private readonly moduleRegistry: ModuleRegistryService,
    private readonly configService: ConfigService,
    private readonly statementMatcher: StatementMatcherService,
    private readonly workflowExecutor: WorkflowExecutorService,
    private readonly logService: LogService,
    private readonly logGateway: LogGateway,
  ) {}

  async start(mod: ModuleConfig): Promise<void> {
    await this.stop(mod.id);

    const cfg = mod.config as KafkaModuleConfig;
    const listeners = cfg.listeners ?? [];
    if (listeners.length === 0) return;

    const impl = this.moduleRegistry.get(mod.id) as KafkaModuleImpl | undefined;
    if (!impl) return;

    const groupId = cfg.groupId || `mockingbird-${mod.id}`;
    const topics = listeners.map(l => l.topic);

    const consumer = await impl.subscribe(topics, groupId, async (msg) => {
      const listener = listeners.find(l => l.topic === msg.topic);
      if (listener) await this.handleMessage(mod, listener, msg);
    });

    this.consumers.set(mod.id, consumer);
    this.logger.log(`Kafka module "${mod.name}" listening on topics: ${topics.join(', ')}`);
  }

  async stop(moduleId: string): Promise<void> {
    const consumer = this.consumers.get(moduleId);
    if (!consumer) return;
    try {
      await consumer.disconnect();
    } catch (e: unknown) {
      this.logger.warn(`Failed to disconnect Kafka consumer for module ${moduleId}: ${(e as Error).message}`);
    }
    this.consumers.delete(moduleId);
  }

  async reload(mod: ModuleConfig): Promise<void> {
    if (mod.type !== 'kafka') {
      await this.stop(mod.id);
      return;
    }
    await this.start(mod);
  }

  private async handleMessage(
    mod: ModuleConfig,
    listener: KafkaListener,
    msg: { topic: string; key: string | null; value: string; headers: Record<string, string> },
  ): Promise<void> {
    const start = Date.now();
    const ctx: RequestContext = {
      method: 'KAFKA',
      path: msg.topic,
      pathParams: {},
      queryParams: {},
      headers: { ...msg.headers, key: msg.key ?? '' },
      body: msg.value,
      callCount: this.incrementCallCount(mod.id, msg.topic),
    };

    // Read live listener statements from current config, not the closure, so edits
    // made after the consumer started are picked up without a restart.
    const liveConfig = this.configService.getCurrent();
    const liveMod = liveConfig?.modules?.find(m => m.id === mod.id);
    const liveListener = (liveMod?.config as KafkaModuleConfig | undefined)?.listeners?.find(
      l => l.id === listener.id,
    );
    const statements = liveListener?.statements ?? [];

    const matched = this.statementMatcher.match(statements, ctx);
    const workflowLog: WorkflowLogEntry[] = [];

    if (matched) {
      const paramSets: Record<string, Record<string, string>> = {};
      for (const setId of matched.workflow.flatMap(a => a.parameterSets ?? [])) {
        const ps = liveConfig?.parameterSets.find(p => p.id === setId);
        if (ps) paramSets[ps.name] = ps.values;
      }
      const templateCtx: TemplateContext = { request: ctx, parameterSets: paramSets };
      try {
        await this.workflowExecutor.executeFireAndForget(matched.workflow, templateCtx, workflowLog);
      } catch (e: unknown) {
        this.logger.error(`Kafka listener workflow failed for topic "${msg.topic}": ${(e as Error).message}`);
      }
    }

    const logEntry: LogEntryDto = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      serviceId: mod.id,
      serviceName: mod.name,
      method: 'KAFKA',
      path: msg.topic,
      statusCode: matched ? 200 : 204,
      durationMs: Date.now() - start,
      matched: matched !== null,
      statementId: matched?.id,
      statementName: matched?.name,
      request: {
        headers: ctx.headers,
        query: {},
        pathParams: {},
        body: msg.value,
      },
      response: { headers: {}, body: '' },
      workflowLog,
    };
    this.logService.add(logEntry);
    this.logGateway.broadcast(logEntry);
  }

  private incrementCallCount(moduleId: string, topic: string): number {
    const key = `${moduleId}:${topic}`;
    const count = (this.callCounts.get(key) ?? 0) + 1;
    this.callCounts.set(key, count);
    return count;
  }
}
