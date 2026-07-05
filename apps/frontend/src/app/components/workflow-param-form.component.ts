import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import type { ResponseWorkflowDto } from '../core/api.service';
import type { DataStoreDto } from '@mockingbird/shared-types';

/**
 * Renders one field per parameter declared on a Response Workflow (dataStore
 * select, pathParam select, or text input) and binds the chosen values into
 * `value`. Used wherever a workflow is attached — an HTTP endpoint (real
 * path params available) or a Kafka listener (`pathParams` is always empty —
 * there's nothing to bind a pathParam-typed parameter to there).
 */
@Component({
  standalone: true,
  selector: 'app-workflow-param-form',
  imports: [CommonModule, FormsModule, MatFormFieldModule, MatSelectModule, MatInputModule],
  template: `
    @if (workflow?.parameters?.length) {
      <div class="param-form">
        @for (p of workflow!.parameters!; track p.name) {
          <mat-form-field appearance="outline" class="param-field">
            <mat-label>{{ p.label || p.name }}</mat-label>

            @if (p.type === 'dataStore') {
              <mat-select [ngModel]="value[p.name]" (ngModelChange)="setValue(p.name, $event)">
                @for (s of stores; track s.id) {
                  <mat-option [value]="s.id">{{ s.name }}</mat-option>
                }
              </mat-select>
            } @else if (p.type === 'pathParam') {
              @if (pathParams.length > 0) {
                <mat-select [ngModel]="value[p.name]" (ngModelChange)="setValue(p.name, $event)">
                  @for (pp of pathParams; track pp) {
                    <mat-option [value]="pp">{{ pp }}</mat-option>
                  }
                </mat-select>
              } @else {
                <input matInput disabled placeholder="Not available — no path params here" />
              }
            } @else {
              <input matInput [ngModel]="value[p.name]" (ngModelChange)="setValue(p.name, $event)" />
            }
          </mat-form-field>
        }
      </div>
    }
  `,
  styles: [`
    .param-form { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 8px; }
    .param-field { width: 100%; max-width: 280px; }
  `],
})
export class WorkflowParamFormComponent implements OnChanges {
  @Input() workflow: ResponseWorkflowDto | null = null;
  @Input() stores: DataStoreDto[] = [];
  @Input() pathParams: string[] = [];
  @Input() value: Record<string, string> = {};
  @Output() valueChange = new EventEmitter<Record<string, string>>();

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['workflow'] && this.workflow) {
      this.applyDefaults();
    }
  }

  /** Pre-fills a pathParam-typed parameter to "id" if present, else the sole path param, if not already bound. */
  private applyDefaults(): void {
    if (!this.workflow?.parameters) return;
    const next = { ...this.value };
    let changed = false;
    for (const p of this.workflow.parameters) {
      if (p.type === 'pathParam' && !next[p.name]) {
        const preferred = this.pathParams.find(pp => pp.toLowerCase() === 'id')
          ?? (this.pathParams.length === 1 ? this.pathParams[0] : undefined);
        if (preferred) {
          next[p.name] = preferred;
          changed = true;
        }
      }
    }
    if (changed) {
      this.value = next;
      this.valueChange.emit(next);
    }
  }

  setValue(name: string, val: string): void {
    const next = { ...this.value, [name]: val };
    this.value = next;
    this.valueChange.emit(next);
  }
}
