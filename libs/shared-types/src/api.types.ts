import type {
  Service,
  SpecSource,
  CorsConfig,
  ProxyConfig,
  Endpoint,
  Statement,
  Condition,
  WorkflowAction,
  ResponseBlock,
  ModuleConfig,
  ModuleType,
  ParameterSet,
  ResponseWorkflow,
  ResponseWorkflowStep,
  SavedCondition,
} from './config.types.js';

// ─── Service ───────────────────────────────────────────────────────────────

export interface CreateServiceDto {
  name: string;
  port: number;
  spec: SpecSource;
  /** Raw spec file contents, required when spec.type is 'upload' or 'hosted' */
  specContent?: string;
  cors?: CorsConfig;
  proxy?: ProxyConfig;
}

export interface UpdateServiceDto extends Partial<CreateServiceDto> {}

export interface ServiceDto extends Service {}

// ─── Endpoint ──────────────────────────────────────────────────────────────

export interface UpdateEndpointDto {
  disabled?: boolean;
  proxy?: ProxyConfig | { enabled: false };
  defaultResponseBlockId?: string;
  workflowId?: string;
}

export interface EndpointDto extends Endpoint {
  serviceId: string;
  callCount: number;
}

// ─── Statement ─────────────────────────────────────────────────────────────

export interface CreateStatementDto {
  name?: string;
  priority: number;
  condition: Condition;
  workflow: WorkflowAction[];
}

export interface UpdateStatementDto extends Partial<CreateStatementDto> {
  enabled?: boolean;
}

export interface StatementDto extends Statement {}

// ─── Response Block ────────────────────────────────────────────────────────

export interface CreateResponseBlockDto {
  name: string;
  statusCode: number;
  headers?: Record<string, string>;
  body?: string;
}

export interface UpdateResponseBlockDto extends Partial<CreateResponseBlockDto> {}

export interface ResponseBlockDto extends ResponseBlock {}

// ─── Module ────────────────────────────────────────────────────────────────

export interface CreateModuleDto {
  name: string;
  type: ModuleType;
  scope?: string;
  config: Record<string, unknown>;
}

export interface UpdateModuleDto extends Partial<CreateModuleDto> {}

export interface ModuleDto extends ModuleConfig {
  health: 'healthy' | 'unhealthy' | 'checking' | 'unchecked';
  usedByCount: number;
}

export interface TestConnectionResultDto {
  success: boolean;
  message?: string;
  latencyMs?: number;
}

// ─── Parameter Set ─────────────────────────────────────────────────────────

export interface CreateParameterSetDto {
  name: string;
  values: Record<string, string>;
}

export interface UpdateParameterSetDto extends Partial<CreateParameterSetDto> {}

export interface ParameterSetDto extends ParameterSet {}

// ─── Request Log ───────────────────────────────────────────────────────────

export interface LogEntryDto {
  id: string;
  timestamp: string;
  serviceId: string;
  serviceName: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  matched: boolean;
  statementId?: string;
  statementName?: string;
  request: {
    headers: Record<string, string>;
    query: Record<string, string>;
    pathParams: Record<string, string>;
    body?: string;
  };
  response: {
    headers: Record<string, string>;
    body?: string;
  };
  workflowLog: WorkflowLogEntry[];
}

export interface WorkflowLogEntry {
  action: string;
  status: 'ok' | 'error';
  message?: string;
  durationMs: number;
}

// ─── Spec drift ────────────────────────────────────────────────────────────

export interface OrphanedEndpointDto {
  method: string;
  path: string;
  serviceId: string;
  statementCount: number;
}

export interface RemapEndpointDto {
  fromMethod: string;
  fromPath: string;
  toMethod: string;
  toPath: string;
  serviceId: string;
}

// ─── Template preview ──────────────────────────────────────────────────────

export interface TemplatePreviewRequestDto {
  template: string;
  language: 'json' | 'yaml' | 'xml' | 'plaintext';
  context: {
    pathParams?: Record<string, string>;
    queryParams?: Record<string, string>;
    headers?: Record<string, string>;
    body?: string;
    parameterSets?: Record<string, Record<string, string>>;
  };
}

export interface TemplatePreviewResponseDto {
  rendered: string;
  unresolvedVariables: string[];
}

// ─── Response Workflow ─────────────────────────────────────────────────────

export type ResponseWorkflowDto = ResponseWorkflow;

export interface CreateResponseWorkflowDto {
  name: string;
  steps?: ResponseWorkflowStep[];
}

export interface UpdateResponseWorkflowDto {
  name?: string;
  steps?: ResponseWorkflowStep[];
}

// ─── Saved Condition ───────────────────────────────────────────────────────

export type SavedConditionDto = SavedCondition;

export interface CreateSavedConditionDto {
  name: string;
  condition: Condition;
}

export interface UpdateSavedConditionDto {
  name?: string;
  condition?: Condition;
}

// ─── Health ────────────────────────────────────────────────────────────────

export interface HealthDto {
  status: 'ok' | 'degraded';
  services: Array<{
    id: string;
    name: string;
    port: number;
    running: boolean;
    specLoaded: boolean;
  }>;
  modules: Array<{
    id: string;
    name: string;
    health: 'healthy' | 'unhealthy' | 'checking' | 'unchecked';
  }>;
}
