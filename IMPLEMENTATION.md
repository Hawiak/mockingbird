# Mockingbird — Implementation Guide

Stack: **NX monorepo · NestJS backend · Angular frontend · Shared TypeScript types**

Each phase builds directly on the previous. Backend phases first (testable with curl), frontend phases after. Every step ends with a concrete verifiable outcome.

---

## Package Installation Reference

Install these at the start of each phase. All are root-level installs (the NX monorepo has a single `node_modules`).

```bash
# Phase 1 (already done by NX generators)
npm install js-yaml && npm install -D @types/js-yaml
npm install chokidar && npm install -D @types/chokidar

# Phase 2
npm install @apidevtools/swagger-parser && npm install -D @types/swagger-parser
npm install @nestjs/event-emitter

# Phase 3
npm install cors && npm install -D @types/cors
npm install @nestjs/websockets @nestjs/platform-socket.io socket.io

# Phase 4
npm install jsonpath-plus fast-xml-parser xpath && npm install -D @types/xpath

# Phase 5
npm install http-proxy-middleware && npm install -D @types/http-proxy-middleware

# Phase 6
npm install kafkajs

# Phase 7
npm install class-validator class-transformer @nestjs/mapped-types
```

> All type imports use `@mockingbird/shared-types` (path alias wired in `tsconfig.base.json`). Never redefine types locally.

---

## Phase 1 — Monorepo Foundation

### Step 1 — NX workspace bootstrap

```bash
npx create-nx-workspace@latest mockingbird \
  --preset=empty \
  --packageManager=npm \
  --nxCloud=false

cd mockingbird

# Add NestJS + Angular plugins
npm install -D @nx/nest @nx/angular

# Generate the three projects
npx nx g @nx/nest:app backend --directory=apps/backend
npx nx g @nx/angular:app frontend --directory=apps/frontend --style=scss --routing=true
npx nx g @nx/js:lib shared-types --directory=libs/shared-types --bundler=tsc
```

Final structure:
```
mockingbird/
├── apps/
│   ├── backend/src/
│   └── frontend/src/
├── libs/
│   └── shared-types/src/
├── nx.json
├── package.json
└── tsconfig.base.json
```

Configure `tsconfig.base.json` path alias so both apps can import:
```json
"@mockingbird/shared-types": ["libs/shared-types/src/index.ts"]
```

**Deliverable:** `npx nx build backend` and `npx nx build frontend` both succeed.

---

### Step 2 — Shared type definitions

> **Status: DONE.** `libs/shared-types/src/config.types.ts` and `api.types.ts` are already written. Do not redefine types locally in `apps/backend` or `apps/frontend`. Always import from `@mockingbird/shared-types`.

Key shapes for reference (authoritative source is the file itself):

```typescript
// Config, Service, Endpoint, Statement, Condition, WorkflowAction,
// ResponseBlock, ModuleConfig, ParameterSet, SpecSource, CorsConfig, ProxyConfig
// — all in libs/shared-types/src/config.types.ts

// ParsedSpec, ParsedEndpoint, ParsedParameter
// — swagger loader output, also in config.types.ts

// TemplateContext, RequestContext, ResponseContext
// — template engine context, also in config.types.ts

// All API DTOs (CreateServiceDto, LogEntryDto, HealthDto, etc.)
// — in libs/shared-types/src/api.types.ts

// Endpoint.proxy is ProxyConfig | { enabled: false }   (NOT the string 'disabled')
// ModuleConfig.scope is a service ID string for service-scoped modules
// WorkflowAction.mode is 'block' | 'inline' | 'template' for respond actions
```

**Deliverable:** `npx nx build shared-types` succeeds (already passes). Import `Config` from `@mockingbird/shared-types` in `apps/backend/src/app.module.ts` — compiles without error.

---

### Step 3 — Config loader, writer, and env var resolution

Install: `npm install js-yaml && npm install -D @types/js-yaml`

**`apps/backend/src/config/config.service.ts`** — NestJS injectable service with both `load()` and `write()`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { readFileSync, writeFileSync, renameSync } from 'fs';
import { load, dump } from 'js-yaml';
import type { Config } from '@mockingbird/shared-types';

@Injectable()
export class ConfigService {
  private readonly logger = new Logger(ConfigService.name);
  private current: Config | null = null;
  private configPath: string = '';

  async load(path: string): Promise<Config> {
    this.configPath = path;
    const raw = readFileSync(path, 'utf8');
    const parsed = load(raw) as Config;
    this.current = this.resolveEnvVars(parsed) as Config;
    return this.current;
  }

