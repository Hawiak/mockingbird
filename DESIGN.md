# Mockingbird — Design Document

## Overview

Mockingbird is a self-hosted, Docker-based API mocking platform. It ingests OpenAPI/Swagger specs from configurable endpoints, auto-generates mock HTTP servers for each service, and exposes a browser UI for intercepting requests, configuring responses, writing conditional statements, and building event-driven workflows (e.g. Kafka messages).

Everything is persisted in a single config file (`mockingbird.yaml`), making the tool GitOps-friendly and reproducible across environments.

---

## Goals

- Zero-code mocking: point at a Swagger URL and get a working mock server immediately.
- Programmable behavior: override default responses with statements, conditions, and templated payloads.
- Event workflows: attach side effects (Kafka, webhooks, delays) to request/response events.
- Visual UI: a browser-based editor for all config; no manual YAML editing required.
- Portable: runs fully inside Docker, config mounted as a volume.

## Non-Goals

- Not a load-testing tool.
- Not a production API gateway.
- Not a record-and-replay proxy (at MVP).

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Docker (single compose stack)                               │
│                                                              │
│  ┌─────────────┐    ┌──────────────────────────────────┐    │
│  │  UI Server  │    │       Mock Engine                │    │
│  │ (Angular +  │◄──►│  ┌────────────┐ ┌────────────┐  │    │
│  │  REST API)  │    │  │ HTTP Mocks │ │ Statement  │  │    │
│  └─────────────┘    │  │ (per svc)  │ │  Engine    │  │    │
│         │           │  └────────────┘ └────────────┘  │    │
│         │           │  ┌────────────┐ ┌────────────┐  │    │
│         ▼           │  │ Workflow   │ │  Swagger   │  │    │
│  ┌─────────────┐    │  │ Executor   │ │  Loader    │  │    │
│  │ Config File │◄──►│  └────────────┘ └────────────┘  │    │
│  │mockingbird  │    └──────────────────────────────────┘    │
│  │  .yaml      │                                            │
│  └─────────────┘                                            │
└──────────────────────────────────────────────────────────────┘
```

### Components

| Component | Responsibility |
|---|---|
| **UI Server** | Serves the Angular app and exposes a REST API for reading/writing config |
| **Swagger Loader** | Loads specs from URL (with disk cache), uploaded files, or hosted files; parses OpenAPI 2/3; refreshes URL-backed specs on interval |
| **HTTP Mocks** | Spins up one HTTP listener per service; routes requests to Statement Engine |
| **Statement Engine** | Evaluates ordered statements against an incoming request; triggers matching workflow |
| **Workflow Executor** | Runs workflow action steps (respond, proxy, Kafka, HTTP, delay, log) in order |
| **Config Manager** | Single reader/writer for `mockingbird.yaml`; broadcasts changes to all components |

---

## Core Concepts

### 1. Service

A service maps to one Swagger/OpenAPI spec. It owns a dedicated port, a set of auto-generated endpoints, and optional statements/workflows.

Each service has a **spec source** — one of three types:

| Source type | Description |
|---|---|
| `url` | Mockingbird fetches the spec from a remote URL on boot and on a refresh interval. The spec is cached to disk. If the URL is unreachable on boot, the cached version is used and a warning is shown. |
| `upload` | The user uploads a JSON or YAML spec file via the UI. Mockingbird stores it internally and serves it from its own file system. No external URL dependency. |
| `hosted` | Same as `upload`, but the spec is also served by Mockingbird itself at a well-known path (e.g. `GET /mockingbird/specs/{service-id}`). Useful when other tools need to reference the spec URL. |

The spec cache is stored alongside `mockingbird.yaml` in a `/.mockingbird-cache/` directory. On boot, the cache is always loaded first — the remote URL is then fetched in the background and the cache is updated if the spec has changed.

### 2. Endpoint

Auto-generated from the Swagger spec (path + method). Each endpoint has:
- A **default response block** (auto-generated from the spec — see below).
- An ordered list of **statements** that are evaluated before falling back to the default.

#### Auto-generated Default Response

Mockingbird generates the richest possible default response automatically. The generation pipeline runs in priority order and stops at the first source that yields a result:

**Status code selection:**
Pick the lowest 2xx status code defined in the spec for this operation (`200` → `201` → `202` → `204`). If only error codes are defined, default to `200`.

**Body generation priority:**

| Priority | Source | Description |
|---|---|---|
| 1 | Response-level `example` (OAS3) | Used as-is |
| 2 | Response-level `examples` (OAS3) | First entry used |
| 3 | Schema-level `example` | Used as-is |
| 4 | Schema-level `default` | Used as-is |
| 5 | Schema generation | Recursively build a value from type, format, and constraints |
| 6 | Empty body | For `204 No Content` or when schema is absent |

**Schema generation rules (priority 5):**

| Schema type / format | Generated value |
|---|---|
| `string` | `"string"` |
| `string` / `email` | `"user@example.com"` |
| `string` / `uuid` | a random UUID |
| `string` / `date` | `"2026-06-30"` |
| `string` / `date-time` | current ISO 8601 timestamp |
| `string` / `uri` | `"https://example.com"` |
| `string` with `enum` | first enum value |
| `string` with `minLength` | string of exactly `minLength` chars |
| `integer` | `minimum` if set, else `0` |
| `number` | `minimum` if set, else `0.0` |
| `boolean` | `true` |
| `array` | one-element array with a generated item |
| `object` | recurse through all `properties` |
| `oneOf` / `anyOf` | first schema in the list |
| `allOf` | merge all schemas (later properties win) |
| `$ref` | resolve and generate from the referenced schema |
| `nullable: true` | generate the non-null value |

**Headers:** Any response headers defined in the spec are included with generated values using the same rules above.

**Content-Type:** Set from the spec's `produces` (OAS2) or `content` map (OAS3). If multiple content types are defined, `application/json` is preferred; otherwise the first defined type is used.

The generated response is shown in the UI immediately after import so you can review and edit it before traffic arrives.

### 3. Response Block

A reusable, named unit of a mock response. Contains:
- HTTP status code
- Headers (key/value pairs)
- Body (raw JSON/XML/text, with template variables)
- Optional delay (ms)

Response blocks are a first-class library — they can be shared across endpoints and services.

### 4. Proxy

Proxy support exists at three levels. The most specific level wins.

**Resolution order (highest to lowest priority):**
1. `proxy` action inside a workflow step
2. Endpoint-level proxy setting
3. Service-level proxy setting
4. Default response block (fallback if none of the above apply)

This means you can proxy an entire service to a real backend by default, override specific endpoints to mock them, and within a statement's workflow choose to proxy only when a specific condition matches.

**Service-level proxy** — all requests to this service forward to the target unless overridden by an endpoint or workflow:

```yaml
services:
  - id: payment-service
    proxy:
      target: "https://real-payments.example.com"
      forward_headers: true
      timeout_ms: 5000
