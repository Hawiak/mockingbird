import { describe, it, expect } from 'vitest';
import { executeStoreFetch, executeStoreSave, executeStoreDelete } from './store.action';
import { StateStoreService } from '../../data-store/state-store.service';
import { TemplateService } from '../template.service';
import type { ConfigService } from '../../config/config.service';
import type { TemplateContext, WorkflowAction } from '@mockingbird/shared-types';

function makeStateStore(): StateStoreService {
  const fakeConfigService = { getCurrent: () => ({ dataStores: [] }) } as unknown as ConfigService;
  return new StateStoreService(fakeConfigService);
}

function makeCtx(overrides: Partial<TemplateContext['request']> = {}): TemplateContext {
  return {
    request: {
      method: 'GET', path: '/orders/1', pathParams: {}, queryParams: {}, headers: {}, body: '', callCount: 0,
      ...overrides,
    },
    parameterSets: {},
  };
}

function action(overrides: Partial<WorkflowAction> = {}): WorkflowAction {
  return { action: 'store_fetch', store: 'orders', ...overrides };
}

describe('store.action', () => {
  const templateService = new TemplateService();

  describe('executeStoreFetch', () => {
    it('single mode — populates ctx.stores with the found record', async () => {
      const stateStore = makeStateStore();
      stateStore.set('orders', '1', { id: '1' });
      const ctx = makeCtx({ pathParams: { id: '1' } });
      await executeStoreFetch(action({ storeKey: '{{request.path_param.id}}' }), ctx, stateStore, templateService);
      expect(ctx.stores?.['orders']).toEqual({ id: '1' });
    });

    it('single mode — key not found populates undefined, does not throw', async () => {
      const stateStore = makeStateStore();
      const ctx = makeCtx({ pathParams: { id: '99' } });
      const entry = await executeStoreFetch(action({ storeKey: '{{request.path_param.id}}' }), ctx, stateStore, templateService);
      expect(ctx.stores?.['orders']).toBeUndefined();
      expect(entry.status).toBe('ok');
    });

    it('list mode — populates ctx.stores with every record as an array', async () => {
      const stateStore = makeStateStore();
      stateStore.set('orders', '1', { id: '1' });
      stateStore.set('orders', '2', { id: '2' });
      const ctx = makeCtx();
      await executeStoreFetch(action({ storeFetchMode: 'list' }), ctx, stateStore, templateService);
      expect(ctx.stores?.['orders']).toEqual(expect.arrayContaining([{ id: '1' }, { id: '2' }]));
      expect((ctx.stores?.['orders'] as unknown[]).length).toBe(2);
    });
  });

  describe('executeStoreSave', () => {
    it('saves a record under an explicit templated key', async () => {
      const stateStore = makeStateStore();
      const ctx = makeCtx({ body: '{"name":"widget"}' });
      await executeStoreSave(
        action({ action: 'store_save', storeKey: 'fixed-key', storeValue: '{{request.body}}' }),
        ctx, stateStore, templateService,
      );
      expect(stateStore.get('orders', 'fixed-key')).toEqual({ name: 'widget' });
    });

    it('empty key + default mode auto-generates a UUID key', async () => {
      const stateStore = makeStateStore();
      const ctx = makeCtx({ body: '{}' });
      await executeStoreSave(
        action({ action: 'store_save', storeKey: '', storeValue: '{}' }),
        ctx, stateStore, templateService,
      );
      expect(stateStore.recordCount('orders')).toBe(1);
      const [key] = Object.keys(stateStore.list('orders'));
      expect(key).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('empty key + sequence mode uses an incrementing numeric key', async () => {
      const stateStore = makeStateStore();
      const ctx = makeCtx({ body: '{}' });
      await executeStoreSave(
        action({ action: 'store_save', storeKey: '', storeKeyMode: 'sequence', storeValue: '{}' }),
        ctx, stateStore, templateService,
      );
      await executeStoreSave(
        action({ action: 'store_save', storeKey: '', storeKeyMode: 'sequence', storeValue: '{}' }),
        ctx, stateStore, templateService,
      );
      expect(stateStore.has('orders', '1')).toBe(true);
      expect(stateStore.has('orders', '2')).toBe(true);
    });

    it('non-JSON value is stored as the raw rendered string', async () => {
      const stateStore = makeStateStore();
      const ctx = makeCtx();
      await executeStoreSave(
        action({ action: 'store_save', storeKey: 'k', storeValue: 'plain text' }),
        ctx, stateStore, templateService,
      );
      expect(stateStore.get('orders', 'k')).toBe('plain text');
    });

    it('storeMerge=true merges into the existing record', async () => {
      const stateStore = makeStateStore();
      stateStore.set('orders', 'k', { a: 1, b: 2 });
      const ctx = makeCtx();
      await executeStoreSave(
        action({ action: 'store_save', storeKey: 'k', storeValue: '{"b":3}', storeMerge: true }),
        ctx, stateStore, templateService,
      );
      expect(stateStore.get('orders', 'k')).toEqual({ a: 1, b: 3 });
    });

    it('storeTimestamps=true stamps createdAt on first insert and preserves it on update', async () => {
      const stateStore = makeStateStore();
      const ctx = makeCtx();
      await executeStoreSave(
        action({ action: 'store_save', storeKey: 'k', storeValue: '{"v":1}', storeTimestamps: true }),
        ctx, stateStore, templateService,
      );
      const first = stateStore.get('orders', 'k') as Record<string, unknown>;
      expect(typeof first['createdAt']).toBe('string');
      expect(first['updatedAt']).toBe(first['createdAt']);

      await new Promise(r => setTimeout(r, 5));
      await executeStoreSave(
        action({ action: 'store_save', storeKey: 'k', storeValue: '{"v":2}', storeTimestamps: true, storeMerge: true }),
        ctx, stateStore, templateService,
      );
      const second = stateStore.get('orders', 'k') as Record<string, unknown>;
      expect(second['createdAt']).toBe(first['createdAt']);
      expect(second['updatedAt']).not.toBe(first['updatedAt']);
    });

    it('storeTimestamps=true on a non-object value skips injection silently', async () => {
      const stateStore = makeStateStore();
      const ctx = makeCtx();
      await executeStoreSave(
        action({ action: 'store_save', storeKey: 'k', storeValue: '[1,2,3]', storeTimestamps: true }),
        ctx, stateStore, templateService,
      );
      expect(stateStore.get('orders', 'k')).toEqual([1, 2, 3]);
    });
  });

  describe('executeStoreDelete', () => {
    it('removes the record at the templated key', async () => {
      const stateStore = makeStateStore();
      stateStore.set('orders', '1', { id: '1' });
      const ctx = makeCtx({ pathParams: { id: '1' } });
      await executeStoreDelete(
        action({ action: 'store_delete', storeKey: '{{request.path_param.id}}' }),
        ctx, stateStore, templateService,
      );
      expect(stateStore.has('orders', '1')).toBe(false);
    });

    it('deleting a non-existent key does not throw', async () => {
      const stateStore = makeStateStore();
      const ctx = makeCtx({ pathParams: { id: 'missing' } });
      await expect(executeStoreDelete(
        action({ action: 'store_delete', storeKey: '{{request.path_param.id}}' }),
        ctx, stateStore, templateService,
      )).resolves.toMatchObject({ status: 'ok' });
    });
  });
});
