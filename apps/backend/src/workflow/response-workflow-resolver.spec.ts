import { describe, it, expect } from 'vitest';
import { resolveWorkflowActions } from './response-workflow-resolver';
import { ConditionService } from '../statement/condition.service';
import { StateStoreService } from '../data-store/state-store.service';
import type { Config, RequestContext, ResponseWorkflow, ResponseWorkflowStep } from '@mockingbird/shared-types';
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

describe('resolveWorkflowActions', () => {
  const conditionService = makeConditionService();

  describe('$param.* substitution', () => {
    it('substitutes a structural field (step.store)', () => {
      const workflow: ResponseWorkflow = {
        id: 'wf1', name: 'List', parameters: [{ name: 'entity', type: 'dataStore' }],
        steps: [{ id: 's1', order: 1, type: 'use_data_store', store: '$param.entity', storeOperation: 'fetch', storeFetchMode: 'list' }],
      };
      const actions = resolveWorkflowActions(workflow, makeCtx(), makeConfig(), conditionService, { entity: 'orders-store' });
      expect(actions[0]).toMatchObject({ action: 'store_fetch', store: 'orders-store', storeFetchMode: 'list' });
    });

    it('substitutes a token embedded inside a template string', () => {
      const workflow: ResponseWorkflow = {
        id: 'wf1', name: 'Fetch',
        parameters: [{ name: 'entity', type: 'dataStore' }, { name: 'key', type: 'pathParam' }],
        steps: [{
          id: 's1', order: 1, type: 'use_data_store', store: '$param.entity',
          storeOperation: 'fetch', storeFetchMode: 'single', storeKey: '{{request.path_param.$param.key}}',
        }],
      };
      const actions = resolveWorkflowActions(workflow, makeCtx(), makeConfig(), conditionService, { entity: 'orders', key: 'id' });
      expect(actions[0]).toMatchObject({ storeKey: '{{request.path_param.id}}' });
    });

    it('substitutes inside an inline condition before evaluation', () => {
      const stateStore = new StateStoreService({ getCurrent: () => ({ dataStores: [] }) } as unknown as ConfigService);
      stateStore.set('orders', '42', { id: '42' });
      const cs = new ConditionService(stateStore);

      const workflow: ResponseWorkflow = {
        id: 'wf1', name: 'Fetch',
        parameters: [{ name: 'entity', type: 'dataStore' }, { name: 'key', type: 'pathParam' }],
        steps: [{
          id: 's1', order: 1, type: 'return_response', responseMode: 'template', responseStatusCode: 200,
          responseBody: 'found',
          condition: { type: 'store.exists', store: '$param.entity', param: '$param.key', op: 'exists' },
        }],
      };
      const actions = resolveWorkflowActions(
        workflow, makeCtx({ pathParams: { id: '42' } }), makeConfig(), cs, { entity: 'orders', key: 'id' },
      );
      expect(actions).toHaveLength(1);
      expect(actions[0]).toMatchObject({ statusCode: 200, body: 'found' });
    });

    it('with no params provided, steps pass through unchanged (fast path)', () => {
      const workflow: ResponseWorkflow = {
        id: 'wf1', name: 'Static',
        steps: [{ id: 's1', order: 1, type: 'return_response', responseBlockId: 'block-1' }],
      };
      const actions = resolveWorkflowActions(workflow, makeCtx(), makeConfig(), conditionService);
      expect(actions[0]).toMatchObject({ action: 'respond', mode: 'block', responseBlockId: 'block-1' });
    });
  });

  describe('use_data_store step mapping', () => {
    it('fetch → store_fetch', () => {
      const step: ResponseWorkflowStep = {
        id: 's1', order: 1, type: 'use_data_store', store: 'orders',
        storeOperation: 'fetch', storeFetchMode: 'single', storeKey: '{{request.path_param.id}}',
      };
      const actions = resolveWorkflowActions({ id: 'wf', name: 'w', steps: [step] }, makeCtx(), makeConfig(), conditionService);
      expect(actions[0]).toEqual({ action: 'store_fetch', store: 'orders', storeFetchMode: 'single', storeKey: '{{request.path_param.id}}' });
    });

    it('save → store_save, with defaults applied', () => {
      const step: ResponseWorkflowStep = {
        id: 's1', order: 1, type: 'use_data_store', store: 'orders', storeOperation: 'save', storeValue: '{{request.body}}',
      };
      const actions = resolveWorkflowActions({ id: 'wf', name: 'w', steps: [step] }, makeCtx(), makeConfig(), conditionService);
      expect(actions[0]).toEqual({
        action: 'store_save', store: 'orders', storeKey: '', storeKeyMode: 'uuid',
        storeValue: '{{request.body}}', storeMerge: false, storeTimestamps: false,
      });
    });

    it('save with merge/timestamps set', () => {
      const step: ResponseWorkflowStep = {
        id: 's1', order: 1, type: 'use_data_store', store: 'orders', storeOperation: 'save',
        storeKey: 'k', storeValue: 'v', storeMerge: true, storeTimestamps: true,
      };
      const actions = resolveWorkflowActions({ id: 'wf', name: 'w', steps: [step] }, makeCtx(), makeConfig(), conditionService);
      expect(actions[0]).toMatchObject({ storeMerge: true, storeTimestamps: true });
    });

    it('delete → store_delete', () => {
      const step: ResponseWorkflowStep = {
        id: 's1', order: 1, type: 'use_data_store', store: 'orders', storeOperation: 'delete', storeKey: '{{request.path_param.id}}',
      };
      const actions = resolveWorkflowActions({ id: 'wf', name: 'w', steps: [step] }, makeCtx(), makeConfig(), conditionService);
      expect(actions[0]).toEqual({ action: 'store_delete', store: 'orders', storeKey: '{{request.path_param.id}}' });
    });
  });

  describe('return_response mapping', () => {
    it('block mode (default when responseMode omitted) — unchanged existing behavior', () => {
      const step: ResponseWorkflowStep = { id: 's1', order: 1, type: 'return_response', responseBlockId: 'blk' };
      const actions = resolveWorkflowActions({ id: 'wf', name: 'w', steps: [step] }, makeCtx(), makeConfig(), conditionService);
      expect(actions[0]).toEqual({ action: 'respond', mode: 'block', responseBlockId: 'blk' });
    });

    it('template mode', () => {
      const step: ResponseWorkflowStep = {
        id: 's1', order: 1, type: 'return_response', responseMode: 'template',
        responseStatusCode: 201, responseHeaders: { 'content-type': 'application/json' }, responseBody: '{{request.body}}',
      };
      const actions = resolveWorkflowActions({ id: 'wf', name: 'w', steps: [step] }, makeCtx(), makeConfig(), conditionService);
      expect(actions[0]).toEqual({
        action: 'respond', mode: 'template', statusCode: 201,
        headers: { 'content-type': 'application/json' }, body: '{{request.body}}',
      });
    });
  });

  describe('use_module_action mapping — regression, unchanged by this change', () => {
    it('kafka module → kafka_publish', () => {
      const config = makeConfig({ modules: [{ id: 'mod1', name: 'Kafka', type: 'kafka', config: { brokers: [] } }] });
      const step: ResponseWorkflowStep = { id: 's1', order: 1, type: 'use_module_action', moduleId: 'mod1', kafkaTopic: 't', kafkaKey: 'k', kafkaPayload: 'p' };
      const actions = resolveWorkflowActions({ id: 'wf', name: 'w', steps: [step] }, makeCtx(), config, conditionService);
      expect(actions[0]).toMatchObject({ action: 'kafka_publish', module: 'mod1', topic: 't', key: 'k', payload: 'p' });
    });

    it('http module → http_request', () => {
      const config = makeConfig({ modules: [{ id: 'mod1', name: 'HTTP', type: 'http', config: { baseUrl: 'https://x' } }] });
      const step: ResponseWorkflowStep = { id: 's1', order: 1, type: 'use_module_action', moduleId: 'mod1', httpMethod: 'POST', httpUrl: '/x', httpBody: 'b' };
      const actions = resolveWorkflowActions({ id: 'wf', name: 'w', steps: [step] }, makeCtx(), config, conditionService);
      expect(actions[0]).toMatchObject({ action: 'http_request', module: 'mod1', method: 'POST', url: '/x', requestBody: 'b' });
    });
  });

  describe('the Fetch-entity pattern: mutually exclusive exists/not_exists branches', () => {
    function fetchWorkflow(): ResponseWorkflow {
      return {
        id: 'wf', name: 'Fetch',
        steps: [
          { id: 's1', order: 1, type: 'use_data_store', store: 'orders', storeOperation: 'fetch', storeFetchMode: 'single', storeKey: '{{request.path_param.id}}' },
          {
            id: 's2', order: 2, type: 'return_response', responseMode: 'template', responseStatusCode: 200, responseBody: 'found',
            condition: { type: 'store.exists', store: 'orders', param: 'id', op: 'exists' },
          },
          {
            id: 's3', order: 3, type: 'return_response', responseMode: 'template', responseStatusCode: 404, responseBody: 'missing',
            condition: { type: 'store.exists', store: 'orders', param: 'id', op: 'not_exists' },
          },
        ],
      };
    }

    it('record exists → exactly one respond action, the 200 branch', () => {
      const stateStore = new StateStoreService({ getCurrent: () => ({ dataStores: [] }) } as unknown as ConfigService);
      stateStore.set('orders', '1', { id: '1' });
      const cs = new ConditionService(stateStore);

      const actions = resolveWorkflowActions(fetchWorkflow(), makeCtx({ pathParams: { id: '1' } }), makeConfig(), cs);
      const respondActions = actions.filter(a => a.action === 'respond');
      expect(respondActions).toHaveLength(1);
      expect(respondActions[0]).toMatchObject({ statusCode: 200 });
    });

    it('record missing → exactly one respond action, the 404 branch', () => {
      const stateStore = new StateStoreService({ getCurrent: () => ({ dataStores: [] }) } as unknown as ConfigService);
      const cs = new ConditionService(stateStore);

      const actions = resolveWorkflowActions(fetchWorkflow(), makeCtx({ pathParams: { id: 'missing' } }), makeConfig(), cs);
      const respondActions = actions.filter(a => a.action === 'respond');
      expect(respondActions).toHaveLength(1);
      expect(respondActions[0]).toMatchObject({ statusCode: 404 });
    });
  });

  describe('condition filtering — regression, unchanged by this change', () => {
    it('step with no condition always runs', () => {
      const step: ResponseWorkflowStep = { id: 's1', order: 1, type: 'return_response', responseBlockId: 'blk' };
      const actions = resolveWorkflowActions({ id: 'wf', name: 'w', steps: [step] }, makeCtx(), makeConfig(), conditionService);
      expect(actions).toHaveLength(1);
    });

    it('step with a failing inline condition is excluded', () => {
      const step: ResponseWorkflowStep = {
        id: 's1', order: 1, type: 'return_response', responseBlockId: 'blk',
        condition: { type: 'request.method', op: 'equals', value: 'POST' },
      };
      const actions = resolveWorkflowActions({ id: 'wf', name: 'w', steps: [step] }, makeCtx({ method: 'GET' }), makeConfig(), conditionService);
      expect(actions).toHaveLength(0);
    });

    it('step referencing a missing conditionId defaults to included', () => {
      const step: ResponseWorkflowStep = { id: 's1', order: 1, type: 'return_response', responseBlockId: 'blk', conditionId: 'does-not-exist' };
      const actions = resolveWorkflowActions({ id: 'wf', name: 'w', steps: [step] }, makeCtx(), makeConfig(), conditionService);
      expect(actions).toHaveLength(1);
    });

    it('steps are ordered by `order`, not array position', () => {
      const config = makeConfig();
      const steps: ResponseWorkflowStep[] = [
        { id: 's2', order: 2, type: 'return_response', responseBlockId: 'second' },
        { id: 's1', order: 1, type: 'return_response', responseBlockId: 'first' },
      ];
      const actions = resolveWorkflowActions({ id: 'wf', name: 'w', steps }, makeCtx(), config, conditionService);
      expect(actions.map(a => a.responseBlockId)).toEqual(['first', 'second']);
    });
  });
});
