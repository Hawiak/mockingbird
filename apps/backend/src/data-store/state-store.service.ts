import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '../config/config.service';

const MAX_RECORDS_PER_STORE = 5000;

@Injectable()
export class StateStoreService implements OnApplicationBootstrap {
  private readonly logger = new Logger(StateStoreService.name);
  private readonly stores = new Map<string, Map<string, unknown>>();
  private readonly sequences = new Map<string, number>();
  private readonly seeded = new Set<string>();

  constructor(private readonly configService: ConfigService) {}

  onApplicationBootstrap(): void {
    const dataStores = this.configService.getCurrent()?.dataStores ?? [];
    for (const store of dataStores) {
      this.ensureSeeded(store.id, store.seedRecords);
    }
  }

  /** Seeds a store the first time it's seen; never reapplies over live data afterward. */
  ensureSeeded(storeId: string, seedRecords: Record<string, unknown> | undefined): void {
    if (this.seeded.has(storeId)) return;
    this.seeded.add(storeId);
    if (seedRecords && Object.keys(seedRecords).length > 0) {
      const map = this.getOrCreateStore(storeId);
      for (const [key, value] of Object.entries(seedRecords)) {
        map.set(key, value);
      }
      this.logger.log(`Seeded data store "${storeId}" with ${map.size} record(s)`);
    }
  }

  private getOrCreateStore(storeId: string): Map<string, unknown> {
    let map = this.stores.get(storeId);
    if (!map) {
      map = new Map();
      this.stores.set(storeId, map);
    }
    return map;
  }

  get(storeId: string, key: string): unknown | undefined {
    return this.stores.get(storeId)?.get(key);
  }

  has(storeId: string, key: string): boolean {
    return this.stores.get(storeId)?.has(key) ?? false;
  }

  set(storeId: string, key: string, value: unknown, merge = false): unknown {
    const map = this.getOrCreateStore(storeId);
    const next = merge && this.isPlainObject(value) && this.isPlainObject(map.get(key))
      ? { ...(map.get(key) as Record<string, unknown>), ...value }
      : value;
    map.set(key, next);
    if (map.size > MAX_RECORDS_PER_STORE) {
      const oldestKey = map.keys().next().value;
      if (oldestKey !== undefined) map.delete(oldestKey);
    }
    return next;
  }

  delete(storeId: string, key: string): void {
    this.stores.get(storeId)?.delete(key);
  }

  list(storeId: string): Record<string, unknown> {
    const map = this.stores.get(storeId);
    if (!map) return {};
    return Object.fromEntries(map.entries());
  }

  recordCount(storeId: string): number {
    return this.stores.get(storeId)?.size ?? 0;
  }

  nextSequence(storeId: string): number {
    const next = (this.sequences.get(storeId) ?? 0) + 1;
    this.sequences.set(storeId, next);
    return next;
  }

  clearStore(storeId: string): void {
    this.stores.get(storeId)?.clear();
    this.sequences.delete(storeId);
  }

  clearAll(): void {
    this.stores.clear();
    this.sequences.clear();
    this.seeded.clear();
  }

  resetToSeed(storeId: string, seedRecords: Record<string, unknown> | undefined): void {
    this.clearStore(storeId);
    const map = this.getOrCreateStore(storeId);
    for (const [key, value] of Object.entries(seedRecords ?? {})) {
      map.set(key, value);
    }
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
