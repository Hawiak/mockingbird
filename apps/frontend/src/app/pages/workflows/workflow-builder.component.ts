import { Component, OnInit, OnDestroy, ViewChild, TemplateRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { Subject, of } from 'rxjs';
import { debounceTime, switchMap, takeUntil } from 'rxjs/operators';
import { ApiService } from '../../core/api.service';
import type {
  ResponseWorkflowDto,
  ResponseWorkflowStep,
  WorkflowParameter,
} from '../../core/api.service';
import type { ResponseBlockDto, ModuleDto, DataStoreDto, Condition } from '@mockingbird/shared-types';
import { TemplatePreviewComponent } from '../../components/template-preview.component';
import { WorkflowCanvasComponent, type PaletteBlock, type CanvasBranch } from '../../components/workflow-canvas.component';
import { ConditionBuilderComponent } from '../endpoint-detail/condition-builder.component';

interface StoreOption {
  value: string;
  label: string;
}

const STEP_COLORS: Record<string, string> = {
  return_response: '#22c55e',
  use_module_action: '#f97316',
  use_data_store: '#0ea5e9',
  if_else: '#ec4899',
  switch: '#8b5cf6',
};

const PALETTE: PaletteBlock[] = [
  { type: 'return_response', label: 'Return Response', color: STEP_COLORS['return_response'] },
  { type: 'use_module_action', label: 'Use Module Action', color: STEP_COLORS['use_module_action'] },
  { type: 'use_data_store', label: 'Use Data Store', color: STEP_COLORS['use_data_store'] },
  { type: 'if_else', label: 'If / Else', color: STEP_COLORS['if_else'] },
  { type: 'switch', label: 'Switch', color: STEP_COLORS['switch'] },
];

function randomId(): string {
  return Math.random().toString(36).slice(2, 11);
}

function createStep(type: string): ResponseWorkflowStep {
  const base = { id: randomId(), order: 0 };
  switch (type) {
    case 'use_module_action': return { ...base, type: 'use_module_action' };
    case 'use_data_store': return { ...base, type: 'use_data_store', storeOperation: 'fetch', storeFetchMode: 'single' };
    case 'if_else': return { ...base, type: 'if_else', condition: { type: 'request.method', op: 'equals', value: 'GET' }, then: [], else: [] };
    case 'switch': return { ...base, type: 'switch', cases: [], default: [] };
    default: return { ...base, type: 'return_response' };
  }
}

function getStepBranches(item: unknown): CanvasBranch[] | null {
  const step = item as ResponseWorkflowStep;
  if (step.type === 'if_else') {
    return [
      { key: 'then', label: 'Then', items: step.then ?? [] },
      { key: 'else', label: 'Else', items: step.else ?? [] },
    ];
  }
  if (step.type === 'switch') {
    return [
      ...(step.cases ?? []).map((c, i) => ({ key: `case:${c.id}`, label: `Case ${i + 1}`, items: c.steps })),
      { key: 'default', label: 'Default', items: step.default ?? [] },
    ];
  }
  return null;
}

function setStepBranch(item: unknown, key: string, items: unknown[]): unknown {
  const step = item as ResponseWorkflowStep;
  const steps = items as ResponseWorkflowStep[];
  if (key === 'then') return { ...step, then: steps };
  if (key === 'else') return { ...step, else: steps };
  if (key === 'default') return { ...step, default: steps };
  if (key.startsWith('case:')) {
    const caseId = key.slice(5);
    return { ...step, cases: (step.cases ?? []).map(c => (c.id === caseId ? { ...c, steps } : c)) };
  }
  return step;
}

/** Renumbers `order` to match array position, recursively through every nested branch — the resolver sorts by `order`, not array position. */
function normalizeSteps(steps: ResponseWorkflowStep[]): ResponseWorkflowStep[] {
  return steps.map((s, i) => {
    const step: ResponseWorkflowStep = { ...s, order: i + 1 };
    if (step.then) step.then = normalizeSteps(step.then);
    if (step.else) step.else = normalizeSteps(step.else);
    if (step.cases) step.cases = step.cases.map(c => ({ ...c, steps: normalizeSteps(c.steps) }));
    if (step.default) step.default = normalizeSteps(step.default);
    return step;
  });
}

@Component({
  standalone: true,
  selector: 'app-workflow-builder',
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatTooltipModule,
    MatSnackBarModule,
    MatButtonToggleModule,
    MatCheckboxModule,
    TemplatePreviewComponent,
    WorkflowCanvasComponent,
    ConditionBuilderComponent,
  ],
  template: `
    <div class="builder-page">
      @if (loading) {
        <div class="loading-center"><mat-spinner diameter="40"></mat-spinner></div>
      }

      @if (workflow) {
        <!-- Header -->
        <div class="builder-header">
          <a routerLink="/workflows" class="back-link">
            <span class="material-icons">arrow_back</span>
            <span>Workflows</span>
          </a>
          <input
            class="workflow-name-input"
            [value]="workflow.name"
            (input)="onNameChange($event)"
            placeholder="Workflow name"
          />
          @if (saving) {
            <span class="save-indicator">
              <span class="material-icons" style="font-size:13px;animation:spin 1s linear infinite">autorenew</span>
              Saving…
            </span>
          }
        </div>

        <!-- Parameters -->
        <div class="params-card">
          <div class="params-head">
            <span class="params-title">Parameters</span>
            <span class="params-hint">Named slots filled in wherever this workflow is attached — reference one inside a step as <code>$param.&lt;name&gt;</code>.</span>
          </div>
          @for (p of workflow.parameters; track $index; let i = $index) {
            <div class="param-row">
              <mat-form-field appearance="outline" style="width:160px">
                <mat-label>Name</mat-label>
                <input matInput [(ngModel)]="p.name" (ngModelChange)="triggerSave()" placeholder="entity" />
              </mat-form-field>
              <mat-form-field appearance="outline" style="width:160px">
                <mat-label>Type</mat-label>
                <mat-select [(ngModel)]="p.type" (ngModelChange)="triggerSave()">
                  <mat-option value="dataStore">Data Store</mat-option>
                  <mat-option value="pathParam">Path Param</mat-option>
                  <mat-option value="text">Text</mat-option>
                </mat-select>
              </mat-form-field>
              <mat-form-field appearance="outline" style="flex:1">
                <mat-label>Label</mat-label>
                <input matInput [(ngModel)]="p.label" (ngModelChange)="triggerSave()" placeholder="Shown when attaching this workflow" />
              </mat-form-field>
              <button class="btn-icon-danger" (click)="removeParameter(i)" matTooltip="Remove parameter">
                <span class="material-icons">delete</span>
              </button>
            </div>
          }
          <button class="btn-add-param" (click)="addParameter()">
            <span class="material-icons">add</span> Add Parameter
          </button>
        </div>

        <!-- Steps canvas -->
        <app-workflow-canvas
          [items]="workflow.steps"
          [palette]="palette"
          [createItem]="createItem"
          [getBranches]="getBranches"
          [setBranch]="setBranch"
          [getTypeLabel]="getTypeLabel"
          [getTypeColor]="getTypeColor"
          [itemTemplate]="leafTemplate"
          (itemsChange)="onStepsChange($event)">
        </app-workflow-canvas>
      }
    </div>

    <ng-template #leaf let-step let-onChange="onChange">
      <div class="step-body">
        @if (step.type === 'return_response') {
          <div class="step-fields">
            <mat-button-toggle-group [ngModel]="step.responseMode ?? 'block'" (ngModelChange)="onChange({ ...step, responseMode: $event })">
              <mat-button-toggle value="block">Block</mat-button-toggle>
              <mat-button-toggle value="template">Template</mat-button-toggle>
            </mat-button-toggle-group>
            @if ((step.responseMode ?? 'block') === 'block') {
              <mat-form-field appearance="outline" style="flex:1;min-width:200px">
                <mat-label>Response Block</mat-label>
                <mat-select [ngModel]="step.responseBlockId" (ngModelChange)="onChange({ ...step, responseBlockId: $event })">
                  @for (rb of responseBlocks; track rb.id) {
                    <mat-option [value]="rb.id">{{ rb.name }} — {{ rb.statusCode }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
            }
          </div>
          @if ((step.responseMode ?? 'block') === 'template') {
            <div class="module-fields">
              <mat-form-field appearance="outline" style="width:120px">
                <mat-label>Status Code</mat-label>
                <input matInput type="number" [ngModel]="step.responseStatusCode" (ngModelChange)="onChange({ ...step, responseStatusCode: $event })" placeholder="200" />
              </mat-form-field>
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Body</mat-label>
                <textarea matInput rows="3" [ngModel]="step.responseBody" (ngModelChange)="onChange({ ...step, responseBody: $event })"></textarea>
              </mat-form-field>
              <app-template-preview [template]="step.responseBody ?? ''"></app-template-preview>
            </div>
          }
        }

        @if (step.type === 'use_module_action') {
          <div class="step-fields">
            <mat-form-field appearance="outline" style="flex:1;min-width:200px">
              <mat-label>Module</mat-label>
              <mat-select [ngModel]="step.moduleId" (ngModelChange)="onChange({ ...step, moduleId: $event })">
                @for (mod of modules; track mod.id) {
                  <mat-option [value]="mod.id">{{ mod.name }} ({{ mod.type }})</mat-option>
                }
              </mat-select>
            </mat-form-field>
          </div>

          @if (getModule(step.moduleId)?.type === 'kafka') {
            <div class="module-fields">
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Topic</mat-label>
                <input matInput [ngModel]="step.kafkaTopic" (ngModelChange)="onChange({ ...step, kafkaTopic: $event })" placeholder="my-topic" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Key</mat-label>
                <input matInput [ngModel]="step.kafkaKey" (ngModelChange)="onChange({ ...step, kafkaKey: $event })" />
              </mat-form-field>
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Payload</mat-label>
                <textarea matInput rows="3" [ngModel]="step.kafkaPayload" (ngModelChange)="onChange({ ...step, kafkaPayload: $event })"></textarea>
              </mat-form-field>
              <app-template-preview [template]="step.kafkaPayload ?? ''"></app-template-preview>
            </div>
          }

          @if (getModule(step.moduleId)?.type === 'http') {
            <div class="module-fields">
              <div class="field-row">
                <mat-form-field appearance="outline" style="width:120px;flex-shrink:0">
                  <mat-label>Method</mat-label>
                  <mat-select [ngModel]="step.httpMethod" (ngModelChange)="onChange({ ...step, httpMethod: $event })">
                    @for (m of httpMethods; track m) {
                      <mat-option [value]="m">{{ m }}</mat-option>
                    }
                  </mat-select>
                </mat-form-field>
                <mat-form-field appearance="outline" style="flex:1">
                  <mat-label>URL</mat-label>
                  <input matInput [ngModel]="step.httpUrl" (ngModelChange)="onChange({ ...step, httpUrl: $event })" placeholder="https://…" />
                </mat-form-field>
              </div>
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Body</mat-label>
                <textarea matInput rows="3" [ngModel]="step.httpBody" (ngModelChange)="onChange({ ...step, httpBody: $event })"></textarea>
              </mat-form-field>
              <app-template-preview [template]="step.httpBody ?? ''"></app-template-preview>
            </div>
          }
        }

        @if (step.type === 'use_data_store') {
          <div class="module-fields">
            <div class="field-row">
              <mat-form-field appearance="outline" style="flex:1">
                <mat-label>Data Store</mat-label>
                <mat-select [ngModel]="step.store" (ngModelChange)="onChange({ ...step, store: $event })">
                  @for (opt of storeOptions(); track opt.value) {
                    <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
              <mat-form-field appearance="outline" style="width:140px;flex-shrink:0">
                <mat-label>Operation</mat-label>
                <mat-select [ngModel]="step.storeOperation" (ngModelChange)="onChange({ ...step, storeOperation: $event })">
                  <mat-option value="fetch">Fetch</mat-option>
                  <mat-option value="save">Save</mat-option>
                  <mat-option value="delete">Delete</mat-option>
                </mat-select>
              </mat-form-field>
            </div>

            @if (step.storeOperation === 'fetch') {
              <mat-button-toggle-group [ngModel]="step.storeFetchMode ?? 'single'" (ngModelChange)="onChange({ ...step, storeFetchMode: $event })">
                <mat-button-toggle value="single">Single</mat-button-toggle>
                <mat-button-toggle value="list">List</mat-button-toggle>
              </mat-button-toggle-group>
              @if ((step.storeFetchMode ?? 'single') === 'single') {
                <mat-form-field appearance="outline" class="full-width">
                  <mat-label>Key</mat-label>
                  <input matInput [ngModel]="step.storeKey" (ngModelChange)="onChange({ ...step, storeKey: $event })" placeholder="{{ '{{request.path_param.$param.key}}' }}" />
                </mat-form-field>
              }
            }

            @if (step.storeOperation === 'save') {
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Key (leave empty to auto-generate)</mat-label>
                <input matInput [ngModel]="step.storeKey" (ngModelChange)="onChange({ ...step, storeKey: $event })" placeholder="{{ '{{request.path_param.$param.key}}' }}" />
              </mat-form-field>
              @if (!step.storeKey) {
                <mat-button-toggle-group [ngModel]="step.storeKeyMode ?? 'uuid'" (ngModelChange)="onChange({ ...step, storeKeyMode: $event })">
                  <mat-button-toggle value="uuid">UUID</mat-button-toggle>
                  <mat-button-toggle value="sequence">Sequence</mat-button-toggle>
                </mat-button-toggle-group>
              }
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Value</mat-label>
                <textarea matInput rows="3" [ngModel]="step.storeValue" (ngModelChange)="onChange({ ...step, storeValue: $event })"></textarea>
              </mat-form-field>
              <app-template-preview [template]="step.storeValue ?? ''"></app-template-preview>
              <mat-checkbox [ngModel]="step.storeMerge" (ngModelChange)="onChange({ ...step, storeMerge: $event })">Merge into existing record instead of replacing</mat-checkbox>
              <mat-checkbox [ngModel]="step.storeTimestamps" (ngModelChange)="onChange({ ...step, storeTimestamps: $event })">Add createdAt/updatedAt to this record</mat-checkbox>
            }

            @if (step.storeOperation === 'delete') {
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Key</mat-label>
                <input matInput [ngModel]="step.storeKey" (ngModelChange)="onChange({ ...step, storeKey: $event })" placeholder="{{ '{{request.path_param.$param.key}}' }}" />
              </mat-form-field>
            }
          </div>
        }

        @if (step.type === 'if_else') {
          <div class="module-fields">
            <div class="field-label">Condition</div>
            <app-condition-builder [condition]="step.condition" [stores]="stores" (conditionChange)="onChange({ ...step, condition: $event })"></app-condition-builder>
          </div>
        }

        @if (step.type === 'switch') {
          <div class="module-fields">
            @for (c of step.cases; track c.id; let i = $index) {
              <div class="switch-case">
                <div class="field-label">Case {{ i + 1 }}
                  <button type="button" class="remove-case" (click)="removeCase(step, i, onChange)"><span class="material-icons">close</span></button>
                </div>
                <app-condition-builder [condition]="c.condition" [stores]="stores" (conditionChange)="updateCaseCondition(step, i, $event, onChange)"></app-condition-builder>
              </div>
            }
            <button mat-stroked-button type="button" (click)="addCase(step, onChange)">
              <span class="material-icons">add</span> Add case
            </button>
          </div>
        }

      </div>
    </ng-template>
  `,
  styles: [`
    :host { display: block; }

    .builder-page { display: flex; flex-direction: column; gap: 20px; padding-bottom: 32px; }
    .loading-center { display: flex; justify-content: center; padding: 60px; }

    /* Header */
    .builder-header {
      display: flex; align-items: center; gap: 14px;
      background: white; border: 1px solid #e2e8f0; border-radius: 10px;
      padding: 12px 18px;
    }
    .back-link {
      display: flex; align-items: center; gap: 4px;
      color: #6366f1; text-decoration: none; font-size: 13px; font-weight: 500;
      flex-shrink: 0;
    }
    .back-link:hover { color: #4f46e5; }
    .back-link .material-icons { font-size: 18px; }
    .workflow-name-input {
      flex: 1; border: none; outline: none;
      font-size: 18px; font-weight: 700; color: #1e293b;
      background: transparent; min-width: 0;
    }
    .workflow-name-input:focus { outline: none; }
    .save-indicator {
      display: flex; align-items: center; gap: 5px;
      font-size: 12px; color: #94a3b8; flex-shrink: 0;
    }
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

    /* Parameters */
    .params-card {
      display: flex; flex-direction: column; gap: 10px;
      background: white; border: 1px solid #e2e8f0; border-radius: 10px;
      padding: 16px 18px;
    }
    .params-head { display: flex; flex-direction: column; gap: 2px; }
    .params-title { font-size: 13px; font-weight: 700; color: #1e293b; }
    .params-hint { font-size: 12px; color: #94a3b8; }
    .params-hint code { background: #f1f5f9; border-radius: 3px; padding: 1px 4px; font-family: 'JetBrains Mono', monospace; }
    .param-row { display: flex; gap: 10px; align-items: flex-start; }
    .btn-add-param {
      display: inline-flex; align-items: center; gap: 6px;
      background: none; border: 1px dashed #cbd5e1; color: #6366f1;
      padding: 6px 14px; border-radius: 8px; cursor: pointer;
      font-size: 13px; font-weight: 600; align-self: flex-start;
    }
    .btn-add-param .material-icons { font-size: 16px; }
    .btn-add-param:hover { border-color: #6366f1; background: #eef2ff; }

    .step-body { display: flex; flex-direction: column; gap: 12px; }
    .step-fields { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-start; }
    .full-width { width: 100%; }
    .field-row { display: flex; gap: 10px; align-items: flex-start; }
    .field-label { font-size: 12px; font-weight: 600; color: #475569; display: flex; align-items: center; gap: 6px; }

    /* Module-specific fields */
    .module-fields {
      display: flex; flex-direction: column; gap: 10px;
      background: #f8fafc; border: 1px solid #f1f5f9; border-radius: 8px;
      padding: 12px;
    }
    .switch-case { border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px; display: flex; flex-direction: column; gap: 6px; background: white; }
    .remove-case { margin-left: auto; background: none; border: none; color: #94a3b8; cursor: pointer; display: flex; align-items: center; }
    .remove-case:hover { color: #ef4444; }

    .btn-icon-danger {
      background: none; border: none; cursor: pointer;
      color: #94a3b8; padding: 4px; border-radius: 6px;
      display: flex; align-items: center;
    }
    .btn-icon-danger .material-icons { font-size: 18px; }
    .btn-icon-danger:hover { background: #fef2f2; color: #ef4444; }
  `],
})
export class WorkflowBuilderComponent implements OnInit, OnDestroy {
  workflow: ResponseWorkflowDto | null = null;
  responseBlocks: ResponseBlockDto[] = [];
  modules: ModuleDto[] = [];
  stores: DataStoreDto[] = [];
  loading = false;
  saving = false;
  workflowId = '';

