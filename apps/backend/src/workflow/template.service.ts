import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { JSONPath } from 'jsonpath-plus';
import type { TemplateContext } from '@mockingbird/shared-types';

interface RenderResult {
  output: string;
  warnings: string[];
}

@Injectable()
export class TemplateService {
  private readonly logger = new Logger(TemplateService.name);

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
}