```

**Endpoint-level proxy** — overrides the service setting for this path/method:

```yaml
endpoints:
  - path: "/payments/{id}"
    method: GET
    proxy:
      target: "https://real-payments.example.com"
      forward_headers: true
      timeout_ms: 3000
```

Setting `proxy: disabled` on an endpoint explicitly disables proxying for that endpoint even if the service has a proxy configured, falling back to statements and the default response block.

**Workflow action** — proxy as a step inside a workflow, giving the most granular control:

```yaml
workflow:
  - action: proxy
    target: "https://real-payments.example.com"
    forward_headers: true
    timeout_ms: 3000
  - action: kafka_publish       # fires after proxied response is returned
    topic: payments.audit
    payload: "{{response.body}}"
```

When `proxy` is a workflow action, the upstream response is returned to the caller. Any workflow actions placed after `proxy` run asynchronously with access to `{{response.status}}` and `{{response.body}}` from the upstream.

**Shared proxy settings:**

| Setting | Default | Description |
|---|---|---|
| `target` | — | Base URL of the upstream; request path is appended |
| `forward_headers` | `true` | Forward all incoming request headers to upstream |
| `strip_headers` | `[]` | Header names to remove before forwarding (e.g. `Host`) |
| `timeout_ms` | `5000` | Upstream request timeout |

Proxied requests appear in the Request Log with the upstream URL and the real response status, clearly marked as proxied.

### 5. CORS

All mock servers have CORS enabled with permissive defaults out of the box. On every request, Mockingbird injects the configured `Access-Control-Allow-*` headers into the response. `OPTIONS` preflight requests are automatically intercepted and returned with a `204 No Content` — they never reach the statement engine.

Per-service overrides allow restricting to specific origins, methods, or headers when you need to test CORS behaviour itself. Setting `enabled: false` disables CORS handling entirely for that service.

| Setting | Default | Description |
|---|---|---|
| `enabled` | `true` | Auto-handle OPTIONS and inject CORS headers |
| `allow_origins` | `["*"]` | Allowed origins list |
| `allow_methods` | `["*"]` | Allowed HTTP methods |
| `allow_headers` | `["*"]` | Allowed request headers |

### 6. Statement


A **statement** is an ordered conditional attached to an endpoint. When a request arrives, statements are evaluated in priority order. The first statement whose condition matches triggers its **workflow**. If no statement matches, the endpoint's default response block is returned.

Multiple conditions within a statement can be combined with AND/OR.

**Condition types:**

| Type | Description |
|---|---|
| `request.method` | HTTP method equals |
| `request.path_param` | Path parameter matches value/regex |
| `request.query_param` | Query parameter matches |
| `request.header` | Header key/value matches |
| `request.body_json` | JSONPath expression matches value/regex |
| `request.body_xml` | XPath expression matches |
| `request.body_raw` | Raw body contains/regex |
| `request.count` | Number of times this endpoint has been called |

**Operators:** `equals`, `not_equals`, `contains`, `not_contains`, `matches_regex`, `exists`, `not_exists`, `gt`, `lt`

### 7. Module

A **module** is a named, configured instance of an integration type. Modules hold all connection-level settings (brokers, base URLs, credentials) in one place. Workflow steps reference a module by name and only supply operation-specific parameters (topic, payload, path, body, etc.).

This separation means connection settings are configured once and reused across any number of workflows and services — changing a broker address requires editing one module, not hunting through every workflow step.

**Scope:**
- **Global modules** — available to all services. Defined at the top level of config.
- **Service-scoped modules** — defined under a service; only available to that service's workflows. Useful when two services talk to different Kafka clusters or different webhook targets.

When a workflow step references a module, Mockingbird first looks for a service-scoped module with that name, then falls back to a global module with that name.

**Built-in module types (MVP):**

| Type | Purpose | Key config |
|---|---|---|
| `kafka` | Publish messages to Kafka topics | brokers, authentication, SSL |
| `http` | Make outbound HTTP calls | base URL, default headers, auth, timeout |

**Post-MVP module types:**

| Type | Purpose |
|---|---|
| `grpc` | Call gRPC endpoints |
| `database` | Execute a query (read result into template variable) |
| `email` | Send an email via SMTP |
| `slack` | Post a message to a Slack channel |

**Module extensibility:**

Each module type implements a common interface: `configure(config)`, `execute(params, templateContext)`, `healthCheck()`. New module types are registered at startup. Post-MVP: user-defined modules via a script runner (e.g. a JS/Python snippet executed per invocation).

**Config structure:**

```yaml
# Global modules
modules:
  - id: main-kafka
    name: "Main Kafka Cluster"
    type: kafka
    config:
      brokers:
        - kafka:9092
      auth:
        type: sasl_plain
        username: "${KAFKA_USER}"
        password: "${KAFKA_PASSWORD}"

  - id: audit-webhook
    name: "Audit Service Webhook"
    type: http
    config:
      base_url: "https://audit.internal.example.com"
      headers:
        Authorization: "Bearer ${AUDIT_TOKEN}"
      timeout_ms: 3000

