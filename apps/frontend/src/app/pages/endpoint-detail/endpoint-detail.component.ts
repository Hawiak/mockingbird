import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { MatTabsModule } from '@angular/material/tabs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ApiService } from '../../core/api.service';
import { LogSocketService } from '../../core/log-socket.service';
import type { EndpointDto, StatementDto, ResponseBlockDto, ServiceDto, ModuleDto, CreateStatementDto, Condition, ResponseWorkflowDto } from '@mockingbird/shared-types';
import { ConditionBuilderComponent } from './condition-builder.component';
import { WorkflowEditorComponent } from './workflow-editor.component';

@Component({
  standalone: true,
  selector: 'app-endpoint-detail',
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    DragDropModule,
    MatTabsModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSlideToggleModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatTooltipModule,
    MatSnackBarModule,
    ConditionBuilderComponent,
    WorkflowEditorComponent,
  ],
  template: `
    <div class="ep-page">
      <!-- Breadcrumb -->
      <div class="breadcrumb">
        <a routerLink="/services" class="bc-link">Services</a>
        <span class="bc-sep material-icons">chevron_right</span>
        <a [routerLink]="['/services', svcId]" class="bc-link">{{ service?.name ?? svcId }}</a>
        <span class="bc-sep material-icons">chevron_right</span>
        @if (endpoint) {
          <span class="bc-current">
            <span class="method-pill method-{{ endpoint.method.toLowerCase() }}">{{ endpoint.method }}</span>
            <span class="bc-path">{{ endpoint.path }}</span>
          </span>
        }
      </div>

      @if (loading) {
        <div class="loading-center"><mat-spinner diameter="40"></mat-spinner></div>
      }

      @if (endpoint) {
        <mat-tab-group class="ep-tabs" animationDuration="120ms">

          <!-- Tab: Default Response -->
          <mat-tab>
            <ng-template mat-tab-label>Default Response</ng-template>
            <div class="tab-body">
              <div class="section-card">
                <div class="section-title">Endpoint Status</div>
                <mat-slide-toggle
                  [checked]="!!endpoint.disabled"
                  (change)="toggleDisabled($event.checked)">
                  Disable this endpoint (always returns 404)
                </mat-slide-toggle>
              </div>

              <div class="section-card">
                <div class="section-title">Default Response Block</div>
                <p class="section-hint">Used when no statement matches. Leave empty to use the spec-generated default.</p>
                <mat-form-field appearance="outline" style="width:100%;max-width:480px">
                  <mat-label>Response Block</mat-label>
                  <mat-select
                    [value]="endpoint.defaultResponseBlockId ?? ''"
                    (selectionChange)="setDefaultBlock($event.value)">
                    <mat-option value="">(use spec default)</mat-option>
                    @for (rb of responseBlocks; track rb.id) {
                      <mat-option [value]="rb.id">{{ rb.name }} — {{ rb.statusCode }}</mat-option>
                    }
                  </mat-select>
                </mat-form-field>

                @if (selectedBlock) {
                  <div class="body-preview">
                    <div class="preview-label">Response Preview</div>
                    <pre class="preview-pre">{{ selectedBlock.body }}</pre>
                  </div>
                }
              </div>
            </div>
          </mat-tab>

          <!-- Tab: Workflow -->
          <mat-tab>
            <ng-template mat-tab-label>Workflow</ng-template>
            <div class="tab-body">
              <div class="section-card">
                <div class="section-title">Response Workflow</div>
                <p class="section-hint">Assign a workflow to control how this endpoint responds using multiple ordered steps.</p>

                <mat-form-field appearance="outline" style="width:100%;max-width:480px">
                  <mat-label>Workflow</mat-label>
                  <mat-select
                    [value]="selectedWorkflowId ?? ''"
                    (selectionChange)="setWorkflow($event.value)">
                    <mat-option value="">(none)</mat-option>
                    @for (wf of responseWorkflows; track wf.id) {
                      <mat-option [value]="wf.id">{{ wf.name }}</mat-option>
                    }
                  </mat-select>
                </mat-form-field>

                @if (selectedWorkflowId) {
                  <div class="workflow-preview">
                    @for (wf of responseWorkflows; track wf.id) {
                      @if (wf.id === selectedWorkflowId) {
                        <div class="workflow-steps-preview">
                          @for (step of wf.steps; track step.id) {
                            <div class="wf-step-row">
                              <span class="wf-step-order">{{ step.order }}</span>
                              <span class="wf-step-type">
                                {{ step.type === 'return_response' ? 'Return Response' : 'Use Module Action' }}
                              </span>
                              @if (step.responseBlockId) {
                                <span class="wf-step-detail">{{ getBlockName(step.responseBlockId) }}</span>
                              }
                              @if (step.moduleId) {
                                <span class="wf-step-detail">{{ getModuleName(step.moduleId) }}</span>
                              }
                              @if (step.conditionId) {
                                <span class="wf-step-cond">if condition</span>
                              }
                            </div>
                          }
                        </div>
                        <button class="btn-edit-workflow" (click)="goToWorkflow()">
                          <span class="material-icons">edit</span>
                          Edit Workflow
                        </button>
                      }
                    }
                  </div>
                }
              </div>
            </div>
          </mat-tab>

          <!-- Tab: Statements -->
          <mat-tab>
            <ng-template mat-tab-label>
              Statements
              @if (statements.length) {
                <span class="tab-count">{{ statements.length }}</span>
              }
            </ng-template>
            <div class="tab-body">
              @if (statementsLoading) {
                <mat-spinner diameter="32"></mat-spinner>
              }

              @if (!statementsLoading && statements.length === 0) {
                <div class="empty-state">
                  <span class="material-icons empty-icon">rule</span>
                  <p>No statements yet. Add one to control how this endpoint responds.</p>
                  <button mat-flat-button color="primary" (click)="openNew()">
                    <span class="material-icons">add</span> Add Statement
                  </button>
                </div>
              }

              <div cdkDropList (cdkDropListDropped)="dropStatement($event)" class="stmt-list">
                @for (stmt of statements; track stmt.id; let i = $index) {
                  <div class="stmt-row" [class.stmt-disabled]="!stmt.enabled" cdkDrag>
                    <div class="stmt-drag" cdkDragHandle>
                      <span class="material-icons">drag_indicator</span>
                    </div>
                    <div class="stmt-priority">P{{ stmt.priority }}</div>
                    <div class="stmt-info">
                      <span class="stmt-name">{{ stmt.name || ('Statement ' + (i + 1)) }}</span>
                      <span class="stmt-summary">{{ summariseCondition(stmt.condition) }}</span>
                    </div>
                    <div class="stmt-actions">
                      <mat-slide-toggle
                        [checked]="stmt.enabled"
                        (change)="toggleStatement(stmt, $event.checked)">
                      </mat-slide-toggle>
                      <button mat-icon-button (click)="openEdit(stmt)" matTooltip="Edit">
                        <span class="material-icons">edit</span>
                      </button>
                      <button mat-icon-button (click)="deleteStatement(stmt.id)" matTooltip="Delete" class="warn-btn">
                        <span class="material-icons">delete</span>
                      </button>
                    </div>
                  </div>
                }
              </div>

              @if (statements.length > 0) {
                <button mat-stroked-button color="primary" (click)="openNew()" class="add-btn">
                  <span class="material-icons">add</span> Add Statement
                </button>
              }
            </div>
          </mat-tab>

          <!-- Tab: Log -->
          <mat-tab>
            <ng-template mat-tab-label>Log</ng-template>
            <div class="tab-body">
              <div class="log-list">
                @for (entry of filteredLog(); track entry.id) {
                  <div class="log-entry" [class.log-open]="expandedLogId === entry.id">
                    <div class="log-row" (click)="expandedLogId = expandedLogId === entry.id ? null : entry.id">
                      <span class="log-time">{{ entry.timestamp | date:'HH:mm:ss' }}</span>
                      <span class="method-pill method-{{ entry.method.toLowerCase() }}">{{ entry.method }}</span>
                      <span class="log-status" [class]="statusClass(entry.statusCode)">{{ entry.statusCode }}</span>
                      <span class="log-path">{{ entry.path }}</span>
                      <span class="log-why" [class.why-hit]="entry.matched" [class.why-miss]="!entry.matched">
                        {{ entry.matched ? (entry.statementName || 'statement') : 'default' }}
                      </span>
                      <span class="log-ms">{{ entry.durationMs }}ms</span>
                      <span class="material-icons log-chevron">{{ expandedLogId === entry.id ? 'expand_less' : 'expand_more' }}</span>
                    </div>
                    @if (expandedLogId === entry.id) {
                      <div class="log-detail">
                        <div class="log-detail-col">
                          <div class="log-detail-label">Response Body</div>
                          <pre class="log-pre">{{ entry.response.body || '(empty)' }}</pre>
                        </div>
                        @if (entry.request.body) {
                          <div class="log-detail-col">
                            <div class="log-detail-label">Request Body</div>
                            <pre class="log-pre">{{ entry.request.body }}</pre>
                          </div>
                        }
                        @if (entry.workflowLog.length) {
                          <div class="log-detail-col">
                            <div class="log-detail-label">Workflow Steps</div>
                            @for (step of entry.workflowLog; track $index) {
                              <div class="log-step">
                                <span class="step-action">{{ step.action }}</span>
                                <span class="step-status" [class.step-ok]="step.status==='ok'" [class.step-err]="step.status==='error'">{{ step.status }}</span>
                                @if (step.message) { <span class="step-msg">{{ step.message }}</span> }
                                <span class="step-ms">{{ step.durationMs }}ms</span>
                              </div>
                            }
                          </div>
                        }
                      </div>
                    }
                  </div>
                }
                @if (filteredLog().length === 0) {
                  <div class="empty-state">
                    <span class="material-icons empty-icon">receipt_long</span>
                    <p>No log entries for this endpoint yet.</p>
                  </div>
                }
              </div>
            </div>
          </mat-tab>

        </mat-tab-group>
      }
    </div>

    <!-- Fixed drawer overlay — outside the page flow to avoid nesting issues -->
    @if (editingStatement) {
      <div class="drawer-backdrop" (click)="closeDrawer()"></div>
      <div class="drawer-panel">
        <div class="drawer-head">
          <span class="drawer-title">{{ editingStatement.isNew ? 'New Statement' : 'Edit Statement' }}</span>
          <button class="drawer-close" (click)="closeDrawer()">
            <span class="material-icons">close</span>
          </button>
        </div>
        <div class="drawer-body">
          <div class="field-row">
            <mat-form-field appearance="outline" class="flex-grow">
              <mat-label>Name</mat-label>
              <input matInput [(ngModel)]="editingStatement.name" placeholder="e.g. Return 404 for unknown pets" />
            </mat-form-field>
            <mat-form-field appearance="outline" style="width:100px">
              <mat-label>Priority</mat-label>
              <input matInput type="number" [(ngModel)]="editingStatement.priority" />
            </mat-form-field>
          </div>

          <mat-slide-toggle [(ngModel)]="editingStatement.enabled">Enabled</mat-slide-toggle>

          <div class="drawer-section">
            <div class="drawer-section-title">Condition</div>
            <app-condition-builder
              [condition]="editingStatement.condition"
              (conditionChange)="editingStatement.condition = $event">
            </app-condition-builder>
          </div>

          <div class="drawer-section">
            <div class="drawer-section-title">Workflow</div>
            <app-workflow-editor
              [workflow]="editingStatement.workflow"
              [modules]="[]"
              (workflowChange)="editingStatement.workflow = $event">
            </app-workflow-editor>
          </div>
        </div>
        <div class="drawer-foot">
          <button mat-button (click)="closeDrawer()">Cancel</button>
          <button mat-flat-button color="primary" (click)="saveStatement()">Save Statement</button>
        </div>
      </div>
    }
  `,
  styles: [`
    :host { display: block; height: 100%; }
    .ep-page { display: flex; flex-direction: column; height: 100%; }

    /* Breadcrumb */
    .breadcrumb { display: flex; align-items: center; gap: 4px; margin-bottom: 20px; font-size: 13px; }
    .bc-link { color: #6366F1; text-decoration: none; font-weight: 500; }
    .bc-link:hover { text-decoration: underline; }
    .bc-sep { font-size: 16px; color: #CBD5E1; }
    .bc-current { display: flex; align-items: center; gap: 8px; }
    .bc-path { font-family: 'JetBrains Mono', monospace; font-size: 13px; color: #1E293B; }

    /* Method pills */
    .method-pill { font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 4px; color: white; flex-shrink: 0; }
    .method-get    { background: #10B981; }
    .method-post   { background: #6366F1; }
    .method-put    { background: #F59E0B; }
    .method-delete { background: #EF4444; }
    .method-patch  { background: #8B5CF6; }

    .loading-center { display: flex; justify-content: center; padding: 48px; }

    /* Tabs */
    .ep-tabs { flex: 1; }
    .tab-count { display: inline-flex; align-items: center; justify-content: center; background: #6366F1; color: white; font-size: 10px; font-weight: 700; border-radius: 10px; padding: 0 6px; min-width: 18px; height: 18px; margin-left: 6px; }

    .tab-body { padding: 24px 0; display: flex; flex-direction: column; gap: 20px; }

    /* Section cards */
    .section-card { background: white; border: 1px solid #E2E8F0; border-radius: 10px; padding: 20px 24px; display: flex; flex-direction: column; gap: 14px; }
    .section-title { font-size: 13px; font-weight: 700; color: #1E293B; letter-spacing: 0.2px; }
    .section-hint { margin: 0; font-size: 12px; color: #94A3B8; }

    /* Body preview */
    .body-preview { display: flex; flex-direction: column; gap: 6px; }
    .preview-label { font-size: 11px; font-weight: 700; color: #94A3B8; text-transform: uppercase; letter-spacing: 0.5px; }
    .preview-pre { margin: 0; font-family: 'JetBrains Mono', monospace; font-size: 12px; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 6px; padding: 12px; max-height: 200px; overflow-y: auto; white-space: pre-wrap; word-break: break-all; color: #334155; }

    /* Statements list */
    .stmt-list { display: flex; flex-direction: column; gap: 6px; }
    .stmt-row { display: flex; align-items: center; gap: 12px; background: white; border: 1px solid #E2E8F0; border-radius: 8px; padding: 10px 16px; transition: box-shadow 0.15s; }
    .stmt-row:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
    .stmt-disabled { opacity: 0.45; }
    .stmt-drag { cursor: grab; color: #CBD5E1; display: flex; align-items: center; flex-shrink: 0; }
    .stmt-priority { font-size: 11px; font-weight: 700; color: #6366F1; background: #EEF2FF; padding: 2px 8px; border-radius: 10px; flex-shrink: 0; font-family: 'JetBrains Mono', monospace; }
    .stmt-info { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
    .stmt-name { font-size: 13px; font-weight: 600; color: #1E293B; }
    .stmt-summary { font-size: 11px; color: #94A3B8; font-family: 'JetBrains Mono', monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .stmt-actions { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
    .warn-btn { color: #EF4444; }

    .add-btn { align-self: flex-start; margin-top: 4px; }

    /* Empty state */
    .empty-state { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 48px 24px; text-align: center; color: #94A3B8; }
    .empty-icon { font-size: 40px; opacity: 0.4; }
    .empty-state p { margin: 0; font-size: 14px; }

    /* Log tab */
    .log-list { display: flex; flex-direction: column; gap: 4px; }
    .log-entry { border-radius: 8px; overflow: hidden; border: 1px solid #E2E8F0; }
    .log-open { border-color: #6366F1; }
    .log-row { display: flex; align-items: center; gap: 10px; padding: 9px 14px; font-size: 12px; cursor: pointer; background: white; transition: background 0.1s; }
    .log-row:hover { background: #F8FAFC; }
    .log-open .log-row { background: #EEF2FF; }
    .log-time { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #94A3B8; min-width: 72px; flex-shrink: 0; }
    .log-status { font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 700; flex-shrink: 0; }
    .status-2xx { color: #10B981; }
    .status-3xx { color: #3B82F6; }
    .status-4xx { color: #F59E0B; }
    .status-5xx { color: #EF4444; }
    .log-path { font-family: 'JetBrains Mono', monospace; font-size: 11px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #334155; }
    .log-why { font-size: 10px; font-weight: 700; padding: 1px 7px; border-radius: 8px; flex-shrink: 0; }
    .why-hit { background: #D1FAE5; color: #065F46; }
    .why-miss { background: #FEF3C7; color: #92400E; }
    .log-ms { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #CBD5E1; flex-shrink: 0; width: 50px; text-align: right; }
    .log-chevron { font-size: 16px; color: #CBD5E1; flex-shrink: 0; }
    .log-detail { background: #0F172A; padding: 14px 16px; display: flex; flex-direction: column; gap: 14px; }
    .log-detail-col { display: flex; flex-direction: column; gap: 5px; }
    .log-detail-label { font-size: 10px; font-weight: 700; color: rgba(255,255,255,0.35); text-transform: uppercase; letter-spacing: 0.6px; }
    .log-pre { margin: 0; font-family: 'JetBrains Mono', monospace; font-size: 11px; color: rgba(255,255,255,0.75); white-space: pre-wrap; word-break: break-all; max-height: 160px; overflow-y: auto; }
    .log-step { display: flex; gap: 8px; align-items: center; padding: 3px 0; border-bottom: 1px solid rgba(255,255,255,0.04); font-size: 11px; }
    .log-step:last-child { border-bottom: none; }
    .step-action { font-family: 'JetBrains Mono', monospace; color: #818CF8; min-width: 80px; font-weight: 600; }
    .step-ok { color: #34D399; }
    .step-err { color: #FCA5A5; }
    .step-msg { flex: 1; color: rgba(255,255,255,0.45); }
    .step-ms { color: rgba(255,255,255,0.2); font-family: 'JetBrains Mono', monospace; }

    /* Drag */
    .cdk-drag-preview { box-shadow: 0 8px 24px rgba(0,0,0,0.15); border-radius: 8px; }
    .cdk-drag-placeholder { opacity: 0.3; }

    /* Workflow tab */
    .workflow-preview { display: flex; flex-direction: column; gap: 12px; }
    .workflow-steps-preview { display: flex; flex-direction: column; gap: 4px; }
    .wf-step-row {
      display: flex; align-items: center; gap: 10px;
      background: #f8fafc; border: 1px solid #f1f5f9; border-radius: 6px;
      padding: 8px 12px; font-size: 13px;
    }
    .wf-step-order {
      width: 22px; height: 22px; border-radius: 50%;
      background: #eef2ff; color: #6366f1;
      font-size: 11px; font-weight: 700;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; font-family: 'JetBrains Mono', monospace;
    }
    .wf-step-type { font-weight: 600; color: #1e293b; }
    .wf-step-detail { color: #6366f1; font-size: 12px; font-family: 'JetBrains Mono', monospace; }
    .wf-step-cond {
      margin-left: auto; font-size: 10px; font-weight: 700;
      background: #fef3c7; color: #92400e;
      padding: 1px 7px; border-radius: 8px;
    }
    .btn-edit-workflow {
      display: inline-flex; align-items: center; gap: 6px;
      background: white; border: 1px solid #e2e8f0; color: #475569;
      padding: 7px 16px; border-radius: 7px; cursor: pointer;
      font-size: 13px; font-weight: 500; align-self: flex-start;
    }
    .btn-edit-workflow .material-icons { font-size: 16px; }
    .btn-edit-workflow:hover { background: #f1f5f9; color: #1e293b; border-color: #cbd5e1; }

    /* Fixed drawer */
    .drawer-backdrop { position: fixed; inset: 0; background: rgba(15,23,42,0.35); z-index: 900; backdrop-filter: blur(2px); }
    .drawer-panel { position: fixed; top: 0; right: 0; width: 560px; height: 100vh; background: white; z-index: 901; display: flex; flex-direction: column; box-shadow: -8px 0 40px rgba(0,0,0,0.15); }
    .drawer-head { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid #E2E8F0; flex-shrink: 0; }
    .drawer-title { font-size: 15px; font-weight: 700; color: #1E293B; }
    .drawer-close { background: none; border: none; cursor: pointer; color: #94A3B8; display: flex; align-items: center; padding: 4px; border-radius: 6px; transition: background 0.12s; }
    .drawer-close:hover { background: #F1F5F9; color: #475569; }
    .drawer-body { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 20px; }
    .drawer-foot { padding: 14px 20px; border-top: 1px solid #E2E8F0; display: flex; gap: 8px; justify-content: flex-end; flex-shrink: 0; background: #F8FAFC; }
    .field-row { display: flex; gap: 12px; align-items: flex-start; }
    .flex-grow { flex: 1; }
    .drawer-section { display: flex; flex-direction: column; gap: 10px; }
    .drawer-section-title { font-size: 12px; font-weight: 700; color: #64748B; text-transform: uppercase; letter-spacing: 0.5px; padding-bottom: 2px; border-bottom: 1px solid #F1F5F9; }
  `]
})
export class EndpointDetailComponent implements OnInit {
  endpoint: EndpointDto | null = null;
  service: ServiceDto | null = null;
  statements: StatementDto[] = [];
  responseBlocks: ResponseBlockDto[] = [];
  modules: ModuleDto[] = [];
  responseWorkflows: ResponseWorkflowDto[] = [];
  selectedWorkflowId: string | null = null;
  loading = false;
  statementsLoading = false;
  editingStatement: (StatementDto & { isNew?: boolean }) | null = null;
  expandedLogId: string | null = null;

