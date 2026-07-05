# Workflows

An endpoint's (or Kafka listener's) response is a **ResponseNode** — either a simple
response block or a workflow, optionally gated behind a condition with a fallback. A
node with no condition is unconditional ("simple") and always resolves; chaining
conditional nodes via `else` gives switch-like, first-match-wins behavior for free. The
Response tab in the UI renders this chain as a flat list of cases (add/reorder/remove),
even though underneath it's just the `condition`/`else` linked list.

```yaml
# Simple — no condition, just a block
responseNode:
  id: n1
  kind: block
  responseBlockId: not_found

# Conditional chain (switch-style): first matching case wins, last one is the fallback
responseNode:
  id: n1
  kind: block
  condition: { type: request.header, param: x-role, op: equals, value: admin }
  responseBlockId: admin_view
  else:
    id: n2
    kind: workflow
    workflowMode: named
    workflowId: <response-workflow-id>
    workflowParams: { entity: orders }
    # else: <n3> ... chain continues; the last node with no `else` falls through
    # to the spec-generated default if its condition (if any) doesn't match.
```

A node's `kind` is either:
- `block` — a static response: `responseBlockId` (reference), or `mode: inline|template`
  with `statusCode`/`headers`/`body` written directly on the node.
- `workflow` — `workflowMode: inline` runs an ad-hoc `actions: WorkflowAction[]` list
  (edited in place, right where it's attached); `workflowMode: named` references a
  reusable Response Workflow by `workflowId`, with `workflowParams` bound to its
  declared parameters.

Kafka listeners use the exact same `responseNode` shape, with a narrower set of
applicable condition types in the UI (a Kafka message has no method/path/query params —
see [Kafka](./kafka.md)).

## Workflow actions

Actions execute in order. `respond` and `proxy` are the *boundary* — everything before
is synchronous (blocks the response), everything after runs asynchronously (the response
has already been sent to the caller).

```yaml
actions:
  # Delay before responding
  - action: delay
    ms: 200

  # Respond with a reusable block
  - action: respond
    mode: block
    responseBlockId: not_found

  # Respond inline
  - action: respond
    mode: inline
    statusCode: 200
    headers:
      Content-Type: application/json
    body: '{"id": "{{uuid}}", "ts": "{{now}}"}'

  # Respond with a template (same as inline, but previewable in the UI)
  - action: respond
    mode: template
    statusCode: 200
    body: '{"id": "{{request.path_param.id}}"}'

  # Forward to the real backend
  - action: proxy
    target: https://real-api.example.com

  # Log a message (appears in the request log's workflow trace)
  - action: log
    message: 'User {{request.header.X-User-Id}} called count {{request.count}}'

  # Publish to Kafka (async — runs after the response is sent)
  - action: kafka_publish
    module: main-kafka          # references a module by id
    topic: events
    key: '{{request.path_param.id}}'
    payload: '{{request.body}}'
    # messageBlockId: <id>      # alternative to key/payload — see kafka.md

  # Call another HTTP service (async)
  - action: http_request
    module: downstream           # references an HTTP module by id
    method: POST
    url: /webhooks/notify
    requestBody: '{"event": "called"}'

  # Read a record from a data store (single or list mode)
  - action: store_fetch
    store: <data-store-id>
    storeFetchMode: single       # or: list
    storeKey: '{{request.path_param.id}}'

  # Write a record to a data store
  - action: store_save
    store: <data-store-id>
    storeKey: '{{request.path_param.id}}'   # empty → auto-generated key
    storeKeyMode: uuid                       # or: sequence
    storeValue: '{{request.body}}'
    storeMerge: false                        # true = shallow-merge into existing record
    storeTimestamps: false                   # true = stamp createdAt/updatedAt

  # Delete a record from a data store
  - action: store_delete
    store: <data-store-id>
    storeKey: '{{request.path_param.id}}'

  # Branch: run `then` or `else` depending on a condition
  - action: if_else
    condition: { type: request.query_param, param: vip, op: equals, value: 'true' }
    then:
      - action: respond
        mode: inline
        statusCode: 200
        body: vip-response
    else:
      - action: respond
        mode: inline
        statusCode: 200
        body: regular-response

  # Branch: first matching case wins, `default` is the fallback
  - action: switch
    cases:
      - id: c1
        condition: { type: request.query_param, param: n, op: equals, value: '1' }
        actions: [{ action: respond, mode: inline, statusCode: 200, body: one }]
      - id: c2
        condition: { type: request.query_param, param: n, op: equals, value: '2' }
        actions: [{ action: respond, mode: inline, statusCode: 200, body: two }]
    default:
      - action: respond
        mode: inline
        statusCode: 200
        body: other
```

`if_else`/`switch` are edited as draggable blocks in the workflow canvas (block palette
on the right, canvas on the left) — dragging one in gives you nested drop zones for each
branch, which can themselves contain any block, including another `if_else`/`switch`.
Dragging a new block in from the palette, and reordering within one branch, are both
supported; dragging an *existing* block from one branch into a different branch isn't —
remove it and re-add via the palette instead.

See [Data Stores](./data-stores.md) for the full `store_*` action reference, and
[Templates](./templates.md) for every `{{...}}` expression.

### The sync/async boundary

Only actions *before* the first `respond`/`proxy` can affect that response — including
ones nested inside an `if_else`/`switch` branch, since branches are resolved and spliced
into the flat action list before execution. A `store_fetch` needs to run before `respond`
if that response's template is going to read `{{store.name}}`; a `kafka_publish` placed
after `respond` runs fire-and-forget once the HTTP response has already gone out. The
workflow canvas warns when a workflow has no `respond`/`proxy` anywhere in it (it falls
through to the spec-generated default response).

Kafka-listener-triggered workflows have no HTTP response to send, so `respond`/`proxy`
are skipped there entirely — every action runs fire-and-forget.

## Response Workflows

A separate, higher-level page (`/workflows` in the UI) for defining reusable response
logic, referenced from a `responseNode`'s `workflowId` (`workflowMode: named`). A
Response Workflow is an ordered list of **steps**, not raw actions — resolved into
actions at attachment time:

```yaml
responseWorkflows:
  - id: order-lifecycle
    name: Order Lifecycle
    steps:
      - id: step1
        order: 1
        type: return_response
        responseBlockId: not_found
        conditionId: <saved-condition-id>   # optional — skip this step unless it matches
      - id: step2
        order: 2
        type: use_module_action
        moduleId: <kafka-module-id>
        kafkaTopic: orders.updated
        kafkaKey: '{{request.path_param.id}}'
        kafkaPayload: '{{request.body}}'
```

Step types:
- `return_response` — equivalent to a `respond` action in Block mode
- `use_module_action` — equivalent to `kafka_publish` or `http_request`, depending on
  the referenced module's type
- `use_data_store` — equivalent to `store_fetch`/`store_save`/`store_delete`, chosen via
  `storeOperation`
- `if_else` / `switch` — same branching semantics as the `WorkflowAction` versions above,
  with `then`/`else`/`cases[].steps`/`default` holding nested steps instead of actions

Each non-branching step can optionally be gated behind a condition — either a reference
to a [Saved Condition](#saved-conditions) (`conditionId`) or an inline one (`condition`,
same shape as anywhere else). Steps without a condition always run. (`if_else`'s own
`condition` field selects its branch instead — it's not an additional skip-gate.) This
flat per-step gate has no dedicated UI in the `/workflows` step editor anymore — with
`if_else`/`switch` available as real blocks, prefer those for anything conditional when
editing through the UI. The field is still fully supported when set programmatically or
by hand in `mockingbird.yaml` (the built-in CRUD templates in `builtin-workflows.ts` use
it), and still resolves correctly either way.

Attach a Response Workflow to an HTTP endpoint or a Kafka listener via their
`responseNode`'s `workflowId` — both go through the exact same resolution and execution
path, so the same workflow can drive both an HTTP endpoint and a Kafka topic listener
identically.

**Scope note:** raw `store_*` actions/`use_data_store` steps and `store.exists`
conditions are supported in both the endpoint/listener response editor and the Response
Workflows builder — see [Data Stores](./data-stores.md) for the full reference.

## Saved Conditions

Named, reusable condition definitions:

```yaml
savedConditions:
  - id: is-admin
    name: Is Admin
    condition:
      type: request.header
      param: X-Role
      op: equals
      value: admin
```

Referenced by id (`conditionId`) from a Response Workflow step. Create one from the
Response Workflows builder's "Save as reusable condition" button on an inline condition,
or by hand in the config file.
