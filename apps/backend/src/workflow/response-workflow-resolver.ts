import type {
  ResponseWorkflow,
  RequestContext,
  Config,
  WorkflowAction,
} from '@mockingbird/shared-types';
import { ConditionService } from '../statement/condition.service';

/**
 * Orders a response workflow's steps, filters to the ones whose condition
 * currently passes, and translates them into WorkflowAction[] ready for the
 * workflow executor. Shared between the HTTP mock server and the Kafka
 * listener so both trigger sources produce identical action semantics from
 * the same workflow definition.
 */
export function resolveWorkflowActions(
  workflow: ResponseWorkflow,
  ctx: RequestContext,
  config: Config,
  conditionService: ConditionService,
): WorkflowAction[] {
  const orderedSteps = [...workflow.steps].sort((a, b) => a.order - b.order);
  const activeSteps = orderedSteps.filter(step => {
    if (step.conditionId) {
      const saved = config.savedConditions?.find(c => c.id === step.conditionId);
      return saved ? conditionService.evaluate(saved.condition, ctx) : true;
    }
    if (step.condition) {
      return conditionService.evaluate(step.condition, ctx);
    }
    return true;
  });

  return activeSteps.map((step): WorkflowAction => {
    if (step.type === 'return_response') {
      return { action: 'respond', mode: 'block', responseBlockId: step.responseBlockId };
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