  getCurrent(): Config | null { return this.current; }

  /**
   * Persist a new config to disk atomically (write to .tmp, then rename).
   * Chokidar will pick up the change and broadcast it; the hash guard
   * prevents a reload loop since the in-memory value already matches.
   */
  async write(config: Config): Promise<void> {
    if (!this.configPath) throw new Error('ConfigService not initialised — call load() first');
    this.validate(config);
    const yaml = dump(config, { lineWidth: 120, noRefs: true });
    const tmp = `${this.configPath}.tmp`;
    writeFileSync(tmp, yaml, 'utf8');
    renameSync(tmp, this.configPath);   // atomic on POSIX; best-effort on Windows
    this.current = config;
  }

  private validate(config: Config): void {
    const ports = config.services.map(s => s.port);
    const dups = ports.filter((p, i) => ports.indexOf(p) !== i);
    if (dups.length) throw new Error(`Duplicate service ports: ${dups.join(', ')}`);
    for (const svc of config.services) {
      if (!svc.id) throw new Error(`Service "${svc.name}" is missing an id`);
      if (!svc.port || svc.port < 1 || svc.port > 65535)
        throw new Error(`Service "${svc.name}" has invalid port ${svc.port}`);
    }
  }

  private resolveEnvVars(obj: unknown): unknown {
    if (typeof obj === 'string') {
      return obj.replace(/\$\{([^}]+)\}/g, (_, key) => {
        const val = process.env[key];
        if (!val) this.logger.warn(`Unresolved env var: \${${key}}`);
        return val ?? '';
      });
    }
    if (Array.isArray(obj)) return obj.map(v => this.resolveEnvVars(v));
    if (obj !== null && typeof obj === 'object') {
      return Object.fromEntries(
        Object.entries(obj as object).map(([k, v]) => [k, this.resolveEnvVars(v)])
      );
    }
    return obj;
  }
}
```

Wire into `apps/backend/src/app.module.ts`. In `apps/backend/src/main.ts`, call `configService.load(process.env.CONFIG_PATH ?? 'mockingbird.yaml')` before `app.listen()`.

**Unit tests** (`config.service.spec.ts`): env var substitution, missing vars (warn + empty string), nested objects, arrays, `write()` creates temp file then renames, `write()` throws on duplicate ports, `write()` throws on invalid port.

**Deliverable:** `npx nx test backend --testFile=config.service.spec.ts` passes.

---

### Step 4 — Config hot reload

Install: `npm install chokidar && npm install -D @types/chokidar`

**`apps/backend/src/config/config-watcher.service.ts`:**

Use `chokidar`. Debounce 200ms. On change: re-parse, compare SHA-256 hash of stringified config, skip broadcast if identical, log and discard parse errors.

```typescript
@Injectable()
export class ConfigWatcherService implements OnModuleInit, OnModuleDestroy {
  private changes$ = new Subject<{ old: Config; new: Config }>();

  get changes(): Observable<{ old: Config; new: Config }> {
    return this.changes$.asObservable();
  }

  onModuleInit() { /* start chokidar watcher */ }
  onModuleDestroy() { /* close watcher */ }
}
```

All other NestJS modules subscribe to `changes$` via RxJS to react to config updates.

**Deliverable:** Edit `mockingbird.yaml` while the server is running — console logs "Config reloaded". Invalid YAML logs the error but does not crash.

---

## Phase 2 — Swagger Loading

### Step 5 — Swagger loader

Install: `npm install @apidevtools/swagger-parser && npm install -D @types/swagger-parser && npm install @nestjs/event-emitter`

`ParsedSpec`, `ParsedEndpoint`, and `ParsedParameter` are already defined in `@mockingbird/shared-types` — import them, do not redefine.

**`apps/backend/src/swagger/swagger-loader.service.ts`:**

```typescript
import type { Service, ParsedSpec } from '@mockingbird/shared-types';

