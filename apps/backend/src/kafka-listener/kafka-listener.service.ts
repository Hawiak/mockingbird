import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Consumer } from 'kafkajs';
import type {
  ModuleConfig,
  KafkaModuleConfig,
  KafkaListener,
  KafkaSimulator,
  RequestContext,
  TemplateContext,
  WorkflowLogEntry,
  LogEntryDto,
} from '@mockingbird/shared-types';
import { ModuleRegistryService } from '../module-registry/module-registry.service';
import { KafkaModuleImpl } from '../module-registry/modules/kafka.module-impl';
import { ConfigService } from '../config/config.service';
import { ConditionService } from '../statement/condition.service';
import { WorkflowExecutorService } from '../workflow/workflow-executor.service';
import { TemplateService } from '../workflow/template.service';
import { resolveResponseNode, flattenWorkflowActions } from '../workflow/response-node-resolver';
import { LogService } from '../log/log.service';
import { LogGateway } from '../log/log.gateway';

/** Sentinel topic name meaning "match every topic on the broker". */
const ALL_TOPICS = '*';
/** Matches any topic except Kafka's own internal ones (e.g. __consumer_offsets). */
const ALL_TOPICS_PATTERN = /^(?!__).*/;

/** Fallback bounds if a simulator is saved without them — 1 msg every 1–5s. */
const DEFAULT_MIN_INTERVAL_MS = 1000;
const DEFAULT_MAX_INTERVAL_MS = 5000;

