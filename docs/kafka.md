# Modules: Kafka & HTTP

A **module** is a named, reusable connector — configure a Kafka broker or an HTTP
backend once, then reference it by id from any number of workflow actions across any
number of endpoints. Modules can optionally be scoped to a single service (`scope:
<service-id>`); unscoped modules are global.

## HTTP modules

```yaml
modules:
  - id: downstream
    name: downstream
    type: http
    config:
      baseUrl: https://downstream-api.example.com
      timeout: 5000
      headers:
        X-Client: mockingbird
      auth:
        type: bearer            # none | bearer | basic | apikey
        token: ${DOWNSTREAM_TOKEN}
        # basic: username / password
        # apikey: header / value
```

Used from an `http_request` workflow action (see [Workflows](./workflows.md)) — the
action's `url` is relative to `baseUrl` unless it's already absolute.

## Kafka modules

```yaml
modules:
  - id: main-kafka
    name: Main Kafka
    type: kafka
    config:
      brokers: ["kafka:9092"]
      clientId: mockingbird
      ssl: false
      sasl:
        mechanism: PLAIN        # PLAIN | SCRAM-SHA-256 | SCRAM-SHA-512
        username: ${KAFKA_USERNAME}
        password: ${KAFKA_PASSWORD}
      groupId: mockingbird-main # optional; defaults to mockingbird-<moduleId>
      listeners: [ ... ]
      triggers: [ ... ]
      messageBlocks: [ ... ]
      simulators: [ ... ]
```

Secrets support `${ENV_VAR}` substitution (see
[Configuration](./configuration.md#environment-variables)) — the literal placeholder is
what's saved to disk, the resolved value is what the running server connects with.
Saving a module reconnects it immediately with the resolved credentials; no restart or
wait for the file watcher.

### Listeners — consuming messages

Each listener subscribes to one topic and resolves a `responseNode` when a message
arrives — the exact same unified block/workflow/condition model an HTTP endpoint uses
(see [Workflows](./workflows.md)), just with a narrower set of applicable condition
types (a Kafka message has no method/path/query params).

```yaml
listeners:
  - id: orders-created
    topic: orders.created
    responseNode: { ... }   # a block or a workflow, optionally conditional
```

`topic` can be the literal `*` to subscribe to **every topic** on the broker (except
Kafka's own internal ones). The actual topic a message arrived on is available as the
`topic` header, so a wildcard listener's condition can filter on it via a
`request.header` condition with `param: topic`.

A Kafka-triggered workflow has no HTTP response channel — `respond`/`proxy` actions are
skipped; every other action type (`log`, `kafka_publish`, `http_request`, `store_fetch`,
`store_save`, `store_delete`, ...) runs the same as it would from an HTTP endpoint.

### Send triggers — manual "send buttons"

A named, manually-fired publisher — useful for kicking off a process during testing
(e.g. simulating an upstream event) without a real producer:

```yaml
triggers:
  - id: start-order
    name: Start Order
    topic: orders.created
    key: '{{uuid}}'
    payload: '{"orderId": "{{uuid}}", "status": "created"}'
```

Fired from its "Send" button in the Module Detail page, or via
`POST /api/modules/:id/triggers/:triggerId/fire`. `{{request.*}}` expressions don't
resolve here (there's no request context), but `{{uuid}}`/`{{now}}` do.

### Message blocks — reusable payloads

A named, reusable Kafka payload — analogous to a Response Block, but for outbound
messages:

```yaml
messageBlocks:
  - id: ping
    name: Ping
    key: '{{uuid}}'             # optional — overrides the action's inline key if set
    payload: '{"type": "ping"}'
```

Reference it from a `kafka_publish` action instead of retyping the payload inline:

```yaml
- action: kafka_publish
  module: main-kafka
  topic: health.pings
  mode: block
  messageBlockId: ping
```

### Simulators — self-firing publishers on a randomized schedule

Unlike a send trigger (manually fired) or `kafka_publish` (fired from a matched
statement's workflow), a **simulator** fires **on its own**, continuously, on a
randomized schedule — for load-testing a downstream consumer or just keeping a demo
environment feeling "alive" without any human or request driving it.

```yaml
simulators:
  - id: order-events-simulator
    name: Random order events
    topic: orders.simulated
    enabled: true
    minIntervalMs: 200      # ~5 msg/sec at the fast end
    maxIntervalMs: 15000    # ~4 msg/min at the slow end
    messageBlockIds: [order-event-demo]   # omit/empty = draw from every message block on this module
    key: ''                                # optional; overrides the chosen block's own key if set
```

Each fire: pick one message block at random from `messageBlockIds` (or the module's
entire `messageBlocks` list if that's empty), render its `payload`/`key` through the
[template engine](./templates.md) — so `{{uuid}}`, `{{now}}`, `{{faker ...}}`,
`{{randomInt ...}}`, `{{randomItem ...}}`, `{{autoIncrement ...}}` etc. all apply, giving
each simulated message varied, realistic content — and publish. Then wait a fresh random
delay, uniformly chosen between `minIntervalMs` and `maxIntervalMs`, and repeat.

A simulator is independent of this module's `listeners` — it produces, they consume — so
a module can run one, the other, both, or neither. Toggling `enabled`, or editing any
other module field, reconnects the module and restarts its simulators immediately (same
as editing a listener), picking up the change without a server restart. Each simulated
fire is written to the Request Log like any other Kafka activity, with a `simulated:
true` request header so you can tell it apart from a real inbound message or a manual
trigger.

There's no dedicated UI slider for "messages per second" — set `minIntervalMs` /
`maxIntervalMs` directly (`1000 / rate` gives the interval for a target rate); the Module
Detail page shows the resulting approximate rate next to the fields.

### Wildcard listeners + `request.count`

Combining a `*` wildcard listener with `request.count` on a condition lets you simulate
sequenced/eventual behavior — e.g. reply differently to the 3rd message on a topic than
the 1st.
