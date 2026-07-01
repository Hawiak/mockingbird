# Implementation Progress

## Status key
- [x] Done and verified
- [ ] Not started

---

## Phase 1 — Monorepo Foundation

- [x] Step 1 — NX workspace + app scaffold (`apps/backend`, `apps/frontend`, `libs/shared-types` all build)
- [x] Step 2 — Shared type definitions (`config.types.ts`: Config, Service, Endpoint, Statement, Condition, WorkflowAction, ResponseBlock, ModuleConfig, ParameterSet, ParsedSpec, TemplateContext; `api.types.ts`: all DTOs)
- [x] Step 3 — Config loader + `write()` + env var resolution
- [x] Step 4 — Config hot reload (chokidar)

## Phase 2 — Swagger Loading

- [x] Step 5 — Swagger loader (url/upload/hosted, cache, `@apidevtools/swagger-parser`)
- [x] Step 6 — Default response generation (schema → ResponseBlock)

## Phase 3 — Mock HTTP Servers

- [x] Step 7 — Per-service Express mock server
- [x] Step 8 — CORS middleware
- [x] Step 9 — Request log ring buffer + WebSocket gateway

## Phase 4 — Statement Engine

- [x] Step 10 — Condition evaluator (all types × operators, jsonpath-plus, fast-xml-parser)
- [x] Step 11 — Statement matcher (priority sort, first-match, default fallback)

## Phase 5 — Workflow Executor

- [x] Step 12 — Template engine (`{{request.*}}`, `{{now}}`, `{{uuid}}`, parameter sets)
- [x] Step 13 — `respond`, `delay`, `log` actions
- [x] Step 14 — `proxy` action (axios pipe)
- [x] Step 15 — Workflow executor (sync/async split at respond/proxy boundary)

## Phase 6 — Module System

- [x] Step 16 — Module registry interface + health check cache
- [x] Step 17 — Kafka module (kafkajs, lazy connect, retry, SASL auth)
- [x] Step 18 — HTTP module (axios, Bearer/Basic/APIKey auth)

## Phase 7 — REST API

- [x] Step 19 — NestJS controllers (full CRUD for all 6 resource types + log + template preview + health)
- [x] Step 20 — Spec drift API (orphaned endpoint detection, remap)

## Phase 8 — Frontend Foundation

- [x] Step 21 — Angular app scaffold, routing, ApiService, LogSocketService
- [x] Step 22 — SaveStateService

## Phase 9 — Frontend: Services

- [x] Step 23 — Add Service wizard (MatStepper in MatDialog, async port validator)
- [x] Step 24 — Sidebar + service settings page

## Phase 10 — Frontend: Endpoints

- [x] Step 25 — Endpoint list (grouped by method, orphaned section)
- [x] Step 26 — Default response editor (block vs inline, MatTabGroup)
- [x] Step 27 — Template preview panel (split Monaco, Render button)

## Phase 11 — Frontend: Statements

- [x] Step 28 — Condition builder (CdkDropList, AND/OR connector, nested groups)
- [x] Step 29 — Workflow editor (CdkDropList, sync/async divider, action type forms)

## Phase 12 — Frontend: Modules

- [x] Step 30 — Module configuration UI (list + drawer editor, test connection)

## Phase 13 — Frontend: Supporting Views

- [x] Step 31 — Response Block library
- [x] Step 32 — Request log (CdkVirtualScrollViewport, MatDrawer, filter chips)

## Phase 14 — Docker & CI/CD

- [x] Step 33 — Multi-stage Dockerfile (deps → build → runtime)
- [x] Step 34 — docker-compose.yml
- [x] Step 35 — GitHub Actions (ECR + Docker Hub, NX affected tests)

---

