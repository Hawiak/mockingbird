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
  defaultResponseBlockId?: string;
  workflowId?: string;
  statements: Statement[];
}

export interface Statement {
  id: string;
  name?: string;
  priority: number;
  enabled: boolean;
  condition: Condition;
  workflow: WorkflowAction[];
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
  | 'request.count';

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
}

export type ActionType =
  | 'respond'
  | 'proxy'
  | 'delay'
  | 'log'
  | 'kafka_publish'
  | 'http_request';

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
  // http_request
  method?: string;
  url?: string;
  requestHeaders?: Record<string, string>;
  requestBody?: string;
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

// ─── Response Workflow ─────────────────────────────────────────────────────

export interface ResponseWorkflow {
  id: string;
  name: string;
  steps: ResponseWorkflowStep[];
}

export interface ResponseWorkflowStep {
  id: string;
  order: number;
  type: 'return_response' | 'use_module_action';
  /** References a SavedCondition by id */
  conditionId?: string;
  /** Inline condition (used when not yet saved) */
  condition?: Condition;
  // for return_response:
  responseBlockId?: string;
  // for use_module_action:
  moduleId?: string;
  kafkaTopic?: string;
  kafkaKey?: string;
  kafkaPayload?: string;
  httpMethod?: string;
  httpUrl?: string;
  httpHeaders?: Record<string, string>;
  httpBody?: string;
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