@Injectable()
export class SwaggerLoaderService {
  async load(service: Service): Promise<ParsedSpec> { ... }
  async refresh(service: Service): Promise<ParsedSpec | null> { ... } // null = no change
}
```

- **URL source:** fetch with resolved headers (axios). On success write to `.mockingbird-cache/specs/{id}.json`. On failure load from cache.
- **Upload/hosted:** read directly from `.mockingbird-cache/specs/{id}.json`.
- **Parsing:** `@apidevtools/swagger-parser` — resolves all `$ref` chains, validates OAS2/3.
- **Refresh:** background `setInterval` per URL-backed service. On change (hash comparison) emit `SpecChangedEvent` via NestJS `EventEmitter2` (requires `EventEmitterModule.forRoot()` in `app.module.ts`).

**Deliverable:** Point at the Petstore Swagger URL — `loader.load(service)` returns a list of endpoints with their parsed schemas. Cache file written to disk.

---

### Step 6 — Default response generation

**`apps/backend/src/swagger/response-generator.service.ts`:**

Priority pipeline (stop at first result):
1. Response-level `example` (OAS3)
2. Response-level `examples` first entry
3. Schema-level `example`
4. Schema-level `default`
5. Recursive `generateFromSchema(schema)` — handles all types, formats, `$ref`, `oneOf`, `allOf`, `nullable`
6. Empty body for 204 or schema-absent

Status code: lowest 2xx defined on the operation. Content-Type: prefer `application/json`.

Write the generated `ResponseBlock` into config via `ConfigService.write()` (defined in Step 3) only if no user-defined block already exists for that endpoint. This is the first call site for `write()` — it runs at boot after spec parsing, before any HTTP request is served.

**Deliverable:** Unit tests covering every schema type, `oneOf`, `$ref` resolution, format-aware string generation. Petstore import produces realistic JSON bodies on all endpoints.

---

## Phase 3 — Mock HTTP Servers

### Step 7 — Per-service Express mock server

Each service gets its own raw Express app (not the NestJS adapter) on its configured port. Routes are registered from the parsed spec.

**`apps/backend/src/mock/mock-server.service.ts`:**

```typescript
@Injectable()
export class MockServerService {
  private servers = new Map<string, http.Server>();

  async start(service: Service, spec: ParsedSpec): Promise<void> { ... }
  async stop(serviceId: string): Promise<void> { ... }
  async reload(service: Service, spec: ParsedSpec): Promise<void> { ... }
}
```

Subscribe to `ConfigWatcherService.changes$` — diff old vs new services, restart only those whose port or endpoints changed.

Route handler for each endpoint calls the Statement Engine, then Workflow Executor (Phase 4–5).

**Deliverable:** `curl localhost:8081/pets/1` returns the auto-generated default response with status 200.

---

### Step 8 — CORS middleware

Pure Express middleware applied per service. Read CORS config from the service definition. Handle `OPTIONS` by returning 204 immediately (never reaches statement engine). Inject `Access-Control-*` headers on all other responses.

**Deliverable:** `curl -X OPTIONS localhost:8081/pets/1 -v` returns 204 with correct CORS headers. `cors.enabled: false` skips all CORS handling.

---

### Step 9 — Request log

**`apps/backend/src/log/log.service.ts`:**

In-memory ring buffer (default 1000, max 10 000). Each entry captures the full request snapshot, response snapshot, matched statement name, latency, and workflow execution log.

**`apps/backend/src/log/log.gateway.ts`** — NestJS WebSocket gateway:

```typescript
@WebSocketGateway({ path: '/ws/log' })
export class LogGateway {
  @WebSocketServer() server: Server;

  broadcast(entry: LogEntry) {
    this.server.emit('log', entry);
  }
}
```

On new client connect: send last N entries from the ring buffer immediately. On each new request: call `gateway.broadcast(entry)`.

**Deliverable:** Connect to `ws://localhost:9000/ws/log` with `wscat` — see entries appear in real time as curl hits the mock server.

---

## Phase 4 — Statement Engine

### Step 10 — Condition evaluator

Install: `npm install jsonpath-plus fast-xml-parser xpath && npm install -D @types/xpath`

**`apps/backend/src/statement/condition.service.ts`:**

```typescript
evaluate(condition: Condition | ConditionLeaf, req: Request, callCount: number): boolean
```

Recursive: branch nodes (AND/OR) delegate to children; leaf nodes evaluate the specific type.

- `request.body_json`: parse body once, cache on `req` object, evaluate JSONPath with `jsonpath-plus`
- `request.body_xml`: parse with `fast-xml-parser`, evaluate XPath with `xpath`
- `request.count`: compare against per-endpoint `Map<string, number>` (atomic increment on each request)
- All other types: direct string/header/query/param lookup

Operators: `equals`, `not_equals`, `contains`, `not_contains`, `matches_regex`, `exists`, `not_exists`, `gt`, `lt`.