services:
  - id: payment-service
    # Service-scoped module — overrides global if same name is used
    modules:
      - id: payment-kafka
        name: "Payment-specific Kafka"
        type: kafka
        config:
          brokers:
            - kafka-payments:9092
```

**Module health:**

On boot and on each config hot reload, Mockingbird runs `healthCheck()` on all configured modules. Results are shown in the UI next to each module (green = reachable, red = unreachable, grey = not yet checked). An unreachable module does not prevent startup — it logs a warning and becomes available for use once the connection is established lazily on first execution.

---

### 8. Workflow

A **workflow** is the sequence of actions executed when a statement matches. Actions run in order. The workflow can contain any combination of action types — including the response, which is just one action among others.

**Action types:**

| Action | Module required | Description |
|---|---|---|
| `respond` | No | Send an HTTP response (block, inline, or template) |
| `proxy` | No | Forward the request to a real upstream |
| `kafka_publish` | Yes (`kafka`) | Publish a message to a topic |
| `http_request` | Yes (`http`) | Make an outbound HTTP call |
| `delay` | No | Wait N milliseconds |
| `log` | No | Write a message to the request log |

Actions before `respond` execute synchronously (the HTTP response is held until they complete). Actions after `respond` execute asynchronously — the response has already been sent to the caller.

**Workflow step referencing a module:**

```yaml
workflow:
  - action: respond
    response_block: standard_200

  - action: kafka_publish
    module: payment-kafka          # references a configured module
    topic: payments.events
    key: "{{request.path_param.id}}"
    payload: |
      {
        "event": "PAYMENT_REQUESTED",
        "id": "{{request.path_param.id}}",
        "at": "{{now}}"
      }

  - action: http_request
    module: audit-webhook          # references a configured module
    method: POST
    path: "/events"
    body: "{{request.body}}"
