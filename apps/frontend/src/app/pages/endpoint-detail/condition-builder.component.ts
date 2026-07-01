import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import type { Condition, ConditionLeaf, ConditionGroup, ConditionType, Operator } from '@mockingbird/shared-types';

const CONDITION_TYPES: { value: ConditionType; label: string }[] = [
  { value: 'request.method', label: 'Method' },
  { value: 'request.path_param', label: 'Path Param' },
  { value: 'request.query_param', label: 'Query Param' },
  { value: 'request.header', label: 'Header' },
  { value: 'request.body_json', label: 'Body JSON' },
  { value: 'request.body_xml', label: 'Body XML' },
  { value: 'request.body_raw', label: 'Body Raw' },
  { value: 'request.count', label: 'Call Count' },
];

const OPERATORS: { value: Operator; label: string }[] = [
  { value: 'equals', label: 'equals' },
  { value: 'not_equals', label: 'not equals' },
  { value: 'contains', label: 'contains' },
  { value: 'not_contains', label: 'not contains' },
  { value: 'matches_regex', label: 'matches regex' },
  { value: 'exists', label: 'exists' },
  { value: 'not_exists', label: 'not exists' },
  { value: 'gt', label: '>' },
  { value: 'lt', label: '<' },
];

const PARAM_TYPES: ConditionType[] = [
  'request.path_param',
  'request.query_param',
  'request.header',
  'request.body_json',
  'request.body_xml',
];

const VALUELESS_OPS: Operator[] = ['exists', 'not_exists'];

function isGroup(c: Condition): c is ConditionGroup {
  return 'operator' in c && 'conditions' in c;
}

function defaultLeaf(): ConditionLeaf {
  return { type: 'request.method', op: 'equals', value: '' };
}

function defaultGroup(): ConditionGroup {
  return { operator: 'AND', conditions: [defaultLeaf()] };
}

@Component({
  standalone: true,
  selector: 'app-condition-builder',
  imports: [
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatButtonToggleModule,
  ],
  template: `
    <div class="condition-builder">
      @if (isGroupCondition(condition)) {
        <div class="group">
          @for (leaf of asGroup(condition).conditions; track $index; let last = $last) {
            @if (isLeafCondition(leaf)) {
              <div class="leaf-row">
                <mat-form-field appearance="outline" class="type-field">
                  <mat-label>Type</mat-label>
                  <mat-select [ngModel]="asLeaf(leaf).type" (ngModelChange)="updateLeafType($index, $event)">
                    @for (t of conditionTypes; track t.value) {
                      <mat-option [value]="t.value">{{ t.label }}</mat-option>
                    }
                  </mat-select>
                </mat-form-field>

                @if (needsParam(asLeaf(leaf).type)) {
                  <mat-form-field appearance="outline" class="param-field">
                    <mat-label>Param</mat-label>
                    <input matInput [ngModel]="asLeaf(leaf).param" (ngModelChange)="updateLeafParam($index, $event)" />
                  </mat-form-field>
                }

                <mat-form-field appearance="outline" class="op-field">
                  <mat-label>Operator</mat-label>
                  <mat-select [ngModel]="asLeaf(leaf).op" (ngModelChange)="updateLeafOp($index, $event)">
                    @for (op of operators; track op.value) {
                      <mat-option [value]="op.value">{{ op.label }}</mat-option>
                    }
                  </mat-select>
                </mat-form-field>

                @if (!isValueless(asLeaf(leaf).op)) {
                  <mat-form-field appearance="outline" class="value-field">
                    <mat-label>Value</mat-label>
                    <input matInput [ngModel]="asLeaf(leaf).value" (ngModelChange)="updateLeafValue($index, $event)" />
                  </mat-form-field>
                }

                <button mat-icon-button color="warn" (click)="removeLeaf($index)" matTooltip="Remove">
                  <mat-icon>remove_circle_outline</mat-icon>
                </button>
              </div>
            }
            @if (!last) {
              <div class="connector">
                <mat-button-toggle-group [value]="asGroup(condition).operator" (change)="updateOperator($event.value)">
                  <mat-button-toggle value="AND">AND</mat-button-toggle>
                  <mat-button-toggle value="OR">OR</mat-button-toggle>
                </mat-button-toggle-group>
              </div>
            }
          }
          <button mat-stroked-button (click)="addLeaf()">
            <mat-icon>add</mat-icon> Add condition
          </button>
        </div>
      } @else {
        <!-- Single leaf — wrap in a group UI -->
        <div class="leaf-row">
          <mat-form-field appearance="outline" class="type-field">
            <mat-label>Type</mat-label>
            <mat-select [ngModel]="asLeaf(condition).type" (ngModelChange)="updateSingleLeafType($event)">
              @for (t of conditionTypes; track t.value) {
                <mat-option [value]="t.value">{{ t.label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>

          @if (needsParam(asLeaf(condition).type)) {
            <mat-form-field appearance="outline" class="param-field">
              <mat-label>Param</mat-label>
              <input matInput [ngModel]="asLeaf(condition).param" (ngModelChange)="updateSingleLeafParam($event)" />
            </mat-form-field>
          }

          <mat-form-field appearance="outline" class="op-field">
            <mat-label>Operator</mat-label>
            <mat-select [ngModel]="asLeaf(condition).op" (ngModelChange)="updateSingleLeafOp($event)">
              @for (op of operators; track op.value) {
                <mat-option [value]="op.value">{{ op.label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>

          @if (!isValueless(asLeaf(condition).op)) {
            <mat-form-field appearance="outline" class="value-field">
              <mat-label>Value</mat-label>
              <input matInput [ngModel]="asLeaf(condition).value" (ngModelChange)="updateSingleLeafValue($event)" />
            </mat-form-field>
          }
        </div>
        <button mat-stroked-button (click)="promoteToGroup()">
          <mat-icon>add</mat-icon> Add condition
        </button>
      }
    </div>
  `,
  styles: [`
    .condition-builder { display: flex; flex-direction: column; gap: 8px; }
    .group { display: flex; flex-direction: column; gap: 8px; }
    .leaf-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .type-field { min-width: 140px; }
    .param-field { min-width: 120px; }
    .op-field { min-width: 140px; }
    .value-field { min-width: 140px; }
    .connector { display: flex; justify-content: flex-start; padding: 4px 0; }
  `]
})
export class ConditionBuilderComponent {
  @Input() condition: Condition = defaultLeaf();
  @Output() conditionChange = new EventEmitter<Condition>();