**Unit tests:** Table-driven, every type × every applicable operator. Nested AND/OR trees. Body JSON caching (parse called only once per request).

**Deliverable:** All tests pass. `npx nx test backend --testFile=condition.service.spec.ts`

---

### Step 11 — Statement matcher

**`apps/backend/src/statement/statement-matcher.service.ts`:**

Sort enabled statements by priority on config load (not per-request). Evaluate in order; return the first match. If none: return null (caller serves default response block).

Wire into the Express route handler:
1. Increment call counter for this endpoint.
2. Call `matcher.match(statements, req, count)`.
3. Matched: hand to Workflow Executor.
4. No match: serve default response block directly.

**Deliverable:** Two statements on one endpoint — `id=999` → 404, `format=full` → custom body. All three cases (match1, match2, default) verified with curl.

---

## Phase 5 — Workflow Executor

### Step 12 — Template engine

`TemplateContext`, `RequestContext`, and `ResponseContext` are defined in `@mockingbird/shared-types`. Import them — do not redefine.

**`apps/backend/src/workflow/template.service.ts`:**

```typescript
import type { TemplateContext } from '@mockingbird/shared-types';

interface RenderResult { output: string; warnings: string[] }

render(template: string, ctx: TemplateContext): RenderResult
```

Variables resolved in order:
1. `request.*` — method, path, path params (from Express `req.params`), query, headers, raw body, JSONPath into body
2. Built-ins: `{{now}}` (ISO timestamp), `{{uuid}}` (random UUIDv4)
3. Named parameter sets (listed order; later sets override earlier)

Use a simple regex replace (`/\{\{([^}]+)\}\}/g`) — no external template library needed. Warnings for unresolved variables (empty resolution).

**Unit tests:** All `request.*` paths, JSONPath, parameter set merging order, `{{now}}`, `{{uuid}}`, unresolved variable produces warning.

---

### Step 13 — `respond`, `delay`, `log` actions

**`apps/backend/src/workflow/actions/`** — one file per action type:

- **respond.action.ts:** Resolve response block by ID, render body template, write status + headers + body to Express `res`. Supports block / inline / template modes.
- **delay.action.ts:** `await new Promise(resolve => setTimeout(resolve, action.ms))` — synchronous in the async chain, holds the response.
- **log.action.ts:** Render message template, write to NestJS logger, append to the current request's `WorkflowLogEntry[]`.

---

### Step 14 — `proxy` action

Install: `npm install http-proxy-middleware && npm install -D @types/http-proxy-middleware`

**`apps/backend/src/workflow/actions/proxy.action.ts`:**

Use `http-proxy-middleware` or pipe a raw `axios` request to the Express `res`. Strip `Host` header. Apply `stripHeaders` list. Return `{ status, body }` so post-respond actions can access `{{response.status}}` and `{{response.body}}`.

Priority resolution (in the Express route handler, before statement engine):
1. Check service-level proxy config → proxy immediately if set
2. Check endpoint-level proxy → proxy or disable (overrides service)
3. Else run statement engine normally
4. Inside a workflow, `proxy` action overrides all of the above for that matched statement

**Deliverable:** Service proxy to `https://httpbin.org` — all requests forwarded. Endpoint-level `proxy: disabled` bypasses service proxy. Workflow `proxy` action fires only on statement match.

---

### Step 15 — Workflow executor (sync/async split)

**`apps/backend/src/workflow/workflow-executor.service.ts`:**

```typescript
async execute(
  workflow: WorkflowAction[],
  ctx: TemplateContext,
  res: Response,
  logEntry: LogEntry
): Promise<void>
```

1. Find the index of the `respond` or `proxy` action in the workflow array.
2. `await` all actions before that index (synchronous — delay, outbound http_request, etc.).
3. Execute `respond`/`proxy` — response is now sent.
4. Fire remaining actions in a detached `Promise` chain (non-blocking). Populate `ctx.response` from the respond result so `{{response.body}}` resolves.
5. When all async actions complete, finalise `logEntry` and push to `LogService`.

If no `respond` or `proxy` action exists in the workflow: log a warning and fall through to the endpoint's default response block (same path as the no-statement-match case). Do not return a 500 — the user can configure the default block as they wish. The warning banner in the UI (Step 29) alerts them to fix the workflow.

**Deliverable:** `delay(200ms) → respond → kafka_publish` — response arrives in ~200ms, Kafka message arrives ~10ms later. Both appear in the log entry's workflow log.

---

