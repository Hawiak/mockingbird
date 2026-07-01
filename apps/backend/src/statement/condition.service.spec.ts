import { describe, it, expect, beforeEach } from 'vitest';
import { ConditionService } from './condition.service';
import type { RequestContext, ConditionLeaf, ConditionGroup, Condition } from '@mockingbird/shared-types';

function makeCtx(overrides: Partial<RequestContext> = {}): RequestContext {
  return {
    method: 'GET',
    path: '/test',
    pathParams: {},
    queryParams: {},
    headers: {},
    body: '',
    callCount: 0,
    ...overrides,
  };
}

function leaf(
  type: ConditionLeaf['type'],
  op: ConditionLeaf['op'],
  value?: string,
  param?: string,
): ConditionLeaf {
  return { type, op, value, param };
}

describe('ConditionService', () => {
  let service: ConditionService;

  beforeEach(() => {
    service = new ConditionService();
  });

  // ─── request.method ───────────────────────────────────────────────────────

  describe('request.method', () => {
    it('equals — matches uppercase', () => {
      const ctx = makeCtx({ method: 'post' });
      expect(service.evaluate(leaf('request.method', 'equals', 'POST'), ctx)).toBe(true);
    });

    it('equals — does not match different method', () => {
      const ctx = makeCtx({ method: 'GET' });
      expect(service.evaluate(leaf('request.method', 'equals', 'POST'), ctx)).toBe(false);
    });

    it('not_equals', () => {
      const ctx = makeCtx({ method: 'DELETE' });
      expect(service.evaluate(leaf('request.method', 'not_equals', 'GET'), ctx)).toBe(true);
    });

    it('contains', () => {
      const ctx = makeCtx({ method: 'GET' });
      expect(service.evaluate(leaf('request.method', 'contains', 'ET'), ctx)).toBe(true);
    });

    it('not_contains', () => {
      const ctx = makeCtx({ method: 'GET' });
      expect(service.evaluate(leaf('request.method', 'not_contains', 'POST'), ctx)).toBe(true);
    });

    it('matches_regex', () => {
      const ctx = makeCtx({ method: 'PUT' });
      expect(service.evaluate(leaf('request.method', 'matches_regex', '^(PUT|PATCH)$'), ctx)).toBe(true);
    });

    it('exists', () => {
      const ctx = makeCtx({ method: 'GET' });
      expect(service.evaluate(leaf('request.method', 'exists'), ctx)).toBe(true);
    });

    it('not_exists — always false (method is always present)', () => {
      const ctx = makeCtx({ method: 'GET' });
      expect(service.evaluate(leaf('request.method', 'not_exists'), ctx)).toBe(false);
    });
  });

  // ─── request.path_param ───────────────────────────────────────────────────

  describe('request.path_param', () => {
    it('equals — match', () => {
      const ctx = makeCtx({ pathParams: { id: '42' } });
      expect(service.evaluate(leaf('request.path_param', 'equals', '42', 'id'), ctx)).toBe(true);
    });

    it('equals — no match', () => {
      const ctx = makeCtx({ pathParams: { id: '99' } });
      expect(service.evaluate(leaf('request.path_param', 'equals', '42', 'id'), ctx)).toBe(false);
    });

    it('exists — param present', () => {
      const ctx = makeCtx({ pathParams: { id: '1' } });
      expect(service.evaluate(leaf('request.path_param', 'exists', undefined, 'id'), ctx)).toBe(true);
    });

    it('not_exists — param absent', () => {
      const ctx = makeCtx({ pathParams: {} });
      expect(service.evaluate(leaf('request.path_param', 'not_exists', undefined, 'id'), ctx)).toBe(true);
    });

    it('gt', () => {
      const ctx = makeCtx({ pathParams: { id: '10' } });
      expect(service.evaluate(leaf('request.path_param', 'gt', '5', 'id'), ctx)).toBe(true);
    });

    it('lt', () => {
      const ctx = makeCtx({ pathParams: { id: '3' } });
      expect(service.evaluate(leaf('request.path_param', 'lt', '5', 'id'), ctx)).toBe(true);
    });

    it('no param key → undefined → not_exists true', () => {
      const ctx = makeCtx();
      expect(service.evaluate({ type: 'request.path_param', op: 'not_exists' }, ctx)).toBe(true);
    });
  });

  // ─── request.query_param ──────────────────────────────────────────────────

  describe('request.query_param', () => {
    it('equals — match', () => {
      const ctx = makeCtx({ queryParams: { format: 'full' } });
      expect(service.evaluate(leaf('request.query_param', 'equals', 'full', 'format'), ctx)).toBe(true);
    });

    it('contains', () => {
      const ctx = makeCtx({ queryParams: { q: 'hello world' } });
      expect(service.evaluate(leaf('request.query_param', 'contains', 'hello', 'q'), ctx)).toBe(true);
    });

    it('not_contains', () => {
      const ctx = makeCtx({ queryParams: { q: 'hello' } });
      expect(service.evaluate(leaf('request.query_param', 'not_contains', 'world', 'q'), ctx)).toBe(true);
    });

    it('exists — present', () => {
      const ctx = makeCtx({ queryParams: { page: '2' } });
      expect(service.evaluate(leaf('request.query_param', 'exists', undefined, 'page'), ctx)).toBe(true);
    });

    it('not_exists — absent', () => {
      const ctx = makeCtx({ queryParams: {} });
      expect(service.evaluate(leaf('request.query_param', 'not_exists', undefined, 'page'), ctx)).toBe(true);
    });
  });

  // ─── request.header ───────────────────────────────────────────────────────

  describe('request.header', () => {
    it('equals — case-insensitive lookup', () => {
      const ctx = makeCtx({ headers: { 'content-type': 'application/json' } });
      expect(service.evaluate(leaf('request.header', 'equals', 'application/json', 'Content-Type'), ctx)).toBe(true);
    });

    it('matches_regex', () => {
      const ctx = makeCtx({ headers: { authorization: 'Bearer token123' } });
      expect(service.evaluate(leaf('request.header', 'matches_regex', '^Bearer .+', 'Authorization'), ctx)).toBe(true);
    });

    it('exists — header present', () => {
      const ctx = makeCtx({ headers: { 'x-api-key': 'abc' } });
      expect(service.evaluate(leaf('request.header', 'exists', undefined, 'x-api-key'), ctx)).toBe(true);
    });

    it('not_exists — header absent', () => {
      const ctx = makeCtx({ headers: {} });
      expect(service.evaluate(leaf('request.header', 'not_exists', undefined, 'x-api-key'), ctx)).toBe(true);
    });
  });

  // ─── request.body_raw ─────────────────────────────────────────────────────

  describe('request.body_raw', () => {
    it('equals', () => {
      const ctx = makeCtx({ body: 'exact-body' });
      expect(service.evaluate(leaf('request.body_raw', 'equals', 'exact-body'), ctx)).toBe(true);
    });

    it('contains', () => {
      const ctx = makeCtx({ body: 'hello world' });
      expect(service.evaluate(leaf('request.body_raw', 'contains', 'world'), ctx)).toBe(true);
    });

    it('not_contains', () => {
      const ctx = makeCtx({ body: 'hello' });
      expect(service.evaluate(leaf('request.body_raw', 'not_contains', 'world'), ctx)).toBe(true);
    });

    it('matches_regex', () => {
      const ctx = makeCtx({ body: '{"status":"active"}' });
      expect(service.evaluate(leaf('request.body_raw', 'matches_regex', '"status":"active"'), ctx)).toBe(true);
    });

    it('exists — body non-empty', () => {
      const ctx = makeCtx({ body: 'data' });
      expect(service.evaluate(leaf('request.body_raw', 'exists'), ctx)).toBe(true);
    });
  });

  // ─── request.body_json ────────────────────────────────────────────────────

  describe('request.body_json', () => {
    it('equals — simple JSONPath', () => {
      const ctx = makeCtx({ body: '{"name":"Alice"}' });
      expect(service.evaluate(leaf('request.body_json', 'equals', 'Alice', '$.name'), ctx)).toBe(true);
    });

    it('equals — nested JSONPath', () => {
      const ctx = makeCtx({ body: '{"user":{"age":30}}' });
      expect(service.evaluate(leaf('request.body_json', 'equals', '30', '$.user.age'), ctx)).toBe(true);
    });

    it('contains — value in string field', () => {
      const ctx = makeCtx({ body: '{"desc":"hello world"}' });
      expect(service.evaluate(leaf('request.body_json', 'contains', 'hello', '$.desc'), ctx)).toBe(true);
    });

    it('gt — numeric comparison', () => {
      const ctx = makeCtx({ body: '{"price":99}' });
      expect(service.evaluate(leaf('request.body_json', 'gt', '50', '$.price'), ctx)).toBe(true);
    });

    it('lt — numeric comparison', () => {
      const ctx = makeCtx({ body: '{"stock":3}' });
      expect(service.evaluate(leaf('request.body_json', 'lt', '10', '$.stock'), ctx)).toBe(true);
    });

    it('exists — path found', () => {
      const ctx = makeCtx({ body: '{"id":1}' });
      expect(service.evaluate(leaf('request.body_json', 'exists', undefined, '$.id'), ctx)).toBe(true);
    });

    it('not_exists — JSONPath finds no result', () => {
      const ctx = makeCtx({ body: '{"name":"Bob"}' });
      expect(service.evaluate(leaf('request.body_json', 'not_exists', undefined, '$.missing'), ctx)).toBe(true);
    });

    it('exists false — JSONPath finds no result', () => {
      const ctx = makeCtx({ body: '{"name":"Bob"}' });
      expect(service.evaluate(leaf('request.body_json', 'exists', undefined, '$.missing'), ctx)).toBe(false);
    });

    it('invalid JSON body → undefined → exists=false (no throw)', () => {
      const ctx = makeCtx({ body: 'not valid json' });
      expect(() =>
        service.evaluate(leaf('request.body_json', 'exists', undefined, '$.foo'), ctx)
      ).not.toThrow();
      expect(service.evaluate(leaf('request.body_json', 'exists', undefined, '$.foo'), ctx)).toBe(false);
    });

    it('invalid JSON body → undefined → not_exists=true (no throw)', () => {
      const ctx = makeCtx({ body: '{{broken' });
      expect(service.evaluate(leaf('request.body_json', 'not_exists', undefined, '$.foo'), ctx)).toBe(true);
    });

    it('matches_regex on JSON value', () => {
      const ctx = makeCtx({ body: '{"email":"user@example.com"}' });
      expect(service.evaluate(leaf('request.body_json', 'matches_regex', '^.+@.+\\..+$', '$.email'), ctx)).toBe(true);
    });
  });

  // ─── request.body_xml ─────────────────────────────────────────────────────

  describe('request.body_xml', () => {
    const xmlBody = '<root><name>Alice</name><age>30</age></root>';

    it('equals — text content via XPath', () => {
      const ctx = makeCtx({ body: xmlBody });
      expect(service.evaluate(leaf('request.body_xml', 'equals', 'Alice', '//name/text()'), ctx)).toBe(true);
    });

    it('contains — text content', () => {
      const ctx = makeCtx({ body: xmlBody });
      expect(service.evaluate(leaf('request.body_xml', 'contains', 'Ali', '//name/text()'), ctx)).toBe(true);
    });

    it('not_equals', () => {
      const ctx = makeCtx({ body: xmlBody });
      expect(service.evaluate(leaf('request.body_xml', 'not_equals', 'Bob', '//name/text()'), ctx)).toBe(true);
    });

    it('exists — node found', () => {
      const ctx = makeCtx({ body: xmlBody });
      expect(service.evaluate(leaf('request.body_xml', 'exists', undefined, '//age/text()'), ctx)).toBe(true);
    });

    it('not_exists — node not found', () => {
      const ctx = makeCtx({ body: xmlBody });
      expect(service.evaluate(leaf('request.body_xml', 'not_exists', undefined, '//missing/text()'), ctx)).toBe(true);
    });
  });

  // ─── request.count ────────────────────────────────────────────────────────

  describe('request.count', () => {
    it('equals', () => {
      const ctx = makeCtx({ callCount: 3 });
      expect(service.evaluate(leaf('request.count', 'equals', '3'), ctx)).toBe(true);
    });

    it('gt — count above threshold', () => {
      const ctx = makeCtx({ callCount: 10 });
      expect(service.evaluate(leaf('request.count', 'gt', '5'), ctx)).toBe(true);
    });

    it('lt — count below threshold', () => {
      const ctx = makeCtx({ callCount: 2 });
      expect(service.evaluate(leaf('request.count', 'lt', '5'), ctx)).toBe(true);
    });

    it('not_equals', () => {
      const ctx = makeCtx({ callCount: 7 });
      expect(service.evaluate(leaf('request.count', 'not_equals', '3'), ctx)).toBe(true);
    });
  });

  // ─── All remaining operators ──────────────────────────────────────────────

  describe('operator coverage', () => {
    it('not_equals — false when equal', () => {
      const ctx = makeCtx({ method: 'GET' });
      expect(service.evaluate(leaf('request.method', 'not_equals', 'GET'), ctx)).toBe(false);
    });

    it('not_contains — false when contained', () => {
      const ctx = makeCtx({ body: 'hello world' });
      expect(service.evaluate(leaf('request.body_raw', 'not_contains', 'world'), ctx)).toBe(false);
    });

    it('matches_regex — false when no match', () => {
      const ctx = makeCtx({ method: 'GET' });
      expect(service.evaluate(leaf('request.method', 'matches_regex', '^POST$'), ctx)).toBe(false);
    });

    it('gt — false when equal', () => {
      const ctx = makeCtx({ callCount: 5 });
      expect(service.evaluate(leaf('request.count', 'gt', '5'), ctx)).toBe(false);
    });

    it('lt — false when equal', () => {
      const ctx = makeCtx({ callCount: 5 });
      expect(service.evaluate(leaf('request.count', 'lt', '5'), ctx)).toBe(false);
    });

    it('unknown op → false', () => {
      const ctx = makeCtx({ method: 'GET' });
      expect(service.evaluate({ type: 'request.method', op: 'unknown_op' as never }, ctx)).toBe(false);
    });
  });

  // ─── AND group ────────────────────────────────────────────────────────────

  describe('AND group', () => {
    it('both true → true', () => {
      const ctx = makeCtx({ method: 'POST', queryParams: { page: '1' } });
      const group: ConditionGroup = {
        operator: 'AND',
        conditions: [
          leaf('request.method', 'equals', 'POST'),
          leaf('request.query_param', 'equals', '1', 'page'),
        ],
      };
      expect(service.evaluate(group, ctx)).toBe(true);
    });

    it('one false → false', () => {
      const ctx = makeCtx({ method: 'GET', queryParams: { page: '1' } });
      const group: ConditionGroup = {
        operator: 'AND',
        conditions: [
          leaf('request.method', 'equals', 'POST'), // false
          leaf('request.query_param', 'equals', '1', 'page'), // true
        ],
      };
      expect(service.evaluate(group, ctx)).toBe(false);
    });

    it('all false → false', () => {
      const ctx = makeCtx({ method: 'GET' });
      const group: ConditionGroup = {
        operator: 'AND',
        conditions: [
          leaf('request.method', 'equals', 'POST'),
          leaf('request.method', 'equals', 'PUT'),
        ],
      };
      expect(service.evaluate(group, ctx)).toBe(false);
    });
  });

  // ─── OR group ─────────────────────────────────────────────────────────────

  describe('OR group', () => {
    it('one true → true', () => {
      const ctx = makeCtx({ method: 'GET' });
      const group: ConditionGroup = {
        operator: 'OR',
        conditions: [
          leaf('request.method', 'equals', 'POST'), // false
          leaf('request.method', 'equals', 'GET'),  // true
        ],
      };
      expect(service.evaluate(group, ctx)).toBe(true);
    });

    it('both false → false', () => {
      const ctx = makeCtx({ method: 'DELETE' });
      const group: ConditionGroup = {
        operator: 'OR',
        conditions: [
          leaf('request.method', 'equals', 'GET'),
          leaf('request.method', 'equals', 'POST'),
        ],
      };
      expect(service.evaluate(group, ctx)).toBe(false);
    });

    it('both true → true', () => {
      const ctx = makeCtx({ method: 'GET', queryParams: { a: '1' } });
      const group: ConditionGroup = {
        operator: 'OR',
        conditions: [
          leaf('request.method', 'equals', 'GET'),
          leaf('request.query_param', 'equals', '1', 'a'),
        ],
      };
      expect(service.evaluate(group, ctx)).toBe(true);
    });
  });

  // ─── Deeply nested AND inside OR ─────────────────────────────────────────

  describe('nested groups', () => {
    it('AND inside OR — nested AND branch matches', () => {
      // OR( AND(method=POST, header exists), method=GET )
      // ctx: GET → outer OR second branch true
      const ctx = makeCtx({ method: 'GET' });
      const condition: Condition = {
        operator: 'OR',
        conditions: [
          {
            operator: 'AND',
            conditions: [
              leaf('request.method', 'equals', 'POST'),
              leaf('request.header', 'exists', undefined, 'x-special'),
            ],
          } as ConditionGroup,
          leaf('request.method', 'equals', 'GET'),
        ],
      };
      expect(service.evaluate(condition, ctx)).toBe(true);
    });

    it('AND inside OR — nested AND branch fails, OR second branch also fails → false', () => {
      const ctx = makeCtx({ method: 'DELETE' });
      const condition: Condition = {
        operator: 'OR',
        conditions: [
          {
            operator: 'AND',
            conditions: [
              leaf('request.method', 'equals', 'POST'),
              leaf('request.header', 'exists', undefined, 'x-special'),
            ],
          } as ConditionGroup,
          leaf('request.method', 'equals', 'GET'),
        ],
      };
      expect(service.evaluate(condition, ctx)).toBe(false);
    });

    it('OR inside AND — both branches must be true', () => {
      const ctx = makeCtx({ method: 'GET', queryParams: { format: 'full' } });
      const condition: Condition = {
        operator: 'AND',
        conditions: [
          {
            operator: 'OR',
            conditions: [
              leaf('request.method', 'equals', 'GET'),
              leaf('request.method', 'equals', 'HEAD'),
            ],
          } as ConditionGroup,
          leaf('request.query_param', 'equals', 'full', 'format'),
        ],
      };
      expect(service.evaluate(condition, ctx)).toBe(true);
    });
  });
});