```

**Connection lifecycle:**

Module connections are established lazily on first use. A failed connection is retried with exponential backoff (max 3 attempts, 5s cap). Failures are logged as workflow execution errors and never affect the HTTP response to the caller.

### 9. Respond Action

The `respond` action sends an HTTP response to the caller. It has three modes:

**a) Named response block** — references a block from the Response Block library by ID.

**b) Inline response** — status, headers, and body defined directly on the action (one-off, not reusable).

**c) Template response** — body (and optionally headers) are defined as a template string. The template is rendered at request time by substituting values from one or more **parameter sets**.

#### Template Preview

Any Monaco editor that contains a template body has a **Preview** panel alongside it. The panel is split into two halves:

```
┌─────────────────────────┬──────────────────────────┐
│  Template               │  Rendered output          │
│                         │                           │
│  {                      │  {                        │
│    "id": "{{request.    │    "id": "42",            │
│      path_param.id}}",  │    "email":               │
│    "email": "{{request. │      "jane@example.com",  │
│      body_json.$.email}}│    "at":                  │
│    "at": "{{now}}"      │      "2026-06-30T..."     │
│  }                      │  }                        │
│                         │                           │
├─────────────────────────┴──────────────────────────┤
│  Sample request                                     │
│  Path params:  id = [ 42          ]                │
│  Body (JSON):  [ { "email": "jane@example.com" } ] │
│                                            Render ▶ │
└─────────────────────────────────────────────────────┘
```

The **Sample request** section lets you fill in:
- Path parameters (one field per param detected in the endpoint path)
- Query parameters (key/value table)
- Headers (key/value table)
- Body (Monaco editor)

Clicking **Render** sends the sample through the template engine and displays the result on the right. Unresolved variables are highlighted in red. Clicking an unresolved variable jumps to the offending `{{...}}` in the template.

The sample request is local to the browser session — it is not saved to config.

### 10. Parameter Sets

A **parameter set** is a named collection of key/value data available to templates at render time. Multiple parameter sets can be passed to a template; keys from later sets override earlier ones.

**Built-in parameter set — `request`:**

```
{{request.method}}
{{request.path}}
{{request.path_param.id}}
{{request.query.page}}
{{request.header.Authorization}}
{{request.body}}                        // raw body string
{{request.body_json.$.user.email}}      // JSONPath into parsed body
```

**Built-in helper variables** (always available, not tied to a set):

```
{{now}}          // ISO 8601 timestamp
{{uuid}}         // random UUID v4
```

**User-defined parameter sets** — static key/value collections defined in config and referenced by name. Useful for environment-specific values or shared constants:

```yaml
parameter_sets:
  - id: env-vars
    values:
      base_url: "https://staging.example.com"
      tenant_id: "acme-corp"
```

In a template action, parameter sets are listed in merge order:

```yaml
- action: respond
  status: 200
  body_template: |
    {
      "id": "{{request.path_param.id}}",
      "tenant": "{{tenant_id}}",
      "called_at": "{{now}}"
    }
  parameter_sets:
    - request
    - env-vars
```

---

## Config File Schema (`mockingbird.yaml`)

### Env Var References

Any scalar string value in `mockingbird.yaml` can reference an environment variable using `${VAR_NAME}` syntax. The Config Manager resolves these at load time and on hot reload. Unresolved variables cause a startup warning and fall back to an empty string.

Example:
```yaml
services:
  - id: payment-service
    spec:
      source: url
      url: "https://internal.example.com/api-docs"
      headers:
        Authorization: "Bearer ${PAYMENT_SERVICE_TOKEN}"
```

Pass secrets via Docker:
```yaml
# docker-compose.yml
services:
  mockingbird:
    environment:
      PAYMENT_SERVICE_TOKEN: "eyJhbGci..."
```

---

```yaml
version: "1"

settings:
  ui_port: 9000
  log_level: info          # debug | info | warn | error

response_blocks:
  - id: standard_200
    name: "Generic 200 OK"
    status: 200
    headers:
      Content-Type: application/json
    body: |
      { "status": "ok" }
    delay_ms: 0

  - id: not_found_404
    name: "Generic 404"
    status: 404
    headers:
      Content-Type: application/json
    body: |
      { "error": "not found" }

