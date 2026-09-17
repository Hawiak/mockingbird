# Template engine

Mockingbird's template syntax is `{{expression}}` — used anywhere a body, header value,
log message, or workflow action field accepts text: response bodies, `kafka_publish`
payloads, `http_request` bodies, `store_save` keys/values, log messages, and so on.

Unresolved expressions render as an empty string and are logged as a warning (and
surfaced in the [Template Preview](#template-preview) tool). There is no nested-template
support — an expression's arguments are literal text, not themselves re-evaluated.

### Wrapping a value in a literal prefix/suffix

No special helper is needed for this — everything outside `{{...}}` in a template is
plain literal text, so wrapping an interpolated value just means writing the text around
it directly:

```yaml
body: '{"confirmationCode": "ORDER-{{request.path_param.id}}-CONFIRMED"}'
```

renders as `"confirmationCode": "ORDER-42-CONFIRMED"` for `id=42`. This works with any
expression, chained any number of times in the same template.

## Expression reference

| Expression | Resolves to |
|---|---|
| `{{request.method}}` | HTTP method |
| `{{request.path}}` | Request path |
| `{{request.path_param.name}}` | Path parameter |
| `{{request.query_param.page}}` | Query parameter |
| `{{request.header.Authorization}}` | Request header (case-insensitive) |
| `{{request.body}}` | Raw request body |
| `{{request.body_json.$.user.id}}` | JSONPath into a JSON request body |
| `{{request.body_patch key=expr ...}}` | Request body JSON with specific keys overridden — see below |
| `{{request.count}}` | How many times this endpoint has been called |
| `{{now}}` | Current UTC timestamp (ISO 8601) |
| `{{uuid}}` | Random UUID v4 |
| `{{autoIncrement "key"}}` | Persistent, per-key integer counter — `1`, `2`, `3`, … — see [below](#autoincrement-counters) |
| `{{faker "person.fullName"}}` | Any dotted path into [`@faker-js/faker`](https://fakerjs.dev/api/) — see [below](#faker--random-helpers) |
| `{{randomInt 1 100}}` | Random integer, inclusive of both bounds |
| `{{randomItem "a,b,c"}}` | One comma-separated item, picked at random |
| `{{randomBool}}` | `"true"` or `"false"`, picked at random |
| `{{randomDate}}` / `{{randomDate 30 7}}` | Random ISO 8601 timestamp — default within the past year; `daysBack daysForward` narrows the window around now |
| `{{parameterSets.mySet.key}}` | Value from a named [parameter set](./configuration.md#parameter-set) |
| `{{response.statusCode}}` | Response status code — async actions only (after `respond`/`proxy` ran) |
| `{{response.body}}` | Response body — async actions only |
| `{{response.header.X}}` | Response header — async actions only |
| `{{store.myStore}}` | Whole value from a [data store](./data-stores.md) fetch, JSON-stringified |
| `{{store.myStore.$.field}}` | JSONPath into a fetched data store record |

### `request.body_patch`

Takes the request body, parses it as JSON, overrides specific top-level keys, and
re-serializes — everything not listed passes through unchanged:

```yaml
body: '{{request.body_patch id=uuid status="processed"}}'
```

Each `key=value` pair is space-separated; the value is itself resolved as an expression
first (`uuid` above resolves to a fresh UUID), falling back to the literal text if it
doesn't resolve to anything.

### `autoIncrement` counters

`{{autoIncrement "key"}}` returns a persistent, monotonically-increasing integer for the
given key — `1` the first time it's rendered, `2` the next, and so on. Counters are
independent of each other (`"orderId"` and `"ticketId"` count separately) and independent
of any [data store](./data-stores.md)'s own per-record `sequence` key mode — they're a
freestanding named counter you can drop into any response body, Kafka payload, or other
templated field.

```yaml
body: '{"orderNumber": {{autoIncrement "orderNumber"}}}'
```

Counters live in the same in-memory state the data store feature uses, so — like data
store records — they reset on server restart. There's no config-file persistence and no
seeding; `GET /api/counters` lists every counter's current value, and
`POST /api/counters/:key/reset` resets one back to zero. There's currently no single
"reset all mock state" action — data stores are reset per-store from their detail page,
and counters per-key from the API.

### `faker` + random helpers

For varied, realistic-looking mock data without a `store_*` action:

| Expression | Notes |
|---|---|
| `{{faker "person.fullName"}}` | Any dotted path under [`faker`](https://fakerjs.dev/api/) — `internet.email`, `company.name`, `commerce.productName`, `number.int`, … — called with no arguments |
| `{{randomInt 1 100}}` | Inclusive integer range; order of the two bounds doesn't matter |
| `{{randomItem "a,b,c"}}` | One comma-separated item, picked at random; wrap the whole list in quotes if any item might contain a space |
| `{{randomBool}}` | `"true"` or `"false"` |
| `{{randomDate}}` | ISO 8601 timestamp, random within the past year by default; `{{randomDate 30 7}}` narrows it to 30 days back through 7 days forward from now |

An unresolvable `faker` path (typo, or a namespace member that isn't a callable
generator) renders empty with a warning, same as any other unresolved expression.

### Async-only expressions

`respond` and `proxy` are the workflow's synchronous/async boundary — everything before
them blocks the response, everything after runs after the response has already been
sent. Only actions in that *async* tail can reference `{{response.*}}`, since that's the
first point the response actually exists.

### Data store expressions

`{{store.<name>}}` and `{{store.<name>.<jsonpath>}}` only resolve if a `store_fetch`
action for that store already ran earlier in the *same* workflow (actions run in order;
a `store_fetch` placed after `respond` runs too late to be usable in that response). See
[Data Stores](./data-stores.md) for the full picture, including how sequential
`store_fetch` calls can reference each other's results (a lightweight join).

## Template Preview

Response Blocks, `respond` actions in Template mode, `kafka_publish` payloads, and
`http_request` bodies all have a "Preview with sample request" panel in the UI: fill in
a sample body, path params, query params, and headers, then render the template against
them to see the exact output and any unresolved variables — without making a real
request. It calls `POST /api/template/preview` under the hood (see
[API Reference](./api-reference.md)).
