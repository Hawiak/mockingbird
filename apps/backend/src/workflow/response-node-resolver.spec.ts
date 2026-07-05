import { describe, it, expect } from 'vitest';
import { resolveResponseNode, flattenWorkflowActions } from './response-node-resolver';
import { ConditionService } from '../statement/condition.service';
import { StateStoreService } from '../data-store/state-store.service';
import type { Config, RequestContext, ResponseNode, WorkflowAction } from '@mockingbird/shared-types';
import type { ConfigService } from '../config/config.service';

function makeCtx(overrides: Partial<RequestContext> = {}): RequestContext {
  return {
    method: 'GET', path: '/orders/1', pathParams: {}, queryParams: {}, headers: {}, body: '', callCount: 0,
    ...overrides,
  };
}

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    version: '1', settings: { uiPort: 9000 }, responseBlocks: [], services: [], modules: [], parameterSets: [],
    ...overrides,
  };
}

function makeConditionService(): ConditionService {
  const fakeConfigService = { getCurrent: () => ({ dataStores: [] }) } as unknown as ConfigService;
  const stateStore = new StateStoreService(fakeConfigService);
  return new ConditionService(stateStore);
}

const methodEquals = (value: string) => ({ type: 'request.method' as const, op: 'equals' as const, value });

describe('resolveResponseNode', () => {
  const conditionService = makeConditionService();

  it('unconditional block resolves to a single respond action', () => {
    const node: ResponseNode = { id: 'n1', kind: 'block', responseBlockId: 'blk-1' };
    const actions = resolveResponseNode(node, makeCtx(), makeConfig(), conditionService);
    expect(actions).toEqual([{ action: 'respond', mode: 'block', responseBlockId: 'blk-1', statusCode: undefined, headers: undefined, body: undefined }]);
  });

  it('unconditional inline workflow returns its actions as-is', () => {
    const node: ResponseNode = {
      id: 'n1', kind: 'workflow', workflowMode: 'inline',
      actions: [{ action: 'delay', ms: 10 }, { action: 'respond', mode: 'block', responseBlockId: 'blk' }],
    };
    const actions = resolveResponseNode(node, makeCtx(), makeConfig(), conditionService);
    expect(actions).toEqual(node.actions);
  });

  it('named workflow mode delegates to resolveWorkflowActions, with params bound', () => {
    const config = makeConfig({
      responseWorkflows: [{
        id: 'wf1', name: 'List', parameters: [{ name: 'entity', type: 'dataStore' }],
        steps: [{ id: 's1', order: 1, type: 'use_data_store', store: '$param.entity', storeOperation: 'fetch', storeFetchMode: 'list' }],
      }],
    });
    const node: ResponseNode = { id: 'n1', kind: 'workflow', workflowMode: 'named', workflowId: 'wf1', workflowParams: { entity: 'orders' } };
    const actions = resolveResponseNode(node, makeCtx(), config, conditionService);
    expect(actions?.[0]).toMatchObject({ action: 'store_fetch', store: 'orders' });
  });

  it('named workflow mode returns null when the referenced workflow is missing', () => {
    const node: ResponseNode = { id: 'n1', kind: 'workflow', workflowMode: 'named', workflowId: 'does-not-exist' };
    const actions = resolveResponseNode(node, makeCtx(), makeConfig(), conditionService);
    expect(actions).toBeNull();
  });

  describe('conditional chain (if/else and switch-style via else)', () => {
    it('condition matches → resolves this node, ignoring else', () => {
      const node: ResponseNode = {
        id: 'n1', condition: methodEquals('GET'), kind: 'block', responseBlockId: 'matched',
        else: { id: 'n2', kind: 'block', responseBlockId: 'fallback' },
      };
      const actions = resolveResponseNode(node, makeCtx({ method: 'GET' }), makeConfig(), conditionService);
      expect(actions).toEqual([expect.objectContaining({ responseBlockId: 'matched' })]);
    });

    it('condition fails with an else → recurses into else', () => {
      const node: ResponseNode = {
        id: 'n1', condition: methodEquals('POST'), kind: 'block', responseBlockId: 'matched',
        else: { id: 'n2', kind: 'block', responseBlockId: 'fallback' },
      };
      const actions = resolveResponseNode(node, makeCtx({ method: 'GET' }), makeConfig(), conditionService);
      expect(actions).toEqual([expect.objectContaining({ responseBlockId: 'fallback' })]);
    });

    it('condition fails with no else → null (caller falls through to spec default)', () => {
      const node: ResponseNode = { id: 'n1', condition: methodEquals('POST'), kind: 'block', responseBlockId: 'matched' };
      const actions = resolveResponseNode(node, makeCtx({ method: 'GET' }), makeConfig(), conditionService);
      expect(actions).toBeNull();
    });

    it('a 3-case switch-style chain picks the first matching case', () => {
      const node: ResponseNode = {
        id: 'n1', condition: methodEquals('POST'), kind: 'block', responseBlockId: 'case-post',
        else: {
          id: 'n2', condition: methodEquals('DELETE'), kind: 'block', responseBlockId: 'case-delete',
          else: { id: 'n3', kind: 'block', responseBlockId: 'default-case' },
        },
      };
      expect(resolveResponseNode(node, makeCtx({ method: 'DELETE' }), makeConfig(), conditionService))
        .toEqual([expect.objectContaining({ responseBlockId: 'case-delete' })]);
      expect(resolveResponseNode(node, makeCtx({ method: 'GET' }), makeConfig(), conditionService))
        .toEqual([expect.objectContaining({ responseBlockId: 'default-case' })]);
    });
  });
});