## Phase 6 — Module System

### Step 16 — Module registry

**`apps/backend/src/module-registry/module-registry.service.ts`:**

```typescript
@Injectable()
export class ModuleRegistryService {
  register(id: string, instance: MockingbirdModule): void
  get(id: string): MockingbirdModule | undefined
  async runHealthChecks(): Promise<Record<string, HealthResult>>
}

export interface MockingbirdModule {
  type: string;
  configure(config: Record<string, unknown>): Promise<void>;
  execute(params: Record<string, string>, ctx: TemplateContext): Promise<void>;
  healthCheck(): Promise<HealthResult>;
}
```

On `ConfigWatcherService.changes$`: reconfigure any module whose config changed. Re-run health checks and cache results. Expose via `GET /api/modules/:id/health`.

---

### Step 17 — Kafka module

**`apps/backend/src/module-registry/modules/kafka.module-impl.ts`:**

Use `kafkajs`. Lazy connect on first `execute()`. Retry 3× with backoff (1s, 2s, 4s). `healthCheck()` calls `admin.listTopics()` with a 3s timeout.

Auth support: SASL Plain, SASL SCRAM-256/512 — configured from the module's config object.

Kafka workflow step: render `key` and `payload` through `TemplateService` before calling `module.execute()`.

**Deliverable:** Kafka module against a local `kafka` container. Statement fires, message appears in a test consumer.

---

### Step 18 — HTTP module

**`apps/backend/src/module-registry/modules/http.module-impl.ts`:**

Use `axios`. `configure()` creates an axios instance with `baseURL`, `headers`, timeout. Auth: Bearer (Authorization header), Basic (base64), API Key (custom header or query param). `healthCheck()` sends a `HEAD` or `GET` to the base URL with 2s timeout.

`execute()`: render path, body, per-action headers through `TemplateService`, merge with instance defaults, fire the request.

**Deliverable:** HTTP module against `https://httpbin.org`. Statement fires, outbound POST logged with response status.

---

## Phase 7 — REST API

### Step 19 — NestJS controllers

Install: `npm install class-validator class-transformer @nestjs/mapped-types`

One controller per resource. All request bodies validated with `class-validator` DTOs. All writes go through `ConfigService.write(updatedConfig)` (Step 3) which persists to disk atomically and triggers the hot reload cycle. Pattern: load current config → apply mutation → call `write()`.

**Controllers:**

```
ServicesController      GET/POST /api/services
                        GET/PUT/DELETE /api/services/:id
                        POST /api/services/:id/spec/refresh
                        POST /api/services/:id/spec/upload
                        GET  /api/services/:id/spec/preview

EndpointsController     GET /api/services/:id/endpoints
                        GET/PUT /api/services/:id/endpoints/:eid

StatementsController    GET/POST /api/services/:id/endpoints/:eid/statements
                        GET/PUT/DELETE /api/services/:id/endpoints/:eid/statements/:sid
                        PATCH /api/services/:id/endpoints/:eid/statements/:sid/reorder

ResponseBlocksController  GET/POST /api/response-blocks
                          GET/PUT/DELETE /api/response-blocks/:id

ModulesController       GET/POST /api/modules
                        GET/PUT/DELETE /api/modules/:id
                        GET /api/modules/:id/health

ParameterSetsController GET/POST /api/parameter-sets
                        GET/PUT/DELETE /api/parameter-sets/:id

LogController           GET /api/log
TemplateController      POST /api/template/preview
HealthController        GET /api/health
```

**Validation:** `ValidationPipe` globally. Invalid port returns `400 { error: "Port 8082 is already in use" }`. Nothing written to disk on validation failure.

**Deliverable:** Full CRUD via curl. Config file reflects every change. Mock server picks up changes within 200ms.

---

### Step 20 — Swagger spec drift

**`apps/backend/src/swagger/spec-drift.service.ts`:**

On every `SpecChangedEvent`: diff old endpoint list vs new spec. Endpoints with statements, custom default response, or workflows that no longer exist in the spec → flagged in an in-memory `Set<string>` (orphaned endpoint IDs).

Levenshtein-distance closest match suggested in the remap response.

```
GET  /api/services/:id/orphaned-endpoints
POST /api/services/:id/endpoints/:eid/remap  { targetEndpointId: string }
```

`remap`: moves all statements + workflows + default response to the target endpoint, removes orphaned entry.

**Deliverable:** Upload a modified spec with one path renamed. `GET /orphaned-endpoints` returns the old path. POST remap moves statements to new path.

