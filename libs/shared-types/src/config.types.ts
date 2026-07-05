// ─── Core config ───────────────────────────────────────────────────────────

export interface Config {
  version: string;
  settings: Settings;
  responseBlocks: ResponseBlock[];
  services: Service[];
  modules: ModuleConfig[];
  parameterSets: ParameterSet[];
  responseWorkflows?: ResponseWorkflow[];
  savedConditions?: SavedCondition[];
  dataStores?: DataStore[];
}

export interface Settings {
  uiPort: number;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  logRetention?: number;
}

export interface Service {
  id: string;
  name: string;
  port: number;
  basePath?: string;
  spec: SpecSource;
  cors?: CorsConfig;
  proxy?: ProxyConfig;
  endpoints: Endpoint[];
}

export type SpecSourceType = 'url' | 'upload' | 'hosted';

export interface SpecSource {
  type: SpecSourceType;
  url?: string;
  headers?: Record<string, string>;
  refreshIntervalSeconds?: number;
  /** Raw spec text for `type: 'upload' | 'hosted'` — persisted here instead of a separate on-disk cache. */
  specContent?: string;
}

export interface CorsConfig {
  enabled: boolean;
  allowOrigins?: string[];
  allowMethods?: string[];
  allowHeaders?: string[];
  exposeHeaders?: string[];
  allowCredentials?: boolean;
  maxAge?: number;
}

export interface ProxyConfig {
  enabled: boolean;
  target?: string;
  headers?: Record<string, string>;
}

export interface Endpoint {
  id: string;
  method: string;
  path: string;
  disabled?: boolean;
  /** { enabled: false } disables service-level proxy for this endpoint only */
  proxy?: ProxyConfig | { enabled: false };
  /** Root of the endpoint's response logic. Absent means "no response configured" — falls through to the spec-generated default. */
  responseNode?: ResponseNode;
}

export type Condition = ConditionLeaf | ConditionGroup;

export interface ConditionGroup {
  operator: 'AND' | 'OR';
  conditions: Condition[];
}

export type ConditionType =
  | 'request.method'
  | 'request.path_param'
  | 'request.query_param'
  | 'request.header'
  | 'request.body_json'
  | 'request.body_xml'
  | 'request.body_raw'
  | 'request.count'
  | 'store.exists';

export type Operator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'matches_regex'
  | 'exists'
  | 'not_exists'
  | 'gt'
  | 'lt';

export interface ConditionLeaf {
  type: ConditionType;
  param?: string;
  op: Operator;
  value?: string;
  /** Data store id — store.exists only. `param` doubles as the path param name used as the record key. */
  store?: string;
}

export type ActionType =
  | 'respond'
  | 'proxy'
  | 'delay'
  | 'log'
  | 'kafka_publish'
  | 'http_request'
  | 'store_fetch'
  | 'store_save'
  | 'store_delete'
  | 'if_else'
  | 'switch';

export interface WorkflowActionSwitchCase {
  id: string;
  condition: Condition;
  actions: WorkflowAction[];
}

export interface WorkflowAction {
  action: ActionType;
  // respond
  mode?: 'block' | 'inline' | 'template';
  responseBlockId?: string;
  statusCode?: number;
  headers?: Record<string, string>;
  body?: string;
  parameterSets?: string[];
  // proxy
  target?: string;
  proxyHeaders?: Record<string, string>;
  // delay
  ms?: number;
  // log
  message?: string;
  // kafka_publish
  module?: string;
  topic?: string;
  key?: string;
  payload?: string;
  /** If set, payload (and key, if the block has one) come from the module's message block instead of the inline fields above */
  messageBlockId?: string;
  // http_request
  method?: string;
  url?: string;
  requestHeaders?: Record<string, string>;
  requestBody?: string;
  // store_fetch / store_save / store_delete
  store?: string;
  /** store_fetch only; default 'single' */
  storeFetchMode?: 'single' | 'list';
  /** template; unused in store_fetch list mode */
  storeKey?: string;
  /** store_save only; strategy used when storeKey renders empty; default 'uuid' */
  storeKeyMode?: 'uuid' | 'sequence';
  /** store_save only; template, JSON expected */
  storeValue?: string;
  /** store_save only; shallow-merge into existing record instead of replacing */
  storeMerge?: boolean;
  /** store_save only; stamp createdAt/updatedAt onto the record */
  storeTimestamps?: boolean;
  // if_else
  condition?: Condition;
  then?: WorkflowAction[];
  else?: WorkflowAction[];
  // switch
  cases?: WorkflowActionSwitchCase[];
  default?: WorkflowAction[];
}

