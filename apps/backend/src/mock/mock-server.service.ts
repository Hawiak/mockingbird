import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import express from 'express';
import * as http from 'http';
import type {
  Service,
  ParsedSpec,
  Config,
  RequestContext,
  TemplateContext,
  Statement,
  WorkflowLogEntry,
  LogEntryDto,
} from '@mockingbird/shared-types';
import { ConfigService } from '../config/config.service';
import { ConfigWatcherService } from '../config/config-watcher.service';
import { ConditionService } from '../statement/condition.service';
import { StatementMatcherService } from '../statement/statement-matcher.service';
import { WorkflowExecutorService } from '../workflow/workflow-executor.service';
import { TemplateService } from '../workflow/template.service';
import { LogService } from '../log/log.service';
import { LogGateway } from '../log/log.gateway';
import { createCorsMiddleware } from './cors.middleware';

@Injectable()
export class MockServerService implements OnModuleInit {
  private readonly logger = new Logger(MockServerService.name);
  private readonly servers = new Map<string, http.Server>();
  private readonly callCounts = new Map<string, number>();

  constructor(
    private readonly configWatcher: ConfigWatcherService,
    private readonly configService: ConfigService,
    private readonly conditionService: ConditionService,
    private readonly statementMatcher: StatementMatcherService,
    private readonly workflowExecutor: WorkflowExecutorService,
    private readonly templateService: TemplateService,
    private readonly logService: LogService,
    private readonly logGateway: LogGateway,
  ) {}

  onModuleInit(): void {
    this.configWatcher.changes.subscribe(({ old: oldConfig, new: newConfig }) => {
      void this.handleConfigChange(oldConfig, newConfig);
    });
  }