  readonly httpMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
  readonly defaultLeaf: Condition = { type: 'request.method', op: 'equals', value: '' };

  @ViewChild('leaf', { static: true }) leafTemplate!: TemplateRef<any>;

  palette = PALETTE;
  createItem = createStep;
  getBranches = getStepBranches;
  setBranch = setStepBranch;

  private saveSubject = new Subject<void>();
  private destroy$ = new Subject<void>();

  private route = inject(ActivatedRoute);
  private api = inject(ApiService);
  private snack = inject(MatSnackBar);

  ngOnInit(): void {
    this.saveSubject.pipe(
      debounceTime(800),
      switchMap(() => {
        if (!this.workflow) return of(null);
        this.saving = true;
        return this.api.updateResponseWorkflow(this.workflowId, {
          name: this.workflow.name,
          steps: this.workflow.steps,
          parameters: this.workflow.parameters,
        });
      }),
      takeUntil(this.destroy$),
    ).subscribe({
      next: (wf) => { if (wf) { this.workflow = wf; this.saving = false; } },
      error: () => {
        this.saving = false;
        this.snack.open('Auto-save failed', 'OK', { duration: 3000 });
      },
    });

    this.route.params.subscribe(params => {
      this.workflowId = params['id'];
      this.load();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  load(): void {
    this.loading = true;
    this.api.getResponseWorkflow(this.workflowId).subscribe({
      next: (wf) => {
        this.workflow = { ...wf, parameters: wf.parameters ?? [] };
        this.loading = false;
      },
      error: () => { this.loading = false; },
    });
    this.api.getResponseBlocks().subscribe({ next: (rbs) => { this.responseBlocks = rbs; }, error: () => {} });
    this.api.getModules().subscribe({ next: (mods) => { this.modules = mods; }, error: () => {} });
    this.api.getDataStores().subscribe({ next: (stores) => { this.stores = stores; }, error: () => {} });
  }

  addParameter(): void {
    if (!this.workflow) return;
    const newParam: WorkflowParameter = { name: '', type: 'dataStore', label: '' };
    const parameters = [...(this.workflow.parameters ?? []), newParam];
    this.workflow = { ...this.workflow, parameters };
    this.triggerSave();
  }

  removeParameter(index: number): void {
    if (!this.workflow) return;
    const parameters = (this.workflow.parameters ?? []).filter((_, i) => i !== index);
    this.workflow = { ...this.workflow, parameters };
    this.triggerSave();
  }

  /** Real Data Stores plus, for each declared dataStore-typed parameter, a `$param.<name>` option. */
  storeOptions(): StoreOption[] {
    const real = this.stores.map(s => ({ value: s.id, label: s.name }));
    const params = (this.workflow?.parameters ?? [])
      .filter(p => p.type === 'dataStore' && p.name)
      .map(p => ({ value: `$param.${p.name}`, label: `→ ${p.name} (parameter)` }));
    return [...real, ...params];
  }

  triggerSave(): void {
    this.saveSubject.next();
  }

  onNameChange(event: Event): void {
    if (!this.workflow) return;
    this.workflow = { ...this.workflow, name: (event.target as HTMLInputElement).value };
    this.saveSubject.next();
  }

  onStepsChange(steps: unknown[]): void {
    if (!this.workflow) return;
    const normalized = normalizeSteps(steps as ResponseWorkflowStep[]);
    this.workflow = { ...this.workflow, steps: normalized };
    this.triggerSave();
  }

  getModule(moduleId?: string): ModuleDto | undefined {
    return this.modules.find(m => m.id === moduleId);
  }

  // Arrow properties, not methods — these are passed by reference to <app-workflow-canvas>
  // as plain @Input() callbacks and later invoked as `this.getTypeLabel(item)` from THAT
  // component's `this`, so a regular method would see the wrong `this` and crash.
  getTypeLabel = (item: unknown): string => {
    const step = item as ResponseWorkflowStep;
    if (step.type === 'use_module_action') return this.getModule(step.moduleId)?.type === 'kafka' ? 'Kafka Publish' : 'HTTP Request';
    return step.type;
  };

  getTypeColor = (item: unknown): string => {
    return STEP_COLORS[(item as ResponseWorkflowStep).type] ?? '#64748b';
  };

  addCase(step: ResponseWorkflowStep, onChange: (updated: unknown) => void): void {
    const cases = [...(step.cases ?? []), { id: randomId(), condition: this.defaultLeaf, steps: [] }];
    onChange({ ...step, cases });
  }

  removeCase(step: ResponseWorkflowStep, index: number, onChange: (updated: unknown) => void): void {
    const cases = (step.cases ?? []).filter((_, i) => i !== index);
    onChange({ ...step, cases });
  }

  updateCaseCondition(step: ResponseWorkflowStep, index: number, condition: Condition, onChange: (updated: unknown) => void): void {
    const cases = (step.cases ?? []).map((c, i) => (i === index ? { ...c, condition } : c));
    onChange({ ...step, cases });
  }
}