## Config + Swagger + Mock + Log (Steps 3–9)
- [x] Step 3 — `ConfigService`: YAML load, atomic write (tmp→rename), env var resolution, port/id validation
- [x] Step 4 — `ConfigWatcherService`: chokidar watcher, 200ms debounce, SHA-256 hash guard, RxJS Subject broadcast
- [x] Step 5 — `SwaggerLoaderService`: url/upload/hosted sources, axios fetch with headers, cache to `.mockingbird-cache/specs/{id}.json`, `SwaggerParser.dereference()`, per-service refresh intervals, `SpecChangedEvent` via EventEmitter2
- [x] Step 6 — `ResponseGeneratorService`: OAS2+OAS3 aware, priority pipeline (example→examples→schema.example→schema.default→generateFromSchema→empty), all schema types (string/formats, integer/number, boolean, array, object, oneOf/anyOf/allOf), depth guard 10
- [x] Step 7 — `MockServerService`: per-service Express apps, OAS `{param}` → Express `:param` conversion, default response handler, ConfigWatcher subscription for hot-reload stop/restart
- [x] Step 8 — `createCorsMiddleware()`: all Access-Control-* headers, OPTIONS 204 short-circuit, `enabled: false` skips all CORS
- [x] Step 9 — `LogService` (ring buffer, capacity 1000/max 10000) + `LogGateway` (@WebSocketGateway on /ws/log, backlog-on-connect, broadcast)
- NOTE: `SwaggerParser` imported via `require()` (CJS `export =` pattern; webpack transpileOnly mode)
- NOTE: `IoAdapter` registered in main.ts for socket.io WebSocket support

---

## Statement Engine (Steps 10-11)
- [x] Step 10 — Condition evaluator (all types × operators, JSONPath, XPath)
- [x] Step 11 — Statement matcher (priority sort, first-match)

---

## Workflow Engine (Steps 12-15)
- [x] Step 12 — Template engine (all request.* vars, JSONPath, {{now}}, {{uuid}}, parameter sets)
- [x] Step 13 — respond / delay / log actions
- [x] Step 14 — proxy action (axios pipe)
- [x] Step 15 — Workflow executor (sync/async split at respond boundary)

---

## Module System (Steps 16-18)
- [x] Step 16 — Module registry (configure, get, health checks, cache)
- [x] Step 17 — Kafka module (kafkajs, lazy connect, retry 3x with backoff, SASL)
- [x] Step 18 — HTTP module (axios, Bearer/Basic/APIKey auth, timeout)

---

## Wiring Pass + REST API (Steps 19–20)
- [x] StatementModule, WorkflowModule, ModuleRegistryModule wired into AppModule
- [x] MockServerService: full request pipeline (callCounts, StatementMatcherService, WorkflowExecutorService, LogService, LogGateway)
- [x] WorkflowExecutorService: `kafka_publish` and `http_request` wired to ModuleRegistryService via `@Optional()` injection
- [x] WorkflowModule imports ModuleRegistryModule
- [x] MockModule imports StatementModule, WorkflowModule, LogModule
- [x] main.ts: `ValidationPipe` global, module registry initialised from config, `ConfigWatcherService.changes$` subscription for live module reconfiguration
- [x] Step 19 — Controllers: ServicesController, EndpointsController, StatementsController, ResponseBlocksController, ModulesController, ParameterSetsController, LogController, TemplateController, HealthController — all in ApiModule
- [x] Step 20 — SpecDriftService (`@OnEvent('spec.changed')`), orphaned-endpoints endpoint, remap endpoint
- [x] `EventEmitterModule.forRoot({ global: true })` in SwaggerModule so `@OnEvent` works in ApiModule providers
- [x] `SwaggerLoaderService.isLoaded()` and `MockServerService.isRunning()` / `getCallCount()` added

---

## Notes

- TypeScript downgraded to `~5.9.0` (Angular 21.x requires `<6.0`)
- `NX_IGNORE_UNSUPPORTED_TS_SETUP=true` required for Angular generator due to project references config
- Atomic write in `ConfigService.write()` uses rename; best-effort on Windows
- No `MatBanner` in Angular Material — use styled `div` for workflow warning (Step 29)
- `config.service.spec.ts` fixed: missing `describe`/`afterAll`/`vi` imports (Vitest globals=false) and `jest.spyOn` → `vi.spyOn` replaced with observable-behavior assertion
- Deviations from spec: `spec/upload` and `spec/preview` endpoints not implemented (not required by task prompt); remap body uses `{ targetPath, targetMethod }` (matches task prompt, not IMPLEMENTATION.md's `{ targetEndpointId }`)