export interface ResponseBlock {
  id: string;
  name: string;
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

export type ModuleType = 'kafka' | 'http';

export interface ModuleConfig {
  id: string;
  name: string;
  type: ModuleType;
  /** Service ID if service-scoped; absent means global */
  scope?: string;
  config: KafkaModuleConfig | HttpModuleConfig;
}

export interface KafkaModuleConfig {
  brokers: string[];
  clientId?: string;
  ssl?: boolean;
  sasl?: { mechanism: string; username: string; password: string };
  /** Consumer group id for listeners; defaults to `mockingbird-${moduleId}` when omitted */
  groupId?: string;
  /** Topics this module listens on; each has its own statements (condition + workflow) */
  listeners?: KafkaListener[];
  /** Manually-fired "send buttons" for mocking the start of a process */
  triggers?: KafkaSendTrigger[];
  /** Reusable named payloads, referenced from a kafka_publish action's messageBlockId */
  messageBlocks?: KafkaMessageBlock[];
}

export interface KafkaListener {
  id: string;
  topic: string;
  /** Root of this listener's response logic. Absent means the message is consumed with no action taken. */
  responseNode?: ResponseNode;
}

export interface KafkaSendTrigger {
  id: string;
  name: string;
  topic: string;
  key?: string;
  /** Rendered through the template engine on fire; {{uuid}}/{{now}} work, {{request.*}} does not (no request context) */
  payload: string;
}

export interface KafkaMessageBlock {
  id: string;
  name: string;
  /** Overrides the action's inline key when this block is selected, if set */
  key?: string;
  payload: string;
}

export interface HttpModuleConfig {
  baseUrl: string;
  timeout?: number;
  auth?: BearerAuth | BasicAuth | ApiKeyAuth;
  headers?: Record<string, string>;
}

export interface BearerAuth { type: 'bearer'; token: string }
export interface BasicAuth { type: 'basic'; username: string; password: string }
export interface ApiKeyAuth { type: 'apikey'; header: string; value: string }

export interface ParameterSet {
  id: string;
  name: string;
  values: Record<string, string>;
}

// ─── Data Store ────────────────────────────────────────────────────────────

export interface DataStore {
  id: string;
  name: string;
  /** Optional starting records, keyed the same way live records are. Applied once at
   *  cold start (and to any newly-added store on a later reload) — never silently
   *  reapplied over live data on an unrelated config change. */
  seedRecords?: Record<string, unknown>;
}

// ─── Response Workflow ─────────────────────────────────────────────────────

export interface WorkflowParameter {
  /** Referenced inside steps as the literal token $param.<name> */
  name: string;
  label?: string;
  type: 'dataStore' | 'pathParam' | 'text';
  required?: boolean;
}

export interface ResponseWorkflow {
  id: string;
  name: string;
  steps: ResponseWorkflowStep[];
  /** Named slots filled in wherever this workflow is attached (endpoint/listener) */
  parameters?: WorkflowParameter[];
  /** UI badge only — system-seeded workflows are still editable/deletable */
  builtIn?: boolean;
}

export interface ResponseWorkflowStepSwitchCase {
  id: string;
  condition: Condition;
  steps: ResponseWorkflowStep[];
}

export interface ResponseWorkflowStep {
  id: string;
  order: number;
  type: 'return_response' | 'use_module_action' | 'use_data_store' | 'if_else' | 'switch';
  /** References a SavedCondition by id */
  conditionId?: string;
  /** Inline condition (used when not yet saved) */
  condition?: Condition;
  // for return_response:
  responseBlockId?: string;
  /** default 'block' when omitted */
  responseMode?: 'block' | 'template';
  responseStatusCode?: number;
  responseHeaders?: Record<string, string>;
  responseBody?: string;
  // for use_module_action:
  moduleId?: string;
  kafkaTopic?: string;
  kafkaKey?: string;
  kafkaPayload?: string;
  httpMethod?: string;
  httpUrl?: string;
  httpHeaders?: Record<string, string>;
  httpBody?: string;
  // for use_data_store — mirrors WorkflowAction's store_* fields plus an operation switch:
  store?: string;
  storeOperation?: 'fetch' | 'save' | 'delete';
  storeFetchMode?: 'single' | 'list';
  storeKey?: string;
  storeKeyMode?: 'uuid' | 'sequence';
  storeValue?: string;
  storeMerge?: boolean;
  storeTimestamps?: boolean;
  // for if_else — branch condition reuses `condition` above; branches:
  then?: ResponseWorkflowStep[];
  else?: ResponseWorkflowStep[];
  // for switch:
  cases?: ResponseWorkflowStepSwitchCase[];
  default?: ResponseWorkflowStep[];
}

// ─── Response Node (unified endpoint/listener response model) ─────────────

export interface ResponseNode {
  id: string;
  /** Absent = unconditional ("simple") — always matches. */
  condition?: Condition;
  kind: 'block' | 'workflow';
  /** Fallback when `condition` is set and doesn't match. Chaining these gives switch-like behavior. */
  else?: ResponseNode;