services:
  - id: payment-service
    name: "Payment Service"
    port: 8081                          # must be explicitly declared; mapped in docker-compose
    base_path: ""                       # optional prefix override
    spec:
      source: url                       # url | upload | hosted
      url: "https://internal.example.com/payments/v1/api-docs"
      headers:                          # optional; supports ${ENV_VAR} references
        Authorization: "Bearer ${PAYMENT_SERVICE_TOKEN}"
      refresh_interval_s: 60
      # For source: upload or hosted, the spec content is stored in
      # .mockingbird-cache/specs/{service-id}.json and managed by the UI.
      # hosted also exposes: GET /mockingbird/specs/payment-service
    cors:
      enabled: true                     # true by default on all services
      allow_origins: ["*"]
      allow_methods: ["*"]
      allow_headers: ["*"]
    endpoints:
      - id: get-payment
        path: "/payments/{id}"
        method: GET
        default_response_block: standard_200   # returned when no statement matches
        statements:
          - id: stmt-not-found
            name: "Return 404 for id=999, then notify Kafka"
            enabled: true
            priority: 1
            condition:
              operator: AND
              conditions:
                - type: request.path_param
                  param: id
                  op: equals
                  value: "999"
            workflow:
              - action: respond                 # send response first
                response_block: not_found_404
              - action: kafka_publish           # then notify async
                module: main-kafka             # references a configured module
                topic: payments.events
                key: "{{request.path_param.id}}"
                payload: |
                  {
                    "event": "PAYMENT_NOT_FOUND",
                    "id": "{{request.path_param.id}}",
                    "at": "{{now}}"
                  }
              - action: log
                message: "404 triggered for payment id={{request.path_param.id}}"

          - id: stmt-template-response
            name: "Return templated response using parameter set"
            enabled: true
            priority: 2
            condition:
              operator: AND
              conditions:
                - type: request.query_param
                  param: format
                  op: equals
                  value: "full"
            workflow:
              - action: respond
                status: 200
                body_template: |
                  {
                    "id": "{{request.path_param.id}}",
                    "tenant": "{{tenant_id}}",
                    "requested_at": "{{now}}"
                  }
                parameter_sets:
                  - request
                  - env-vars

parameter_sets:
  - id: env-vars
    values:
      tenant_id: "acme-corp"
      base_url: "https://staging.example.com"
```

---

## UI Structure

### Navigation

```
Sidebar
├── Services
│   ├── Payment Service
│   │   ├── Endpoints
│   │   │   ├── GET /payments/{id}
│   │   │   └── POST /payments
│   │   ├── Modules          ← service-scoped modules
│   │   └── Settings
│   └── + Add Service
├── Modules                  ← global modules
├── Response Blocks
├── Request Log
└── Settings
```

### Module Configuration UI

Both the global **Modules** page and the per-service **Modules** tab share the same UI pattern.

**Module list view:**
- Card per module showing: name, type badge, health indicator (green/red/grey dot), and a summary of key config (e.g. "kafka:9092" for Kafka, "https://audit.example.com" for HTTP).
- **+ Add Module** button opens the module editor.
- Click a card to edit. Delete button on the card (disabled if the module is referenced by any workflow step — shows "Used by N workflows" tooltip).

**Module editor — Kafka:**

```
Name:        [ Payment Kafka              ]
Type:        [ Kafka          ▾ ]

Brokers
  [ kafka:9092              ] [ + Add broker ]

Authentication
  [ None ▾ ]   (options: None, SASL Plain, SASL SCRAM-256, SASL SCRAM-512, SSL)

  (if SASL Plain selected)
  Username:  [ ${KAFKA_USER}   ]
  Password:  [ ${KAFKA_PASSWORD} ]

[ Test connection ]   ● Connected to kafka:9092 (3 brokers)

                              [ Cancel ]  [ Save ]
```

**Module editor — HTTP:**

```
Name:        [ Audit Webhook              ]
Type:        [ HTTP           ▾ ]