---

## Phase 8 — Frontend Foundation

### Step 21 — Angular app scaffold and routing

Angular is already generated by NX. Set up Angular Material, routing, and the API service layer.

```bash
npx nx g @nx/angular:add-material frontend
```

**Routes:**
```typescript
const routes: Routes = [
  { path: '', redirectTo: 'services', pathMatch: 'full' },
  { path: 'services', component: ServicesShellComponent },
  { path: 'services/:id', component: ServiceDetailComponent },
  { path: 'services/:id/endpoints/:eid', component: EndpointDetailComponent },
  { path: 'modules', component: ModulesPageComponent },
  { path: 'response-blocks', component: ResponseBlocksPageComponent },
  { path: 'log', component: RequestLogPageComponent },
  { path: 'settings', component: SettingsPageComponent },
];
```

**API service** (`libs/shared-types` DTOs used as return types):
```typescript
@Injectable({ providedIn: 'root' })
export class ApiService {
  constructor(private http: HttpClient) {}
  getServices(): Observable<Service[]> { ... }
  // ... one method per API endpoint
}
```

**WebSocket service** (`apps/frontend/src/app/core/log-socket.service.ts`):
```typescript
@Injectable({ providedIn: 'root' })
export class LogSocketService {
  readonly entries$ = new BehaviorSubject<LogEntry[]>([]);
  // connect to ws://localhost:9000/ws/log
  // buffer last 1000 entries in entries$
}
```

**Deliverable:** App loads, navigates between routes, sidebar renders service list from API.

---

### Step 22 — Save state service

```typescript
@Injectable({ providedIn: 'root' })
export class SaveStateService {
  readonly status$ = new BehaviorSubject<'saved'|'unsaved'|'saving'|'error'>('saved');

  markUnsaved(): void { this.status$.next('unsaved'); }

  async save(fn: () => Promise<void>): Promise<void> {
    this.status$.next('saving');
    try {
      await fn();
      this.status$.next('saved');
    } catch (e) {
      this.status$.next('error');
      throw e;
    }
  }
}
```

Monaco editor wrapper component binds `Cmd/Ctrl+S` via `(keydown)` on the host and calls `saveStateService.save(...)`. Header indicator component subscribes to `status$`.

**Deliverable:** Edit body in Monaco → header shows "Unsaved". Cmd+S → "Saving…" → "Saved". Invalid JSON → "Error" with message.

---

## Phase 9 — Frontend: Services

### Step 23 — Add Service wizard

Three-step Angular Material `MatStepper` in a `MatDialog`.

- **Step 1:** `MatFormField` for name + port. Port uniqueness validated via async validator calling `GET /api/health`.
- **Step 2:** `MatRadioGroup` for spec source. URL option: `MatFormField` + headers table + **Test connection** button (calls `POST /api/services/temp/spec/preview`). Upload option: drag/drop zone with `DragEvent` + FileReader.
- **Step 3:** Summary card. **Create** calls `POST /api/services` → navigate to new service.

**Deliverable:** Full wizard creates a service. Mock server up, curl returns auto-generated response.

---

### Step 24 — Sidebar and service detail

Sidebar: `MatNavList` with nested items. Angular Material `MatExpansionPanel` for service children. `MatBadge` for orphaned endpoint warning count.

Service settings page: CORS config as inline editable table (structural save on change). Spec source display with **Refresh now** button. Proxy toggle + target input. Delete with `MatDialog` confirmation.

---

## Phase 10 — Frontend: Endpoints

### Step 25 — Endpoint list

`MatList` grouped by HTTP method. Method pill: `MatChip` with colour binding (`GET=blue`, `POST=green`, `DELETE=red`, etc.). Status icon: green dot (active), grey dot (default only, no statements), orange strikethrough (orphaned).

Orphaned section: `MatExpansionPanel` collapsed by default with **Remap to…** button opening a `MatDialog` picker.

---

### Step 26 — Default response editor

`MatTabGroup` with tabs: Default Response / Statements / Log.

Default Response tab: `MatButtonToggle` for block vs inline mode. Block mode: `MatSelect` with response block options + read-only preview. Inline mode: status picker + headers table + Monaco editor with Save button.

---

### Step 27 — Template preview panel

Collapsible panel below any Monaco editor. Angular `@defer` to lazy-load. Layout: two-column (`display: grid; grid-template-columns: 1fr 1fr`).

