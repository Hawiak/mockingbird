import { Component, Input, Output, EventEmitter, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import type { WorkflowAction, ActionType, ModuleDto } from '@mockingbird/shared-types';

const ACTION_COLORS: Record<ActionType, string> = {
  respond: '#22c55e',
  proxy: '#3b82f6',
  delay: '#f59e0b',
  log: '#a78bfa',
  kafka_publish: '#f97316',
  http_request: '#06b6d4',
};

@Component({
  standalone: true,
  selector: 'app-workflow-editor',
  imports: [
    CommonModule,
    FormsModule,
    DragDropModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonToggleModule,
    MatMenuModule,
    MatTooltipModule,
  ],
  template: `
    <div class="workflow-editor">
      @if (!hasRespondOrProxy()) {
        <div class="no-respond-warning">
          &#x26A0; No respond or proxy action — this workflow will fall through to the default response block.
        </div>
      }

      <div cdkDropList (cdkDropListDropped)="drop($event)" class="action-list">
        @for (action of workflow; track $index; let i = $index) {
          <div cdkDrag class="action-card-wrapper">
            <mat-card class="action-card">
              <mat-card-header>
                <span class="type-badge" [style.background]="getColor(action.action)">
                  {{ action.action }}
                </span>
                <div cdkDragHandle class="drag-handle" matTooltip="Drag to reorder">
                  <mat-icon>drag_indicator</mat-icon>
                </div>
                <button mat-icon-button color="warn" (click)="removeAction(i)" class="remove-btn">
                  <mat-icon>close</mat-icon>
                </button>
              </mat-card-header>
              <mat-card-content>
                @switch (action.action) {
                  @case ('respond') {
                    <div class="action-form">
                      <mat-button-toggle-group [(ngModel)]="action.mode" (ngModelChange)="emit()">
                        <mat-button-toggle value="block">Block</mat-button-toggle>
                        <mat-button-toggle value="inline">Inline</mat-button-toggle>
                        <mat-button-toggle value="template">Template</mat-button-toggle>
                      </mat-button-toggle-group>
                      @if (action.mode === 'block') {
                        <mat-form-field appearance="outline" class="full-width">
                          <mat-label>Response Block ID</mat-label>
                          <input matInput [(ngModel)]="action.responseBlockId" (ngModelChange)="emit()" />
                        </mat-form-field>
                      }
                      @if (action.mode === 'inline' || action.mode === 'template') {
                        <mat-form-field appearance="outline" class="full-width">
                          <mat-label>Status Code</mat-label>
                          <input matInput type="number" [(ngModel)]="action.statusCode" (ngModelChange)="emit()" />
                        </mat-form-field>
                        <mat-form-field appearance="outline" class="full-width">
                          <mat-label>Body</mat-label>
                          <textarea matInput rows="4" [(ngModel)]="action.body" (ngModelChange)="emit()"></textarea>
                        </mat-form-field>
                      }
                    </div>
                  }
                  @case ('delay') {
                    <div class="action-form">
                      <mat-form-field appearance="outline">
                        <mat-label>Delay (ms)</mat-label>
                        <input matInput type="number" [(ngModel)]="action.ms" (ngModelChange)="emit()" />
                      </mat-form-field>
                    </div>
                  }
                  @case ('log') {
                    <div class="action-form">
                      <mat-form-field appearance="outline" class="full-width">
                        <mat-label>Message</mat-label>
                        <input matInput [(ngModel)]="action.message" (ngModelChange)="emit()" />
                      </mat-form-field>
                    </div>
                  }
                  @case ('kafka_publish') {
                    <div class="action-form">
                      <mat-form-field appearance="outline" class="full-width">
                        <mat-label>Module</mat-label>
                        <mat-select [(ngModel)]="action.module" (ngModelChange)="emit()">
                          @for (m of kafkaModules; track m.id) {
                            <mat-option [value]="m.id">{{ m.name }}</mat-option>
                          }
                        </mat-select>
                      </mat-form-field>
                      <mat-form-field appearance="outline" class="full-width">
                        <mat-label>Topic</mat-label>
                        <input matInput [(ngModel)]="action.topic" (ngModelChange)="emit()" />
                      </mat-form-field>
                      <mat-form-field appearance="outline" class="full-width">
                        <mat-label>Key</mat-label>
                        <input matInput [(ngModel)]="action.key" (ngModelChange)="emit()" />
                      </mat-form-field>
                      <mat-form-field appearance="outline" class="full-width">
                        <mat-label>Payload</mat-label>
                        <textarea matInput rows="4" [(ngModel)]="action.payload" (ngModelChange)="emit()"></textarea>
                      </mat-form-field>
                    </div>
                  }
                  @case ('http_request') {
                    <div class="action-form">
                      <mat-form-field appearance="outline" class="full-width">
                        <mat-label>Module</mat-label>
                        <mat-select [(ngModel)]="action.module" (ngModelChange)="emit()">
                          @for (m of httpModules; track m.id) {
                            <mat-option [value]="m.id">{{ m.name }}</mat-option>
                          }
                        </mat-select>
                      </mat-form-field>
                      <mat-form-field appearance="outline">
                        <mat-label>Method</mat-label>
                        <mat-select [(ngModel)]="action.method" (ngModelChange)="emit()">
                          <mat-option value="GET">GET</mat-option>
                          <mat-option value="POST">POST</mat-option>
                          <mat-option value="PUT">PUT</mat-option>
                          <mat-option value="PATCH">PATCH</mat-option>
                          <mat-option value="DELETE">DELETE</mat-option>
                        </mat-select>
                      </mat-form-field>
                      <mat-form-field appearance="outline" class="full-width">
                        <mat-label>URL</mat-label>
                        <input matInput [(ngModel)]="action.url" (ngModelChange)="emit()" />
                      </mat-form-field>
                      <mat-form-field appearance="outline" class="full-width">
                        <mat-label>Body</mat-label>
                        <textarea matInput rows="3" [(ngModel)]="action.requestBody" (ngModelChange)="emit()"></textarea>
                      </mat-form-field>
                    </div>
                  }
                  @case ('proxy') {
                    <div class="action-form">
                      <mat-form-field appearance="outline" class="full-width">
                        <mat-label>Target URL</mat-label>
                        <input matInput [(ngModel)]="action.target" (ngModelChange)="emit()" />
                      </mat-form-field>
                    </div>
                  }
                }
              </mat-card-content>
            </mat-card>

            @if (isRespondOrProxy(action) && i < workflow.length - 1) {
              <div class="sync-divider">
                <span>&#x2191; sync &nbsp;&middot;&nbsp; &#x2193; async</span>
              </div>
            }
          </div>
        }
      </div>

      <button mat-stroked-button [matMenuTriggerFor]="addMenu">
        <mat-icon>add</mat-icon> Add action
      </button>
      <mat-menu #addMenu>
        <button mat-menu-item (click)="addAction('respond')">respond</button>
        <button mat-menu-item (click)="addAction('delay')">delay</button>
        <button mat-menu-item (click)="addAction('log')">log</button>
        <button mat-menu-item (click)="addAction('proxy')">proxy</button>
        <button mat-menu-item (click)="addAction('kafka_publish')">kafka_publish</button>
        <button mat-menu-item (click)="addAction('http_request')">http_request</button>
      </mat-menu>
    </div>
  `,
  styles: [`
    .workflow-editor { display: flex; flex-direction: column; gap: 12px; }
    .no-respond-warning { background: #fef9c3; border: 1px solid #fde047; border-radius: 4px; padding: 8px 12px; font-size: 14px; }
    .action-list { display: flex; flex-direction: column; gap: 8px; }
    .action-card-wrapper { display: flex; flex-direction: column; }
    .action-card { border-left: 4px solid #3b82f6; }
    mat-card-header { display: flex; align-items: center; gap: 8px; padding: 8px 16px; }
    .type-badge { padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 700; color: white; }
    .drag-handle { cursor: grab; margin-left: auto; color: #94a3b8; }
    .remove-btn { margin-left: 4px; }
    .action-form { display: flex; flex-direction: column; gap: 8px; padding: 8px 0; }
    .full-width { width: 100%; }
    .sync-divider { text-align: center; font-size: 12px; color: #64748b; padding: 4px; border-top: 1px dashed #cbd5e1; border-bottom: 1px dashed #cbd5e1; margin: 4px 0; }
    .cdk-drag-placeholder { opacity: 0.4; }
    .cdk-drag-animating { transition: transform 250ms cubic-bezier(0,0,0.2,1); }
  `]
})
export class WorkflowEditorComponent implements OnChanges {
  @Input() workflow: WorkflowAction[] = [];
  @Input() modules: ModuleDto[] = [];
  @Output() workflowChange = new EventEmitter<WorkflowAction[]>();

  localWorkflow: WorkflowAction[] = [];

  get kafkaModules(): ModuleDto[] { return this.modules.filter(m => m.type === 'kafka'); }
  get httpModules(): ModuleDto[] { return this.modules.filter(m => m.type === 'http'); }

  ngOnChanges(): void {
    this.localWorkflow = [...this.workflow];
  }

  getColor(action: ActionType): string {
    return ACTION_COLORS[action] ?? '#64748b';
  }

  isRespondOrProxy(action: WorkflowAction): boolean {
    return action.action === 'respond' || action.action === 'proxy';
  }

  hasRespondOrProxy(): boolean {
    return this.workflow.some(a => this.isRespondOrProxy(a));
  }

  drop(event: CdkDragDrop<WorkflowAction[]>): void {
    const arr = [...this.workflow];
    moveItemInArray(arr, event.previousIndex, event.currentIndex);
    this.workflowChange.emit(arr);
  }

  addAction(type: ActionType): void {
    const action: WorkflowAction = { action: type, mode: type === 'respond' ? 'block' : undefined };
    this.workflowChange.emit([...this.workflow, action]);
  }

  removeAction(index: number): void {
    const arr = [...this.workflow];
    arr.splice(index, 1);
    this.workflowChange.emit(arr);
  }

  emit(): void {
    this.workflowChange.emit([...this.workflow]);
  }
}
