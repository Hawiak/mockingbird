import { describe, it, expect } from 'vitest';
import { StateStoreService } from './state-store.service';
import type { ConfigService } from '../config/config.service';

function makeService(dataStores: { id: string; seedRecords?: Record<string, unknown> }[] = []): StateStoreService {
  const fakeConfigService = {
    getCurrent: () => ({ dataStores }),
  } as unknown as ConfigService;
  return new StateStoreService(fakeConfigService);
}

describe('StateStoreService', () => {
  describe('get/set/has/delete', () => {
    it('set then get returns the value', () => {
      const svc = makeService();
      svc.set('orders', '1', { id: '1', name: 'widget' });
      expect(svc.get('orders', '1')).toEqual({ id: '1', name: 'widget' });
    });

    it('get on missing key returns undefined', () => {
      const svc = makeService();
      expect(svc.get('orders', 'missing')).toBeUndefined();
    });

    it('has reflects presence', () => {
      const svc = makeService();
      expect(svc.has('orders', '1')).toBe(false);
      svc.set('orders', '1', { id: '1' });
      expect(svc.has('orders', '1')).toBe(true);
    });

    it('delete removes the key', () => {
      const svc = makeService();
      svc.set('orders', '1', { id: '1' });
      svc.delete('orders', '1');
      expect(svc.has('orders', '1')).toBe(false);
    });

    it('stores are isolated from each other', () => {
      const svc = makeService();
      svc.set('orders', '1', { kind: 'order' });
      svc.set('customers', '1', { kind: 'customer' });
      expect(svc.get('orders', '1')).toEqual({ kind: 'order' });
      expect(svc.get('customers', '1')).toEqual({ kind: 'customer' });
    });
  });

  describe('merge behavior', () => {
    it('merge=false replaces the record entirely', () => {
      const svc = makeService();
      svc.set('orders', '1', { a: 1, b: 2 });
      svc.set('orders', '1', { b: 3 }, false);
      expect(svc.get('orders', '1')).toEqual({ b: 3 });
    });

    it('merge=true shallow-merges into the existing record', () => {
      const svc = makeService();
      svc.set('orders', '1', { a: 1, b: 2 });
      svc.set('orders', '1', { b: 3, c: 4 }, true);
      expect(svc.get('orders', '1')).toEqual({ a: 1, b: 3, c: 4 });
    });

    it('merge=true on a non-existent key just sets the value', () => {
      const svc = makeService();
      svc.set('orders', '1', { a: 1 }, true);
      expect(svc.get('orders', '1')).toEqual({ a: 1 });
    });

    it('merge=true with a non-object incoming value does not merge', () => {
      const svc = makeService();
      svc.set('orders', '1', { a: 1 });
      svc.set('orders', '1', 'not-an-object', true);
      expect(svc.get('orders', '1')).toBe('not-an-object');
    });
  });

  describe('list', () => {
    it('returns all records for a store', () => {
      const svc = makeService();
      svc.set('orders', '1', { id: '1' });
      svc.set('orders', '2', { id: '2' });
      expect(svc.list('orders')).toEqual({ '1': { id: '1' }, '2': { id: '2' } });
    });

    it('returns empty object for an unknown store', () => {
      const svc = makeService();
      expect(svc.list('unknown')).toEqual({});
    });
  });

  describe('recordCount', () => {
    it('reflects the number of records', () => {
      const svc = makeService();
      expect(svc.recordCount('orders')).toBe(0);
      svc.set('orders', '1', {});
      svc.set('orders', '2', {});
      expect(svc.recordCount('orders')).toBe(2);
    });
  });

  describe('nextSequence', () => {
    it('increments per store, starting at 1', () => {
      const svc = makeService();
      expect(svc.nextSequence('orders')).toBe(1);
      expect(svc.nextSequence('orders')).toBe(2);
      expect(svc.nextSequence('orders')).toBe(3);
    });

    it('is independent per store', () => {
      const svc = makeService();
      expect(svc.nextSequence('orders')).toBe(1);
      expect(svc.nextSequence('customers')).toBe(1);
      expect(svc.nextSequence('orders')).toBe(2);
    });
  });

  describe('clearStore / clearAll', () => {
    it('clearStore empties only the targeted store', () => {
      const svc = makeService();
      svc.set('orders', '1', {});
      svc.set('customers', '1', {});
      svc.clearStore('orders');
      expect(svc.recordCount('orders')).toBe(0);
      expect(svc.recordCount('customers')).toBe(1);
    });

    it('clearStore resets the sequence counter', () => {
      const svc = makeService();
      svc.nextSequence('orders');
      svc.nextSequence('orders');
      svc.clearStore('orders');
      expect(svc.nextSequence('orders')).toBe(1);
    });

    it('clearAll empties every store', () => {
      const svc = makeService();
      svc.set('orders', '1', {});
      svc.set('customers', '1', {});
      svc.clearAll();
      expect(svc.recordCount('orders')).toBe(0);
      expect(svc.recordCount('customers')).toBe(0);
    });
  });

  describe('resetToSeed', () => {
    it('clears current records and reapplies the given seed', () => {
      const svc = makeService();
      svc.set('orders', 'stale', { junk: true });
      svc.resetToSeed('orders', { '1': { id: '1' }, '2': { id: '2' } });
      expect(svc.list('orders')).toEqual({ '1': { id: '1' }, '2': { id: '2' } });
      expect(svc.has('orders', 'stale')).toBe(false);
    });

    it('with no seed records, results in an empty store', () => {
      const svc = makeService();
      svc.set('orders', '1', {});
      svc.resetToSeed('orders', undefined);
      expect(svc.recordCount('orders')).toBe(0);
    });
  });

  describe('bootstrap seeding (onApplicationBootstrap / ensureSeeded)', () => {
    it('seeds a store from config on bootstrap', () => {
      const svc = makeService([{ id: 'orders', seedRecords: { '1': { id: '1' } } }]);
      svc.onApplicationBootstrap();
      expect(svc.get('orders', '1')).toEqual({ id: '1' });
    });

    it('does not reseed a store on a second ensureSeeded call (protects live data)', () => {
      const svc = makeService();
      svc.ensureSeeded('orders', { '1': { id: '1', v: 'seed' } });
      svc.set('orders', '1', { id: '1', v: 'live-edit' });
      svc.ensureSeeded('orders', { '1': { id: '1', v: 'seed' } });
      expect(svc.get('orders', '1')).toEqual({ id: '1', v: 'live-edit' });
    });

    it('store with no seed records stays empty after ensureSeeded', () => {
      const svc = makeService();
      svc.ensureSeeded('orders', undefined);
      expect(svc.recordCount('orders')).toBe(0);
    });
  });

  describe('soft cap eviction', () => {
    it('evicts the oldest record once the per-store cap is exceeded', () => {
      const svc = makeService();
      for (let i = 0; i < 5001; i++) {
        svc.set('orders', String(i), { i });
      }
      expect(svc.recordCount('orders')).toBe(5000);
      expect(svc.has('orders', '0')).toBe(false);
      expect(svc.has('orders', '5000')).toBe(true);
    });
  });
});