- Left: Monaco editor (the template).
- Right: read-only Monaco showing rendered output.
- Below: sample request form (path params auto-detected from endpoint path pattern using regex).
- **Render** button calls `POST /api/template/preview`. Unresolved variables decorated in Monaco with `createDecorationsCollection`.

---

## Phase 11 — Frontend: Statements

### Step 28 — Condition builder

Each condition block is an Angular component with `MatSelect` for field type, a secondary param input (conditionally shown), operator `MatSelect`, and value `MatInput`.

Angular CDK `DragDropModule` for reordering blocks within a group. AND/OR connector shown between adjacent blocks as a `MatButtonToggle`.

Nested groups: a block can be "wrapped in a group" — promotes the leaf into a sub-condition tree. Recursively rendered via a self-referencing component.

All changes (picker selections, value input debounced 500ms): structural save.

---

### Step 29 — Workflow editor

**`WorkflowEditorComponent`:**

Ordered list of action step cards using Angular CDK `CdkDropList`. Drag handle (`cdkDragHandle`) on each card.

The `respond` or `proxy` card renders a labelled zone divider below it ("↑ sync — runs before response · ↓ async — runs after response"). Dragging `respond` up or down moves the divider.

Each step card shows:
- Type badge (`MatChip` coloured by action type)
- Inline form using `@switch (action.action)`:
  - `respond`: `MatButtonToggle` (block/inline/template) + conditional sub-form
  - `kafka_publish`: module `MatSelect` (filtered to `kafka` type) + topic, key, payload (Monaco)
  - `http_request`: module `MatSelect` (filtered to `http` type) + method, path, headers, body (Monaco)
  - `proxy`: target override input + forward headers `MatSlideToggle`
  - `delay`: `MatInput` type=number (ms)
  - `log`: `MatInput` for message template

**"+ Add action"** button: `MatMenu` with action type options. If a `kafka_publish` or `http_request` is picked and no module of that type exists: shows a **Create module** option that opens the module editor in a `MatSideNav` without leaving the workflow.

No-respond warning banner: a styled `div` with `background: var(--color-warning-50); border: 1px solid var(--color-warning-200); border-radius: var(--radius-sm); padding: 8px 12px` shown above the action list if the workflow contains no `respond` or `proxy` step. Angular Material has no `MatBanner` — do not try to import one.

---

## Phase 12 — Frontend: Modules

### Step 30 — Module configuration UI

**Global Modules page** and **per-service Modules tab** share `ModuleListComponent` and `ModuleEditorComponent`.

Module list: `MatCard` grid. Health status: `MatIcon` with colour (green checkmark / red error / grey hourglass). `MatTooltip` showing "Used by N workflow steps" on disabled delete buttons.

**Kafka editor:** broker list with add/remove rows, auth type `MatSelect` with conditional credential fields. **Test connection** → `GET /api/modules/:id/health` → inline result.

**HTTP editor:** base URL, default headers table, auth type picker, timeout input. **Test connection** same pattern.

---

## Phase 13 — Frontend: Supporting Views

### Step 31 — Response Block library

`/response-blocks` page. `MatCard` grid with name, status badge, truncated body preview, "Used by N" chip.

Block editor: status code `MatButtonToggle` (200, 201, 204, 400, 401, 403, 404, 500) + custom `MatInput`. Delay `MatSlider`. Headers `MatTable` (editable rows, add/remove). Body Monaco editor with Save + Cmd+S.

---

### Step 32 — Request log

**`/log` page.**

Filtering toolbar: five `MatSelect` multi-selects (service, method, status range, statement, path contains). Filters implemented as a RxJS `combineLatest` pipeline on `LogSocketService.entries$` — no server round-trip.

Virtual scroll: `CdkVirtualScrollViewport` with `itemSize=48`. Handles 1000 entries without layout jank.

Row click: `MatDrawer` slides open from the right.

**Drawer tabs** (`MatTabGroup`):
- Request: method, path, query params `MatTable`, headers `MatTable`, body Monaco (read-only).
- Response: status, headers `MatTable`, body Monaco (read-only). If proxied: upstream URL + round-trip badge.
- Workflow log: `MatTimeline` (or simple list) of action results with type icon, duration, result/error.

**"Create statement from this request"** button: calls `POST /api/services/:id/endpoints/:eid/statements` with pre-populated condition, then `router.navigate` to that endpoint's Statements tab.

---

## Phase 14 — Docker and CI/CD

### Step 33 — Multi-stage Dockerfile

