import type { ResponseNode, RequestContext, Config, WorkflowAction } from '@mockingbird/shared-types';
import { ConditionService } from '../statement/condition.service';
import { resolveWorkflowActions } from './response-workflow-resolver';

/**
 * Walks a ResponseNode chain (condition + else) and resolves it down to the
 * WorkflowAction[] that should run — or null if nothing in the chain matches
 * (caller falls through to the spec-generated default). Nodes with no
 * `condition` are unconditional and always resolve; chaining conditional
 * nodes via `else` gives switch-like, first-match-wins behavior.
 */
export function resolveResponseNode(
  node: ResponseNode,
  ctx: RequestContext,
  config: Config,
  conditionService: ConditionService,
): WorkflowAction[] | null {
  if (node.condition && !conditionService.evaluate(node.condition, ctx)) {
    return node.else ? resolveResponseNode(node.else, ctx, config, conditionService) : null;
  }

  if (node.kind === 'block') {
    // Sugar for a single-action workflow — reuses the executor's existing 'respond' handling.
    return [
      {
        action: 'respond',
        mode: node.mode ?? 'block',
        responseBlockId: node.responseBlockId,
        statusCode: node.statusCode,
        headers: node.headers,
        body: node.body,
      },
    ];
  }

  if (node.workflowMode === 'named') {
    const wf = config.responseWorkflows?.find(w => w.id === node.workflowId);
    return wf ? resolveWorkflowActions(wf, ctx, config, conditionService, node.workflowParams ?? {}) : null;
  }

  return node.actions ?? [];
}

/**
 * Collapses `if_else`/`switch` branch nodes out of a WorkflowAction[] by
 * evaluating their condition(s) against ctx and recursively flattening the
 * chosen branch in place. The result contains no branch nodes, so
 * WorkflowExecutorService (which only understands a flat action list) needs
 * no changes to support branching — this runs once, right before execution,
 * regardless of whether the actions came from an inline workflow or a
 * resolved named Response Workflow.
 */
export function flattenWorkflowActions(
  actions: WorkflowAction[],
  ctx: RequestContext,
  conditionService: ConditionService,
): WorkflowAction[] {
  const result: WorkflowAction[] = [];
  for (const action of actions) {
    if (action.action === 'if_else') {
      const branch =
        action.condition && conditionService.evaluate(action.condition, ctx)
          ? action.then ?? []
          : action.else ?? [];
      result.push(...flattenWorkflowActions(branch, ctx, conditionService));
    } else if (action.action === 'switch') {
      const matchedCase = (action.cases ?? []).find(c => conditionService.evaluate(c.condition, ctx));
      const branch = matchedCase ? matchedCase.actions : action.default ?? [];
      result.push(...flattenWorkflowActions(branch, ctx, conditionService));
    } else {
      result.push(action);
    }
  }
  return result;
}