Base URL:    [ https://audit.internal.example.com ]

Default headers
  [ Authorization  ] [ Bearer ${AUDIT_TOKEN} ]  [ × ]
  [ + Add header ]

Authentication
  [ Bearer token ▾ ]  (options: None, Bearer, Basic, API Key)

Timeout:     [ 3000 ] ms

[ Test connection ]   ● 200 OK (42ms)

                              [ Cancel ]  [ Save ]
```

The **Test connection** button fires a live check (Kafka: list topics; HTTP: GET the base URL). Results appear inline. `${ENV_VAR}` references are resolved using the current Docker environment before testing.

**Using a module in the workflow editor:**

When adding a `kafka_publish` or `http_request` action step, a **Module** dropdown appears showing all available modules of the matching type (global first, then service-scoped). If no module of that type exists, the dropdown shows **"+ Create new module"** which opens the module editor in a side panel without leaving the workflow.

### Add Service Wizard

Clicking **+ Add Service** in the sidebar opens a three-step wizard:

**Step 1 — Basic info**
- Service name (free text)
- Port number (validated as available and not already used by another service)

**Step 2 — Spec source** (choose one)

```
┌─────────────────────────────────────────────────────┐
│  How do you want to provide the OpenAPI spec?       │
│                                                     │
│  ○  URL                                             │
│     Fetch from a remote endpoint                    │
│     [ https://...                              ]    │
│     Headers (optional)  [ + Add header ]           │
│     Refresh every [ 60 ] seconds                   │
│                                                     │
│  ○  Upload file                                     │
│     Upload a .json or .yaml spec file              │
│     [ Drop file here or click to browse ]          │
│                                                     │
│  ○  Upload & host                                   │
│     Same as above; also serves the spec at         │
│     GET /mockingbird/specs/{id}                    │
└─────────────────────────────────────────────────────┘
```

For the URL option, a **Test connection** button fetches the URL immediately and shows a success/error status plus a preview of how many endpoints were found.

For upload options, the file is validated as parseable OpenAPI 2 or 3 on drop, with inline error if not.

**Step 3 — Review**
- Summary of service name, port, spec source, and number of endpoints detected.
- **Create service** button writes to `mockingbird.yaml` and spins up the mock server.

### Endpoint Detail View

Split into three tabs:

**1. Default Response**
- Pick a response block from the library or create an inline one.
- Response block editor: status, headers table, body (Monaco editor), delay slider.

**2. Statements**
- Ordered list of statements (drag to reorder = priority order).
- Enable/disable toggle per statement.
- Each statement has two sections:

  *Condition builder* — visual block editor: IF [field] [operator] [value], with AND/OR grouping between blocks.

  *Workflow* — ordered list of action steps. Each step has a type picker and a type-specific form:
  - `respond`: choose response block, inline, or template mode. Template mode opens Monaco with parameter set selector and autocomplete for all available `{{variables}}`.
  - `kafka_publish`: module picker (filtered to `kafka` type) → topic, key (template), payload (Monaco).
  - `http_request`: module picker (filtered to `http` type) → method, path, additional headers, body (Monaco).
  - `proxy`: target URL override (or inherits service/endpoint proxy config), forward headers toggle.
  - `delay`: millisecond input.
  - `log`: message (template).

  Steps are visually separated into **before respond** (sync) and **after respond** (async) zones. Dragging `respond` up or down in the list changes which other steps are sync vs async.

### Save Behavior

The UI uses a **two-tier save model** depending on the type of edit:

**Structural changes** (toggling a statement on/off, reordering statements, selecting a different response block, adding/removing a workflow action) save immediately — these are single-field writes with no validity concern.

**Content edits** (body editor, Kafka payload, webhook body, any Monaco editor field) require an **explicit Save**. The editor shows a Save button that becomes active when the content has changed. Before writing to disk, the backend validates the content:
- JSON bodies are parsed; invalid JSON returns a 400 with the parse error shown inline.
- YAML config integrity is checked after the write is assembled.
- Template variable syntax is linted (unmatched `{{` flagged as a warning, not an error).

Save is triggered by the Save button or `Cmd/Ctrl+S` inside the editor.

The UI status indicator in the header shows:
- **Saved** (green dot) — all changes written to file.
- **Unsaved changes** (orange dot) — one or more editors have pending edits not yet saved.
- **Validation error** (red dot + inline message) — save was attempted but rejected; file unchanged.
- **Write error** (red dot + message) — file write failed (e.g. permissions); content preserved in UI.

If the config file is edited externally while unsaved edits exist in the UI, the UI shows a conflict banner: "File changed externally — review before saving." The user can diff and decide which to keep.

### Response Block Library

- List/card view of all response blocks.
- Create, edit, clone, delete.
- Monaco editor for body; headers table; status picker.
- "Used by" indicator showing which endpoints reference this block.

### Request Log

Real-time stream of all incoming requests across all services, pushed via WebSocket.

**Log entry columns:**

| Column | Description |
|---|---|
| Time | Timestamp (relative by default, absolute on hover) |
| Service | Service name |
| Method | HTTP method (color-coded: GET blue, POST green, DELETE red, etc.) |
| Path | Request path with resolved path params highlighted |
| Status | HTTP status returned (color-coded: 2xx green, 4xx amber, 5xx red) |
| Matched | Statement name, or "default", or "proxied" |
| Latency | Time from request received to response sent (ms) |

**Filtering toolbar:**

```
[ Service ▾ ] [ Method ▾ ] [ Status ▾ ] [ Statement ▾ ] [ Path contains... ] [ Clear filters ]
```

- **Service** — multi-select dropdown of all configured services.
- **Method** — multi-select: GET, POST, PUT, PATCH, DELETE, OPTIONS.
- **Status** — multi-select by range: 2xx, 3xx, 4xx, 5xx, or exact code.
- **Statement** — multi-select of all statement names across all services; includes "default" and "proxied" as options.
- **Path contains** — free-text substring match against the request path.

All filters are AND-combined. Active filters are shown as removable chips. Filters persist across page navigation within the session but are not saved to config.

**Log retention:**

The log keeps the last **1000 entries** in memory (configurable in settings, max 10 000). Older entries are dropped as new ones arrive. A "Load older" button is not available — if you need full history, enable stdout logging and pipe to a log aggregator.

**Entry detail drawer:**

Clicking any log entry opens a side drawer showing:
- Full request: method, path, query params, all headers, raw body.
- Full response: status, all headers, raw body.
- Matched statement ID and which condition matched.
- Workflow execution log: each action, its result, and duration.
- If proxied: upstream URL, upstream status, and round-trip latency.

**"Create statement from this request" shortcut:**

A button on the entry drawer pre-fills a new statement on the relevant endpoint, with condition blocks auto-populated from the request's path params, query params, and body fields. Opens the statement editor with the pre-filled condition ready to review.

---

## Docker Setup

### Single-container (simple)

```dockerfile
# Dockerfile (multi-stage — NX monorepo)
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx nx build backend --configuration=production
RUN npx nx build frontend --configuration=production

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist/apps/backend ./
COPY --from=build /app/dist/apps/frontend /app/public
COPY --from=deps /app/node_modules ./node_modules
EXPOSE 9000
CMD ["node", "main.js"]
```

```yaml
# docker-compose.yml
services:
  mockingbird:
    image: mockingbird:latest
    ports:
      - "9000:9000"       # UI
      - "8081:8081"       # Payment Service mock
      - "8082:8082"       # Another service mock
    volumes:
      - ./mockingbird.yaml:/config/mockingbird.yaml
    environment:
      CONFIG_PATH: /config/mockingbird.yaml
```

Ports for mock services are declared in config and the container exposes them dynamically. The user maps them in compose.

### Multi-container (optional, for isolation)

Each service can optionally run in its own container sharing the config volume:

```yaml
services:
  mockingbird-ui:
    image: mockingbird:latest
    command: ["--mode", "ui"]
    ports: ["9000:9000"]
    volumes: ["./mockingbird.yaml:/config/mockingbird.yaml"]

  mock-payment:
    image: mockingbird:latest
    command: ["--mode", "mock", "--service", "payment-service"]
    ports: ["8081:8081"]
    volumes: ["./mockingbird.yaml:/config/mockingbird.yaml"]
```

---

## Tech Stack (Recommended)

| Layer | Choice | Rationale |
|---|---|---|
| Monorepo | NX | First-class NestJS + Angular support; build caching; affected-only CI |
| Backend | NestJS (TypeScript) | Shared language with frontend; DI framework; structured, testable modules |
| Frontend | Angular | TypeScript-native; RxJS built-in (great for WebSocket streams); Angular CDK for drag/drop |
| Shared types | NX library (`libs/shared-types`) | Single source of truth for config schema and API DTOs — imported by both apps |
| Mock servers | Express (raw instances) | Each service gets its own `express()` instance managed by NestJS; clean isolation |
| UI components | Angular Material | Consistent component library; well-maintained; theming support |
| Code editor | Monaco Editor (`ngx-monaco-editor`) | Same engine as VS Code; template variable autocomplete |
| Workflow editor | Angular CDK drag/drop | Linear step list with drag handles; simpler and more usable than a canvas for this use case |
| Condition builder | Angular CDK drag/drop | Draggable condition blocks with AND/OR connectors |
| Config | YAML (single file) | Human-readable, GitOps-friendly |
| Config watcher | chokidar | File watching with debounce; works reliably across platforms |
| Real-time log | WebSocket (`@nestjs/websockets` + `ws`) | Low-overhead push to browser; RxJS WebSocketSubject on the client |
| Kafka client | kafkajs | Pure TypeScript Kafka client; no native dependencies |
| HTTP client | axios | Outbound HTTP calls from workflow steps |
| YAML parser | js-yaml | Parse `mockingbird.yaml` at runtime |
| Swagger parser | @apidevtools/swagger-parser | Resolves `$ref` chains; validates OAS2 + OAS3 |
| Testing | Jest + Supertest | Unit and integration tests; NX runs only affected tests on CI |
| CI/CD | GitHub Actions | Build, test, and push Docker image to ECR or Docker Hub |

---

## Data Flow — Request Lifecycle

```
Incoming HTTP Request
        │
        ▼
  HTTP Mock Server (per service)
        │
        ▼
  Statement Engine
  ├── Evaluate statements in priority order
  ├── First match → execute its Workflow
  └── No match   → return default response block
        │
        ▼
  Workflow Executor
  ├── Run actions in order
  ├── Actions before `respond`: synchronous (block the response)
  │     └── e.g. delay, outbound http_request
  ├── `respond` action: render template with parameter sets → send HTTP response
  └── Actions after `respond`: asynchronous (response already sent)
        └── e.g. kafka_publish, log, http_request
        │
        ▼
  Append to Request Log (WebSocket broadcast)
```

---

## Swagger Spec Drift

**Boot behavior:** On startup, Mockingbird always loads the cached spec first so mock servers come up immediately regardless of network state. URL-backed specs are then fetched in the background; if the fetch succeeds and the spec has changed, the diff is applied live. If unreachable, a warning is logged and the cached version continues to be used. Upload/hosted specs have no remote dependency and always boot from cache.

When the Swagger Loader fetches an updated spec (on boot background fetch or on refresh interval), it diffs the new spec against the existing config. If any configured endpoint — one that has user-defined statements, a custom default response, or attached workflows — is no longer present in the updated spec, it is marked **orphaned**.

### Orphaned endpoint behavior

- The endpoint is **not deleted** from `mockingbird.yaml`. All statements, workflows, and responses are preserved.
- The mock server **stops routing** requests to that path (it no longer exists in the spec).
- A warning is shown in two places:
  - **On boot / spec reload:** a warning is printed to stdout listing all orphaned endpoints by service.
  - **In the UI:** the service in the sidebar shows an orange warning badge. Orphaned endpoints are listed under a collapsible "Orphaned" section with a distinct visual treatment (strikethrough path, warning icon).

### Remapping an orphaned endpoint

Each orphaned endpoint in the UI has a **"Remap to…"** action. Clicking it opens a picker showing all endpoints currently in the live spec. Selecting one moves all statements, workflows, and the default response to the new endpoint. The old orphaned entry is then removed from config.

If the rename was a simple path change (e.g. `/payments/{id}` → `/payment/{id}`), Mockingbird suggests the closest match by Levenshtein distance as a pre-filled default in the picker.

---

## Config Hot Reload

The config file is watched with `chokidar`. On change:
1. Config Manager re-parses and validates the file.
2. Diffs are computed per service/endpoint/statement/block.
3. Only affected mock servers are restarted (zero-downtime for unaffected services).
4. UI receives a WebSocket event and refreshes state without a page reload.

The UI writes config changes via the REST API; the API writes to file, which triggers the watch cycle.

---

## MVP Scope

| Feature | MVP | Post-MVP |
|---|---|---|
| Swagger auto-import | ✅ | |
| Default response blocks | ✅ | |
| Statement engine | ✅ | |
| Module registry (Kafka + HTTP) | ✅ | |
| Workflow engine | ✅ | |
| Visual statement + condition builder | ✅ | |
| Visual workflow editor | ✅ | |
| Module configuration UI | ✅ | |
| gRPC module | | ✅ |
| Database module | | ✅ |
| Email / Slack modules | | ✅ |
| User-defined script modules | | ✅ |
| Request log UI | ✅ | |
| Config hot reload | ✅ | |
| Scenarios (named flags) | ✅ | |
| Record & replay | | ✅ |
| Multiple config files / workspaces | | ✅ |
| gRPC mocking | | ✅ |
| OAuth2 token injection | | ✅ |
| Parallel flow steps | | ✅ |

---

## Resolved Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Swagger auth | Env var references in config | Secrets stay out of the file; injected via Docker `environment:` |
| Port allocation | Explicit per-service in config | Predictable; easy to map in docker-compose before the container starts |
| UI save model | Two-tier: immediate for structural changes, explicit Save for content editors | Prevents broken JSON/YAML being written mid-edit; validation runs before write |
| Kafka connection | Lazy (on first flow execution) | Not all setups use Kafka; avoids startup failures in non-Kafka environments |
| Multi-user | Single user, no locking (MVP) | Last-write-wins acceptable; add optimistic locking post-MVP if needed |