  svcId = '';
  eid = '';

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private api = inject(ApiService);
  private logSocket = inject(LogSocketService);
  private snack = inject(MatSnackBar);

  get selectedBlock(): ResponseBlockDto | undefined {
    return this.responseBlocks.find(rb => rb.id === this.endpoint?.defaultResponseBlockId);
  }

  filteredLog() {
    const entries = this.logSocket.entries$.value;
    if (!this.endpoint) return [];
    return entries
      .filter(e => e.serviceId === this.svcId && e.path === this.endpoint!.path)
      .slice(-30)
      .reverse();
  }

  statusClass(code: number): string {
    if (code < 300) return 'log-status status-2xx';
    if (code < 400) return 'log-status status-3xx';
    if (code < 500) return 'log-status status-4xx';
    return 'log-status status-5xx';
  }

  summariseCondition(condition: unknown): string {
    if (!condition) return '';
    const c = condition as Record<string, unknown>;
    if ('type' in c) return `${c['type']} ${c['op']} ${c['value'] ?? ''}`.trim();
    if ('conditions' in c) {
      const group = c as { operator: string; conditions: unknown[] };
      return `${group.conditions.length} conditions (${group.operator})`;
    }
    return '';
  }

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      this.svcId = params['id'];
      this.eid = params['eid'];
      this.load();
    });
  }

  load(): void {
    this.loading = true;
    this.api.getService(this.svcId).subscribe({ next: (svc) => { this.service = svc; }, error: () => {} });
    this.api.getEndpoints(this.svcId).subscribe({
      next: (eps) => {
        this.endpoint = (eps.find(e => e.id === this.eid) ?? null) as EndpointDto | null;
        this.selectedWorkflowId = this.endpoint?.workflowId ?? null;
        this.loading = false;
        this.loadStatements();
      },
      error: () => { this.loading = false; },
    });
    this.api.getResponseBlocks().subscribe({ next: (rbs) => { this.responseBlocks = rbs; }, error: () => {} });
    this.api.getModules().subscribe({ next: (mods) => { this.modules = mods; }, error: () => {} });
    this.api.getResponseWorkflows().subscribe({ next: (wfs) => { this.responseWorkflows = wfs; }, error: () => {} });
  }

  loadStatements(): void {
    this.statementsLoading = true;
    this.api.getStatements(this.svcId, this.eid).subscribe({
      next: (stmts) => { this.statements = stmts; this.statementsLoading = false; },
      error: () => { this.statementsLoading = false; },
    });
  }

  toggleDisabled(checked: boolean): void {
    if (!this.endpoint) return;
    // Optimistic update — apply immediately so the toggle doesn't fight the [checked] binding
    this.endpoint = { ...this.endpoint, disabled: checked };
    this.api.updateEndpoint(this.svcId, this.eid, { disabled: checked }).subscribe({
      next: (ep) => { this.endpoint = ep as EndpointDto; },
      error: () => {
        // Roll back on failure
        this.endpoint = { ...this.endpoint!, disabled: !checked };
        this.snack.open('Failed to update endpoint', 'OK', { duration: 3000 });
      },
    });
  }

  setDefaultBlock(blockId: string): void {
    if (!this.endpoint) return;
    this.api.updateEndpoint(this.svcId, this.eid, { defaultResponseBlockId: blockId || undefined }).subscribe({
      next: (ep) => { this.endpoint = ep as EndpointDto; },
    });
  }

  setWorkflow(workflowId: string): void {
    this.selectedWorkflowId = workflowId || null;
    this.api.updateEndpoint(this.svcId, this.eid, { workflowId: workflowId || undefined }).subscribe({
      next: (ep) => { this.endpoint = ep as EndpointDto; },
      error: () => this.snack.open('Failed to update workflow', 'OK', { duration: 3000 }),
    });
  }

  goToWorkflow(): void {
    if (this.selectedWorkflowId) {
      this.router.navigate(['/workflows', this.selectedWorkflowId]);
    }
  }

  getBlockName(blockId: string): string {
    return this.responseBlocks.find(rb => rb.id === blockId)?.name ?? blockId;
  }

  getModuleName(moduleId: string): string {
    return this.modules.find(m => m.id === moduleId)?.name ?? moduleId;
  }

  dropStatement(event: CdkDragDrop<StatementDto[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    const arr = [...this.statements];
    moveItemInArray(arr, event.previousIndex, event.currentIndex);
    this.statements = arr;
    const moved = arr[event.currentIndex];
    this.api.reorderStatement(this.svcId, this.eid, moved.id, event.currentIndex + 1).subscribe({
      error: () => this.snack.open('Failed to reorder', 'OK', { duration: 3000 }),
    });
  }

  openNew(): void {
    const defaultCondition: Condition = { type: 'request.method', op: 'equals', value: 'GET' };
    this.editingStatement = {
      id: '', name: '', priority: this.statements.length + 1,
      enabled: true, condition: defaultCondition, workflow: [], isNew: true,
    };
  }

  openEdit(stmt: StatementDto): void {
    this.editingStatement = JSON.parse(JSON.stringify(stmt));
  }

  closeDrawer(): void {
    this.editingStatement = null;
  }

  saveStatement(): void {
    const stmt = this.editingStatement;
    if (!stmt) return;

    if (stmt.isNew || !stmt.id) {
      const dto: CreateStatementDto = {
        name: stmt.name || undefined,
        priority: stmt.priority,
        condition: stmt.condition,
        workflow: stmt.workflow,
      };
      this.api.createStatement(this.svcId, this.eid, dto).subscribe({
        next: () => { this.closeDrawer(); this.loadStatements(); this.snack.open('Statement created', '', { duration: 2000 }); },
        error: () => this.snack.open('Failed to create statement', 'OK', { duration: 3000 }),
      });
    } else {
      this.api.updateStatement(this.svcId, this.eid, stmt.id, {
        name: stmt.name || undefined,
        priority: stmt.priority,
        enabled: stmt.enabled,
        condition: stmt.condition,
        workflow: stmt.workflow,
      }).subscribe({
        next: () => { this.closeDrawer(); this.loadStatements(); this.snack.open('Statement saved', '', { duration: 2000 }); },
        error: () => this.snack.open('Failed to save statement', 'OK', { duration: 3000 }),
      });
    }
  }

  toggleStatement(stmt: StatementDto, enabled: boolean): void {
    this.api.updateStatement(this.svcId, this.eid, stmt.id, { enabled }).subscribe({
      next: () => { stmt.enabled = enabled; },
      error: () => this.snack.open('Failed to update', 'OK', { duration: 3000 }),
    });
  }

  deleteStatement(sid: string): void {
    if (!confirm('Delete this statement?')) return;
    this.api.deleteStatement(this.svcId, this.eid, sid).subscribe({
      next: () => { this.statements = this.statements.filter(s => s.id !== sid); },
      error: () => this.snack.open('Failed to delete', 'OK', { duration: 3000 }),
    });
  }
}