  conditionTypes = CONDITION_TYPES;
  operators = OPERATORS;

  isGroupCondition(c: Condition): boolean { return isGroup(c); }
  isLeafCondition(c: Condition): boolean { return !isGroup(c); }
  asGroup(c: Condition): ConditionGroup { return c as ConditionGroup; }
  asLeaf(c: Condition): ConditionLeaf { return c as ConditionLeaf; }

  needsParam(type: ConditionType): boolean { return PARAM_TYPES.includes(type); }
  isValueless(op: Operator): boolean { return VALUELESS_OPS.includes(op); }

  // Group mutations
  updateOperator(op: 'AND' | 'OR'): void {
    const g = this.asGroup(this.condition);
    this.conditionChange.emit({ ...g, operator: op });
  }

  updateLeafType(index: number, type: ConditionType): void {
    const g = this.asGroup(this.condition);
    const conditions = [...g.conditions];
    conditions[index] = { ...this.asLeaf(conditions[index]), type };
    this.conditionChange.emit({ ...g, conditions });
  }

  updateLeafParam(index: number, param: string): void {
    const g = this.asGroup(this.condition);
    const conditions = [...g.conditions];
    conditions[index] = { ...this.asLeaf(conditions[index]), param };
    this.conditionChange.emit({ ...g, conditions });
  }

  updateLeafOp(index: number, op: Operator): void {
    const g = this.asGroup(this.condition);
    const conditions = [...g.conditions];
    conditions[index] = { ...this.asLeaf(conditions[index]), op };
    this.conditionChange.emit({ ...g, conditions });
  }

  updateLeafValue(index: number, value: string): void {
    const g = this.asGroup(this.condition);
    const conditions = [...g.conditions];
    conditions[index] = { ...this.asLeaf(conditions[index]), value };
    this.conditionChange.emit({ ...g, conditions });
  }

  removeLeaf(index: number): void {
    const g = this.asGroup(this.condition);
    const conditions = g.conditions.filter((_, i) => i !== index);
    if (conditions.length === 0) {
      this.conditionChange.emit(defaultLeaf());
    } else if (conditions.length === 1) {
      this.conditionChange.emit(conditions[0]);
    } else {
      this.conditionChange.emit({ ...g, conditions });
    }
  }

  addLeaf(): void {
    const g = this.asGroup(this.condition);
    this.conditionChange.emit({ ...g, conditions: [...g.conditions, defaultLeaf()] });
  }

  promoteToGroup(): void {
    this.conditionChange.emit({ operator: 'AND', conditions: [this.condition, defaultLeaf()] });
  }

  // Single leaf mutations
  updateSingleLeafType(type: ConditionType): void {
    this.conditionChange.emit({ ...this.asLeaf(this.condition), type });
  }

  updateSingleLeafParam(param: string): void {
    this.conditionChange.emit({ ...this.asLeaf(this.condition), param });
  }

  updateSingleLeafOp(op: Operator): void {
    this.conditionChange.emit({ ...this.asLeaf(this.condition), op });
  }

  updateSingleLeafValue(value: string): void {
    this.conditionChange.emit({ ...this.asLeaf(this.condition), value });
  }
}
