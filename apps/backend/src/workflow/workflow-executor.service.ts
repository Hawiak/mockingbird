import { Injectable, Logger, Optional } from '@nestjs/common';
import { Request, Response } from 'express';
import type { WorkflowAction, TemplateContext, ResponseBlock, WorkflowLogEntry } from '@mockingbird/shared-types';
import { TemplateService } from './template.service';
import { executeRespond } from './actions/respond.action';
import { executeDelay } from './actions/delay.action';
import { executeLog } from './actions/log.action';
import { executeProxy } from './actions/proxy.action';
import { ModuleRegistryService } from '../module-registry/module-registry.service';

@Injectable()
export class WorkflowExecutorService {
  private readonly logger = new Logger(WorkflowExecutorService.name);

  constructor(
    private readonly templateService: TemplateService,
    @Optional() private readonly moduleRegistry?: ModuleRegistryService,
  ) {}

  async execute(
    workflow: WorkflowAction[],
    ctx: TemplateContext,
    req: Request,
    res: Response,
    responseBlocks: ResponseBlock[],
    workflowLog: WorkflowLogEntry[],
  ): Promise<void> {
    // Find the sync/async boundary (index of respond or proxy)
    const boundaryIdx = workflow.findIndex(
      a => a.action === 'respond' || a.action === 'proxy',
    );

    if (boundaryIdx === -1) {
      // No respond/proxy — fall through to default (caller handles default response)
      this.logger.warn(
        'Workflow has no respond/proxy action — falling through to default response',
      );
      return;
    }

    // Execute sync actions (before respond/proxy)
    for (const action of workflow.slice(0, boundaryIdx)) {
      const entry = await this.runAction(action, ctx, req, res, responseBlocks);
      if (entry) workflowLog.push(entry);
    }

    // Execute the respond/proxy action
    const boundaryAction = workflow[boundaryIdx];
    const boundaryStart = Date.now();

    if (boundaryAction.action === 'respond') {
      const result = await executeRespond(
        boundaryAction,
        ctx,
        res,
        responseBlocks,
        this.templateService,
      );
      ctx.response = result.response;
      workflowLog.push({
        action: 'respond',
        status: 'ok',
        durationMs: Date.now() - boundaryStart,
      });
    } else {
      const responseContext = await executeProxy(boundaryAction, ctx, req, res);
      ctx.response = responseContext;
      workflowLog.push({
        action: 'proxy',
        status: 'ok',
        durationMs: Date.now() - boundaryStart,
      });
    }

    // Fire async actions detached (do not block response)
    const asyncActions = workflow.slice(boundaryIdx + 1);
    if (asyncActions.length > 0) {
      Promise.resolve()
        .then(async () => {
          for (const action of asyncActions) {
            const entry = await this.runAction(
              action,
              ctx,
              req,
              res,
              responseBlocks,
            );
            if (entry) workflowLog.push(entry);
          }
        })
        .catch((e: Error) =>
          this.logger.error(`Async workflow action failed: ${e.message}`),
        );
    }
  }

  private async runAction(
    action: WorkflowAction,
    ctx: TemplateContext,
    _req: Request,
    _res: Response,
    _responseBlocks: ResponseBlock[],
  ): Promise<WorkflowLogEntry | null> {
    const start = Date.now();
    try {
      switch (action.action) {
        case 'delay':
          await executeDelay(action.ms ?? 0);
          return { action: 'delay', status: 'ok', durationMs: Date.now() - start };
        case 'log':
          return await executeLog(action, ctx, this.templateService);
        case 'kafka_publish': {
          if (!this.moduleRegistry) throw new Error('ModuleRegistry not available');
          const kafkaMod = this.moduleRegistry.get(action.module!);
          if (!kafkaMod) throw new Error(`Module "${action.module}" not found`);
          const kafkaParams = {
            topic: action.topic ?? '',
            key: action.key ?? '',
            payload: this.templateService.render(action.payload ?? '', ctx).output,
          };
          await kafkaMod.execute(kafkaParams, ctx);
          return { action: 'kafka_publish', status: 'ok', durationMs: Date.now() - start };
        }
        case 'http_request': {
          if (!this.moduleRegistry) throw new Error('ModuleRegistry not available');
          const httpMod = this.moduleRegistry.get(action.module!);
          if (!httpMod) throw new Error(`Module "${action.module}" not found`);
          const httpParams = {
            method: action.method ?? 'POST',
            url: action.url ?? '/',
            headers: JSON.stringify(action.requestHeaders ?? {}),
            body: this.templateService.render(action.requestBody ?? '', ctx).output,
          };
          await httpMod.execute(httpParams, ctx);
          return { action: 'http_request', status: 'ok', durationMs: Date.now() - start };
        }
        default:
          return null;
      }
    } catch (e: unknown) {
      const err = e as Error;
      this.logger.error(`Action ${action.action} failed: ${err.message}`);
      return {
        action: action.action,
        status: 'error',
        message: err.message,
        durationMs: Date.now() - start,
      };
    }
  }
}
