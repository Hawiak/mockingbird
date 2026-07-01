# Mockingbird — Test Plan

## Coverage status legend

- ✅ Covered — test exists and passes
- 🔲 Planned, not yet written
- ⚠️ Gap — needs design clarification before a test can be written

---

## 1. Config (Steps 1–3)

### 1.1 YAML parsing

**What to assert:** `config.Load` correctly deserialises every field in `mockingbird.yaml` into the corresponding TypeScript interface.

| # | Case | Input | Expected |
|---|---|---|---|
| 🔲 | Minimal valid config | `minimal.yaml` fixture | Returns `Config` with no error; `config.services[0].port === 8081` |
| 🔲 | Full config round-trip | `mockingbird.yaml` example from DESIGN.md | All nested structs populated; no zero-value surprises on required fields |
| 🔲 | Unknown fields ignored | YAML with an extra `foo: bar` key | Parses successfully, unknown key is silently dropped |
| 🔲 | Missing required field — port | Service with no `port:` | Returns an error describing the missing field |
| 🔲 | Invalid YAML syntax | `invalid.yaml` fixture | Returns a parse error; does not panic |
| 🔲 | Empty file | Zero-byte file | Returns an error or the zero-value `Config`; does not panic |
| 🔲 | Version field | `version: "1"` | `Config.Version == "1"` |

**Edge cases:**
- `base_path` is optional and defaults to `""`.
- `cors.enabled` defaults to `true` even when `cors:` block is absent from config.
- Statement `priority` field is an integer; test that a string value returns a parse error.

---

### 1.2 Env var substitution

**What to assert:** Every `${VAR}` token in string fields is replaced with the corresponding environment variable value before the config is returned.

| # | Case | Setup | Expected |
|---|---|---|---|
| 🔲 | Single variable resolved | `PAYMENT_SERVICE_TOKEN=abc` in env; `"Bearer ${PAYMENT_SERVICE_TOKEN}"` in config | Resolved string is `"Bearer abc"` |
| 🔲 | Multiple variables in one string | `A=foo`, `B=bar`; `"${A}-${B}"` | Resolved to `"foo-bar"` |
| 🔲 | Variable in nested struct | Env var referenced inside `modules[].config.auth.password` | Substituted at any nesting depth |
| 🔲 | Unresolved variable | `${MISSING_VAR}` with no env set | Substituted with empty string; warning logged; no error returned |
| 🔲 | No variables | Config with no `${…}` tokens | Config returned unchanged |
| 🔲 | Partial match — no braces | `$VAR_NAME` (no curly braces) | Treated as a literal string, not substituted |

**Edge cases:**
- Substitution must walk every string field recursively, including inside `[]string` slices (e.g. `allow_origins`, Kafka broker list).
- An env var whose value itself contains `${…}` must not be substituted again (no double-pass).

---

### 1.3 Hot reload

**What to assert:** When `mockingbird.yaml` is modified on disk, the Watcher parses the new file and delivers a `ChangeEvent` to all subscribers.

| # | Case | Action | Expected |
|---|---|---|---|
| 🔲 | Valid change delivered | Write new port to config file | Subscriber receives `{ old: { port: 8081 }, new: { port: 8082 } }` within 500ms |
| 🔲 | Invalid YAML not broadcast | Write malformed YAML | No `ChangeEvent` emitted; error logged; watcher keeps running |
| 🔲 | Identical content no-op | Re-write the same bytes | No `ChangeEvent` emitted (hash check) |
| 🔲 | Multiple rapid writes debounced | Write file 5 times in 50ms | Exactly one `ChangeEvent` received (200ms debounce) |
| 🔲 | Multiple subscribers | Two subscriber callbacks registered | Both receive the same `ChangeEvent` |
| 🔲 | Subscriber added after boot | Subscribe after first change | Receives future events; does not receive past events |

**Edge cases:**
- Watcher must not block the calling thread when no subscriber is listening.
- If `chokidar` fires a non-content event (e.g. a touch with no byte change), no reload should occur (hash guard prevents it).

---

## 2. Swagger loading (Steps 4–5)

### 2.1 URL source — success, failure, cache fallback

**What to assert:** `loader.Load` for a `url`-type spec fetches from the remote, writes the cache, and returns parsed endpoints. On failure, falls back to the cached copy.

| # | Case | Setup | Expected |
|---|---|---|---|
| 🔲 | Success — first load | Local test HTTP server serving a valid OAS3 spec | Returns list of endpoints; cache file written to `.mockingbird-cache/specs/{id}.json` |
| 🔲 | Success with auth headers | Spec server requires `Authorization` header | Header is forwarded; spec returned; env var substitution runs before the request |
| 🔲 | Remote unreachable, cache exists | Server down; cache present | Returns endpoints from cache; warning logged |
| 🔲 | Remote unreachable, no cache | Server down; no cache file | Returns error; no panic |
| 🔲 | Spec unchanged on refresh | Second fetch returns same bytes | No `SpecChangedEvent` emitted (hash unchanged) |
| 🔲 | Spec changed on refresh | Second fetch returns different spec | `SpecChangedEvent` emitted with new endpoint list |

**Edge cases:**
- The cache directory must be created if it does not exist.
- The background refresh task must respect `refresh_interval_s`; a value of `0` should default to some safe interval or disable auto-refresh (⚠️ see Design gaps §G2).

---

### 2.2 Upload source

