# Mockingbird

A self-hosted API mocking platform. Point it at an OpenAPI/Swagger spec, define conditional response rules, and run arbitrarily complex response workflows — all from a browser UI, persisted to a single YAML file.

## Features

- **Spec-driven** — load any OpenAPI 2/3 spec from a URL, with auto-refresh
- **Statement engine** — ordered conditional rules with AND/OR groups; first match wins
- **Workflow actions** — `respond`, `proxy`, `delay`, `log`, `kafka_publish`, `http_request`
- **Template engine** — `{{request.header.X-User-Id}}`, `{{uuid}}`, `{{now}}`, JSONPath into body
- **Module system** — named Kafka and HTTP connectors reused across endpoints
- **Live request log** — WebSocket-streamed, filterable, with per-request workflow trace
- **Hot reload** — edit `mockingbird.yaml` directly; the server picks up changes instantly
- **Single config file** — everything in `mockingbird.yaml`; version-control friendly

---

## Quick start with Docker

**1. Create a config file**

```yaml
# mockingbird.yaml
version: "1"

settings:
  uiPort: 9000

services:
  - id: petstore
    name: Petstore
    port: 8081
    spec:
      type: url
      url: https://petstore3.swagger.io/api/v3/openapi.json
      refreshIntervalSeconds: 300
    cors:
      enabled: true
      allowOrigins: ["*"]

responseBlocks: []
modules: []
parameterSets: []
```

**2. Run**

```bash
docker run -d \
  -p 9000:9000 \
  -p 8081:8081 \
  -v $(pwd)/mockingbird.yaml:/config/mockingbird.yaml \
  -e CONFIG_PATH=/config/mockingbird.yaml \
  --name mockingbird \
  ghcr.io/harmakkerman/mockingbird:latest
```

Open **http://localhost:9000** for the UI.  
Your mock server is live at **http://localhost:8081**.

---

## Docker Compose

```bash
# Uses docker-compose.yml in this repo
docker compose up -d
```

The compose file mounts `mockingbird.yaml` from the current directory and exposes ports 9000 (UI), 8081–8083 (mock services).

---

## Build from source

**Prerequisites:** Node 22+, npm 10+

```bash
git clone https://github.com/harmakkerman/mockingbird
cd mockingbird
npm install
NX_IGNORE_UNSUPPORTED_TS_SETUP=true npx nx build backend
NX_IGNORE_UNSUPPORTED_TS_SETUP=true npx nx build frontend
node dist/apps/backend/main.js
```

Set `CONFIG_PATH` to point at your config file (defaults to `mockingbird.yaml` in the working directory).

---

## Configuration reference

### Top-level

| Field | Type | Description |
|---|---|---|
| `version` | `"1"` | Config format version |
| `settings.uiPort` | number | Port for the Mockingbird UI and API (default `9000`) |
| `settings.logRetention` | number | Max request log entries kept in memory (default `1000`) |
| `services` | Service[] | Mock servers to run |
| `responseBlocks` | ResponseBlock[] | Reusable response templates |
| `modules` | ModuleConfig[] | Named Kafka/HTTP connectors |
| `parameterSets` | ParameterSet[] | Named key/value bags for use in templates |

### Service

```yaml
services:
  - id: my-api           # unique, used in URLs
    name: My API
    port: 8081
    basePath: /v1        # optional prefix stripped before routing
    spec:
      type: url
      url: https://example.com/openapi.json
      refreshIntervalSeconds: 300
      headers:           # forwarded when fetching the spec
        Authorization: Bearer ${SPEC_TOKEN}
    cors:
      enabled: true
      allowOrigins: ["https://app.example.com"]
    proxy:               # fallback for unmatched requests
      enabled: true
      target: https://real-api.example.com
```

### Response Block

```yaml
responseBlocks:
  - id: not_found
    name: 404 Not Found
    statusCode: 404
    headers:
      Content-Type: application/json
    body: '{"error": "not found"}'
```

### Statement (conditional rule)

Each endpoint can have multiple statements. They are evaluated in priority order (lowest number first); the first match runs its workflow.

```yaml
# Inside an endpoint (managed by the UI or edited directly)
statements:
  - id: s1
    name: Return 401 for missing token
    priority: 10
    enabled: true
    condition:
      operator: AND
      conditions:
        - type: request.header
          param: Authorization
          op: not_exists
    workflow:
      - action: respond
        statusCode: 401
        headers:
          Content-Type: application/json
        body: '{"error": "Unauthorized"}'
```