  async start(service: Service, spec: ParsedSpec): Promise<void> {
    if (this.servers.has(service.id)) {
      await this.stop(service.id);
    }

    const app = express();
    app.use(express.json());
    app.use(express.text({ type: '*/*' }));

    // Apply CORS middleware
    app.use(createCorsMiddleware(service.cors ?? { enabled: true }));

    // Register routes for each endpoint in the spec
    for (const endpoint of spec.endpoints) {
      const method = endpoint.method.toLowerCase() as keyof express.Application;
      if (typeof app[method] !== 'function') continue;

      // Capture values for closure
      const capturedService = service;
      const capturedEndpoint = endpoint;

      (app[method] as express.IRouterMatcher<express.Application>)(
        endpoint.path,
        async (req: express.Request, res: express.Response) => {
          const start = Date.now();

          const ctx: RequestContext = {
            method: req.method,
            path: req.path,
            pathParams: req.params as Record<string, string>,
            queryParams: req.query as Record<string, string>,
            headers: req.headers as Record<string, string>,
            body: typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? ''),
            callCount: this.incrementCallCount(capturedService.id, capturedEndpoint.path, capturedEndpoint.method),
          };

          // Get the live endpoint from current config (not the stale closure)
          const liveConfig = this.configService.getCurrent()!;
          const liveSvc = liveConfig.services.find(s => s.id === capturedService.id);
          const liveEndpoint = liveSvc?.endpoints.find(
            e =>
              e.method.toUpperCase() === capturedEndpoint.method.toUpperCase() &&
              e.path === capturedEndpoint.path,
          );

          // Intercept res.send to capture what was actually returned
          let capturedBody = '';
          let capturedResHeaders: Record<string, string> = {};
          const origSend = res.send.bind(res) as (body?: unknown) => express.Response;
          (res as express.Response & { send: unknown }).send = function (body?: unknown) {
            capturedBody =
              typeof body === 'string' ? body
              : Buffer.isBuffer(body) ? body.toString()
              : body != null ? JSON.stringify(body)
              : '';
            for (const [k, v] of Object.entries(res.getHeaders())) {
              capturedResHeaders[k.toLowerCase()] = String(v);
            }
            return origSend(body);
          };

          const workflowLog: WorkflowLogEntry[] = [];
          let matchedStatement: Statement | null = null;

          if (liveEndpoint?.disabled) {
            res.status(404).json({ error: 'Endpoint disabled' });
          } else if (liveEndpoint?.workflowId) {
            const wf = liveConfig.responseWorkflows?.find(w => w.id === liveEndpoint!.workflowId);
            if (wf) {
              const orderedSteps = [...wf.steps].sort((a, b) => a.order - b.order);
              const activeSteps = orderedSteps.filter(step => {
                if (step.conditionId) {
                  const saved = liveConfig.savedConditions?.find(c => c.id === step.conditionId);
                  return saved ? this.conditionService.evaluate(saved.condition, ctx) : true;
                }
                if (step.condition) {
                  return this.conditionService.evaluate(step.condition, ctx);
                }
                return true;
              });

              // Translate steps to WorkflowAction[]
              const actions: import('@mockingbird/shared-types').WorkflowAction[] = activeSteps.map(step => {
                if (step.type === 'return_response') {
                  return { action: 'respond' as const, mode: 'block' as const, responseBlockId: step.responseBlockId };
                }
                // use_module_action — determine type from module config
                const mod = liveConfig.modules?.find(m => m.id === step.moduleId);
                if (mod?.type === 'kafka') {
                  return {
                    action: 'kafka_publish' as const,
                    module: step.moduleId,
                    topic: step.kafkaTopic ?? '',
                    key: step.kafkaKey ?? '',
                    payload: step.kafkaPayload ?? '',
                  };
                }
                return {
                  action: 'http_request' as const,
                  module: step.moduleId,
                  method: step.httpMethod ?? 'POST',
                  url: step.httpUrl ?? '/',
                  requestHeaders: step.httpHeaders,
                  requestBody: step.httpBody ?? '',
                };
              });

              const paramSets: Record<string, Record<string, string>> = {};
              const tplCtx: import('@mockingbird/shared-types').TemplateContext = {
                request: ctx,
                parameterSets: paramSets,
              };

              if (actions.length > 0) {
                await this.workflowExecutor.execute(
                  actions, tplCtx, req, res, liveConfig.responseBlocks ?? [], workflowLog,
                );
              } else {
                // No matching steps — 200 empty fallback
                res.status(200).json({});
              }
            } else {
              res.status(404).json({ error: 'Workflow not found' });
            }
          } else if (liveEndpoint && liveEndpoint.statements?.length) {
            matchedStatement = this.statementMatcher.match(liveEndpoint.statements, ctx);
          }

          if (matchedStatement) {
            // Build parameter sets context
            const paramSets: Record<string, Record<string, string>> = {};
            for (const setId of matchedStatement.workflow.flatMap(a => a.parameterSets ?? [])) {
              const ps = liveConfig.parameterSets.find(p => p.id === setId);
              if (ps) paramSets[ps.name] = ps.values;
            }

            const templateCtx: TemplateContext = { request: ctx, parameterSets: paramSets };

            await this.workflowExecutor.execute(
              matchedStatement.workflow,
              templateCtx,
              req,
              res,
              liveConfig.responseBlocks,
              workflowLog,
            );
          }

          // If no response was sent (no match, or workflow had no respond/proxy), serve default
          if (!res.headersSent) {
            const defaultBlockId = liveEndpoint?.defaultResponseBlockId;
            const defaultBlock = defaultBlockId
              ? (liveConfig.responseBlocks ?? []).find(b => b.id === defaultBlockId)
              : undefined;
            if (!defaultBlock && defaultBlockId) {
              this.logger.warn(
                `[default] ${capturedEndpoint.method}:${capturedEndpoint.path} ` +
                `blockId=${defaultBlockId} not found — falling back to spec default`,
              );
            }
            // Build template context for default block rendering
            const defaultTemplateCtx: TemplateContext = {
              request: ctx,
              parameterSets: {},
            };
            if (defaultBlock) {
              for (const [k, v] of Object.entries(defaultBlock.headers)) res.setHeader(k, v);
              const body = this.templateService.render(defaultBlock.body ?? '', defaultTemplateCtx).output;
              res.status(defaultBlock.statusCode).send(body);
            } else {
              for (const [k, v] of Object.entries(capturedEndpoint.defaultHeaders)) res.setHeader(k, v);
              const body = this.templateService.render(capturedEndpoint.defaultBody ?? '', defaultTemplateCtx).output;
              res.status(capturedEndpoint.defaultStatusCode).send(body);
            }
          }

          // Log the request
          const logEntry: LogEntryDto = {
            id: randomUUID(),
            timestamp: new Date().toISOString(),
            serviceId: capturedService.id,
            serviceName: capturedService.name,
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            durationMs: Date.now() - start,
            matched: matchedStatement !== null,
            statementId: matchedStatement?.id,
            statementName: matchedStatement?.name,
            request: {
              headers: req.headers as Record<string, string>,
              query: req.query as Record<string, string>,
              pathParams: req.params as Record<string, string>,
              body: typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? ''),
            },
            response: { headers: capturedResHeaders, body: capturedBody },
            workflowLog,
          };
          this.logService.add(logEntry);
          this.logGateway.broadcast(logEntry);
        },
      );
    }

    // 404 fallback for unregistered routes
    app.use((_req: express.Request, res: express.Response) => {
      res.status(404).json({ error: 'Not Found' });
    });

    const server = http.createServer(app);

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(service.port, () => {
        this.logger.log(`Mock server for "${service.name}" listening on port ${service.port}`);
        resolve();
      });
    });

    this.servers.set(service.id, server);
  }

  async stop(serviceId: string): Promise<void> {
    const server = this.servers.get(serviceId);
    if (!server) return;

    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    this.servers.delete(serviceId);
    this.logger.log(`Mock server ${serviceId} stopped`);
  }

  async reload(service: Service, spec: ParsedSpec): Promise<void> {
    await this.stop(service.id);
    await this.start(service, spec);
  }

  isRunning(serviceId: string): boolean {
    return this.servers.has(serviceId);
  }

  getCallCount(serviceId: string, path: string, method: string): number {
    return this.callCounts.get(`${serviceId}:${method}:${path}`) ?? 0;
  }

  private incrementCallCount(serviceId: string, path: string, method: string): number {
    const key = `${serviceId}:${method}:${path}`;
    const count = (this.callCounts.get(key) ?? 0) + 1;
    this.callCounts.set(key, count);
    return count;
  }

  private toRouteSet(svc: Service): Set<string> {
    return new Set((svc.endpoints ?? []).map(e => `${e.method.toUpperCase()}:${e.path}`));
  }

  private async handleConfigChange(oldConfig: Config, newConfig: Config): Promise<void> {
    for (const newSvc of newConfig.services) {
      const oldSvc = oldConfig.services.find(s => s.id === newSvc.id);
      if (!oldSvc) continue;

      const portChanged = oldSvc.port !== newSvc.port;

      // Statements are read live at request time — only stop if routes (method+path) change
      const oldRoutes = this.toRouteSet(oldSvc);
      const newRoutes = this.toRouteSet(newSvc);
      const routesChanged =
        oldRoutes.size !== newRoutes.size ||
        [...oldRoutes].some(r => !newRoutes.has(r)) ||
        [...newRoutes].some(r => !oldRoutes.has(r));

      if (portChanged || routesChanged) {
        this.logger.log(`Service ${newSvc.id}: routes or port changed, stopping server`);
        await this.stop(newSvc.id);
      }
    }

    // Stop removed services
    for (const oldSvc of oldConfig.services) {
      if (!newConfig.services.find(s => s.id === oldSvc.id)) {
        await this.stop(oldSvc.id);
      }
    }
  }
}