```dockerfile
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

The NestJS server serves the Angular build as static files for all non-API routes:
```typescript
app.useStaticAssets(join(__dirname, 'public'));
app.setGlobalPrefix('api');
// catch-all: serve index.html for Angular routing
```

---

### Step 34 — docker-compose

```yaml
services:
  mockingbird:
    build: .
    ports:
      - "9000:9000"
      - "8081:8081"
      - "8082:8082"
    volumes:
      - ./mockingbird.yaml:/config/mockingbird.yaml
      - mockingbird-cache:/config/.mockingbird-cache
    environment:
      CONFIG_PATH: /config/mockingbird.yaml
      CACHE_DIR: /config/.mockingbird-cache

volumes:
  mockingbird-cache:
```

---

### Step 35 — GitHub Actions CI/CD

**`.github/workflows/docker.yml`:**

Supports both registries. Set `vars.REGISTRY` to `dockerhub` or `ecr` in the GitHub repo variables. Provide the corresponding secrets.

```yaml
name: Build and Push Docker Image

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - run: npm ci

      - name: Run affected tests
        run: npx nx affected --target=test --base=origin/main --parallel=3

  build-and-push:
    runs-on: ubuntu-latest
    needs: test
    if: github.event_name == 'push'
    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      # Docker Hub path
      - name: Login to Docker Hub
        if: vars.REGISTRY == 'dockerhub'
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}

      - name: Build and push to Docker Hub
        if: vars.REGISTRY == 'dockerhub'
        uses: docker/build-push-action@v5
        with:
          push: true
          tags: |
            ${{ secrets.DOCKERHUB_USERNAME }}/mockingbird:latest
            ${{ secrets.DOCKERHUB_USERNAME }}/mockingbird:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      # ECR path
      - name: Configure AWS credentials
        if: vars.REGISTRY == 'ecr'
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ secrets.AWS_REGION }}

      - name: Login to Amazon ECR
        if: vars.REGISTRY == 'ecr'
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v2

      - name: Build and push to ECR
        if: vars.REGISTRY == 'ecr'
        uses: docker/build-push-action@v5
        with:
          push: true
          tags: |
            ${{ steps.login-ecr.outputs.registry }}/mockingbird:latest
            ${{ steps.login-ecr.outputs.registry }}/mockingbird:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  build-pr:
    runs-on: ubuntu-latest
    needs: test
    if: github.event_name == 'pull_request'
    steps:
      - uses: actions/checkout@v4
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3
      - name: Build only (no push)
        uses: docker/build-push-action@v5
        with:
          push: false
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

**Secrets to configure in GitHub:**

| Secret / Variable | Used when |
|---|---|
| `vars.REGISTRY` | `dockerhub` or `ecr` |
| `secrets.DOCKERHUB_USERNAME` | Docker Hub |
| `secrets.DOCKERHUB_TOKEN` | Docker Hub |
| `secrets.AWS_ACCESS_KEY_ID` | ECR |
| `secrets.AWS_SECRET_ACCESS_KEY` | ECR |
| `secrets.AWS_REGION` | ECR |

PRs only build (no push) to validate the Dockerfile. Merges to `main` build and push. NX's `affected` command means only tests for changed packages run on each PR — CI stays fast as the project grows.

---

## Implementation Order Summary

| Phase | Steps | Deliverable |
|---|---|---|
| 1 — Foundation | 1–4 | NX workspace, shared types, config parser, hot reload |
| 2 — Swagger | 5–6 | Spec loading, default response generation |
| 3 — Mock servers | 7–9 | curl returns auto-generated responses; WebSocket log works |
| 4 — Statement engine | 10–11 | Conditional responses verified with curl |
| 5 — Workflow | 12–15 | Templates, delays, proxy, sync/async split |
| 6 — Modules | 16–18 | Kafka + outbound HTTP from workflows |
| 7 — REST API | 19–20 | Full config management over HTTP |
| 8 — Frontend foundation | 21–22 | Angular app shell, routing, save state |
| 9 — Services UI | 23–24 | Add service wizard, sidebar, settings |
| 10 — Endpoints UI | 25–27 | Default response editor, template preview |
| 11 — Statements UI | 28–29 | Condition builder, workflow editor |
| 12 — Modules UI | 30 | Module config, test connection |
| 13 — Supporting views | 31–32 | Response block library, request log |
| 14 — Docker + CI/CD | 33–35 | Containerised; GitHub Actions pushes to ECR or Docker Hub |
