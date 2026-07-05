import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTooltipModule } from '@angular/material/tooltip';
import type { ResponseNode, ModuleDto, DataStoreDto, ResponseBlockDto } from '@mockingbird/shared-types';
import type { ResponseWorkflowDto } from '../core/api.service';
import { ConditionBuilderComponent } from '../pages/endpoint-detail/condition-builder.component';
import { WorkflowEditorComponent } from '../pages/endpoint-detail/workflow-editor.component';
import { RespondFieldsComponent } from './respond-fields.component';
import { WorkflowParamFormComponent } from './workflow-param-form.component';

function randomId(): string {
  return Math.random().toString(36).slice(2, 11);
}

function defaultCondition(context: 'http' | 'kafka') {
  return context === 'kafka'
    ? { type: 'request.header' as const, param: 'topic', op: 'equals' as const, value: '' }
    : { type: 'request.method' as const, op: 'equals' as const, value: 'GET' };
}

/**
 * Unified endpoint/Kafka-listener response editor. A ResponseNode is either a
 * simple block or a workflow — condition is opt-in, not mandatory. Chaining
 * conditional nodes via `else` is handled by nesting this component inside
 * itself, one level per else — there's no separate flat "case list"/"switch"
 * UI here, since a `switch` block already covers multi-way branching one
 * level down, inside a workflow's action/step canvas.
 */
@Component({
  standalone: true,
  selector: 'app-response-node-editor',
  imports: [
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatSelectModule,
    MatButtonToggleModule,
    MatButtonModule,
    MatIconModule,
    MatCheckboxModule,
    MatTooltipModule,
    ConditionBuilderComponent,
    WorkflowEditorComponent,
    RespondFieldsComponent,
    WorkflowParamFormComponent,
    ResponseNodeEditorComponent,
  ],
  template: `
    <div class="response-node-editor">
      <div class="section">
        <mat-checkbox [checked]="!!node.condition" (change)="toggleCondition($event.checked)">
          Conditional
        </mat-checkbox>
      </div>

      @if (node.condition) {
        <div class="section">
          <app-condition-builder
            [condition]="node.condition"
            [context]="context"
            [stores]="stores"
            (conditionChange)="update({ condition: $event })">
          </app-condition-builder>
        </div>
      }

      <div class="section">
        <mat-button-toggle-group [ngModel]="node.kind" (ngModelChange)="update({ kind: $event })">
          <mat-button-toggle value="block">Block</mat-button-toggle>
          <mat-button-toggle value="workflow">Workflow</mat-button-toggle>
        </mat-button-toggle-group>
      </div>

      @if (node.kind === 'block') {
        <div class="section">
          <app-respond-fields
            [value]="node"
            [responseBlocks]="responseBlocks"
            (valueChange)="update($event)">
          </app-respond-fields>
        </div>
      } @else {
        <div class="section">
          <mat-button-toggle-group [ngModel]="node.workflowMode ?? 'inline'" (ngModelChange)="setWorkflowMode($event)">
            <mat-button-toggle value="inline">Inline</mat-button-toggle>
            <mat-button-toggle value="named">Named Workflow</mat-button-toggle>
          </mat-button-toggle-group>

          @if ((node.workflowMode ?? 'inline') === 'named') {
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Response Workflow</mat-label>
              <mat-select [ngModel]="node.workflowId" (ngModelChange)="setWorkflowId($event)">
                @for (wf of responseWorkflows; track wf.id) {
                  <mat-option [value]="wf.id">{{ wf.name }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            @if (findWorkflow(node.workflowId)) {
              <app-workflow-param-form
                [workflow]="findWorkflow(node.workflowId)"
                [stores]="stores"
                [pathParams]="pathParams"
                [value]="node.workflowParams ?? {}"
                (valueChange)="update({ workflowParams: $event })">
              </app-workflow-param-form>
            }
          } @else {
            <app-workflow-editor
              [workflow]="node.actions ?? []"
              [modules]="modules"
              [responseBlocks]="responseBlocks"
              (workflowChange)="update({ actions: $event })">
            </app-workflow-editor>
          }
        </div>
      }

      @if (node.condition) {
        <div class="else-block">
          <div class="else-head">
            <span class="else-label">Else</span>
            @if (node.else) {
              <button type="button" class="remove-btn" (click)="clearElse()" matTooltip="Remove else">
                <mat-icon>close</mat-icon>
              </button>
            }
          </div>
          <app-response-node-editor
            [node]="node.else ?? emptyNode()"
            [context]="context"
            [responseBlocks]="responseBlocks"
            [responseWorkflows]="responseWorkflows"
            [modules]="modules"
            [stores]="stores"
            [pathParams]="pathParams"
            (nodeChange)="update({ else: $event })">
          </app-response-node-editor>
        </div>
      }
    </div>
  `,
  styles: [`
    .response-node-editor { display: flex; flex-direction: column; gap: 8px; }
    .section { padding: 10px 0; border-bottom: 1px solid #f1f5f9; display: flex; flex-direction: column; gap: 8px; }
    .section:last-of-type { border-bottom: none; }
    .full-width { width: 100%; }
    .else-block { border: 1px dashed #cbd5e1; border-radius: 10px; padding: 12px; background: #f8fafc; margin-top: 4px; }
    .else-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
    .else-label { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.4px; }
    .remove-btn { margin-left: auto; background: none; border: none; color: #94a3b8; cursor: pointer; display: flex; align-items: center; padding: 2px; border-radius: 4px; }
    .remove-btn:hover { background: #fee2e2; color: #ef4444; }
  `],
})
export class ResponseNodeEditorComponent {
  @Input() node: ResponseNode = { id: randomId(), kind: 'block' };
  @Input() context: 'http' | 'kafka' = 'http';
  @Input() responseBlocks: ResponseBlockDto[] = [];
  @Input() responseWorkflows: ResponseWorkflowDto[] = [];
  @Input() modules: ModuleDto[] = [];
  @Input() stores: DataStoreDto[] = [];
  @Input() pathParams: string[] = [];
  @Output() nodeChange = new EventEmitter<ResponseNode>();

  findWorkflow(id?: string): ResponseWorkflowDto | null {
    return this.responseWorkflows.find(w => w.id === id) ?? null;
  }

  emptyNode(): ResponseNode {
    return { id: randomId(), kind: 'block' };
  }

  update(patch: Partial<ResponseNode>): void {
    this.nodeChange.emit({ ...this.node, ...patch });
  }

  toggleCondition(enabled: boolean): void {
    this.update({ condition: enabled ? (this.node.condition ?? defaultCondition(this.context)) : undefined });
  }

  setWorkflowMode(workflowMode: 'inline' | 'named'): void {
    this.update({ workflowMode, workflowParams: workflowMode === 'named' ? {} : this.node.workflowParams });
  }

  setWorkflowId(workflowId: string): void {
    this.update({ workflowId, workflowParams: {} });
  }

  clearElse(): void {
    this.update({ else: undefined });
  }
}
