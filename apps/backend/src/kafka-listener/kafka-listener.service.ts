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
import { ConditionService } from '../statement/condition.service';
import { StatementMatcherService } from '../statement/statement-matcher.service';
import { WorkflowExecutorService } from '../workflow/workflow-executor.service';
import { resolveWorkflowActions } from '../workflow/response-workflow-resolver';
import { LogService } from '../log/log.service';
import { LogGateway } from '../log/log.gateway';

/** Sentinel topic name meaning "match every topic on the broker". */
const ALL_TOPICS = '*';
/** Matches any topic except Kafka's own internal ones (e.g. __consumer_offsets). */
const ALL_TOPICS_PATTERN = /^(?!__).*/;

@Injectable()
export class KafkaListenerService {
  private readonly logger = new Logger(KafkaListenerService.name);
  private readonly consumers = new Map<string, Consumer>();
  private readonly callCounts = new Map<string, number>();
  /**
   * Config saves trigger reload() from two independent places (the API
   * controller directly, and the config-file watcher reacting to that same
   * write) — without serializing, their start()/stop() calls can interleave
   * and leave an orphaned, untracked consumer still holding partitions in
   * the group. Chaining onto this per-module promise forces reloads to run
   * one at a time.
   */
  private readonly reloadChains = new Map<string, Promise<void>>();

  constructor(
    private readonly moduleRegistry: ModuleRegistryService,
    private readonly configService: ConfigService,
    private readonly conditionService: ConditionService,
    private readonly statementMatcher: StatementMatcherService,
    private readonly workflowExecutor: WorkflowExecutorService,
    private readonly logService: LogService,
    private readonly logGateway: LogGateway,
  ) {}

  async start(mod: ModuleConfig): Promise<void> {
    await this.stop(mod.id);

    const cfg = mod.config as KafkaModuleConfig;
    // An empty topic (e.g. a just-added, not-yet-named row) would otherwise break
    // the whole subscription — Kafka rejects a metadata request that includes one.
    const listeners = (cfg.listeners ?? []).filter(l => l.topic.trim() !== '');
    if (listeners.length === 0) return;

    const impl = this.moduleRegistry.get(mod.id) as KafkaModuleImpl | undefined;
    if (!impl) return;

    const groupId = cfg.groupId || `mockingbird-${mod.id}`;
    const topics = listeners.map(l => (l.topic === ALL_TOPICS ? ALL_TOPICS_PATTERN : l.topic));

    const consumer = await impl.subscribe(topics, groupId, async (msg) => {
      // Exact-topic listeners take priority over a "*" catch-all in the same module.
      const listener =
        listeners.find(l => l.topic === msg.topic) ?? listeners.find(l => l.topic === ALL_TOPICS);
      if (listener) await this.handleMessage(mod, listener, msg);
    });

    this.consumers.set(mod.id, consumer);
    this.logger.log(
      `Kafka module "${mod.name}" listening on topics: ${listeners.map(l => l.topic).join(', ')}`,
    );
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
    return this.serialize(mod.id, () => this.doReload(mod));
  }

  /** Like stop(), but serialized against any in-flight reload for this module (e.g. from module deletion). */
  async stopSerialized(moduleId: string): Promise<void> {
    return this.serialize(moduleId, () => this.stop(moduleId));
  }

  private serialize(moduleId: string, fn: () => Promise<void>): Promise<void> {
    const prior = this.reloadChains.get(moduleId) ?? Promise.resolve();
    const chained = prior.then(fn);
    // Swallow so a failed run doesn't poison the chain for the next caller —
    // the real error still propagates to whoever awaited `chained` below.
    this.reloadChains.set(moduleId, chained.catch(() => undefined));
    return chained;
  }

  private async doReload(mod: ModuleConfig): Promise<void> {
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
      headers: { ...msg.headers, key: msg.key ?? '', topic: msg.topic },
      body: msg.value,
      callCount: this.incrementCallCount(mod.id, msg.topic),
    };

    // Read live listener config from current config, not the closure, so edits
    // made after the consumer started are picked up without a restart.
    const liveConfig = this.configService.getCurrent();
    const liveMod = liveConfig?.modules?.find(m => m.id === mod.id);
    const liveListener = (liveMod?.config as KafkaModuleConfig | undefined)?.listeners?.find(
      l => l.id === listener.id,
    );

    const workflowLog: WorkflowLogEntry[] = [];
    let matched = false;
    let matchedId: string | undefined;
    let matchedName: string | undefined;

    if (liveListener?.workflowId && liveConfig) {
      // Triggered by a shared Response Workflow instead of this listener's own statements.
      const wf = liveConfig.responseWorkflows?.find(w => w.id === liveListener.workflowId);
      if (wf) {
        const actions = resolveWorkflowActions(wf, ctx, liveConfig, this.conditionService);
        matched = actions.length > 0;
        matchedId = wf.id;
        matchedName = wf.name;
        if (actions.length > 0) {
          const templateCtx: TemplateContext = { request: ctx, parameterSets: {} };
          try {
            await this.workflowExecutor.executeFireAndForget(actions, templateCtx, workflowLog);
          } catch (e: unknown) {
            this.logger.error(`Kafka listener workflow failed for topic "${msg.topic}": ${(e as Error).message}`);
          }
        }
      } else {
        this.logger.warn(`Kafka listener workflow "${liveListener.workflowId}" not found`);
      }
    } else {
      const statements = liveListener?.statements ?? [];
      const matchedStatement = this.statementMatcher.match(statements, ctx);
      matched = matchedStatement !== null;
      matchedId = matchedStatement?.id;
      matchedName = matchedStatement?.name;

      if (matchedStatement) {
        const paramSets: Record<string, Record<string, string>> = {};
        for (const setId of matchedStatement.workflow.flatMap(a => a.parameterSets ?? [])) {
          const ps = liveConfig?.parameterSets.find(p => p.id === setId);
          if (ps) paramSets[ps.name] = ps.values;
        }
        const templateCtx: TemplateContext = { request: ctx, parameterSets: paramSets };
        try {
          await this.workflowExecutor.executeFireAndForget(matchedStatement.workflow, templateCtx, workflowLog);
        } catch (e: unknown) {
          this.logger.error(`Kafka listener workflow failed for topic "${msg.topic}": ${(e as Error).message}`);
        }
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
      matched,
      statementId: matchedId,
      statementName: matchedName,
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
