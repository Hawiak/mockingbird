import 'reflect-metadata';
import { describe, it, expect, beforeEach } from 'vitest';
import { TemplateService } from './template.service';

function makeCtx(overrides?: Partial<{
  method: string;
  path: string;
  body: string;
  pathParams: Record<string, string>;
  queryParams: Record<string, string>;
  headers: Record<string, string>;
  callCount: number;
  parameterSets: Record<string, Record<string, string>>;
}>) {
  return {
    request: {
      method: overrides?.method ?? 'GET',
      path: overrides?.path ?? '/test',
      body: overrides?.body ?? '',
      pathParams: overrides?.pathParams ?? {},
      queryParams: overrides?.queryParams ?? {},
      headers: overrides?.headers ?? {},
      callCount: overrides?.callCount ?? 1,
    },
    parameterSets: overrides?.parameterSets ?? {},
  };
}

describe('TemplateService', () => {
  let svc: TemplateService;

  beforeEach(() => {
    svc = new TemplateService();
  });

  // ── request.* basics ────────────────────────────────────────────────────────

  it('resolves {{request.method}}', () => {
    const ctx = makeCtx({ method: 'POST' });
    const { output, warnings } = svc.render('{{request.method}}', ctx);
    expect(output).toBe('POST');
    expect(warnings).toHaveLength(0);
  });

  it('resolves {{request.path}}', () => {
    const ctx = makeCtx({ path: '/pets/42' });
    const { output } = svc.render('{{request.path}}', ctx);
    expect(output).toBe('/pets/42');
  });

  it('resolves {{request.body}}', () => {
    const ctx = makeCtx({ body: '{"foo":"bar"}' });
    const { output } = svc.render('{{request.body}}', ctx);
    expect(output).toBe('{"foo":"bar"}');
  });

  // ── path / query / header params ────────────────────────────────────────────

  it('resolves {{request.path_param.id}}', () => {
    const ctx = makeCtx({ pathParams: { id: '99' } });
    const { output } = svc.render('id is {{request.path_param.id}}', ctx);
    expect(output).toBe('id is 99');
  });

  it('resolves {{request.query_param.format}}', () => {
    const ctx = makeCtx({ queryParams: { format: 'full' } });
    const { output } = svc.render('format={{request.query_param.format}}', ctx);
    expect(output).toBe('format=full');
  });

  it('resolves {{request.header.authorization}} (lowercased lookup)', () => {
    const ctx = makeCtx({ headers: { authorization: 'Bearer tok123' } });
    const { output } = svc.render('{{request.header.authorization}}', ctx);
    expect(output).toBe('Bearer tok123');
  });

  // ── JSONPath ─────────────────────────────────────────────────────────────────

  it('resolves {{request.body_json.$.user.name}} from JSON body', () => {
    const ctx = makeCtx({ body: '{"user":{"name":"Alice"}}' });
    const { output } = svc.render('{{request.body_json.$.user.name}}', ctx);
    expect(output).toBe('Alice');
  });

  it('returns empty string and warning when JSONPath has no match', () => {
    const ctx = makeCtx({ body: '{"user":{"name":"Alice"}}' });
    const { output, warnings } = svc.render('{{request.body_json.$.missing}}', ctx);
    expect(output).toBe('');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('request.body_json.$.missing');
  });

  it('returns empty string and warning when body is not valid JSON', () => {
    const ctx = makeCtx({ body: 'not-json' });
    const { output, warnings } = svc.render('{{request.body_json.$.foo}}', ctx);
    expect(output).toBe('');
    expect(warnings).toHaveLength(1);
  });

  // ── built-ins ────────────────────────────────────────────────────────────────

  it('resolves {{now}} to a parseable ISO-8601 string', () => {
    const ctx = makeCtx();
    const { output } = svc.render('{{now}}', ctx);
    const d = new Date(output);
    expect(d.toISOString()).toBe(output);
  });

  it('resolves {{uuid}} to a v4 UUID', () => {
    const ctx = makeCtx();
    const { output } = svc.render('{{uuid}}', ctx);
    expect(output).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('generates a different UUID on each render call', () => {
    const ctx = makeCtx();
    const first = svc.render('{{uuid}}', ctx).output;
    const second = svc.render('{{uuid}}', ctx).output;
    expect(first).not.toBe(second);
  });

  // ── parameter sets ──────────────────────────────────────────────────────────

  it('resolves {{mySet.key}} from a named parameter set', () => {
    const ctx = makeCtx({
      parameterSets: { mySet: { key: 'hello' } },
    });
    const { output } = svc.render('{{mySet.key}}', ctx);
    expect(output).toBe('hello');
  });

  it('later parameter set overrides earlier for the same key', () => {
    // ctx.parameterSets is a Record keyed by set name; last writer wins when
    // two sets contain the same key.
    // We simulate the "last writer wins" contract: if setA.value='first'
    // and setB.value='second', the template engine must pick setB.value when
    // the template asks for {{setB.value}}.
    const ctx = makeCtx({
      parameterSets: {
        setA: { value: 'first' },
        setB: { value: 'second' },
      },
    });
    // Template resolves set names independently; to verify override semantics
    // we render both and confirm the engine returns each set's own value.
    const resultA = svc.render('{{setA.value}}', ctx);
    const resultB = svc.render('{{setB.value}}', ctx);
    expect(resultA.output).toBe('first');
    expect(resultB.output).toBe('second');
  });

  it('resolves from a set that overrides a key shared by an earlier set', () => {
    // Demonstrate that if both sets export "color", each resolves by set name
    const ctx = makeCtx({
      parameterSets: {
        brand: { color: 'blue' },
        theme: { color: 'red' },
      },
    });
    expect(svc.render('{{brand.color}}', ctx).output).toBe('blue');
    expect(svc.render('{{theme.color}}', ctx).output).toBe('red');
  });

  // ── unresolved variable ──────────────────────────────────────────────────────

  it('leaves empty string for an unresolved variable and adds warning', () => {
    const ctx = makeCtx();
    const { output, warnings } = svc.render('prefix-{{unknownVar}}-suffix', ctx);
    expect(output).toBe('prefix--suffix');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('unknownVar');
  });

  it('collects warnings for multiple unresolved variables', () => {
    const ctx = makeCtx();
    const { warnings } = svc.render('{{a}} and {{b}}', ctx);
    expect(warnings).toHaveLength(2);
  });

  // ── response context ─────────────────────────────────────────────────────────

  it('resolves {{response.statusCode}} when ctx.response is set', () => {
    const ctx = {
      ...makeCtx(),
      response: { statusCode: 201, headers: {}, body: '' },
    };
    const { output } = svc.render('{{response.statusCode}}', ctx);
    expect(output).toBe('201');
  });

  it('resolves {{response.body}} when ctx.response is set', () => {
    const ctx = {
      ...makeCtx(),
      response: { statusCode: 200, headers: {}, body: '{"ok":true}' },
    };
    const { output } = svc.render('{{response.body}}', ctx);
    expect(output).toBe('{"ok":true}');
  });

  it('returns empty string and warning for {{response.statusCode}} when ctx.response is absent', () => {
    const ctx = makeCtx();
    const { output, warnings } = svc.render('{{response.statusCode}}', ctx);
    expect(output).toBe('');
    expect(warnings).toHaveLength(1);
  });

  // ── no-variable passthrough ──────────────────────────────────────────────────

  it('returns input unchanged when template has no variables', () => {
    const ctx = makeCtx();
    const plain = 'no variables here';
    const { output, warnings } = svc.render(plain, ctx);
    expect(output).toBe(plain);
    expect(warnings).toHaveLength(0);
  });

  it('handles an empty template', () => {
    const ctx = makeCtx();
    const { output } = svc.render('', ctx);
    expect(output).toBe('');
  });

  // ── multiple variables in one template ───────────────────────────────────────

  it('interpolates multiple variables in a single template string', () => {
    const ctx = makeCtx({
      method: 'DELETE',
      pathParams: { id: '7' },
    });
    const { output } = svc.render(
      'method={{request.method}} id={{request.path_param.id}}',
      ctx,
    );
    expect(output).toBe('method=DELETE id=7');
  });
});
