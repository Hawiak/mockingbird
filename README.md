# Mockingbird

A self-hosted API mocking platform. Point it at an OpenAPI/Swagger spec, define
conditional response rules, and run response workflows that can talk to Kafka, call
other HTTP services, or read and write stateful data stores — all from a browser UI,
persisted to a single YAML file.

## Features

- **Spec-driven** — load any OpenAPI 2/3 spec from a URL, with auto-refresh
- **Response model** — an endpoint or Kafka listener resolves to a simple block or a
  workflow, optionally gated by a condition with a fallback (`else`); chaining these
  gives switch-like behavior for free
- **Workflow actions** — `respond`, `proxy`, `delay`, `log`, `kafka_publish`,
  `http_request`, `store_fetch`, `store_save`, `store_delete`, plus `if_else`/`switch`
  branching blocks for low-code logic inside a workflow
- **Data stores** — named, stateful record collections so mocks can behave like a real
  CRUD backend (create, list, update, delete) instead of returning static responses
- **Response Workflows** — reusable, multi-step response logic shared across many
  endpoints and Kafka listeners
- **Template engine** — `{{request.header.X-User-Id}}`, `{{uuid}}`, `{{now}}`, JSONPath
  into bodies, JSONPath into stored records
- **Module system** — named Kafka and HTTP connectors reused across endpoints
- **Live request log** — WebSocket-streamed, filterable, with a per-request workflow trace
- **Hot reload** — edit `mockingbird.yaml` directly; the server picks up changes instantly
- **Single config file** — everything in `mockingbird.yaml`; version-control friendly

## Quick start with Docker

**1. Create a config file**

Copy [`mockingbird.example.yaml`](./mockingbird.example.yaml) to `mockingbird.yaml`, or
start from scratch:

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

## Docker Compose

This repo's [`docker-compose.yml`](./docker-compose.yml) also spins up a local Kafka
broker (KRaft mode, no Zookeeper) and a Kafka UI, for exercising the Kafka module
without a real cluster:

```bash
cp .env.example .env   # fill in KAFKA_USERNAME / KAFKA_PASSWORD if your config needs them
docker compose up -d
```

| Service | URL |
|---|---|
| Mockingbird UI + API | http://localhost:9000 |
| Mock services | http://localhost:8081–8084 (one port per service in `mockingbird.yaml`) |
| Kafka broker | `kafka:9092` (internal), `localhost:9092` (host) |
| Kafka UI | http://localhost:8090 |

## Build from source

**Prerequisites:** Node 24+, [pnpm](https://pnpm.io) 11+

```bash
git clone https://github.com/harmakkerman/mockingbird
cd mockingbird
pnpm install
npx nx build backend
npx nx build frontend
node dist/apps/backend/main.js
```

Set `CONFIG_PATH` to point at your config file (defaults to `mockingbird.yaml` in the
working directory).

## Documentation

The README covers getting started; everything else lives in [`docs/`](./docs):

| Doc | Covers |
|---|---|
| [Configuration](./docs/configuration.md) | Full `mockingbird.yaml` reference — services, response blocks, conditions, parameter sets |
| [Templates](./docs/templates.md) | The `{{...}}` template engine — every expression it understands |
| [Workflows](./docs/workflows.md) | Workflow actions, Response Workflows, Saved Conditions |
| [Data Stores](./docs/data-stores.md) | Stateful mocking — data stores, `store_fetch`/`store_save`/`store_delete`, seed data |
| [Kafka](./docs/kafka.md) | The Kafka module — listeners, wildcard topics, send triggers, message blocks |
| [API Reference](./docs/api-reference.md) | The REST API and WebSocket log stream |

## Ports

| Port | Purpose |
|---|---|
| `9000` | Mockingbird UI + REST API (configurable via `settings.uiPort`) |
| `8081`+ | Mock services (one port per service, defined in `mockingbird.yaml`) |

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `CONFIG_PATH` | `mockingbird.yaml` | Path to the config file |
| `NODE_ENV` | — | Set to `production` in the Docker image |

Any `${VAR}` reference inside `mockingbird.yaml` is substituted from the process
environment at startup — see [Configuration](./docs/configuration.md#environment-variables).
