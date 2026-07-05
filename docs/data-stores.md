# Data Stores

Data Stores make mocks **stateful**: instead of every response being a static block or
a template rendered purely from the current request, an endpoint can persist and read
back records across calls. `POST /orders` creates a record, `GET /orders/:id` reads it
back, `GET /orders` lists everything, `PATCH`/`PUT` update it, `DELETE` removes it — a
small set of endpoints backed by the same store behaves like a real, if simple,
stateful microservice.

A store is a named, in-memory, schemaless collection of `key → JSON record` pairs.
Stores are declared once — like Modules or Response Blocks — and referenced by id from
as many endpoints as you like; the same "Orders" store can back a list endpoint, a
get-one endpoint, and a create endpoint independently, all sharing the same records.

## Quick start: attach a store to an endpoint

The fastest way to wire this up is the **Data** tab on an endpoint's detail page. It
doesn't introduce a new runtime mechanism — it generates an ordinary `responseNode`
built from the primitives below, which you can then hand-tune like any other response.

1. Create a Data Store from the **Data Stores** nav page (just a name).
2. On the target endpoint's **Data** tab, pick the store and, if the endpoint's path has
   one, a path param to use as the record key (e.g. `id` for `/orders/:id`).
3. The UI computes an operation preset from the endpoint's HTTP method and whether a key
   is selected, and click **Generate**:

| Method | Key selected? | Preset | Generates |
|---|---|---|---|
| GET | no | List | `store_fetch` (list) → respond with the whole collection |
| GET | yes | Get One | a `store.exists`-gated `responseNode` returning the record, plus a 404 `else` fallback |
| POST | — | Create | `store_save` (key from `request.body_json.$.id` if present, else auto-generated) → respond 201 |
| PUT | yes | Replace | `store_save` (replace) keyed by the path param → respond 200 |
| PATCH | yes | Update | `store_save` (merge) keyed by the path param → respond 200 |
| DELETE | yes | Delete | `store_delete` keyed by the path param → respond 204 |

PUT/PATCH/DELETE require a path param to key by — you can't replace, update, or delete
a whole collection. Repeat the process per endpoint to build out a full CRUD resource.

## The primitives

Everything above is built from three workflow actions and one condition type, all
usable directly from the Workflow Editor / Condition Builder on any endpoint or Kafka
listener's `responseNode` if you want more control than the scaffolding gives you.

### `store_fetch`

Reads from a store into the current request's context, for use by a later `respond`
action's template.

```yaml
- action: store_fetch
  store: <data-store-id>
  storeFetchMode: single        # or: list
  storeKey: '{{request.path_param.id}}'   # unused in list mode
```

- **`single`** looks up one record by key. If found, `{{store.<name>}}` in a later
  action renders it as JSON; if not found, it renders empty.
- **`list`** ignores `storeKey` and populates `{{store.<name>}}` with *every* record in
  the store, as a JSON array — this is what a collection-style `GET` needs.

