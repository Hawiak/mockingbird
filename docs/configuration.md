# Configuration reference

Everything in Mockingbird lives in one YAML file (`mockingbird.yaml` by default, see
`CONFIG_PATH`). Edits made through the UI are written back to this file; edits made
directly to the file are picked up automatically (hot reload, no restart needed).

## Top-level

```yaml
version: "1"
settings: { ... }
services: [ ... ]
responseBlocks: [ ... ]
modules: [ ... ]
parameterSets: [ ... ]
responseWorkflows: [ ... ]
savedConditions: [ ... ]
dataStores: [ ... ]
```

| Field | Type | Description |
|---|---|---|
| `version` | `"1"` | Config format version |
| `settings.uiPort` | number | Port for the Mockingbird UI and API (default `9000`) |
| `settings.logLevel` | `debug \| info \| warn \| error` | Backend log verbosity |
| `settings.logRetention` | number | Max request log entries kept in memory (default `1000`) |
| `services` | Service[] | Mock servers to run |
| `responseBlocks` | ResponseBlock[] | Reusable response templates |
| `modules` | ModuleConfig[] | Named Kafka/HTTP connectors — see [Kafka](./kafka.md) |
| `parameterSets` | ParameterSet[] | Named key/value bags for use in templates |
| `responseWorkflows` | ResponseWorkflow[] | Reusable, multi-step response logic — see [Workflows](./workflows.md) |
| `savedConditions` | SavedCondition[] | Reusable named conditions — see [Workflows](./workflows.md#saved-conditions) |
| `dataStores` | DataStore[] | Stateful record collections — see [Data Stores](./data-stores.md) |

Every array is optional and defaults to `[]` on load — an empty or partial file is
valid; missing sections are filled in.

## Service

```yaml
services:
  - id: my-api           # unique, used in URLs
    name: My API
    port: 8081
    basePath: /v1         # optional prefix stripped before routing
    spec:
      type: url            # url | upload | hosted
      url: https://example.com/openapi.json
      refreshIntervalSeconds: 300
      headers:              # forwarded when fetching the spec
        Authorization: Bearer ${SPEC_TOKEN}
    cors:
      enabled: true
      allowOrigins: ["https://app.example.com"]
      allowMethods: ["GET", "POST"]
      allowHeaders: ["*"]
      allowCredentials: false
    proxy:                # fallback for unmatched requests
      enabled: true
      target: https://real-api.example.com
    endpoints: [ ... ]      # usually populated by the spec, not hand-written
```

`spec.type`:
- `url` — fetch and auto-refresh from a remote OpenAPI/Swagger URL
- `upload` — the spec content was uploaded through the UI and is stored directly in
  `mockingbird.yaml` as `spec.specContent` — portable, travels with the config file
- `hosted` — like `upload`, but Mockingbird also serves the raw spec file itself

Every endpoint discovered from the spec becomes mockable automatically. Endpoints
persist their `responseNode`/config across spec refreshes as long as method+path stay
the same.

### Endpoint

```yaml
endpoints:
  - id: ep1
    method: GET
    path: /pet/:petId
    disabled: false            # true → always 404s
    proxy: { enabled: false }  # override the service-level proxy for this endpoint only
    responseNode: { ... }      # a block or a workflow, optionally conditional — see Workflows
```

An endpoint with no `responseNode` falls through to the spec-generated default response.
See [Workflows](./workflows.md) for the full `responseNode` shape (block vs workflow,
the optional `condition`/`else` chain, and the `if_else`/`switch` block types available
inside a workflow).

## Response Block

A named, reusable HTTP response.

```yaml
responseBlocks:
  - id: not_found
    name: 404 Not Found
    statusCode: 404
    headers:
      Content-Type: application/json
    body: '{"error": "not found"}'   # rendered through the template engine
```

Referenced by id from a `responseNode`'s `kind: block` (`responseBlockId`), a `respond`
action in Block mode, or a Response Workflow's `return_response` step.

## Condition

Used throughout — a `responseNode`'s optional `condition`, an `if_else`/`switch` block's
branch condition, a Response Workflow step's per-step gate, and `store.exists` checks.
See [Workflows](./workflows.md) for how conditions plug into `responseNode` and the
workflow/step branching types.

### Condition types

| Type | `param` field | Example |
|---|---|---|
| `request.method` | — | `op: equals, value: POST` |
| `request.path_param` | param name | `param: id, op: matches_regex, value: ^\d+$` |
| `request.query_param` | param name | `param: page, op: gt, value: 0` |
| `request.header` | header name | `param: X-Feature-Flag, op: exists` |
| `request.body_json` | JSONPath | `param: $.user.role, op: equals, value: admin` |
| `request.body_xml` | XPath | `param: //order/status, op: contains, value: pending` |
| `request.body_raw` | — | `op: contains, value: hello` |
| `request.count` | — | `op: equals, value: 1` (matches first call only) |
| `store.exists` | path param name (record key) | see [Data Stores](./data-stores.md#store-exists-condition) |

A condition is either one of the leaves above, or a group:

```yaml
condition:
  operator: OR   # or AND
  conditions:
    - { type: request.method, op: equals, value: GET }
    - { type: request.method, op: equals, value: HEAD }
```

### Operators

`equals` · `not_equals` · `contains` · `not_contains` · `matches_regex` · `exists` ·
`not_exists` · `gt` · `lt`

`exists`/`not_exists` ignore `value`. `gt`/`lt` compare numerically.

## Parameter Set

Named key/value bags, referenced from any template via `{{setName.key}}`.

```yaml
parameterSets:
  - id: test-users
    name: test-users
    values:
      adminId: "1"
      guestId: "2"
```

## Environment variables

Any `${VAR}` — distinct from the `{{...}}` template syntax — is substituted from the
process environment, both at startup and whenever the config is saved through the UI.
Use it for secrets so they never need to be hardcoded in the YAML file:

```yaml
modules:
  - id: main-kafka
    name: main-kafka
    type: kafka
    config:
      sasl:
        username: ${KAFKA_USERNAME}
        password: ${KAFKA_PASSWORD}
```

The literal `${VAR}` placeholder is what's persisted to disk (portable, safe to commit);
the resolved value is what the running server actually uses.
