import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Subject, of } from 'rxjs';
import { debounceTime, switchMap, takeUntil } from 'rxjs/operators';
import { ApiService } from '../../core/api.service';
import type {
  ResponseWorkflowDto,
  ResponseWorkflowStep,
  SavedConditionDto,
} from '../../core/api.service';
import type { ResponseBlockDto, ModuleDto } from '@mockingbird/shared-types';
import { TemplatePreviewComponent } from '../../components/template-preview.component';

interface InlineCondition {
  type: string;
  param: string;
  op: string;
  value: string;
}

@Component({
  standalone: true,
  selector: 'app-workflow-builder',
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    DragDropModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatTooltipModule,
    MatSnackBarModule,
    TemplatePreviewComponent,
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

        <!-- Steps -->
        <div
          cdkDropList
          (cdkDropListDropped)="dropStep($event)"
          class="steps-list"
        >
          @for (step of workflow.steps; track step.id; let i = $index) {
            <div class="step-card" cdkDrag>
              <!-- Drag placeholder -->
              <div class="cdk-drag-placeholder" *cdkDragPlaceholder></div>

              <div class="step-drag" cdkDragHandle>
                <span class="material-icons">drag_indicator</span>
              </div>

              <div class="step-content">
                <!-- Step header row -->
                <div class="step-header-row">
                  <span class="step-number">Step {{ step.order }}</span>
                  <button
                    class="btn-icon-danger"
                    (click)="deleteStep(step)"
                    matTooltip="Delete step"
                  >
                    <span class="material-icons">delete</span>
                  </button>
                </div>

                <!-- Main fields -->
                <div class="step-fields">
                  <mat-form-field appearance="outline" style="width:210px;flex-shrink:0">
                    <mat-label>Type</mat-label>
                    <mat-select [(ngModel)]="step.type" (ngModelChange)="triggerSave()">
                      <mat-option value="return_response">Return Response</mat-option>
                      <mat-option value="use_module_action">Use Module Action</mat-option>
                    </mat-select>
                  </mat-form-field>

                  @if (step.type === 'return_response') {
                    <mat-form-field appearance="outline" style="flex:1;min-width:200px">
                      <mat-label>Response Block</mat-label>
                      <mat-select [(ngModel)]="step.responseBlockId" (ngModelChange)="triggerSave()">
                        <mat-option value="">(none)</mat-option>
                        @for (rb of responseBlocks; track rb.id) {
                          <mat-option [value]="rb.id">{{ rb.name }} — {{ rb.statusCode }}</mat-option>
                        }
                      </mat-select>
                    </mat-form-field>
                  }

                  @if (step.type === 'use_module_action') {
                    <mat-form-field appearance="outline" style="flex:1;min-width:200px">
                      <mat-label>Module</mat-label>
                      <mat-select [(ngModel)]="step.moduleId" (ngModelChange)="triggerSave()">
                        <mat-option value="">(none)</mat-option>
                        @for (mod of modules; track mod.id) {
                          <mat-option [value]="mod.id">{{ mod.name }} ({{ mod.type }})</mat-option>
                        }
                      </mat-select>
                    </mat-form-field>
                  }
                </div>

                <!-- Module-specific fields -->
                @if (step.type === 'use_module_action' && getModule(step.moduleId)?.type === 'kafka') {
                  <div class="module-fields">
                    <mat-form-field appearance="outline" class="full-width">
                      <mat-label>Topic</mat-label>
                      <input matInput [(ngModel)]="step.kafkaTopic" (ngModelChange)="triggerSave()" placeholder="my-topic" />
                    </mat-form-field>
                    <div class="field-row">
                      <mat-form-field appearance="outline" style="flex:1">
                        <mat-label>Key</mat-label>
                        <input matInput [(ngModel)]="step.kafkaKey" (ngModelChange)="triggerSave()" />
                      </mat-form-field>
                    </div>
                    <mat-form-field appearance="outline" class="full-width">
                      <mat-label>Payload</mat-label>
                      <textarea matInput rows="3" [(ngModel)]="step.kafkaPayload" (ngModelChange)="triggerSave()"></textarea>
                    </mat-form-field>
                    <app-template-preview [template]="step.kafkaPayload ?? ''"></app-template-preview>
                  </div>
                }

                @if (step.type === 'use_module_action' && getModule(step.moduleId)?.type === 'http') {
                  <div class="module-fields">
                    <div class="field-row">
                      <mat-form-field appearance="outline" style="width:120px;flex-shrink:0">
                        <mat-label>Method</mat-label>
                        <mat-select [(ngModel)]="step.httpMethod" (ngModelChange)="triggerSave()">
                          @for (m of httpMethods; track m) {
                            <mat-option [value]="m">{{ m }}</mat-option>
                          }
                        </mat-select>
                      </mat-form-field>
                      <mat-form-field appearance="outline" style="flex:1">
                        <mat-label>URL</mat-label>
                        <input matInput [(ngModel)]="step.httpUrl" (ngModelChange)="triggerSave()" placeholder="https://…" />
                      </mat-form-field>
                    </div>
                    <mat-form-field appearance="outline" class="full-width">
                      <mat-label>Body</mat-label>
                      <textarea matInput rows="3" [(ngModel)]="step.httpBody" (ngModelChange)="triggerSave()"></textarea>
                    </mat-form-field>
                    <app-template-preview [template]="step.httpBody ?? ''"></app-template-preview>
                  </div>
                }

                <!-- Condition section -->
                <div class="condition-section">
                  <label class="condition-toggle-row">
                    <input
                      type="checkbox"
                      class="cond-checkbox"
                      [checked]="conditionEnabled[step.id]"
                      (change)="toggleCondition(step, $any($event.target).checked)"
                    />
                    <span class="cond-toggle-label">Has condition</span>
                  </label>

                  @if (conditionEnabled[step.id]) {
                    <div class="condition-body">
                      <div class="cond-mode-row">
                        <label class="radio-label">
                          <input
                            type="radio"
                            [checked]="conditionMode[step.id] === 'saved'"
                            (change)="setConditionMode(step, 'saved')"
                          />
                          Use saved condition
                        </label>
                        <label class="radio-label">
                          <input
                            type="radio"
                            [checked]="conditionMode[step.id] === 'inline'"
                            (change)="setConditionMode(step, 'inline')"
                          />
                          Define inline
                        </label>
                      </div>

                      @if (conditionMode[step.id] === 'saved') {
                        <mat-form-field appearance="outline" style="width:100%;max-width:360px">
                          <mat-label>Saved Condition</mat-label>
                          <mat-select [(ngModel)]="step.conditionId" (ngModelChange)="triggerSave()">
                            <mat-option value="">(none)</mat-option>
                            @for (sc of savedConditions; track sc.id) {
                              <mat-option [value]="sc.id">{{ sc.name }}</mat-option>
                            }
                          </mat-select>
                        </mat-form-field>
                      }

                      @if (conditionMode[step.id] === 'inline' && inlineConditions[step.id]) {
                        <div class="inline-condition-fields">
                          <mat-form-field appearance="outline" style="flex:1;min-width:180px">
                            <mat-label>Condition Type</mat-label>
                            <mat-select [(ngModel)]="inlineConditions[step.id].type" (ngModelChange)="triggerSave()">
                              <mat-option value="request.method">Request Method</mat-option>
                              <mat-option value="request.header">Request Header</mat-option>
                              <mat-option value="request.query_param">Query Param</mat-option>
                              <mat-option value="request.body_json">Body JSON</mat-option>
                              <mat-option value="request.body_raw">Body Raw</mat-option>
                              <mat-option value="request.path_param">Path Param</mat-option>
                            </mat-select>
                          </mat-form-field>

                          @if (showParam(inlineConditions[step.id].type)) {
                            <mat-form-field appearance="outline" style="flex:1;min-width:120px">
                              <mat-label>Parameter</mat-label>
                              <input
                                matInput
                                [(ngModel)]="inlineConditions[step.id].param"
                                (ngModelChange)="triggerSave()"
                              />
                            </mat-form-field>
                          }

                          <mat-form-field appearance="outline" style="min-width:150px">
                            <mat-label>Operator</mat-label>
                            <mat-select [(ngModel)]="inlineConditions[step.id].op" (ngModelChange)="triggerSave()">
                              <mat-option value="equals">equals</mat-option>
                              <mat-option value="not_equals">not equals</mat-option>
                              <mat-option value="contains">contains</mat-option>
                              <mat-option value="not_contains">not contains</mat-option>
                              <mat-option value="exists">exists</mat-option>
                              <mat-option value="not_exists">not exists</mat-option>
                              <mat-option value="matches_regex">matches regex</mat-option>
                            </mat-select>
                          </mat-form-field>

                          @if (showValue(inlineConditions[step.id].op)) {
                            <mat-form-field appearance="outline" style="flex:1;min-width:120px">
                              <mat-label>Value</mat-label>
                              <input
                                matInput
                                [(ngModel)]="inlineConditions[step.id].value"
                                (ngModelChange)="triggerSave()"
                              />
                            </mat-form-field>
                          }
                        </div>

                        <button class="btn-save-condition" (click)="saveConditionAsReusable(step)">
                          <span class="material-icons">bookmark_add</span>
                          Save as reusable condition
                        </button>
                      }
                    </div>
                  }
                </div>
              </div>
            </div>
          }
        </div>

        @if (workflow.steps.length === 0) {
          <div class="empty-steps">
            <span class="material-icons empty-icon">account_tree</span>
            <p>No steps yet. Add the first step to define this workflow.</p>
          </div>
        }

        <button class="btn-add-step" (click)="addStep()">
          <span class="material-icons">add</span>
          Add Step
        </button>
      }
    </div>
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

    /* Steps list */
    .steps-list { display: flex; flex-direction: column; gap: 10px; }

    /* Step card */
    .step-card {
      display: flex; align-items: flex-start; gap: 10px;
      background: white; border: 1px solid #e2e8f0; border-radius: 10px;
      padding: 16px; transition: box-shadow 0.15s;
    }
    .step-card:hover { box-shadow: 0 2px 10px rgba(0,0,0,0.06); }
    .step-drag {
      cursor: grab; color: #cbd5e1; padding-top: 12px;
      flex-shrink: 0; display: flex; align-items: center;
    }
    .step-drag:active { cursor: grabbing; }
    .step-drag .material-icons { font-size: 20px; }

    .step-content { flex: 1; display: flex; flex-direction: column; gap: 14px; min-width: 0; }

    .step-header-row {
      display: flex; align-items: center; justify-content: space-between;
    }
    .step-number {
      font-size: 11px; font-weight: 700; color: #6366f1;
      background: #eef2ff; padding: 3px 10px; border-radius: 10px;
      font-family: 'JetBrains Mono', monospace;
    }
    .btn-icon-danger {
      background: none; border: none; cursor: pointer;
      color: #94a3b8; padding: 4px; border-radius: 6px;
      display: flex; align-items: center;
    }
    .btn-icon-danger .material-icons { font-size: 18px; }
    .btn-icon-danger:hover { background: #fef2f2; color: #ef4444; }

    .step-fields { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-start; }
    .full-width { width: 100%; }
    .field-row { display: flex; gap: 10px; align-items: flex-start; }

    /* Module-specific fields */
    .module-fields {
      display: flex; flex-direction: column; gap: 10px;
      background: #f8fafc; border: 1px solid #f1f5f9; border-radius: 8px;
      padding: 12px;
    }

    /* Condition section */
    .condition-section {
      display: flex; flex-direction: column; gap: 10px;
      border-top: 1px solid #f1f5f9; padding-top: 12px;
    }
    .condition-toggle-row {
      display: flex; align-items: center; gap: 8px; cursor: pointer;
      font-size: 13px; color: #475569; user-select: none;
    }
    .cond-checkbox { width: 15px; height: 15px; accent-color: #6366f1; cursor: pointer; }
    .cond-toggle-label { font-weight: 500; }

    .condition-body { display: flex; flex-direction: column; gap: 10px; }
    .cond-mode-row { display: flex; gap: 20px; }
    .radio-label {
      display: flex; align-items: center; gap: 6px;
      font-size: 13px; color: #475569; cursor: pointer;
    }
    .radio-label input { accent-color: #6366f1; cursor: pointer; }

    .inline-condition-fields { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-start; }

    .btn-save-condition {
      display: inline-flex; align-items: center; gap: 6px;
      background: none; border: 1px solid #e2e8f0; color: #6366f1;
      padding: 6px 14px; border-radius: 6px; cursor: pointer;
      font-size: 12px; font-weight: 600; align-self: flex-start;
    }
    .btn-save-condition .material-icons { font-size: 16px; }
    .btn-save-condition:hover { background: #eef2ff; border-color: #6366f1; }

    /* CDK drag */
    .cdk-drag-preview {
      box-shadow: 0 8px 28px rgba(0,0,0,0.14);
      border-radius: 10px;
      background: white;
    }
    .cdk-drag-placeholder { opacity: 0.3; }
    .cdk-drag-animating { transition: transform 250ms ease; }
    .steps-list.cdk-drop-list-dragging .step-card:not(.cdk-drag-placeholder) { transition: transform 250ms ease; }

    /* Empty state */
    .empty-steps {
      display: flex; flex-direction: column; align-items: center;
      gap: 12px; padding: 60px 0; color: #94a3b8;
    }
    .empty-icon { font-size: 48px; color: #cbd5e1; }
    .empty-steps p { margin: 0; font-size: 14px; color: #64748b; }

    /* Add step button */
    .btn-add-step {
      display: inline-flex; align-items: center; gap: 6px;
      background: white; border: 2px dashed #cbd5e1; color: #6366f1;
      padding: 12px 24px; border-radius: 10px; cursor: pointer;
      font-size: 14px; font-weight: 600; align-self: flex-start;
      transition: border-color 0.15s, background 0.15s;
    }
    .btn-add-step .material-icons { font-size: 20px; }
    .btn-add-step:hover { border-color: #6366f1; background: #eef2ff; }
  `],
})
export class WorkflowBuilderComponent implements OnInit, OnDestroy {
  workflow: ResponseWorkflowDto | null = null;
  responseBlocks: ResponseBlockDto[] = [];
  modules: ModuleDto[] = [];
  savedConditions: SavedConditionDto[] = [];
  loading = false;
  saving = false;
  workflowId = '';

  conditionEnabled: Record<string, boolean> = {};
  conditionMode: Record<string, 'saved' | 'inline'> = {};
  inlineConditions: Record<string, InlineCondition> = {};

  readonly httpMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

  private saveSubject = new Subject<void>();
  private destroy$ = new Subject<void>();

  private route = inject(ActivatedRoute);
  private router = inject(Router);
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
      next: (wf) => { this.workflow = wf; this.loading = false; this.initConditionState(); },
      error: () => { this.loading = false; },
    });
    this.api.getResponseBlocks().subscribe({ next: (rbs) => { this.responseBlocks = rbs; }, error: () => {} });
    this.api.getModules().subscribe({ next: (mods) => { this.modules = mods; }, error: () => {} });
    this.api.getSavedConditions().subscribe({ next: (scs) => { this.savedConditions = scs; }, error: () => {} });
  }

  initConditionState(): void {
    if (!this.workflow) return;
    for (const step of this.workflow.steps) {
      const hasCond = !!(step.conditionId || step.condition);
      this.conditionEnabled[step.id] = hasCond;
      if (step.conditionId) {
        this.conditionMode[step.id] = 'saved';
      } else if (step.condition) {
        this.conditionMode[step.id] = 'inline';
        const c = step.condition as unknown as Record<string, unknown>;
        this.inlineConditions[step.id] = {
          type: (c['type'] as string) || 'request.method',
          param: (c['param'] as string) || '',
          op: (c['op'] as string) || 'equals',
          value: (c['value'] as string) || '',
        };
      } else {
        this.conditionMode[step.id] = 'saved';
      }
    }
  }

  syncConditionsToSteps(): void {
    if (!this.workflow) return;
    for (const step of this.workflow.steps) {
      if (!this.conditionEnabled[step.id]) {
        step.condition = undefined;
        step.conditionId = undefined;
      } else if (this.conditionMode[step.id] === 'inline') {
        const ic = this.inlineConditions[step.id];
        if (ic) {
          step.condition = {
            type: ic.type as 'request.method',
            op: ic.op as 'equals',
            param: ic.param || undefined,
            value: ic.value || undefined,
          };
        }
        step.conditionId = undefined;
      } else {
        // saved mode — conditionId already bound via ngModel, clear inline condition
        step.condition = undefined;
      }
    }
  }

  triggerSave(): void {
    this.syncConditionsToSteps();
    this.saveSubject.next();
  }

  onNameChange(event: Event): void {
    if (!this.workflow) return;
    this.workflow = { ...this.workflow, name: (event.target as HTMLInputElement).value };
    this.saveSubject.next();
  }

  dropStep(event: CdkDragDrop<ResponseWorkflowStep[]>): void {
    if (!this.workflow || event.previousIndex === event.currentIndex) return;
    const steps = [...this.workflow.steps];
    moveItemInArray(steps, event.previousIndex, event.currentIndex);
    steps.forEach((s, i) => { s.order = i + 1; });
    this.workflow = { ...this.workflow, steps };
    this.triggerSave();
  }

  addStep(): void {
    if (!this.workflow) return;
    const newStep: ResponseWorkflowStep = {
      id: Math.random().toString(36).slice(2, 11),
      order: this.workflow.steps.length + 1,
      type: 'return_response',
    };
    this.workflow = { ...this.workflow, steps: [...this.workflow.steps, newStep] };
    this.conditionEnabled[newStep.id] = false;
    this.conditionMode[newStep.id] = 'saved';
    this.triggerSave();
  }

  deleteStep(step: ResponseWorkflowStep): void {
    if (!this.workflow) return;
    const steps = this.workflow.steps.filter(s => s.id !== step.id);
    steps.forEach((s, i) => { s.order = i + 1; });
    this.workflow = { ...this.workflow, steps };
    delete this.conditionEnabled[step.id];
    delete this.conditionMode[step.id];
    delete this.inlineConditions[step.id];
    this.triggerSave();
  }

  getModule(moduleId?: string): ModuleDto | undefined {
    return this.modules.find(m => m.id === moduleId);
  }

  toggleCondition(step: ResponseWorkflowStep, enabled: boolean): void {
    this.conditionEnabled[step.id] = enabled;
    if (enabled) {
      if (!this.conditionMode[step.id]) {
        this.conditionMode[step.id] = 'saved';
      }
      if (this.conditionMode[step.id] === 'inline' && !this.inlineConditions[step.id]) {
        this.inlineConditions[step.id] = { type: 'request.method', param: '', op: 'equals', value: '' };
      }
    }
    this.triggerSave();
  }

  setConditionMode(step: ResponseWorkflowStep, mode: 'saved' | 'inline'): void {
    this.conditionMode[step.id] = mode;
    if (mode === 'inline' && !this.inlineConditions[step.id]) {
      this.inlineConditions[step.id] = { type: 'request.method', param: '', op: 'equals', value: '' };
    }
    this.triggerSave();
  }

  saveConditionAsReusable(step: ResponseWorkflowStep): void {
    const name = prompt('Name for this saved condition:');
    if (!name?.trim()) return;
    const ic = this.inlineConditions[step.id];
    if (!ic) return;
    const condition: Record<string, unknown> = { type: ic.type, op: ic.op };
    if (ic.param) condition['param'] = ic.param;
    if (ic.value) condition['value'] = ic.value;
    this.api.createSavedCondition({ name: name.trim(), condition: condition as never }).subscribe({
      next: (sc) => {
        this.savedConditions = [...this.savedConditions, sc];
        step.conditionId = sc.id;
        this.conditionMode[step.id] = 'saved';
        this.triggerSave();
        this.snack.open('Condition saved', '', { duration: 2000 });
      },
      error: () => this.snack.open('Failed to save condition', 'OK', { duration: 3000 }),
    });
  }

  showParam(type: string): boolean {
    return ['request.header', 'request.query_param', 'request.path_param', 'request.body_json'].includes(type);
  }

  showValue(op: string): boolean {
    return !['exists', 'not_exists'].includes(op);
  }
}
