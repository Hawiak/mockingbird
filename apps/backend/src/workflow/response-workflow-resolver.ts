import type {
  ResponseWorkflow,
  ResponseWorkflowStep,
  RequestContext,
  Config,
  WorkflowAction,
} from '@mockingbird/shared-types';
import { ConditionService } from '../statement/condition.service';

/**
 * Substitutes every `$param.<name>` token found anywhere in the steps — in
 * structural fields (e.g. a step's `store` id) and inside template strings
 * alike (e.g. `storeKey: "{{request.path_param.$param.key}}"`) — with the
 * bound value for that parameter. Runs once per resolution, before condition
 * evaluation, so a substituted `$param.entity` inside `step.condition` is
 * already a literal value by the time ConditionService sees it. Deliberately
 * a separate, dumb string-replace pass rather than a change to the template
 * engine — it only ever produces literal text that the existing `{{...}}`
 * engine already knows how to render.
 */
function substituteParams(
  steps: ResponseWorkflowStep[],
  params: Record<string, string>,
): ResponseWorkflowStep[] {
  if (Object.keys(params).length === 0) return steps;
  const json = JSON.stringify(steps).replace(
    /\$param\.(\w+)/g,
    (_, name: string) => params[name] ?? '',
  );
  return JSON.parse(json) as ResponseWorkflowStep[];
}

/**
 * Orders a response workflow's steps, filters to the ones whose condition
 * currently passes, and translates them into WorkflowAction[] ready for the
 * workflow executor. Shared between the HTTP mock server and the Kafka
 * listener so both trigger sources produce identical action semantics from
 * the same workflow definition.
 *
 * `if_else`/`switch` steps are translated into the corresponding WorkflowAction
 * branch node (their nested step arrays resolved recursively through this same
 * function) rather than resolved here — the actual branch selection happens
 * once, uniformly, in flattenWorkflowActions() right before execution.
 */
export function resolveWorkflowActions(
  workflow: ResponseWorkflow,
  ctx: RequestContext,
  config: Config,
  conditionService: ConditionService,
  params: Record<string, string> = {},
): WorkflowAction[] {
  const substitutedSteps = substituteParams(workflow.steps, params);
  return resolveSteps(substitutedSteps, ctx, config, conditionService);
}

function resolveSteps(
  steps: ResponseWorkflowStep[],
  ctx: RequestContext,
  config: Config,
  conditionService: ConditionService,
): WorkflowAction[] {
  const orderedSteps = [...steps].sort((a, b) => a.order - b.order);
  const activeSteps = orderedSteps.filter(step => {
    if (step.conditionId) {
      const saved = config.savedConditions?.find(c => c.id === step.conditionId);
      return saved ? conditionService.evaluate(saved.condition, ctx) : true;
    }
    // if_else's `condition` selects its branch (in flattenWorkflowActions), it's not a skip-gate.
    if (step.condition && step.type !== 'if_else') {
      return conditionService.evaluate(step.condition, ctx);
    }
    return true;
  });

  return activeSteps.map((step): WorkflowAction => {
    if (step.type === 'if_else') {
      return {
        action: 'if_else',
        condition: step.condition,
        then: resolveSteps(step.then ?? [], ctx, config, conditionService),
        else: step.else ? resolveSteps(step.else, ctx, config, conditionService) : undefined,
      };
    }

    if (step.type === 'switch') {
      return {
        action: 'switch',
        cases: (step.cases ?? []).map(c => ({
          id: c.id,
          condition: c.condition,
          actions: resolveSteps(c.steps, ctx, config, conditionService),
        })),
        default: step.default ? resolveSteps(step.default, ctx, config, conditionService) : undefined,
      };
    }

    if (step.type === 'return_response') {
      if (step.responseMode === 'template') {
        return {
          action: 'respond',
          mode: 'template',
          statusCode: step.responseStatusCode ?? 200,
          headers: step.responseHeaders,
          body: step.responseBody ?? '',
        };
      }
      return { action: 'respond', mode: 'block', responseBlockId: step.responseBlockId };
    }

    if (step.type === 'use_data_store') {
      if (step.storeOperation === 'save') {
        return {
          action: 'store_save',
          store: step.store,
          storeKey: step.storeKey ?? '',
          storeKeyMode: step.storeKeyMode ?? 'uuid',
          storeValue: step.storeValue ?? '',
          storeMerge: step.storeMerge ?? false,
          storeTimestamps: step.storeTimestamps ?? false,
        };
      }
      if (step.storeOperation === 'delete') {
        return { action: 'store_delete', store: step.store, storeKey: step.storeKey ?? '' };
      }
      return {
        action: 'store_fetch',
        store: step.store,
        storeFetchMode: step.storeFetchMode ?? 'single',
        storeKey: step.storeKey ?? '',
      };
    }

    // use_module_action — determine type from module config
    const mod = config.modules?.find(m => m.id === step.moduleId);
    if (mod?.type === 'kafka') {
      return {
        action: 'kafka_publish',
        module: step.moduleId,
        topic: step.kafkaTopic ?? '',
        key: step.kafkaKey ?? '',
        payload: step.kafkaPayload ?? '',
      };
    }
    return {
      action: 'http_request',
      module: step.moduleId,
      method: step.httpMethod ?? 'POST',
      url: step.httpUrl ?? '/',
      requestHeaders: step.httpHeaders,
      requestBody: step.httpBody ?? '',
    };
  });
}
