import { describe, it, expect, beforeEach } from 'vitest';
import { StatementMatcherService } from './statement-matcher.service';
import { ConditionService } from './condition.service';
import type { Statement, RequestContext, ConditionLeaf } from '@mockingbird/shared-types';

function makeCtx(overrides: Partial<RequestContext> = {}): RequestContext {
  return {
    method: 'GET',
    path: '/test',
    pathParams: {},
    queryParams: {},
    headers: {},
    body: '',
    callCount: 1,
    ...overrides,
  };
}

function makeStatement(
  id: string,
  priority: number,
  enabled: boolean,
  condition: ConditionLeaf,
): Statement {
  return {
    id,
    name: `stmt-${id}`,
    priority,
    enabled,
    condition,
    workflow: [],
  };
}

// Always-true condition: method equals GET (our default ctx method)
const alwaysTrue: ConditionLeaf = { type: 'request.method', op: 'equals', value: 'GET' };
// Always-false condition: method equals POST
const alwaysFalse: ConditionLeaf = { type: 'request.method', op: 'equals', value: 'POST' };

describe('StatementMatcherService', () => {
  let service: StatementMatcherService;

  beforeEach(() => {
    const conditionService = new ConditionService();
    service = new StatementMatcherService(conditionService);
  });

  it('no statements → null', () => {
    const ctx = makeCtx();
    expect(service.match([], ctx)).toBeNull();
  });

  it('all disabled → null', () => {
    const ctx = makeCtx();
    const stmts = [
      makeStatement('a', 1, false, alwaysTrue),
      makeStatement('b', 2, false, alwaysTrue),
    ];
    expect(service.match(stmts, ctx)).toBeNull();
  });

  it('returns first match by priority, not insertion order', () => {
    const ctx = makeCtx();
    // Insert in reverse priority order; priority 1 should win
    const stmts = [
      makeStatement('low-prio', 10, true, alwaysTrue),
      makeStatement('high-prio', 1, true, alwaysTrue),
      makeStatement('mid-prio', 5, true, alwaysTrue),
    ];
    const result = service.match(stmts, ctx);
    expect(result?.id).toBe('high-prio');
  });

  it('disabled statement is skipped even if it would match', () => {
    const ctx = makeCtx();
    const stmts = [
      makeStatement('disabled', 1, false, alwaysTrue), // priority 1 but disabled
      makeStatement('enabled', 2, true, alwaysTrue),   // priority 2, enabled
    ];
    const result = service.match(stmts, ctx);
    expect(result?.id).toBe('enabled');
  });

  it('second statement matches when first does not', () => {
    const ctx = makeCtx();
    const stmts = [
      makeStatement('no-match', 1, true, alwaysFalse),  // priority 1, won't match GET
      makeStatement('matches', 2, true, alwaysTrue),     // priority 2, matches GET
    ];
    const result = service.match(stmts, ctx);
    expect(result?.id).toBe('matches');
  });

  it('returns null when none of the enabled statements match', () => {
    const ctx = makeCtx();
    const stmts = [
      makeStatement('a', 1, true, alwaysFalse),
      makeStatement('b', 2, true, alwaysFalse),
    ];
    expect(service.match(stmts, ctx)).toBeNull();
  });

  it('skips disabled and returns correct enabled match', () => {
    const ctx = makeCtx();
    const stmts = [
      makeStatement('d1', 1, false, alwaysTrue),  // disabled
      makeStatement('d2', 2, false, alwaysTrue),  // disabled
      makeStatement('e1', 3, true, alwaysFalse),  // enabled but won't match
      makeStatement('e2', 4, true, alwaysTrue),   // enabled and matches
    ];
    const result = service.match(stmts, ctx);
    expect(result?.id).toBe('e2');
  });

  it('does not mutate the original statements array order', () => {
    const ctx = makeCtx();
    const stmts = [
      makeStatement('z', 100, true, alwaysTrue),
      makeStatement('a', 1, true, alwaysTrue),
    ];
    const originalOrder = stmts.map(s => s.id);
    service.match(stmts, ctx);
    expect(stmts.map(s => s.id)).toEqual(originalOrder);
  });

  it('single enabled matching statement is returned', () => {
    const ctx = makeCtx();
    const stmts = [makeStatement('only', 1, true, alwaysTrue)];
    const result = service.match(stmts, ctx);
    expect(result?.id).toBe('only');
  });

  it('works with complex condition (AND group)', () => {
    const ctx = makeCtx({ method: 'POST', queryParams: { id: '999' } });
    const stmt: Statement = {
      id: 'complex',
      priority: 1,
      enabled: true,
      condition: {
        operator: 'AND',
        conditions: [
          { type: 'request.method', op: 'equals', value: 'POST' },
          { type: 'request.query_param', op: 'equals', value: '999', param: 'id' },
        ],
      },
      workflow: [],
    };
    const result = service.match([stmt], ctx);
    expect(result?.id).toBe('complex');
  });
});