describe('flattenWorkflowActions', () => {
  const conditionService = makeConditionService();

  it('passes non-branch actions through unchanged', () => {
    const actions: WorkflowAction[] = [{ action: 'delay', ms: 5 }, { action: 'respond', mode: 'block', responseBlockId: 'b' }];
    expect(flattenWorkflowActions(actions, makeCtx(), conditionService)).toEqual(actions);
  });

  it('if_else: condition true → then branch, spliced in place', () => {
    const actions: WorkflowAction[] = [
      { action: 'log', message: 'before' },
      {
        action: 'if_else', condition: methodEquals('GET'),
        then: [{ action: 'respond', mode: 'block', responseBlockId: 'then-block' }],
        else: [{ action: 'respond', mode: 'block', responseBlockId: 'else-block' }],
      },
    ];
    const flat = flattenWorkflowActions(actions, makeCtx({ method: 'GET' }), conditionService);
    expect(flat).toEqual([{ action: 'log', message: 'before' }, { action: 'respond', mode: 'block', responseBlockId: 'then-block' }]);
  });

  it('if_else: condition false → else branch', () => {
    const actions: WorkflowAction[] = [{
      action: 'if_else', condition: methodEquals('POST'),
      then: [{ action: 'respond', mode: 'block', responseBlockId: 'then-block' }],
      else: [{ action: 'respond', mode: 'block', responseBlockId: 'else-block' }],
    }];
    const flat = flattenWorkflowActions(actions, makeCtx({ method: 'GET' }), conditionService);
    expect(flat).toEqual([{ action: 'respond', mode: 'block', responseBlockId: 'else-block' }]);
  });

  it('switch: picks the first matching case, else falls back to default', () => {
    const switchAction: WorkflowAction = {
      action: 'switch',
      cases: [
        { id: 'c1', condition: methodEquals('POST'), actions: [{ action: 'respond', mode: 'block', responseBlockId: 'post-case' }] },
        { id: 'c2', condition: methodEquals('DELETE'), actions: [{ action: 'respond', mode: 'block', responseBlockId: 'delete-case' }] },
      ],
      default: [{ action: 'respond', mode: 'block', responseBlockId: 'default-case' }],
    };
    expect(flattenWorkflowActions([switchAction], makeCtx({ method: 'DELETE' }), conditionService))
      .toEqual([{ action: 'respond', mode: 'block', responseBlockId: 'delete-case' }]);
    expect(flattenWorkflowActions([switchAction], makeCtx({ method: 'GET' }), conditionService))
      .toEqual([{ action: 'respond', mode: 'block', responseBlockId: 'default-case' }]);
  });

  it('nested if_else inside a switch case is itself flattened (recursion)', () => {
    const switchAction: WorkflowAction = {
      action: 'switch',
      cases: [{
        id: 'c1', condition: methodEquals('POST'),
        actions: [{
          action: 'if_else', condition: { type: 'request.header', param: 'x-flag', op: 'exists' },
          then: [{ action: 'respond', mode: 'block', responseBlockId: 'nested-then' }],
          else: [{ action: 'respond', mode: 'block', responseBlockId: 'nested-else' }],
        }],
      }],
      default: [],
    };
    const flat = flattenWorkflowActions([switchAction], makeCtx({ method: 'POST', headers: {} }), conditionService);
    expect(flat).toEqual([{ action: 'respond', mode: 'block', responseBlockId: 'nested-else' }]);
  });
});