@Injectable()
export class KafkaListenerService {
  private readonly logger = new Logger(KafkaListenerService.name);
  private readonly consumers = new Map<string, Consumer>();
  private readonly callCounts = new Map<string, number>();
  /** Pending fire timers for simulators, keyed by `${moduleId}:${simulatorId}`. */
  private readonly simulatorTimers = new Map<string, NodeJS.Timeout>();
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
    private readonly workflowExecutor: WorkflowExecutorService,
    private readonly templateService: TemplateService,
    private readonly logService: LogService,
    private readonly logGateway: LogGateway,
  ) {}

  async start(mod: ModuleConfig): Promise<void> {
    await this.stop(mod.id);

    const cfg = mod.config as KafkaModuleConfig;
    const impl = this.moduleRegistry.get(mod.id) as KafkaModuleImpl | undefined;
    if (!impl) return;

    // Simulators are independent of listeners (they produce, not consume) — start them
    // even if this module has no topics to listen on.
    this.startSimulators(mod);

    // An empty topic (e.g. a just-added, not-yet-named row) would otherwise break
    // the whole subscription — Kafka rejects a metadata request that includes one.
    const listeners = (cfg.listeners ?? []).filter(l => l.topic.trim() !== '');
    if (listeners.length === 0) return;

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
    this.stopSimulators(moduleId);
    const consumer = this.consumers.get(moduleId);
    if (!consumer) return;
    try {
      await consumer.disconnect();
    } catch (e: unknown) {
      this.logger.warn(`Failed to disconnect Kafka consumer for module ${moduleId}: ${(e as Error).message}`);
    }
    this.consumers.delete(moduleId);
  }

  // ─── Simulators — self-firing publishers on a randomized schedule ─────────────

  private startSimulators(mod: ModuleConfig): void {
    const cfg = mod.config as KafkaModuleConfig;
    for (const sim of cfg.simulators ?? []) {
      if (!sim.enabled || !sim.topic.trim()) continue;
      this.scheduleNextFire(mod, sim);
    }
  }

  private stopSimulators(moduleId: string): void {
    const prefix = `${moduleId}:`;
    for (const [key, timer] of this.simulatorTimers) {
      if (key.startsWith(prefix)) {
        clearTimeout(timer);
        this.simulatorTimers.delete(key);
      }
    }
  }

  private scheduleNextFire(mod: ModuleConfig, sim: KafkaSimulator): void {
    const key = `${mod.id}:${sim.id}`;
    const timer = setTimeout(() => void this.fireSimulator(mod, sim), this.randomDelayMs(sim));
    timer.unref?.();
    this.simulatorTimers.set(key, timer);
  }

  private randomDelayMs(sim: KafkaSimulator): number {
    const a = sim.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;
    const b = sim.maxIntervalMs ?? DEFAULT_MAX_INTERVAL_MS;
    const lo = Math.max(50, Math.min(a, b));
    const hi = Math.max(lo, Math.max(a, b));
    return lo + Math.random() * (hi - lo);
  }

  private async fireSimulator(mod: ModuleConfig, sim: KafkaSimulator): Promise<void> {
    // Read live config, not the (mod, sim) captured when this loop started, so message
    // block edits are picked up between fires without needing a full module restart.
    const liveMod = this.configService.getCurrent()?.modules?.find(m => m.id === mod.id) ?? mod;
    const liveSim = (liveMod.config as KafkaModuleConfig).simulators?.find(s => s.id === sim.id) ?? sim;
    const cfg = liveMod.config as KafkaModuleConfig;
    const impl = this.moduleRegistry.get(liveMod.id) as KafkaModuleImpl | undefined;
    const pool = (cfg.messageBlocks ?? []).filter(
      b => !liveSim.messageBlockIds?.length || liveSim.messageBlockIds.includes(b.id),
    );

    if (!impl) {
      this.logger.warn(`Kafka simulator "${liveSim.name}" fired but module "${liveMod.name}" is not connected`);
    } else if (pool.length === 0) {
      this.logger.warn(`Kafka simulator "${liveSim.name}" has no message blocks to draw from`);
    } else {
      const block = pool[Math.floor(Math.random() * pool.length)];
      // No inbound request/message — {{uuid}}, {{now}}, {{faker ...}}, {{randomInt ...}},
      // {{autoIncrement ...}} etc. all resolve; {{request.*}} does not.
      const ctx: TemplateContext = {
        request: { method: 'SIMULATOR', path: liveSim.topic, pathParams: {}, queryParams: {}, headers: {}, body: '', callCount: 0 },
        parameterSets: {},
      };
      const payload = this.templateService.render(block.payload, ctx).output;
      const key = this.templateService.render(liveSim.key || block.key || '', ctx).output;
      try {
        await impl.execute({ topic: liveSim.topic, key, payload }, ctx);
        this.logSimulatedFire(liveMod, liveSim, key, payload, true);
      } catch (e: unknown) {
        this.logger.error(`Kafka simulator "${liveSim.name}" failed to publish: ${(e as Error).message}`);
        this.logSimulatedFire(liveMod, liveSim, key, payload, false, (e as Error).message);
      }
    }

    // Pick a fresh random delay and keep going as long as still enabled. A stop()/reload
    // in the meantime already cleared this simulator's timer via clearTimeout, so this
    // check only needs to catch the "disabled but module still running" case.
    if (liveSim.enabled && liveSim.topic.trim()) {
      this.scheduleNextFire(liveMod, liveSim);
    }
  }

  private logSimulatedFire(
    mod: ModuleConfig,
    sim: KafkaSimulator,
    key: string,
    payload: string,
    success: boolean,
    errorMessage?: string,
  ): void {
    const logEntry: LogEntryDto = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      serviceId: mod.id,
      serviceName: mod.name,
      method: 'KAFKA',
      path: sim.topic,
      statusCode: success ? 200 : 500,
      durationMs: 0,
      matched: success,
      request: { headers: { key, simulated: 'true', simulator: sim.name }, query: {}, pathParams: {}, body: payload },
      response: { headers: {}, body: errorMessage ?? '' },
      workflowLog: [],
    };
    this.logService.add(logEntry);
    this.logGateway.broadcast(logEntry);
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

    if (liveListener?.responseNode && liveConfig) {
      const resolved = resolveResponseNode(liveListener.responseNode, ctx, liveConfig, this.conditionService);
      if (resolved) {
        const actions = flattenWorkflowActions(resolved, ctx, this.conditionService);
        matched = actions.length > 0;
        if (actions.length > 0) {
          const paramSets: Record<string, Record<string, string>> = {};
          for (const setId of actions.flatMap(a => a.parameterSets ?? [])) {
            const ps = liveConfig.parameterSets.find(p => p.id === setId);
            if (ps) paramSets[ps.name] = ps.values;
          }
          const templateCtx: TemplateContext = { request: ctx, parameterSets: paramSets };
          try {
            await this.workflowExecutor.executeFireAndForget(actions, templateCtx, workflowLog);
          } catch (e: unknown) {
            this.logger.error(`Kafka listener workflow failed for topic "${msg.topic}": ${(e as Error).message}`);
          }
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
