# Template engine

Mockingbird's template syntax is `{{expression}}` — used anywhere a body, header value,
log message, or workflow action field accepts text: response bodies, `kafka_publish`
payloads, `http_request` bodies, `store_save` keys/values, log messages, and so on.

Unresolved expressions render as an empty string and are logged as a warning (and
surfaced in the [Template Preview](#template-preview) tool). There is no nested-template
support — an expression's arguments are literal text, not themselves re-evaluated.

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