#### Condition types

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

#### Operators

`equals` · `not_equals` · `contains` · `not_contains` · `matches_regex` · `exists` · `not_exists` · `gt` · `lt`

### Workflow actions

Actions execute in order. `respond` and `proxy` are the *boundary* — everything before is synchronous, everything after runs asynchronously (the response is already sent).

```yaml
workflow:
  # Delay before responding
  - action: delay
    ms: 200

  # Respond with a reusable block
  - action: respond
    mode: block
    blockId: not_found

  # Respond inline
  - action: respond
    mode: inline
    statusCode: 200
    headers:
      Content-Type: application/json
    body: '{"id": "{{uuid}}", "ts": "{{now}}"}'

  # Forward to real backend
  - action: proxy
    target: https://real-api.example.com

  # Log a message (appears in the request log)
  - action: log
    message: 'User {{request.header.X-User-Id}} called count {{request.count}}'

  # Publish to Kafka (async — runs after response is sent)
  - action: kafka_publish
    module: my-kafka            # references a module by name
    topic: events
    key: '{{request.path_param.id}}'
    value: '{{request.body}}'

  # Call another HTTP service (async)
  - action: http_request
    module: my-http-client
    method: POST
    path: /webhooks/notify
    body: '{"event": "called"}'
```

### Template syntax

Use `{{...}}` anywhere in body, header values, log messages, or action fields.

| Expression | Resolves to |
|---|---|
| `{{request.method}}` | HTTP method |
| `{{request.path}}` | Request path |
| `{{request.path_param.name}}` | Path parameter |
| `{{request.query_param.page}}` | Query parameter |
| `{{request.header.Authorization}}` | Request header |
| `{{request.body}}` | Raw request body |
| `{{request.body_json.$.user.id}}` | JSONPath into JSON body |
| `{{request.count}}` | How many times this endpoint was called |
| `{{now}}` | Current UTC timestamp (ISO 8601) |
| `{{uuid}}` | Random UUID v4 |
| `{{parameterSets.mySet.key}}` | Value from a named parameter set |
| `{{response.statusCode}}` | (async actions only) Response status code |
| `{{response.body}}` | (async actions only) Response body |

Environment variables are resolved at startup: `${MY_ENV_VAR}` anywhere in the config.

### Modules

```yaml
modules:
  - id: main-kafka
    name: main-kafka
    type: kafka
    config:
      brokers: ["kafka:9092"]
      clientId: mockingbird
      sasl:
        mechanism: PLAIN
        username: ${KAFKA_USER}
        password: ${KAFKA_PASS}

  - id: downstream
    name: downstream
    type: http
    config:
      baseUrl: https://downstream-api.example.com
      timeout: 5000
      auth:
        type: bearer
        token: ${DOWNSTREAM_TOKEN}
```

---

## API

The Mockingbird REST API is available at `http://localhost:9000/api`.

| Resource | Endpoint |
|---|---|
| Services | `GET/POST /api/services` |
| Service | `GET/PUT/DELETE /api/services/:id` |
| Endpoints | `GET /api/services/:id/endpoints` |
| Statements | `GET/POST /api/services/:id/endpoints/:eid/statements` |
| Response Blocks | `GET/POST /api/response-blocks` |
| Modules | `GET/POST /api/modules` |
| Parameter Sets | `GET/POST /api/parameter-sets` |
| Request Log | `GET /api/log` |
| Template Preview | `POST /api/template/preview` |
| Health | `GET /api/health` |

WebSocket log stream: `ws://localhost:9000/ws/log`

---

## Ports

| Port | Purpose |
|---|---|
| `9000` | Mockingbird UI + REST API (configurable via `settings.uiPort`) |
| `8081`+ | Mock services (one port per service, defined in `mockingbird.yaml`) |

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `CONFIG_PATH` | `mockingbird.yaml` | Path to the config file |
| `CACHE_DIR` | `.mockingbird-cache` | Directory for cached spec files |
| `NODE_ENV` | — | Set to `production` in Docker image |

Any `${VAR}` reference inside `mockingbird.yaml` is substituted from the process environment at startup.
