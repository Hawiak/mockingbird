import { Injectable } from '@nestjs/common';
import { JSONPath } from 'jsonpath-plus';
import { select } from 'xpath';
import { DOMParser } from '@xmldom/xmldom';
import type { Condition, ConditionLeaf, ConditionGroup, RequestContext } from '@mockingbird/shared-types';

@Injectable()
export class ConditionService {
  evaluate(condition: Condition, ctx: RequestContext): boolean {
    if ('operator' in condition) {
      return this.evaluateGroup(condition as ConditionGroup, ctx);
    }
    return this.evaluateLeaf(condition as ConditionLeaf, ctx);
  }

  private evaluateGroup(group: ConditionGroup, ctx: RequestContext): boolean {
    if (group.operator === 'AND') return group.conditions.every(c => this.evaluate(c, ctx));
    return group.conditions.some(c => this.evaluate(c, ctx));
  }

  private evaluateLeaf(leaf: ConditionLeaf, ctx: RequestContext): boolean {
    const actual = this.extractValue(leaf, ctx);
    return this.applyOperator(actual, leaf.op, leaf.value);
  }

  private extractValue(leaf: ConditionLeaf, ctx: RequestContext): string | undefined {
    switch (leaf.type) {
      case 'request.method': return ctx.method.toUpperCase();
      case 'request.path_param': return leaf.param ? ctx.pathParams[leaf.param] : undefined;
      case 'request.query_param': return leaf.param ? ctx.queryParams[leaf.param] : undefined;
      case 'request.header': return leaf.param ? ctx.headers[leaf.param.toLowerCase()] : undefined;
      case 'request.body_raw': return ctx.body;
      case 'request.body_json': {
        try {
          const parsed = JSON.parse(ctx.body);
          const results = JSONPath({ path: leaf.param ?? '$', json: parsed });
          return results.length > 0 ? String(results[0]) : undefined;
        } catch { return undefined; }
      }
      case 'request.body_xml': {
        try {
          const doc = new DOMParser().parseFromString(ctx.body, 'text/xml');
          const nodes = select(leaf.param ?? '/', doc);
          if (Array.isArray(nodes) && nodes.length > 0) {
            const node = nodes[0] as Node & { nodeValue?: string | null; textContent?: string | null };
            return String(node.nodeValue ?? node.textContent);
          }
          return undefined;
        } catch { return undefined; }
      }
      case 'request.count': return String(ctx.callCount);
      default: return undefined;
    }
  }

  private applyOperator(actual: string | undefined, op: string, expected?: string): boolean {
    if (op === 'exists') return actual !== undefined;
    if (op === 'not_exists') return actual === undefined;
    if (actual === undefined) return false;
    switch (op) {
      case 'equals': return actual === expected;
      case 'not_equals': return actual !== expected;
      case 'contains': return actual.includes(expected ?? '');
      case 'not_contains': return !actual.includes(expected ?? '');
      case 'matches_regex': return new RegExp(expected ?? '').test(actual);
      case 'gt': return Number(actual) > Number(expected);
      case 'lt': return Number(actual) < Number(expected);
      default: return false;
    }
  }
}
