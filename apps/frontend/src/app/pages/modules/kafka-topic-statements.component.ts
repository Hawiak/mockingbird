import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import type { Statement, Condition, ModuleDto } from '@mockingbird/shared-types';
import { ConditionBuilderComponent } from '../endpoint-detail/condition-builder.component';
import { WorkflowEditorComponent } from '../endpoint-detail/workflow-editor.component';

interface EditableStatement extends Statement {
  isNew?: boolean;
}

@Component({
  standalone: true,
  selector: 'app-kafka-topic-statements',
  imports: [
    CommonModule,
    FormsModule,
    DragDropModule,
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule,
    MatFormFieldModule,
    MatInputModule,
    MatTooltipModule,
    ConditionBuilderComponent,
    WorkflowEditorComponent,
  ],
  template: `
    @if (statements.length === 0) {
      <div class="empty-state">
        <span class="material-icons empty-icon">rule</span>
        <p>No statements yet. Messages that don't match any statement are just logged.</p>
      </div>
    }

    <div cdkDropList (cdkDropListDropped)="drop($event)" class="stmt-list">
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
              (change)="toggleEnabled(stmt, $event.checked)">
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

    <button mat-stroked-button color="primary" (click)="openNew()" class="add-btn">
      <span class="material-icons">add</span> Add Statement
    </button>

    @if (editing) {
      <div class="drawer-backdrop" (click)="closeEditor()"></div>
      <div class="drawer-panel">
        <div class="drawer-head">
          <span class="drawer-title">{{ editing.isNew ? 'New Statement' : 'Edit Statement' }}</span>
          <button class="drawer-close" (click)="closeEditor()">
            <span class="material-icons">close</span>
          </button>
        </div>
        <div class="drawer-body">
          <div class="field-row">
            <mat-form-field appearance="outline" class="flex-grow">
              <mat-label>Name</mat-label>
              <input matInput [(ngModel)]="editing.name" placeholder="e.g. Handle ping messages" />
            </mat-form-field>
            <mat-form-field appearance="outline" style="width:100px">
              <mat-label>Priority</mat-label>
              <input matInput type="number" [(ngModel)]="editing.priority" />
            </mat-form-field>
          </div>

          <mat-slide-toggle [(ngModel)]="editing.enabled">Enabled</mat-slide-toggle>

          <div class="drawer-section">
            <div class="drawer-section-title">Condition</div>
            <app-condition-builder
              [condition]="editing.condition"
              (conditionChange)="editing.condition = $event">
            </app-condition-builder>
          </div>

          <div class="drawer-section">
            <div class="drawer-section-title">Workflow</div>
            <app-workflow-editor
              [workflow]="editing.workflow"
              [modules]="modules"
              (workflowChange)="editing.workflow = $event">
            </app-workflow-editor>
          </div>
        </div>
        <div class="drawer-foot">
          <button mat-button (click)="closeEditor()">Cancel</button>
          <button mat-flat-button color="primary" (click)="saveStatement()">Save Statement</button>
        </div>
      </div>
    }
  `,
  styles: [`
    :host { display: block; }
    .empty-state { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 24px; color: #94A3B8; text-align: center; }
    .empty-icon { font-size: 28px; }

    .stmt-list { display: flex; flex-direction: column; gap: 6px; }
    .stmt-row { display: flex; align-items: center; gap: 12px; background: white; border: 1px solid #E2E8F0; border-radius: 8px; padding: 10px 16px; }
    .stmt-disabled { opacity: 0.45; }
    .stmt-drag { cursor: grab; color: #CBD5E1; display: flex; align-items: center; flex-shrink: 0; }
    .stmt-priority { font-size: 11px; font-weight: 700; color: #6366F1; background: #EEF2FF; padding: 2px 8px; border-radius: 10px; flex-shrink: 0; font-family: 'JetBrains Mono', monospace; }
    .stmt-info { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
    .stmt-name { font-size: 13px; font-weight: 600; color: #1E293B; }
    .stmt-summary { font-size: 11px; color: #94A3B8; font-family: 'JetBrains Mono', monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .stmt-actions { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
    .warn-btn { color: #EF4444; }
    .add-btn { align-self: flex-start; margin-top: 8px; }

    .drawer-backdrop { position: fixed; inset: 0; background: rgba(15,23,42,0.4); z-index: 1000; }
    .drawer-panel { position: fixed; top: 0; right: 0; bottom: 0; width: 480px; max-width: 100vw; background: white; z-index: 1001; display: flex; flex-direction: column; box-shadow: -4px 0 24px rgba(0,0,0,0.15); }
    .drawer-head { display: flex; align-items: center; justify-content: space-between; padding: 16px; border-bottom: 1px solid #E2E8F0; }
    .drawer-title { font-weight: 700; }
    .drawer-close { background: none; border: none; cursor: pointer; display: flex; }
    .drawer-body { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 16px; }
    .drawer-foot { display: flex; justify-content: flex-end; gap: 8px; padding: 16px; border-top: 1px solid #E2E8F0; }
    .field-row { display: flex; gap: 12px; }
    .flex-grow { flex: 1; }
    .drawer-section-title { font-size: 12px; font-weight: 700; color: #64748B; text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 8px; }
  `]
})
export class KafkaTopicStatementsComponent {
  @Input() statements: Statement[] = [];
  @Input() modules: ModuleDto[] = [];
  @Output() statementsChange = new EventEmitter<Statement[]>();

  editing: EditableStatement | null = null;

  summariseCondition(condition: Condition): string {
    if (!condition) return '';
    const c = condition as unknown as Record<string, unknown>;
    if ('type' in c) return `${c['type']} ${c['op']} ${c['value'] ?? ''}`.trim();
    if ('conditions' in c) {
      const group = c as unknown as { operator: string; conditions: unknown[] };
      return `${group.conditions.length} conditions (${group.operator})`;
    }
    return '';
  }

  drop(event: CdkDragDrop<Statement[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    const arr = [...this.statements];
    moveItemInArray(arr, event.previousIndex, event.currentIndex);
    this.statements = arr;
    this.statementsChange.emit(this.statements);
  }

  openNew(): void {
    const defaultCondition: Condition = { type: 'request.body_raw', op: 'exists' };
    this.editing = {
      id: crypto.randomUUID(),
      name: '',
      priority: this.statements.length + 1,
      enabled: true,
      condition: defaultCondition,
      workflow: [],
      isNew: true,
    };
  }

  openEdit(stmt: Statement): void {
    this.editing = JSON.parse(JSON.stringify(stmt));
  }

  closeEditor(): void {
    this.editing = null;
  }

  saveStatement(): void {
    const stmt = this.editing;
    if (!stmt) return;
    const clean: Statement = {
      id: stmt.id,
      name: stmt.name,
      priority: stmt.priority,
      enabled: stmt.enabled,
      condition: stmt.condition,
      workflow: stmt.workflow,
    };
    const idx = this.statements.findIndex(s => s.id === clean.id);
    const arr = idx === -1 ? [...this.statements, clean] : this.statements.map(s => (s.id === clean.id ? clean : s));
    this.statements = arr;
    this.statementsChange.emit(this.statements);
    this.closeEditor();
  }

  toggleEnabled(stmt: Statement, enabled: boolean): void {
    this.statements = this.statements.map(s => (s.id === stmt.id ? { ...s, enabled } : s));
    this.statementsChange.emit(this.statements);
  }

  deleteStatement(id: string): void {
    if (!confirm('Delete this statement?')) return;
    this.statements = this.statements.filter(s => s.id !== id);
    this.statementsChange.emit(this.statements);
  }
}