Must run **before** `respond`/`proxy` in the action list to be usable in that response —
see [Workflows: the sync/async boundary](./workflows.md#the-syncasync-boundary). The
Workflow Editor warns if a `store_fetch` is placed too late.

### `store_save`

Writes or merges a record.

```yaml
- action: store_save
  store: <data-store-id>
  storeKey: '{{request.path_param.id}}'   # leave empty to auto-generate
  storeKeyMode: uuid                       # or: sequence — only used when storeKey is empty
  storeValue: '{{request.body}}'
  storeMerge: false                        # true = shallow-merge into the existing record
  storeTimestamps: false                   # true = stamp createdAt/updatedAt
```

- **Key**: if `storeKey` renders to an empty string, a key is generated automatically —
  `uuid` (default) or `sequence` (a monotonic per-store counter, `1`, `2`, `3…`, closer
  to what a real database's auto-increment ID looks like).
- **Merge**: `false` replaces the record entirely (PUT semantics); `true` shallow-merges
  the new value into whatever's already stored (PATCH semantics) — fields not present in
  the new value are preserved.
- **Timestamps**: when enabled, `createdAt` is set once (preserved across later merges)
  and `updatedAt` is refreshed on every save. Only applies when the value is a JSON
  object; a non-object value is stored as-is with no timestamps added.

### `store_delete`

```yaml
- action: store_delete
  store: <data-store-id>
  storeKey: '{{request.path_param.id}}'
```

Removes one record by key. Deleting an already-absent key is a no-op, not an error.

### store exists condition

Gates a `responseNode` (or an `if_else`/`switch` block) on whether a record exists, for
the classic "200 if found, 404 otherwise" pattern:

```yaml
condition:
  type: store.exists
  store: <data-store-id>
  param: id          # path param name used as the record key
  op: exists         # or: not_exists
```

Unlike the workflow actions, `store.exists`'s key is **only** a path param name, not a
full template — this keeps condition evaluation independent of the template engine
(conditions are evaluated earlier in the request pipeline, before templates are
assembled). If you need a computed key, use `store_fetch` + check whether
`{{store.name}}` rendered empty instead.

## Multi-store joins (for free)

Because actions run sequentially and each can read what an earlier one wrote, a second
`store_fetch` can key off a value the first one already fetched:

```yaml
- action: store_fetch
  store: orders
  storeKey: '{{request.path_param.id}}'
- action: store_fetch
  store: customers
  storeKey: '{{store.orders.$.customerId}}'   # pulled from the order just fetched
- action: respond
  mode: template
  body: '{"order": {{store.orders}}, "customer": {{store.customers}}}'
```

This isn't a special feature — it falls out naturally from `{{store.*}}` template
resolution and ordered action execution.

## Seed data

A store can define starting records so a fresh environment already looks populated
instead of starting empty:

```yaml
dataStores:
  - id: orders
    name: Orders
    seedRecords:
      "1": { id: "1", item: "Widget", status: "shipped" }
      "2": { id: "2", item: "Gadget", status: "pending" }
```

Seed records are applied **once**, the first time the server sees that store after a
cold start (or when a new store is added on a config reload) — never silently reapplied
over live data just because unrelated config changed. Live records themselves are
**not** persisted to `mockingbird.yaml`; only the store definition (including
`seedRecords`) is. On the Data Store detail page:

- **Save Current as Seed** — snapshots whatever's live right now into the store's
  `seedRecords`, turning ad-hoc test data into the new baseline.
- **Reset to Seed Data** — clears live records and reapplies `seedRecords`.
- **Clear All** — empties the store without touching `seedRecords`.

## Worked example

A minimal `/phases` resource, generated entirely via the Data tab against a store named
`Phases`:

```bash
curl -X POST localhost:8081/v1/phases -d '{"id":"p1","name":"Discovery"}'
# → 201 {"id":"p1","name":"Discovery"}

curl localhost:8081/v1/phases
# → 200 [{"id":"p1","name":"Discovery"}]

curl localhost:8081/v1/phases/p1
# → 200 {"id":"p1","name":"Discovery"}

curl -X PATCH localhost:8081/v1/phases/p1 -d '{"name":"Discovery Renamed"}'
# → 200 {"name":"Discovery Renamed"}   (merged: id preserved)

curl -X DELETE localhost:8081/v1/phases/p1
# → 204

curl localhost:8081/v1/phases/p1
# → 404
```

## Limitations

- **In-memory only** — live records reset on restart; only definitions (and seed data)
  persist to `mockingbird.yaml`.
- **No field-level conditions** — `store.exists` checks presence only, not a specific
  field's value.
- **No query/filter/pagination on list mode** — it always returns every record; filter
  in the template/condition layer, or use separate stores, if you need subsets.
- **No cross-store transactions** — each action is independent; there's no rollback if
  a later action in the same workflow fails.
- **Soft cap** — ~5,000 records per store; oldest is evicted first past that.

`store_*` actions (`use_data_store` steps) and `store.exists` conditions are available
everywhere a workflow or condition is edited — the endpoint/Kafka-listener response
editor, its inline workflow canvas, and the standalone `/workflows` Response Workflow
builder all share the same Condition Builder and step/action types.
