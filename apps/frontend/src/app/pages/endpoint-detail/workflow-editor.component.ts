import { Component, Input, Output, EventEmitter, ViewChild, TemplateRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import type { WorkflowAction, ActionType, ModuleDto, ResponseBlockDto } from '@mockingbird/shared-types';
import { TemplatePreviewComponent } from '../../components/template-preview.component';
import { RespondFieldsComponent } from '../../components/respond-fields.component';
import { ConditionBuilderComponent } from './condition-builder.component';
import { WorkflowCanvasComponent, type PaletteBlock, type CanvasBranch } from '../../components/workflow-canvas.component';

const ACTION_COLORS: Record<ActionType, string> = {
  respond: '#22c55e',
  proxy: '#3b82f6',
  delay: '#f59e0b',
  log: '#a78bfa',
  kafka_publish: '#f97316',
  http_request: '#06b6d4',
  store_fetch: '#0ea5e9',
  store_save: '#14b8a6',
  store_delete: '#ef4444',
  if_else: '#ec4899',
  switch: '#8b5cf6',
};

const PALETTE: PaletteBlock[] = [
  { type: 'respond', label: 'Respond', color: ACTION_COLORS.respond },
  { type: 'delay', label: 'Delay', color: ACTION_COLORS.delay },
  { type: 'log', label: 'Log', color: ACTION_COLORS.log },
  { type: 'proxy', label: 'Proxy', color: ACTION_COLORS.proxy },
  { type: 'kafka_publish', label: 'Kafka Publish', color: ACTION_COLORS.kafka_publish },
  { type: 'http_request', label: 'HTTP Request', color: ACTION_COLORS.http_request },
  { type: 'if_else', label: 'If / Else', color: ACTION_COLORS.if_else },
  { type: 'switch', label: 'Switch', color: ACTION_COLORS.switch },
];

function createAction(type: string): WorkflowAction {
  switch (type as ActionType) {
    case 'respond': return { action: 'respond', mode: 'block' };
    case 'delay': return { action: 'delay', ms: 100 };
    case 'log': return { action: 'log', message: '' };
    case 'proxy': return { action: 'proxy', target: '' };
    case 'kafka_publish': return { action: 'kafka_publish', mode: 'inline', topic: '', key: '', payload: '' };
    case 'http_request': return { action: 'http_request', method: 'POST', url: '/' };
    case 'if_else': return { action: 'if_else', condition: { type: 'request.method', op: 'equals', value: 'GET' }, then: [], else: [] };
    case 'switch': return { action: 'switch', cases: [], default: [] };
    default: return { action: type as ActionType };
  }
}

function getActionBranches(item: unknown): CanvasBranch[] | null {
  const action = item as WorkflowAction;
  if (action.action === 'if_else') {
    return [
      { key: 'then', label: 'Then', items: action.then ?? [] },
      { key: 'else', label: 'Else', items: action.else ?? [] },
    ];
  }
  if (action.action === 'switch') {
    return [
      ...(action.cases ?? []).map((c, i) => ({ key: `case:${c.id}`, label: `Case ${i + 1}`, items: c.actions })),
      { key: 'default', label: 'Default', items: action.default ?? [] },
    ];
  }
  return null;
}

function setActionBranch(item: unknown, key: string, items: unknown[]): unknown {
  const action = item as WorkflowAction;
  const actions = items as WorkflowAction[];
  if (key === 'then') return { ...action, then: actions };
  if (key === 'else') return { ...action, else: actions };
  if (key === 'default') return { ...action, default: actions };
  if (key.startsWith('case:')) {
    const caseId = key.slice(5);
    return { ...action, cases: (action.cases ?? []).map(c => (c.id === caseId ? { ...c, actions } : c)) };
  }
  return action;
}

/**
 * Ad-hoc workflow editor: a drag-and-drop block canvas over WorkflowAction[],
 * used as the "inline workflow" mode of a ResponseNode. Structural rendering
 * (palette, drag/drop, if_else/switch branch nesting) comes from
 * WorkflowCanvasComponent; this component only supplies the per-action-type
 * form fields via the projected item template.
 */
@Component({
  standalone: true,
  selector: 'app-workflow-editor',
  imports: [
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonToggleModule,
    MatButtonModule,
    MatIconModule,
    TemplatePreviewComponent,
    RespondFieldsComponent,
    ConditionBuilderComponent,
    WorkflowCanvasComponent,
  ],
  template: `
    <div class="workflow-editor">
      @if (!hasRespondOrProxy()) {
        <div class="no-respond-warning">
          &#x26A0; No respond or proxy action anywhere in this workflow — it will fall through to the default response.
        </div>
      }

      <app-workflow-canvas
        [items]="workflow"
        [palette]="palette"
        [createItem]="createItem"
        [getBranches]="getBranches"
        [setBranch]="setBranch"
        [getTypeLabel]="getTypeLabel"
        [getTypeColor]="getTypeColor"
        [itemTemplate]="leafTemplate"
        (itemsChange)="onItemsChange($event)">
      </app-workflow-canvas>
    </div>

    <ng-template #leaf let-action let-onChange="onChange">
      @switch (action.action) {
        @case ('respond') {
          <app-respond-fields [value]="action" [responseBlocks]="responseBlocks" (valueChange)="onChange({ action: 'respond', ...$event })"></app-respond-fields>
        }
        @case ('delay') {
          <mat-form-field appearance="outline">
            <mat-label>Delay (ms)</mat-label>
            <input matInput type="number" [ngModel]="action.ms" (ngModelChange)="onChange({ ...action, ms: $event })" />
          </mat-form-field>
        }
        @case ('log') {
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Message</mat-label>
            <input matInput [ngModel]="action.message" (ngModelChange)="onChange({ ...action, message: $event })" />
          </mat-form-field>
        }
        @case ('proxy') {
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Target URL</mat-label>
            <input matInput [ngModel]="action.target" (ngModelChange)="onChange({ ...action, target: $event })" />
          </mat-form-field>
        }
        @case ('kafka_publish') {
          <div class="action-form">
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Module</mat-label>
              <mat-select [ngModel]="action.module" (ngModelChange)="onChange({ ...action, module: $event })">
                @for (m of kafkaModules; track m.id) {
                  <mat-option [value]="m.id">{{ m.name }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Topic</mat-label>
              <input matInput [ngModel]="action.topic" (ngModelChange)="onChange({ ...action, topic: $event })" />
            </mat-form-field>
            <mat-button-toggle-group [ngModel]="action.mode" (ngModelChange)="onChange({ ...action, mode: $event })">
              <mat-button-toggle value="inline">Inline</mat-button-toggle>
              <mat-button-toggle value="block">Message Block</mat-button-toggle>
            </mat-button-toggle-group>
            @if (action.mode === 'block') {
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Message Block</mat-label>
                <mat-select [ngModel]="action.messageBlockId" (ngModelChange)="onChange({ ...action, messageBlockId: $event })">
                  @for (b of getMessageBlocks(action); track b.id) {
                    <mat-option [value]="b.id">{{ b.name }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
            } @else {
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Key</mat-label>
                <input matInput [ngModel]="action.key" (ngModelChange)="onChange({ ...action, key: $event })" />
              </mat-form-field>
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Payload</mat-label>
                <textarea matInput rows="4" [ngModel]="action.payload" (ngModelChange)="onChange({ ...action, payload: $event })"></textarea>
              </mat-form-field>
              <app-template-preview [template]="action.payload ?? ''"></app-template-preview>
            }
          </div>
        }
        @case ('http_request') {
          <div class="action-form">
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Module</mat-label>
              <mat-select [ngModel]="action.module" (ngModelChange)="onChange({ ...action, module: $event })">
                @for (m of httpModules; track m.id) {
                  <mat-option [value]="m.id">{{ m.name }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Method</mat-label>
              <mat-select [ngModel]="action.method" (ngModelChange)="onChange({ ...action, method: $event })">
                <mat-option value="GET">GET</mat-option>
                <mat-option value="POST">POST</mat-option>
                <mat-option value="PUT">PUT</mat-option>
                <mat-option value="PATCH">PATCH</mat-option>
                <mat-option value="DELETE">DELETE</mat-option>
              </mat-select>
            </mat-form-field>
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>URL</mat-label>
              <input matInput [ngModel]="action.url" (ngModelChange)="onChange({ ...action, url: $event })" />
            </mat-form-field>
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Body</mat-label>
              <textarea matInput rows="3" [ngModel]="action.requestBody" (ngModelChange)="onChange({ ...action, requestBody: $event })"></textarea>
            </mat-form-field>
            <app-template-preview [template]="action.requestBody ?? ''"></app-template-preview>
          </div>
        }
        @case ('if_else') {
          <div class="action-form">
            <div class="field-label">Condition</div>
            <app-condition-builder [condition]="action.condition" (conditionChange)="onChange({ ...action, condition: $event })"></app-condition-builder>
          </div>
        }
        @case ('switch') {
          <div class="action-form">
            @for (c of action.cases; track c.id; let i = $index) {
              <div class="switch-case">
                <div class="field-label">Case {{ i + 1 }}
                  <button type="button" class="remove-case" (click)="removeCase(action, i, onChange)"><mat-icon>close</mat-icon></button>
                </div>
                <app-condition-builder [condition]="c.condition" (conditionChange)="updateCaseCondition(action, i, $event, onChange)"></app-condition-builder>
              </div>
            }
            <button mat-stroked-button type="button" (click)="addCase(action, onChange)">
              <mat-icon>add</mat-icon> Add case
            </button>
          </div>
        }
      }
    </ng-template>
  `,
  styles: [`
    .workflow-editor { display: flex; flex-direction: column; gap: 12px; }
    .no-respond-warning { background: #fef9c3; border: 1px solid #fde047; border-radius: 4px; padding: 8px 12px; font-size: 14px; }
    .action-form { display: flex; flex-direction: column; gap: 8px; }
    .full-width { width: 100%; }
    .field-label { font-size: 12px; font-weight: 600; color: #475569; display: flex; align-items: center; gap: 6px; }
    .switch-case { border: 1px solid #f1f5f9; border-radius: 8px; padding: 8px; display: flex; flex-direction: column; gap: 6px; }
    .remove-case { margin-left: auto; background: none; border: none; color: #94a3b8; cursor: pointer; display: flex; align-items: center; }
    .remove-case:hover { color: #ef4444; }
  `],
})
export class WorkflowEditorComponent {
  @Input() workflow: WorkflowAction[] = [];
  @Input() modules: ModuleDto[] = [];
  @Input() responseBlocks: ResponseBlockDto[] = [];
  @Output() workflowChange = new EventEmitter<WorkflowAction[]>();

  @ViewChild('leaf', { static: true }) leafTemplate!: TemplateRef<any>;

  palette = PALETTE;
  createItem = createAction;
  getBranches = getActionBranches;
  setBranch = setActionBranch;

  onItemsChange(items: unknown[]): void {
    this.workflowChange.emit(items as WorkflowAction[]);
  }

  get kafkaModules(): ModuleDto[] { return this.modules.filter(m => m.type === 'kafka'); }
  get httpModules(): ModuleDto[] { return this.modules.filter(m => m.type === 'http'); }

  getMessageBlocks(action: WorkflowAction): { id: string; name: string }[] {
    const mod = this.modules.find(m => m.id === action.module);
    if (!mod || mod.type !== 'kafka') return [];
    return ((mod.config as unknown as Record<string, unknown>)['messageBlocks'] as { id: string; name: string }[] | undefined) ?? [];
  }

  // Arrow properties, not methods — passed by reference to <app-workflow-canvas> as plain
  // @Input() callbacks and invoked from that component's `this`, so a regular method
  // would run with the wrong `this` (harmless here since neither uses `this`, but keep
  // the pattern consistent with workflow-builder.component.ts's equivalents).
  getTypeLabel = (item: unknown): string => {
    return (item as WorkflowAction).action;
  };

  getTypeColor = (item: unknown): string => {
    return ACTION_COLORS[(item as WorkflowAction).action] ?? '#64748b';
  };

  hasRespondOrProxy(): boolean {
    return this.containsRespondOrProxy(this.workflow);
  }

  private containsRespondOrProxy(actions: WorkflowAction[]): boolean {
    return actions.some(a => {
      if (a.action === 'respond' || a.action === 'proxy') return true;
      if (a.action === 'if_else') return this.containsRespondOrProxy(a.then ?? []) || this.containsRespondOrProxy(a.else ?? []);
      if (a.action === 'switch') {
        return (a.cases ?? []).some(c => this.containsRespondOrProxy(c.actions)) || this.containsRespondOrProxy(a.default ?? []);
      }
      return false;
    });
  }

  addCase(action: WorkflowAction, onChange: (updated: WorkflowAction) => void): void {
    const cases = [...(action.cases ?? []), {
      id: Math.random().toString(36).slice(2, 11),
      condition: { type: 'request.method' as const, op: 'equals' as const, value: 'GET' },
      actions: [],
    }];
    onChange({ ...action, cases });
  }

  removeCase(action: WorkflowAction, index: number, onChange: (updated: WorkflowAction) => void): void {
    const cases = (action.cases ?? []).filter((_, i) => i !== index);
    onChange({ ...action, cases });
  }

  updateCaseCondition(action: WorkflowAction, index: number, condition: WorkflowAction['condition'], onChange: (updated: WorkflowAction) => void): void {
    const cases = (action.cases ?? []).map((c, i) => (i === index ? { ...c, condition: condition! } : c));
    onChange({ ...action, cases });
  }
}
