import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import type {
  ServiceDto, CreateServiceDto, UpdateServiceDto,
  EndpointDto, UpdateEndpointDto,
  StatementDto, CreateStatementDto, UpdateStatementDto,
  ResponseBlockDto, CreateResponseBlockDto, UpdateResponseBlockDto,
  ModuleDto, CreateModuleDto, UpdateModuleDto,
  ParameterSetDto, CreateParameterSetDto, UpdateParameterSetDto,
  LogEntryDto, HealthDto, TemplatePreviewRequestDto, TemplatePreviewResponseDto,
  TestConnectionResultDto, OrphanedEndpointDto,
  Condition,
} from '@mockingbird/shared-types';

// ─── Response Workflow types (inline until shared-types is updated) ───────────

export interface ResponseWorkflowStep {
  id: string;
  order: number;
  type: 'return_response' | 'use_module_action';
  conditionId?: string;
  condition?: Condition;
  responseBlockId?: string;
  moduleId?: string;
  kafkaTopic?: string;
  kafkaKey?: string;
  kafkaPayload?: string;
  httpMethod?: string;
  httpUrl?: string;
  httpHeaders?: Record<string, string>;
  httpBody?: string;
}

export interface ResponseWorkflowDto {
  id: string;
  name: string;
  steps: ResponseWorkflowStep[];
}

export interface CreateResponseWorkflowDto {
  name: string;
  steps?: ResponseWorkflowStep[];
}

export interface UpdateResponseWorkflowDto {
  name?: string;
  steps?: ResponseWorkflowStep[];
}

export interface SavedConditionDto {
  id: string;
  name: string;
  condition: Condition;
}

export interface CreateSavedConditionDto {
  name: string;
  condition: Condition;
}

export interface UpdateSavedConditionDto {
  name?: string;
  condition?: Condition;
}

const BASE = '/api';

@Injectable({ providedIn: 'root' })
export class ApiService {
  constructor(private http: HttpClient) {}

  // Services
  getServices(): Observable<ServiceDto[]> { return this.http.get<ServiceDto[]>(`${BASE}/services`); }
  createService(dto: CreateServiceDto): Observable<ServiceDto> { return this.http.post<ServiceDto>(`${BASE}/services`, dto); }
  getService(id: string): Observable<ServiceDto> { return this.http.get<ServiceDto>(`${BASE}/services/${id}`); }
  updateService(id: string, dto: UpdateServiceDto): Observable<ServiceDto> { return this.http.put<ServiceDto>(`${BASE}/services/${id}`, dto); }
  deleteService(id: string): Observable<void> { return this.http.delete<void>(`${BASE}/services/${id}`); }
  refreshSpec(id: string): Observable<{ endpointCount: number }> { return this.http.post<{ endpointCount: number }>(`${BASE}/services/${id}/spec/refresh`, {}); }
  getOrphanedEndpoints(id: string): Observable<OrphanedEndpointDto[]> { return this.http.get<OrphanedEndpointDto[]>(`${BASE}/services/${id}/orphaned-endpoints`); }
  remapEndpoint(id: string, eid: string, body: { targetPath: string; targetMethod: string }): Observable<void> { return this.http.post<void>(`${BASE}/services/${id}/endpoints/${eid}/remap`, body); }

  // Endpoints
  getEndpoints(svcId: string): Observable<EndpointDto[]> { return this.http.get<EndpointDto[]>(`${BASE}/services/${svcId}/endpoints`); }
  updateEndpoint(svcId: string, eid: string, dto: UpdateEndpointDto): Observable<EndpointDto> { return this.http.put<EndpointDto>(`${BASE}/services/${svcId}/endpoints/${eid}`, dto); }

  // Statements
  getStatements(svcId: string, eid: string): Observable<StatementDto[]> { return this.http.get<StatementDto[]>(`${BASE}/services/${svcId}/endpoints/${eid}/statements`); }
  createStatement(svcId: string, eid: string, dto: CreateStatementDto): Observable<StatementDto> { return this.http.post<StatementDto>(`${BASE}/services/${svcId}/endpoints/${eid}/statements`, dto); }
  updateStatement(svcId: string, eid: string, sid: string, dto: UpdateStatementDto): Observable<StatementDto> { return this.http.put<StatementDto>(`${BASE}/services/${svcId}/endpoints/${eid}/statements/${sid}`, dto); }
  deleteStatement(svcId: string, eid: string, sid: string): Observable<void> { return this.http.delete<void>(`${BASE}/services/${svcId}/endpoints/${eid}/statements/${sid}`); }
  reorderStatement(svcId: string, eid: string, sid: string, priority: number): Observable<void> { return this.http.patch<void>(`${BASE}/services/${svcId}/endpoints/${eid}/statements/${sid}/reorder`, { priority }); }

