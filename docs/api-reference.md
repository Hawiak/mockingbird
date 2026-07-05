# API reference

The Mockingbird REST API is available at `http://localhost:9000/api` (port follows
`settings.uiPort`). It's what the UI itself is built on — everything the browser can do,
the API can do.

## Services & endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/services` | List services |
| POST | `/api/services` | Create a service (spec from URL, upload, or hosted) |
| GET | `/api/services/:id` | Get one service |
| PUT | `/api/services/:id` | Update a service |
| DELETE | `/api/services/:id` | Delete a service |
| POST | `/api/services/:id/spec/refresh` | Re-fetch the service's spec now (`url` type only) |
| PUT | `/api/services/:id/spec` | Push fresh spec content (`specContent`) or a new `url`, persist it, and re-parse/merge endpoints |
| GET | `/api/services/:id/orphaned-endpoints` | Endpoints with a `responseNode` that no longer match the current spec |
| POST | `/api/services/:id/endpoints/:eid/remap` | Remap an orphaned endpoint's `responseNode` to a new method/path |
| GET | `/api/services/:id/endpoints` | List endpoints |
| GET | `/api/services/:id/endpoints/:eid` | Get one endpoint |
| PUT | `/api/services/:id/endpoints/:eid` | Update an endpoint (`disabled`, `responseNode`, `proxy`) |

## Response Blocks

| Method | Path | Description |
|---|---|---|
| GET | `/api/response-blocks` | List |
| POST | `/api/response-blocks` | Create |
| GET | `/api/response-blocks/:id` | Get one |
| PUT | `/api/response-blocks/:id` | Update |
| DELETE | `/api/response-blocks/:id` | Delete |

## Modules

| Method | Path | Description |
|---|---|---|
| GET | `/api/modules` | List (with computed `health`/`usedByCount`) |
| POST | `/api/modules` | Create |
| GET | `/api/modules/:id` | Get one |
| PUT | `/api/modules/:id` | Update — reconnects immediately with resolved `${ENV_VAR}` values |
| DELETE | `/api/modules/:id` | Delete |
| GET | `/api/modules/:id/health` | Run/return a connection health check |
| POST | `/api/modules/:id/triggers/:triggerId/fire` | Fire a Kafka send trigger |

## Data Stores

See [Data Stores](./data-stores.md) for concepts.

| Method | Path | Description |
|---|---|---|
| GET | `/api/data-stores` | List (with computed `recordCount`) |
| POST | `/api/data-stores` | Create |
| PUT | `/api/data-stores/:id` | Update (name, `seedRecords`) |
| DELETE | `/api/data-stores/:id` | Delete — also clears its live records |
| GET | `/api/data-stores/:id/records` | List live records (`{ key, value }[]`) |
| DELETE | `/api/data-stores/:id/records` | Clear all live records |
| DELETE | `/api/data-stores/:id/records/:key` | Delete one record |
| POST | `/api/data-stores/:id/seed` | Snapshot current live records into `seedRecords` |
| POST | `/api/data-stores/:id/records/reset` | Clear live records and reapply `seedRecords` |

## Response Workflows & Saved Conditions

See [Workflows](./workflows.md) for concepts.

| Method | Path | Description |
|---|---|---|
| GET | `/api/response-workflows` | List |
| POST | `/api/response-workflows` | Create |
| GET | `/api/response-workflows/:id` | Get one |
| PUT | `/api/response-workflows/:id` | Update (name, steps) |
| DELETE | `/api/response-workflows/:id` | Delete |
| GET | `/api/saved-conditions` | List |
| POST | `/api/saved-conditions` | Create |
| GET | `/api/saved-conditions/:id` | Get one |
| PUT | `/api/saved-conditions/:id` | Update |
| DELETE | `/api/saved-conditions/:id` | Delete |

## Parameter Sets

| Method | Path | Description |
|---|---|---|
| GET | `/api/parameter-sets` | List |
| POST | `/api/parameter-sets` | Create |
| GET | `/api/parameter-sets/:id` | Get one |
| PUT | `/api/parameter-sets/:id` | Update |
| DELETE | `/api/parameter-sets/:id` | Delete |

## Request Log

| Method | Path | Description |
|---|---|---|
| GET | `/api/log` | Log entries, filterable by `serviceId`, `method`, `statusRange` (e.g. `2xx`), `path` (substring match) |

For live updates rather than polling, use the WebSocket stream (below) — the UI's
Request Log page uses it exclusively and does not poll this endpoint.

## Template Preview

| Method | Path | Description |
|---|---|---|
| POST | `/api/template/preview` | Render a template string against a sample request; returns `{ rendered, unresolvedVariables }` |

```json
// Request
{
  "template": "{{request.body_json.$.id}}-{{now}}",
  "language": "plaintext",
  "context": {
    "body": "{\"id\": 42}",
    "pathParams": {}, "queryParams": {}, "headers": {}
  }
}
```

## Export

| Method | Path | Description |
|---|---|---|
| GET | `/api/export/postman` | Download a Postman Collection (`.json`) of every service/endpoint |
| GET | `/api/export/bruno` | Download a Bruno Collection (`.zip`) of the same |

## Health

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Overall status, plus per-service and per-module health |

## WebSocket log stream

`ws://localhost:9000/ws/log`

Socket.IO, no auth. Emits:
- `log:batch` — an array of `LogEntryDto`, sent once on connect (recent history)
- `log` — a single new `LogEntryDto`, sent as requests happen

Entries cover both HTTP requests and Kafka messages (method `KAFKA`), each including a
`workflowLog` array of the actions that ran and their outcomes.
