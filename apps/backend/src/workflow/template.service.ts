import { Injectable, Logger, Optional } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { JSONPath } from 'jsonpath-plus';
import { faker } from '@faker-js/faker';
import type { TemplateContext } from '@mockingbird/shared-types';
import { StateStoreService } from '../data-store/state-store.service';

interface RenderResult {
  output: string;
  warnings: string[];
}

const MS_PER_DAY = 86_400_000;

@Injectable()
export class TemplateService {
  private readonly logger = new Logger(TemplateService.name);

  constructor(@Optional() private readonly stateStoreService?: StateStoreService) {}

  render(template: string, ctx: TemplateContext): RenderResult {
    const warnings: string[] = [];
    const output = template.replace(/\{\{([^}]+)\}\}/g, (match, expr: string) => {
      const trimmed = expr.trim();
      const resolved = this.resolve(trimmed, ctx);
      if (resolved === undefined) {
        warnings.push(`Unresolved variable: {{${trimmed}}}`);
        return '';
      }
      return resolved;
    });
    if (warnings.length) warnings.forEach(w => this.logger.warn(w));
    return { output, warnings };
  }

  private resolve(expr: string, ctx: TemplateContext): string | undefined {
    // request.body_patch key1=expr1 key2=expr2 ...
    // Merges request body JSON with the given key overrides. Unlisted keys pass through.
    if (expr.startsWith('request.body_patch')) {
      const args = expr.slice('request.body_patch'.length).trim();
      try {
        const base = JSON.parse(ctx.request.body) as Record<string, unknown>;
        for (const [, key, valExpr] of args.matchAll(/(\w+)=(\S+)/g)) {
          base[key] = this.resolve(valExpr, ctx) ?? valExpr;
        }
        return JSON.stringify(base);
      } catch {
        return undefined;
      }
    }
    if (expr === 'now') return new Date().toISOString();
    if (expr === 'uuid') return uuidv4();
    // autoIncrement "key" — a persistent, per-key integer counter, 1/2/3/…, backed by the
    // same in-memory state store data stores use (see data-stores.md). Independent of any
    // data store's own per-record sequence.
    if (expr.startsWith('autoIncrement')) {
      const key = this.parseQuotedArg(expr, 'autoIncrement');
      if (!key || !this.stateStoreService) return undefined;
      return String(this.stateStoreService.nextAutoIncrement(key));
    }
    // faker "person.fullName" — any dotted path into the @faker-js/faker module tree.
    if (expr.startsWith('faker')) {
      const path = this.parseQuotedArg(expr, 'faker');
      return path ? this.resolveFaker(path) : undefined;
    }
    // randomInt min max — inclusive integer range.
    if (expr.startsWith('randomInt')) {
      const [a, b] = expr.slice('randomInt'.length).trim().split(/\s+/).map(Number);
      if (!Number.isFinite(a) || !Number.isFinite(b)) return undefined;
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      return String(Math.floor(Math.random() * (hi - lo + 1)) + lo);
    }
    // randomItem "a,b,c" — picks one comma-separated item at random.
    if (expr.startsWith('randomItem')) {
      const raw = this.parseQuotedArg(expr, 'randomItem') ?? '';
      const items = raw.split(',').map(s => s.trim()).filter(Boolean);
      if (items.length === 0) return undefined;
      return items[Math.floor(Math.random() * items.length)];
    }
    if (expr === 'randomBool') return Math.random() < 0.5 ? 'true' : 'false';
    // randomDate [daysBack] [daysForward] — ISO 8601 timestamp within that window of "now";
    // defaults to somewhere in the past year.
    if (expr === 'randomDate' || expr.startsWith('randomDate ')) {
      const [daysBackArg, daysForwardArg] = expr.slice('randomDate'.length).trim().split(/\s+/).map(Number);
      const daysBack = Number.isFinite(daysBackArg) ? daysBackArg : 365;
      const daysForward = Number.isFinite(daysForwardArg) ? daysForwardArg : 0;
      const offsetMs = Math.random() * (daysBack + daysForward) * MS_PER_DAY - daysBack * MS_PER_DAY;
      return new Date(Date.now() + offsetMs).toISOString();
    }
    if (expr === 'request.method') return ctx.request.method;
    if (expr === 'request.path') return ctx.request.path;
    if (expr === 'request.body') return ctx.request.body;
    if (expr.startsWith('request.path_param.')) {
      return ctx.request.pathParams[expr.slice('request.path_param.'.length)];
    }
    if (expr.startsWith('request.query_param.')) {
      return ctx.request.queryParams[expr.slice('request.query_param.'.length)];
    }
    if (expr.startsWith('request.header.')) {
      return ctx.request.headers[expr.slice('request.header.'.length).toLowerCase()];
    }
    if (expr.startsWith('request.body_json.')) {
      try {
        const parsed: unknown = JSON.parse(ctx.request.body);
        const path = expr.slice('request.body_json.'.length);
        const results = JSONPath({ path, json: parsed }) as unknown[];
        return results.length > 0 ? String(results[0]) : undefined;
      } catch {
        return undefined;
      }
    }
    if (expr.startsWith('response.') && ctx.response) {
      if (expr === 'response.statusCode') return String(ctx.response.statusCode);
      if (expr === 'response.body') return ctx.response.body;
      if (expr.startsWith('response.header.')) {
        return ctx.response.headers[expr.slice('response.header.'.length).toLowerCase()];
      }
    }
    // store.<name> (whole record/list, JSON-stringified) or store.<name>.<jsonpath>
    // (JSONPath into it) — populated mid-workflow by a preceding store_fetch action.
    if (expr.startsWith('store.')) {
      const rest = expr.slice('store.'.length);
      const dotIdx2 = rest.indexOf('.');
      const storeName = dotIdx2 === -1 ? rest : rest.slice(0, dotIdx2);
      const record = ctx.stores?.[storeName];
      if (record === undefined) return undefined;
      if (dotIdx2 === -1) return JSON.stringify(record);
      const path = rest.slice(dotIdx2 + 1);
      try {
        const results = JSONPath({ path, json: record as object }) as unknown[];
        return results.length > 0 ? String(results[0]) : undefined;
      } catch {
        return undefined;
      }
    }
    // Check parameter sets: expr = "setName.key"
    const dotIdx = expr.indexOf('.');
    if (dotIdx > 0) {
      const setName = expr.slice(0, dotIdx);
      const key = expr.slice(dotIdx + 1);
      const set = ctx.parameterSets[setName];
      if (set?.[key] !== undefined) return set[key];
    }
    return undefined;
  }

  /** Extracts a helper's single argument, preferring a `"quoted"` form (safe for values
   *  containing spaces/commas) but falling back to the raw trailing text. */
  private parseQuotedArg(expr: string, helperName: string): string | undefined {
    const quoted = expr.match(/^\S+\s+"([^"]*)"$/);
    if (quoted) return quoted[1];
    const rest = expr.slice(helperName.length).trim();
    return rest || undefined;
  }

  /** Resolves a dotted path (e.g. "person.fullName") into @faker-js/faker and calls it. */
  private resolveFaker(path: string): string | undefined {
    let node: unknown = faker;
    for (const part of path.split('.')) {
      if (node && typeof node === 'object' && part in (node as object)) {
        node = (node as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }
    if (typeof node !== 'function') return undefined;
    try {
      const result = (node as () => unknown)();
      return typeof result === 'string' ? result : JSON.stringify(result);
    } catch {
      return undefined;
    }
  }
}