  // kind: 'block' — mirrors the 'respond' WorkflowAction's fields
  /** default 'block' when omitted */
  mode?: 'block' | 'inline' | 'template';
  responseBlockId?: string;
  statusCode?: number;
  headers?: Record<string, string>;
  body?: string;

  // kind: 'workflow'
  /** default 'inline' when omitted */
  workflowMode?: 'inline' | 'named';
  /** workflowMode: 'inline' */
  actions?: WorkflowAction[];
  /** workflowMode: 'named' */
  workflowId?: string;
  /** Values bound to the named workflow's declared parameters, keyed by parameter name */
  workflowParams?: Record<string, string>;
}

export interface SavedCondition {
  id: string;
  name: string;
  condition: Condition;
}

// ─── Swagger loader output ─────────────────────────────────────────────────

export interface ParsedSpec {
  serviceId: string;
  specHash: string;
  endpoints: ParsedEndpoint[];
}

export interface ParsedEndpoint {
  method: string;
  path: string;
  defaultStatusCode: number;
  defaultContentType: string;
  defaultBody: string;
  defaultHeaders: Record<string, string>;
  parameters: ParsedParameter[];
}

export interface ParsedParameter {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required: boolean;
  schema?: Record<string, unknown>;
}

// ─── Template engine context ───────────────────────────────────────────────

export interface TemplateContext {
  request: RequestContext;
  /** Named parameter sets merged left-to-right; later sets override earlier */
  parameterSets: Record<string, Record<string, string>>;
  /** Populated after the respond/proxy action executes (available to async actions only) */
  response?: ResponseContext;
  /** Populated mid-workflow by store_fetch actions, keyed by data store name */
  stores?: Record<string, unknown>;
}

export interface RequestContext {
  method: string;
  path: string;
  pathParams: Record<string, string>;
  queryParams: Record<string, string>;
  headers: Record<string, string>;
  body: string;
  callCount: number;
}

export interface ResponseContext {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}
