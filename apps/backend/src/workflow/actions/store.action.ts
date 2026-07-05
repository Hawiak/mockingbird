import { randomUUID } from 'crypto';
import type { WorkflowAction, TemplateContext, WorkflowLogEntry } from '@mockingbird/shared-types';
import { TemplateService } from '../template.service';
import { StateStoreService } from '../../data-store/state-store.service';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function executeStoreFetch(
  action: WorkflowAction,
  ctx: TemplateContext,
  stateStoreService: StateStoreService,
  templateService: TemplateService,
): Promise<WorkflowLogEntry> {
  const start = Date.now();
  const storeId = action.store ?? '';
  if (!ctx.stores) ctx.stores = {};

  if (action.storeFetchMode === 'list') {
    const records = Object.values(stateStoreService.list(storeId));
    ctx.stores[storeId] = records;
    return {
      action: 'store_fetch',
      status: 'ok',
      message: `${records.length} record(s)`,
      durationMs: Date.now() - start,
    };
  }

  const key = templateService.render(action.storeKey ?? '', ctx).output;
  const record = stateStoreService.get(storeId, key);
  ctx.stores[storeId] = record;
  return {
    action: 'store_fetch',
    status: 'ok',
    message: record !== undefined ? `found "${key}"` : `not found "${key}"`,
    durationMs: Date.now() - start,
  };
}

export async function executeStoreSave(
  action: WorkflowAction,
  ctx: TemplateContext,
  stateStoreService: StateStoreService,
  templateService: TemplateService,
): Promise<WorkflowLogEntry> {
  const start = Date.now();
  const storeId = action.store ?? '';

  let key = templateService.render(action.storeKey ?? '', ctx).output.trim();
  if (!key) {
    key = action.storeKeyMode === 'sequence'
      ? String(stateStoreService.nextSequence(storeId))
      : randomUUID();
  }

  const rendered = templateService.render(action.storeValue ?? '', ctx).output;
  let value: unknown = rendered;
  try {
    value = JSON.parse(rendered);
  } catch {
    // Not JSON — store the raw rendered string as-is.
  }

  if (action.storeTimestamps && isPlainObject(value)) {
    const now = new Date().toISOString();
    const existing = stateStoreService.get(storeId, key);
    const createdAt = isPlainObject(existing) && typeof existing['createdAt'] === 'string'
      ? existing['createdAt']
      : now;
    value = { ...value, createdAt, updatedAt: now };
  }

  stateStoreService.set(storeId, key, value, action.storeMerge ?? false);
  return {
    action: 'store_save',
    status: 'ok',
    message: `saved "${key}"`,
    durationMs: Date.now() - start,
  };
}

export async function executeStoreDelete(
  action: WorkflowAction,
  ctx: TemplateContext,
  stateStoreService: StateStoreService,
  templateService: TemplateService,
): Promise<WorkflowLogEntry> {
  const start = Date.now();
  const storeId = action.store ?? '';
  const key = templateService.render(action.storeKey ?? '', ctx).output;
  stateStoreService.delete(storeId, key);
  return {
    action: 'store_delete',
    status: 'ok',
    message: `deleted "${key}"`,
    durationMs: Date.now() - start,
  };
}