  // Response blocks
  getResponseBlocks(): Observable<ResponseBlockDto[]> { return this.http.get<ResponseBlockDto[]>(`${BASE}/response-blocks`); }
  createResponseBlock(dto: CreateResponseBlockDto): Observable<ResponseBlockDto> { return this.http.post<ResponseBlockDto>(`${BASE}/response-blocks`, dto); }
  updateResponseBlock(id: string, dto: UpdateResponseBlockDto): Observable<ResponseBlockDto> { return this.http.put<ResponseBlockDto>(`${BASE}/response-blocks/${id}`, dto); }
  deleteResponseBlock(id: string): Observable<void> { return this.http.delete<void>(`${BASE}/response-blocks/${id}`); }

  // Modules
  getModules(): Observable<ModuleDto[]> { return this.http.get<ModuleDto[]>(`${BASE}/modules`); }
  createModule(dto: CreateModuleDto): Observable<ModuleDto> { return this.http.post<ModuleDto>(`${BASE}/modules`, dto); }
  updateModule(id: string, dto: UpdateModuleDto): Observable<ModuleDto> { return this.http.put<ModuleDto>(`${BASE}/modules/${id}`, dto); }
  deleteModule(id: string): Observable<void> { return this.http.delete<void>(`${BASE}/modules/${id}`); }
  getModuleHealth(id: string): Observable<TestConnectionResultDto> { return this.http.get<TestConnectionResultDto>(`${BASE}/modules/${id}/health`); }
  fireModuleTrigger(id: string, triggerId: string): Observable<TestConnectionResultDto> { return this.http.post<TestConnectionResultDto>(`${BASE}/modules/${id}/triggers/${triggerId}/fire`, {}); }

  // Parameter sets
  getParameterSets(): Observable<ParameterSetDto[]> { return this.http.get<ParameterSetDto[]>(`${BASE}/parameter-sets`); }
  createParameterSet(dto: CreateParameterSetDto): Observable<ParameterSetDto> { return this.http.post<ParameterSetDto>(`${BASE}/parameter-sets`, dto); }
  updateParameterSet(id: string, dto: UpdateParameterSetDto): Observable<ParameterSetDto> { return this.http.put<ParameterSetDto>(`${BASE}/parameter-sets/${id}`, dto); }
  deleteParameterSet(id: string): Observable<void> { return this.http.delete<void>(`${BASE}/parameter-sets/${id}`); }

  // Log
  getLog(filters?: { serviceId?: string; method?: string; statusRange?: string; path?: string }): Observable<LogEntryDto[]> {
    let params = new HttpParams();
    if (filters) Object.entries(filters).forEach(([k, v]) => { if (v) params = params.set(k, v); });
    return this.http.get<LogEntryDto[]>(`${BASE}/log`, { params });
  }

  // Template
  previewTemplate(dto: TemplatePreviewRequestDto): Observable<TemplatePreviewResponseDto> { return this.http.post<TemplatePreviewResponseDto>(`${BASE}/template/preview`, dto); }

  // Health
  getHealth(): Observable<HealthDto> { return this.http.get<HealthDto>(`${BASE}/health`); }

  // Response workflows
  getResponseWorkflows(): Observable<ResponseWorkflowDto[]> { return this.http.get<ResponseWorkflowDto[]>(`${BASE}/response-workflows`); }
  createResponseWorkflow(dto: CreateResponseWorkflowDto): Observable<ResponseWorkflowDto> { return this.http.post<ResponseWorkflowDto>(`${BASE}/response-workflows`, dto); }
  getResponseWorkflow(id: string): Observable<ResponseWorkflowDto> { return this.http.get<ResponseWorkflowDto>(`${BASE}/response-workflows/${id}`); }
  updateResponseWorkflow(id: string, dto: UpdateResponseWorkflowDto): Observable<ResponseWorkflowDto> { return this.http.put<ResponseWorkflowDto>(`${BASE}/response-workflows/${id}`, dto); }
  deleteResponseWorkflow(id: string): Observable<void> { return this.http.delete<void>(`${BASE}/response-workflows/${id}`); }

  // Saved conditions
  getSavedConditions(): Observable<SavedConditionDto[]> { return this.http.get<SavedConditionDto[]>(`${BASE}/saved-conditions`); }
  createSavedCondition(dto: CreateSavedConditionDto): Observable<SavedConditionDto> { return this.http.post<SavedConditionDto>(`${BASE}/saved-conditions`, dto); }
  updateSavedCondition(id: string, dto: UpdateSavedConditionDto): Observable<SavedConditionDto> { return this.http.put<SavedConditionDto>(`${BASE}/saved-conditions/${id}`, dto); }
  deleteSavedCondition(id: string): Observable<void> { return this.http.delete<void>(`${BASE}/saved-conditions/${id}`); }
}