**What to assert:** `loader.Load` for an `upload`-type spec reads the spec from the cache path (written by the upload API) and returns parsed endpoints. No remote URL is involved.

| # | Case | Input | Expected |
|---|---|---|---|
| 🔲 | Valid uploaded OAS3 JSON | Cache file contains Petstore JSON | Endpoints parsed and returned |
| 🔲 | Valid uploaded OAS2 YAML | Cache file contains OAS2 YAML spec | Endpoints parsed and returned |
| 🔲 | Cache file missing | No file at cache path | Returns error |
| 🔲 | Corrupt cache file | Cache contains invalid JSON | Returns a parse error |

---

### 2.3 Hosted source

**What to assert:** Hosted behaves identically to upload for loading, and additionally the spec is served at `GET /mockingbird/specs/{service-id}`.

| # | Case | Expected |
|---|---|---|
| 🔲 | Spec served at well-known path | `GET /mockingbird/specs/payment-service` returns the raw spec bytes with `Content-Type: application/json` |
| 🔲 | Spec not found | Path for unknown service-id returns `404` |

---

### 2.4 Default response generation — schema types

**What to assert:** `generateValue(schema)` returns the correct value for each schema type and format combination.

| # | Schema type / format | Expected generated value |
|---|---|---|
| 🔲 | `string` (no format) | `"string"` |
| 🔲 | `string / email` | `"user@example.com"` |
| 🔲 | `string / uuid` | Matches UUID v4 regex |
| 🔲 | `string / date` | `"2026-06-30"` (today's date) |
| 🔲 | `string / date-time` | Parseable ISO 8601 timestamp |
| 🔲 | `string / uri` | `"https://example.com"` |
| 🔲 | `string` with `enum: ["a","b"]` | `"a"` (first entry) |
| 🔲 | `string` with `minLength: 5` | String of exactly 5 characters |
| 🔲 | `integer` (no minimum) | `0` |
| 🔲 | `integer` with `minimum: 10` | `10` |
| 🔲 | `number` (no minimum) | `0.0` |
| 🔲 | `number` with `minimum: 1.5` | `1.5` |
| 🔲 | `boolean` | `true` |
| 🔲 | `array` | One-element array; element is generated from `items` schema |
| 🔲 | `object` with two properties | Object with both properties present, each generated |
| 🔲 | `oneOf: [A, B]` | Value generated from schema A |
| 🔲 | `anyOf: [A, B]` | Value generated from schema A |
| 🔲 | `allOf: [A, B]` (disjoint properties) | Merged object containing properties from both A and B |
| 🔲 | `$ref` pointing to a schema | Ref resolved, value generated from referenced schema |
| 🔲 | `nullable: true` | Generated value is the non-null value (not `null`) |
| 🔲 | No type, no schema | Empty body (priority 6 fallback) |

**Edge cases:**
- Circular `$ref` must not cause infinite recursion (requires a depth limit or visited-set guard).
- `allOf` with overlapping property names: later schema's property value wins.

---

### 2.5 Default response generation — status code selection

**What to assert:** The generator picks the lowest 2xx status code defined in the operation.

| # | Defined codes | Expected selected code |
|---|---|---|
| 🔲 | `200`, `201`, `404` | `200` |
| 🔲 | `201`, `202` | `201` |
| 🔲 | `204` only | `204` |
| 🔲 | `400`, `404`, `500` (no 2xx) | `200` (fallback) |
| 🔲 | No responses defined | `200` (fallback) |

**Content-Type selection:**
- When spec defines `["application/json", "application/xml"]` → `application/json` selected.
- When spec defines only `"application/xml"` → `"application/xml"` selected.

**Never-overwrite rule:**
- When an endpoint already has a user-set `default_response_block`, the generator must not replace it. Assert the existing block ID is preserved after a second import of the same spec.

---

### 2.6 Spec drift detection (orphaned endpoints)

**What to assert:** When a spec update removes a path that has user-configured statements or workflows, that endpoint is flagged as orphaned and removed from the active routing table but kept in config.

| # | Case | Expected |
|---|---|---|
| 🔲 | Endpoint removed from spec, has statements | Marked orphaned; `GET /orphaned-endpoints` returns it; mock server stops routing requests to that path |
| 🔲 | Endpoint removed from spec, no statements and default response is auto-generated | Not flagged as orphaned (no user data to preserve); safely deleted |
| 🔲 | Endpoint still in spec | Not flagged; continues routing normally |
| 🔲 | Remap clears orphan flag | `POST /remap` with valid target → orphaned entry removed; statements now live on the new endpoint |

⚠️ **Gap G7** — see Design gaps section: the exact condition that qualifies an endpoint for orphan preservation vs. silent deletion is underspecified (see §G7).

---

## 3. Mock HTTP servers (Steps 6–8)

### 3.1 Route registration from spec

**What to assert:** For each parsed endpoint, the mock server registers the correct method+path combination and returns the default response block.

| # | Case | Request | Expected |
|---|---|---|---|
| 🔲 | Static path | `GET /payments` | `200` with default response body |
| 🔲 | Path with parameter | `GET /payments/123` | `200`; path param `id=123` available to statement engine |
| 🔲 | Wrong method | `POST /payments/123` when only GET registered | `405 Method Not Allowed` |
| 🔲 | Unknown path | `GET /unknown-path` | `404 Not Found` |
| 🔲 | Base path prefix | Service with `base_path: /v1`; request to `/v1/payments` | Matches and returns default response |

**Edge cases:**
- OAS path parameter syntax `{id}` must map to the router's native parameter syntax without breaking other routes.
- A reload that adds a new endpoint to the spec must make that endpoint routable within ~200ms without restarting unaffected services.

---

### 3.2 CORS preflight (OPTIONS)

**What to assert:** An `OPTIONS` request is intercepted by CORS middleware and returns `204 No Content` with the correct headers, without reaching the statement engine.

| # | Case | Request | Expected headers |
|---|---|---|---|
| 🔲 | Default CORS config | `OPTIONS /payments/123` | `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: *`, `Access-Control-Allow-Headers: *`; status `204` |
| 🔲 | Custom origins | `cors.allow_origins: ["https://app.example.com"]` | `Access-Control-Allow-Origin: https://app.example.com` |
| 🔲 | Statement engine not reached | Statement on endpoint that would match any request | Statement is NOT executed for OPTIONS; no workflow runs |

---

### 3.3 CORS headers on regular requests

**What to assert:** Non-OPTIONS requests also carry `Access-Control-Allow-*` headers injected by the middleware.

| # | Case | Request | Expected |
|---|---|---|---|
| 🔲 | GET request | `GET /payments/123` | Response includes `Access-Control-Allow-Origin: *` alongside the mock response body |
| 🔲 | POST request | `POST /payments` | CORS headers present |

---

### 3.4 CORS disabled per service

**What to assert:** When `cors.enabled: false`, no CORS headers are added and OPTIONS requests are NOT short-circuited.

| # | Case | Expected |
|---|---|---|
| 🔲 | OPTIONS with CORS disabled | `OPTIONS /payments/123` → statement engine evaluates normally; no `Access-Control-*` headers in response |
| 🔲 | GET with CORS disabled | Response has no `Access-Control-*` headers |

---

### 3.5 Request log ring buffer

**What to assert:** Every handled request is appended to the ring buffer. When capacity is reached, the oldest entry is evicted.

| # | Case | Action | Expected |
|---|---|---|---|
| 🔲 | Entry captured | Send `GET /payments/123` | Ring buffer contains 1 entry with correct `Method`, `Path`, `Status`, `ServiceID` |
| 🔲 | Eviction at capacity | Send 1001 requests with capacity=1000 | Buffer contains 1000 entries; first request entry is gone |
| 🔲 | Capacity configurable | `settings.log_max_entries: 500` | Buffer capacity is 500 |
| 🔲 | Max capacity enforced | `settings.log_max_entries: 99999` | Buffer capped at 10000 |

---

### 3.6 WebSocket broadcast

**What to assert:** When a request is handled, the log entry is pushed to all connected WebSocket clients.

| # | Case | Expected |
|---|---|---|
| 🔲 | Single client receives entry | Connect WS client, send HTTP request | Client receives JSON-encoded `Entry` within 100ms |
| 🔲 | Multiple clients receive entry | Two clients connected | Both receive the same entry |
| 🔲 | Client receives backlog on connect | 10 entries in buffer; new client connects | Client immediately receives all 10 historical entries |
| 🔲 | Disconnected client does not block | Client disconnects; new requests arrive | Server does not block or error; remaining clients still receive entries |

---

## 4. Statement engine (Steps 9–10)

### 4.1 Condition types — one test case per type

**What to assert:** `Evaluate(condition, req, callCount)` returns `true` when the condition matches and `false` otherwise, for each condition type.

| # | Type | Matching request | Non-matching request |
|---|---|---|---|
| 🔲 | `request.method` | `GET` against `op: equals, value: GET` | `POST` against same condition |
| 🔲 | `request.path_param` | Path `/payments/999`, param `id`, `op: equals, value: 999` | Path `/payments/123` |
| 🔲 | `request.query_param` | `?format=full`, param `format`, `op: equals, value: full` | `?format=summary` |
| 🔲 | `request.header` | Header `X-Tenant: acme`, param `X-Tenant`, `op: equals, value: acme` | Different value |
| 🔲 | `request.body_json` | Body `{"user":{"email":"a@b.com"}}`, JSONPath `$.user.email`, `op: equals, value: a@b.com` | JSONPath points to missing field |
| 🔲 | `request.body_xml` | Body `<root><id>1</id></root>`, XPath `//id`, `op: equals, value: 1` | XPath misses |
| 🔲 | `request.body_raw` | Body `hello world`, `op: contains, value: hello` | Body `goodbye` |
| 🔲 | `request.count` | Third call against `op: equals, value: 3` | First or second call |

---

### 4.2 Operators — one test case per operator

Input: single condition of type `request.query_param` (simplest to set up), varying operator.

| # | Operator | Matches | Does not match |
|---|---|---|---|
| 🔲 | `equals` | `?q=foo` vs `value: foo` | `?q=bar` |
| 🔲 | `not_equals` | `?q=bar` vs `value: foo` | `?q=foo` |
| 🔲 | `contains` | `?q=foobar` vs `value: foo` | `?q=baz` |
| 🔲 | `not_contains` | `?q=baz` vs `value: foo` | `?q=foobar` |
| 🔲 | `matches_regex` | `?q=abc123` vs `value: ^[a-z]+\d+$` | `?q=abc` |
| 🔲 | `exists` | `?q=anything` vs (no value field needed) | Request with no `q` param |
| 🔲 | `not_exists` | Request with no `q` param | `?q=anything` |
| 🔲 | `gt` (numeric) | `?n=10` vs `value: 5` | `?n=3` |
| 🔲 | `lt` (numeric) | `?n=3` vs `value: 5` | `?n=10` |
| 🔲 | `gt` (non-numeric fallback) | `?s=b` vs `value: a` (lexicographic) | `?s=a` |

---

### 4.3 AND / OR grouping (nested)

**What to assert:** The recursive condition tree evaluates AND and OR semantics correctly, including nesting.

| # | Tree | Match case | Non-match case |
|---|---|---|---|
| 🔲 | `A AND B` | Both A and B satisfied | Only A satisfied |
| 🔲 | `A OR B` | Only A satisfied | Neither A nor B satisfied |
| 🔲 | `A AND (B OR C)` | A + B satisfied | A satisfied but B and C both fail |
| 🔲 | `(A OR B) AND (C OR D)` | A and C satisfied | A satisfied but C and D both fail |
| 🔲 | Single leaf condition (no grouping) | Condition satisfied | Condition not satisfied |

---

### 4.4 Priority ordering

**What to assert:** Statements are evaluated in ascending priority order; the first match wins.

| # | Setup | Request | Expected matched statement |
|---|---|---|---|
| 🔲 | Two statements: priority 1 (id=999→404), priority 2 (id=999→200) | `GET /payments/999` | Statement with priority 1 matches (higher priority wins) |
| 🔲 | Two statements: priority 1 (format=full), priority 2 (id=999) | `GET /payments/999?format=full` | Statement with priority 1 matches |
| 🔲 | Priorities not sequential (1, 5, 10) | Request matching priority-5 condition | Priority-5 statement matches, not priority-10 |

---

### 4.5 Disabled statements skipped

**What to assert:** A statement with `enabled: false` is never evaluated, even if its condition would match.

| # | Setup | Expected |
|---|---|---|
| 🔲 | One enabled, one disabled (would match first) | Enabled statement runs; disabled statement never evaluated |
| 🔲 | All statements disabled | Falls through to default response block |

---

### 4.6 No match → default response

**What to assert:** When no statement matches, the endpoint's `default_response_block` is returned.

| # | Setup | Request | Expected |
|---|---|---|---|
| 🔲 | One statement (id=999), request with id=1 | `GET /payments/1` | Returns default response block body and status |
| 🔲 | No statements configured | Any request | Returns default response block directly |

---

### 4.7 Call count condition

**What to assert:** `request.count` tracks how many times the endpoint has been called across all requests (not per-client), and the count increments atomically.

| # | Case | Expected |
|---|---|---|
| 🔲 | Third call triggers statement | Statement condition `count op: equals value: 3`; first two calls skip it; third matches | First two return default; third triggers statement workflow |
| 🔲 | Count persists across statements | Multiple statements checked on each call | Counter increments exactly once per inbound request |
| 🔲 | Concurrent requests | 10 concurrent requests hit endpoint simultaneously | Counter ends at exactly 10 (no races) |

---

## 5. Workflow executor (Steps 11–15)

### 5.1 Template engine — request.* variables

**What to assert:** `Render(tmpl, ctx)` substitutes every `request.*` token with the correct value from the request context.

| # | Template | Request | Expected output |
|---|---|---|---|
| 🔲 | `{{request.method}}` | `GET /payments/1` | `"GET"` |
| 🔲 | `{{request.path}}` | `GET /payments/1` | `"/payments/1"` |
| 🔲 | `{{request.path_param.id}}` | Path `/payments/42` | `"42"` |
| 🔲 | `{{request.query.page}}` | `?page=3` | `"3"` |
| 🔲 | `{{request.header.Authorization}}` | Header `Authorization: Bearer tok` | `"Bearer tok"` |
| 🔲 | `{{request.body}}` | Raw body `{"x":1}` | `"{\"x\":1}"` (raw string) |

---

### 5.2 Template engine — JSONPath

**What to assert:** `{{request.body_json.$.path.expression}}` correctly extracts values from the parsed JSON body.

| # | Template | Body | Expected |
|---|---|---|---|
| 🔲 | `{{request.body_json.$.user.email}}` | `{"user":{"email":"a@b.com"}}` | `"a@b.com"` |
| 🔲 | `{{request.body_json.$.items[0].id}}` | `{"items":[{"id":5}]}` | `"5"` |
| 🔲 | Path references missing key | `{"other":"val"}` | Empty string; unresolved warning emitted |
| 🔲 | Non-JSON body with JSONPath template | `not json` | Empty string; warning emitted; no panic |

**Performance note:** The parsed body must be cached on the context so repeated JSONPath references in the same template do not re-parse the body.

---

### 5.3 Template engine — parameter set merging

**What to assert:** When multiple parameter sets are listed, later sets override earlier ones for the same key.

| # | Sets (in order) | Template | Expected |
|---|---|---|---|
| 🔲 | `set-a: {x: "a"}`, `set-b: {x: "b"}` | `{{x}}` | `"b"` (set-b wins) |
| 🔲 | `set-a: {x: "a"}`, `set-b: {y: "b"}` | `{{x}} {{y}}` | `"a b"` |
| 🔲 | `request` set, then `env-vars` set | `{{request.method}} {{tenant_id}}` | Both keys resolved from their respective sets |
| 🔲 | Empty parameter set list | `{{tenant_id}}` | Unresolved; warning emitted |

---

### 5.4 Template engine — `{{now}}`, `{{uuid}}`

| # | Template | Expected |
|---|---|---|
| 🔲 | `{{now}}` | Parseable ISO 8601 string; within 1 second of current time |
| 🔲 | `{{uuid}}` | Matches UUID v4 regex `^[0-9a-f]{8}-…$` |
| 🔲 | `{{uuid}}` called twice in same render | Two different UUIDs (not cached) |

---

### 5.5 Template engine — unresolved variable warning

**What to assert:** When a `{{token}}` cannot be resolved to any value, `Render` returns a warning (not an error) and the token is replaced with an empty string.

| # | Case | Expected |
|---|---|---|
| 🔲 | Typo in variable name | `{{request.pathparam.id}}` (missing underscore) | Returns `""` in place of token; warning list contains the token name |
| 🔲 | All variables resolved | No unresolved tokens | Warning list is empty |
| 🔲 | Mixed — some resolved, some not | `{{request.method}} {{ghost_var}}` | `"GET "` in output; warning for `ghost_var` |

---

### 5.6 Respond action — block mode

**What to assert:** A `respond` action with `response_block: <id>` looks up the block, renders the body through the template engine, and writes the correct status + headers + body to the response writer.

| # | Case | Expected |
|---|---|---|
| 🔲 | Known block | `response_block: standard_200` | HTTP response is `200` with the block's body |
| 🔲 | Block with headers | Block defines `Content-Type: application/json` | Response carries that header |
| 🔲 | Block with `delay_ms` | Block sets `delay_ms: 100` | Response arrives after at least 100ms |
| 🔲 | Unknown block ID | `response_block: does-not-exist` | Error logged; fallback to `500` or a safe default (⚠️ see Design gaps §G3) |
| 🔲 | Block body with template variables | Block body contains `{{request.path_param.id}}` | Variable substituted at render time |

---

### 5.7 Respond action — inline mode

**What to assert:** A `respond` action with `status`, `headers`, and `body` defined directly (no `response_block`) writes them to the response writer.

| # | Case | Expected |
|---|---|---|
| 🔲 | Status 201 inline | `status: 201` | HTTP `201 Created` |
| 🔲 | Custom header inline | `headers: {X-My-Header: hello}` | Response carries `X-My-Header: hello` |
| 🔲 | No headers defined | Omitted `headers` | No crash; no extra headers beyond CORS middleware |

---

### 5.8 Respond action — template mode

**What to assert:** A `respond` action with `body_template` renders the template and the result is the HTTP response body.

| # | Template | Parameter sets | Expected body |
|---|---|---|---|
| 🔲 | `{"id":"{{request.path_param.id}}"}` | `[request]` | `{"id":"42"}` for path `/payments/42` |
| 🔲 | `{"tenant":"{{tenant_id}}"}` | `[env-vars]` with `tenant_id: acme` | `{"tenant":"acme"}` |

---

### 5.9 Delay action — blocks response for correct duration

**What to assert:** A `delay` action placed before `respond` makes the HTTP response arrive after at least the specified duration.

| # | Case | Expected |
|---|---|---|
| 🔲 | 200ms delay before respond | Total latency >= 200ms | Pass |
| 🔲 | 0ms delay | Response arrives immediately (no artificial pause) | Pass |
| 🔲 | Delay after respond | Response arrives without delay; async callback runs after | Response latency is not affected by the post-respond delay |

---

### 5.10 Log action — appears in workflow log

**What to assert:** A `log` action renders its message template and appends a `WorkflowLogEntry` to the log entry.

| # | Case | Expected |
|---|---|---|
| 🔲 | Log action with literal message | `message: "hello"` | `WorkflowLog` contains entry with rendered message `"hello"` |
| 🔲 | Log action with template | `message: "id={{request.path_param.id}}"` | Rendered to `"id=42"` for path `/payments/42` |
| 🔲 | Log action after respond | Action in async zone | Message still appears in `WorkflowLog`; response is not delayed |

---

### 5.11 Proxy action — service level

**What to assert:** When a service has a `proxy:` config and no endpoint or workflow override, all requests are forwarded to the target URL and the upstream response is returned verbatim.

| # | Case | Expected |
|---|---|---|
| 🔲 | Service proxy to test server | Test server returns `200 {"proxied":true}` | Client receives `200 {"proxied":true}`; log entry shows `MatchedStatement: "proxied"` |
| 🔲 | Request path appended | Proxy `target: http://upstream`; request to `/payments/1` | Upstream receives `GET /payments/1` |
| 🔲 | Forward headers | `forward_headers: true`; request has `X-Custom: abc` | Upstream sees `X-Custom: abc` |
| 🔲 | Timeout respected | Upstream delays longer than `timeout_ms` | Client receives an error response; upstream connection terminated |

---

### 5.12 Proxy action — endpoint level override

**What to assert:** An endpoint-level `proxy:` setting overrides the service-level setting for that specific path/method.

| # | Setup | Expected |
|---|---|---|
| 🔲 | Service proxy A, endpoint proxy B | Request to the endpoint | Forwarded to B, not A |
| 🔲 | Service proxy A, endpoint proxy B with different timeout | Timeout of B applies | |

---

### 5.13 Proxy action — workflow action level

**What to assert:** A `proxy` action inside a workflow step provides the most granular control, forwarding the request to a specific target and returning the upstream response to the caller. Subsequent actions in the workflow run asynchronously with access to `{{response.status}}` and `{{response.body}}`.

| # | Case | Expected |
|---|---|---|
| 🔲 | Proxy action returns upstream response | Upstream returns `201` | Client receives `201` |
| 🔲 | Post-proxy async action accesses `{{response.status}}` | `log` action after proxy | Log entry contains the upstream status code |
| 🔲 | Post-proxy async action accesses `{{response.body}}` | `kafka_publish` payload template uses `{{response.body}}` | Rendered payload contains upstream body |

---

### 5.14 Proxy action — endpoint `disabled` overrides service

**What to assert:** Setting `proxy: disabled` on an endpoint prevents the service-level proxy from applying; the request goes to the statement engine instead.

| # | Setup | Expected |
|---|---|---|
| 🔲 | Service has proxy; endpoint has `proxy: disabled` | Request to endpoint | Statement engine runs; service proxy NOT used |
| 🔲 | Matching statement exists | Statement matches `id=999` | Statement workflow executes normally |
| 🔲 | No statement matches | Default response block returned | Default block served, not proxied |

---

### 5.15 Sync/async boundary — post-respond actions do not block response

**What to assert:** Actions placed after `respond` in the workflow run asynchronously; the HTTP response is sent to the caller before those actions complete.

| # | Setup | Expected |
|---|---|---|
| 🔲 | `respond` then `delay 2000ms` | Request completes | Client receives response in <50ms; delay runs after in background |
| 🔲 | `respond` then `kafka_publish` (slow broker) | Kafka broker is slow | Client is not blocked; response arrives promptly |
| 🔲 | Post-respond action fails | `http_request` to unreachable server | Failure logged in `WorkflowLog`; HTTP response already sent; client unaffected |

---

## 6. Module system (Steps 16–18)

### 6.1 Module registry — register and retrieve

| # | Case | Expected |
|---|---|---|
| 🔲 | Register and get by ID | `Register(m)` then `Get("my-kafka")` | Returns same module; `found == true` |
| 🔲 | Get unknown ID | `Get("nonexistent")` | Returns `nil, false` |
| 🔲 | Service-scoped lookup before global | Service module `id: foo` and global module `id: foo` | Service-scoped module returned when looked up in context of that service |

---

### 6.2 Module registry — health check all

| # | Case | Expected |
|---|---|---|
| 🔲 | All healthy | Two modules both return `nil` from `HealthCheck` | `RunHealthChecks` returns map with both IDs mapping to `nil` |
| 🔲 | One unhealthy | One module returns error | Map contains the error for that ID; other is `nil` |
| 🔲 | Health check does not block startup | `HealthCheck` hangs | Boot completes; health check result is eventually updated |

---

### 6.3 Kafka module — lazy connect

**What to assert:** `Configure` stores the broker config but does not attempt to connect. The connection is established on the first `Execute` call.

| # | Case | Expected |
|---|---|---|
| 🔲 | Configure with unreachable broker | Call `Configure` | No error returned; no connection attempt made |
| 🔲 | Execute triggers connection | Call `Execute` for the first time | Connection attempt made at this point |

---

### 6.4 Kafka module — publish success

**What to assert:** `Execute` publishes a message to the specified topic with the rendered key and payload.

| # | Case | Expected |
|---|---|---|
| 🔲 | Valid broker and topic | Params: `topic=test`, `key=k`, `payload=hello` | Message appears in topic `test` with key `k` and value `hello` |
| 🔲 | Key is optional | Params without `key` | Message published without a key |

---

### 6.5 Kafka module — retry on failure

**What to assert:** On publish failure, the module retries up to 3 times with exponential backoff (1s, 2s, 4s), then returns an error.

| # | Case | Expected |
|---|---|---|
| 🔲 | Broker flaky — succeeds on retry 2 | First attempt fails; second succeeds | No error returned to caller; one message published |
| 🔲 | All retries exhausted | All 3 attempts fail | Error returned after 3 attempts; total wait ≈ 1+2+4=7s |

---

### 6.6 HTTP module — outbound call success

**What to assert:** `Execute` builds the full URL, applies default and per-action headers, and makes the HTTP call. Non-2xx responses are returned as an error.

| # | Case | Expected |
|---|---|---|
| 🔲 | POST to base + path | `base_url=http://test`, `params["path"]=/events` | Request made to `http://test/events` |
| 🔲 | Upstream returns 200 | Test server returns `200 OK` | `Execute` returns `nil` |
| 🔲 | Upstream returns 500 | Test server returns `500` | `Execute` returns error containing the status code |

---

### 6.7 HTTP module — auth headers applied

| # | Auth type | Expected header |
|---|---|---|
| 🔲 | Bearer token | `auth.type: bearer; token: tok` | Request carries `Authorization: Bearer tok` |
| 🔲 | Basic auth | `auth.type: basic; username: u; password: p` | Request carries `Authorization: Basic <base64>` |
| 🔲 | API key | `auth.type: api_key; header: X-API-Key; value: k` | Request carries `X-API-Key: k` |
| 🔲 | None | `auth.type: none` | No `Authorization` header added |

---

### 6.8 HTTP module — timeout respected

| # | Case | Expected |
|---|---|---|
| 🔲 | Upstream delays past timeout | `timeout_ms: 100`; upstream delays 500ms | `Execute` returns an error within ~200ms (with tolerance) |
| 🔲 | Upstream responds before timeout | Upstream responds in 50ms; `timeout_ms: 100` | `Execute` succeeds |

---

## 7. REST API (Steps 19–20)

### 7.1 CRUD for each entity type

For each entity, verify: list returns empty array when none exist; create returns the created entity; read returns the entity; update modifies it; delete removes it; and a second delete of the same ID returns 404.

| # | Entity | Endpoints |
|---|---|---|
| 🔲 | Service | `GET /api/services`, `POST`, `GET /{id}`, `PUT /{id}`, `DELETE /{id}` |
| 🔲 | Endpoint | `GET /api/services/{id}/endpoints`, `GET /{eid}`, `PUT /{eid}` (no POST/DELETE — endpoints come from spec) |
| 🔲 | Statement | `GET …/statements`, `POST`, `PUT /{sid}`, `DELETE /{sid}`, `PATCH /{sid}/reorder` |
| 🔲 | Response block | `GET /api/response-blocks`, `POST`, `PUT /{id}`, `DELETE /{id}` |
| 🔲 | Module | `GET /api/modules`, `POST`, `PUT /{id}`, `DELETE /{id}` |
| 🔲 | Parameter set | `GET /api/parameter-sets`, `POST`, `PUT /{id}`, `DELETE /{id}` |

**Verify for each write:** The `mockingbird.yaml` file reflects the change within 200ms of the API response.

---

### 7.2 Validation errors return 400 with description

| # | Operation | Invalid input | Expected |
|---|---|---|---|
| 🔲 | Create service | Port number `70000` (> 65535) | `400` with description mentioning `port` |
| 🔲 | Create service | Duplicate port already used by another service | `400` with description |
| 🔲 | Create service | Missing `name` field | `400` |
| 🔲 | Update response block body | Invalid JSON body string | `400` with JSON parse error |
| 🔲 | Create statement | Condition with unknown `type` field | `400` |
| 🔲 | All validation rejections | Any invalid payload | File on disk is NOT modified |

---

### 7.3 Write triggers hot reload

**What to assert:** A successful write via the REST API causes the config file to be updated, the Watcher to emit a `ChangeEvent`, and the running mock server to reflect the change.

| # | Case | Expected |
|---|---|---|
| 🔲 | Add statement via API | `POST /statements`; then send request matching new condition | New statement matches within 200ms |
| 🔲 | Change default response block via API | `PUT /endpoints/{eid}`; then `curl` the endpoint | New block returned within 200ms |

---

### 7.4 Spec upload endpoint

**What to assert:** `POST /api/services/{id}/spec/upload` accepts a multipart file, validates it as OAS2 or OAS3, writes it to the cache, and triggers a spec reload.

| # | Case | Expected |
|---|---|---|
| 🔲 | Valid OAS3 JSON upload | Valid spec file | `200`; spec endpoints populated in mock server |
| 🔲 | Invalid file (not OAS) | Random JSON file | `400` with parse error |
| 🔲 | Non-JSON/YAML file | `.txt` file | `400` |

---

### 7.5 Template preview endpoint

**What to assert:** `POST /api/template/preview` accepts a template string and a sample request context, renders the template, and returns the result along with any unresolved variable warnings.

| # | Case | Expected |
|---|---|---|
| 🔲 | All variables resolved | Template `{"id":"{{request.path_param.id}}"}`, sample `path_params: {id: 42}` | Returns `{"id":"42"}`; empty warning list |
| 🔲 | Unresolved variable | Template `{{ghost}}`, no matching param | Returns `""`; warning list contains `"ghost"` |
| 🔲 | Missing template field | Body missing `template` key | `400` |

---

### 7.6 Orphan detection endpoint

**What to assert:** `GET /api/services/{id}/orphaned-endpoints` returns the current set of orphaned endpoints for a service.

| # | Case | Expected |
|---|---|---|
| 🔲 | No orphans | Spec and config in sync | Returns empty array |
| 🔲 | One orphan | Spec updated to remove a path that has statements | Returns array containing the orphaned endpoint |
| 🔲 | Unknown service ID | `GET /api/services/nonexistent/orphaned-endpoints` | `404` |

---

### 7.7 Remap endpoint

**What to assert:** `POST /api/services/{id}/endpoints/{eid}/remap` moves all statements and workflows from the orphaned endpoint to the target endpoint and removes the orphan from config.

| # | Case | Expected |
|---|---|---|
| 🔲 | Valid remap | Orphaned endpoint with 2 statements; valid target | Statements appear on target endpoint; orphaned entry removed from config |
| 🔲 | Target does not exist | `target_endpoint_id` not in current spec | `400` |
| 🔲 | Source not orphaned | Attempt to remap a live endpoint | `400` (remapping is only valid for orphaned endpoints) |
| 🔲 | Missing body field | No `target_endpoint_id` | `400` |

---

## Test infrastructure scaffold

The following test utilities live under `apps/backend/src/testutil/`.

**`apps/backend/src/testutil/test-helpers.ts`** — shared helpers used across all spec files:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

/** Load a YAML fixture by name from apps/backend/src/testutil/fixtures/ */
export function loadFixture(name: string): Config {
  const raw = fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
  return yaml.load(raw) as Config;
}

/** Parse a YAML string directly into a Config object */
export function parseConfig(yamlStr: string): Config {
  return yaml.load(yamlStr) as Config;
}

/** Create a NestJS TestingModule with the given mock server service wired in */
export async function createTestingApp(
  providers: any[],
): Promise<{ app: any; module: TestingModule }> {
  const moduleRef = await Test.createTestingModule({ providers }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return { app, module: moduleRef };
}
```

**`apps/backend/src/testutil/fixtures/`** — YAML fixtures shared across test suites:

| File | Purpose |
|---|---|
| `minimal.yaml` | Smallest valid config (one service, no optional fields) |
| `full.yaml` | All optional fields populated (used for round-trip tests) |
| `invalid.yaml` | Malformed YAML that cannot be parsed |
| `missing-port.yaml` | Valid YAML structure but service has no `port:` key |
| `env-vars.yaml` | Config with `${VAR}` tokens for env-var substitution tests |

HTTP integration tests use Supertest against the NestJS application instance:

```typescript
const response = await request(app.getHttpServer())
  .get('/payments/123')
  .expect(200);
```

Run the full backend test suite with:

```
npx nx test backend
```

Run only integration tests (requires live Kafka / network):

```
npx nx test backend --testPathPattern=integration
```

---

## Testing gaps

*(Items where the test setup is clear but the assertions cannot be finalised without additional tooling or infrastructure)*

- **Kafka integration tests** require a running Kafka broker. These should use a separate Jest project configuration or `--testPathPattern=integration` and be excluded from the default `npx nx test backend` run.
- **File-watcher reliability on macOS** can be flaky with very fast writes in tests. Hot reload tests should use a 500ms assertion timeout and retry if the first poll misses.
- **Proxy tests** for 5.11–5.14 and 5.15 require an HTTP test server that can simulate latency and error conditions. Use Supertest with a NestJS `TestingModule` inline.
- **WebSocket tests** (3.6) require a live server; table-driven unit tests alone are insufficient.

---

## Design gaps found

**G1 — `refresh_interval_s: 0` behaviour**
The design does not specify what happens when `refresh_interval_s` is set to `0` for a URL-type spec source. Possible interpretations: (a) disable automatic refresh entirely (fetch once on boot only), or (b) refresh as fast as possible (tight loop). The implementation guide does not address this, so the minimum safe interval and the meaning of `0` must be decided before writing the refresh-timer test.

**G2 — Unresolved env var returns empty string vs. error**
The design says "Unresolved variables cause a startup warning and fall back to an empty string." However it is unclear whether this applies globally or only outside critical fields (e.g. a missing `url` for a URL-type spec source could render the spec unloadable). Possible interpretations: (a) always substitute with `""` and warn regardless of field criticality, or (b) treat certain fields (spec URL, broker address) as hard errors when unresolved.

**G3 — Respond action with unknown `response_block` ID**
The design specifies that `respond` looks up a block by ID, but does not define the fallback when the ID is not found. Possible interpretations: (a) return HTTP `500` to the caller with a logged error, (b) return the empty-body default response and log a warning, or (c) return HTTP `500` and halt the workflow.

**G4 — Proxy `strip_headers` default behaviour for `Host` header**
The implementation guide says "Always strip `Host`." The design's shared proxy settings table does not mention `Host` in `strip_headers`. Possible interpretations: (a) `Host` is always stripped unconditionally regardless of `strip_headers`, or (b) `Host` is only stripped if listed in `strip_headers` like any other header.

**G5 — `request.count` reset semantics**
The design does not specify whether the per-endpoint call counter resets on hot reload or only on process restart. Possible interpretations: (a) counter resets to zero whenever the endpoint's config changes, (b) counter persists for the lifetime of the process regardless of config changes.

**G6 — `delay_ms` on response block vs. delay action**
A `ResponseBlock` has a `delay_ms` field. A workflow also has a standalone `delay` action. It is unclear whether the delay on a response block is applied in addition to any `delay` action in the same workflow, or whether one takes precedence over the other. Possible interpretations: (a) both delays are applied additively, (b) the `delay` action overrides the block's `delay_ms`, or (c) `delay_ms` on a block is ignored when the block is used inside a workflow that has its own `delay` action.

**G7 — Orphan preservation threshold**
The design states that an orphaned endpoint is preserved if it "has user-defined statements, a custom default response, or attached workflows." It is unclear what "custom default response" means precisely. Possible interpretations: (a) any `default_response_block` that is not the auto-generated one qualifies, (b) only endpoints where the user has explicitly changed the default response from the auto-generated value are preserved, or (c) any non-empty `default_response_block` field (including the auto-generated one) triggers preservation.

**G8 — Remap target endpoint already has statements**
The design describes remapping as moving statements from an orphaned endpoint to a target endpoint, but does not specify how to handle a target that already has its own statements. Possible interpretations: (a) the orphaned endpoint's statements are appended after the existing statements on the target, (b) they are prepended, or (c) the remap is rejected if the target already has statements.

**G9 — `allOf` merge conflict resolution**
The design says "`allOf` — merge all schemas (later properties win)." It is not specified whether "later" means the order within the `allOf` array or some other ordering (e.g. deepest ref chain wins). This edge case only surfaces when two schemas in an `allOf` define the same property name with different types or values.

**G10 — `proxy: disabled` YAML representation**
The design says "Setting `proxy: disabled` on an endpoint explicitly disables proxying." The config schema defines `proxy` as an optional `ProxyConfig` interface. It is unclear how `proxy: disabled` maps to the TypeScript type — possible interpretations: (a) it is a special string sentinel that the YAML parser must detect before deserialisation, (b) `ProxyConfig` has a `disabled: boolean` field, or (c) the YAML value `disabled` is handled by a custom deserialisation implementation.
