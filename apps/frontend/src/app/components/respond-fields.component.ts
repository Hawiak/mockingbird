import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatSelectModule } from '@angular/material/select';
import type { ResponseBlockDto } from '@mockingbird/shared-types';
import { TemplatePreviewComponent } from './template-preview.component';

export interface RespondFieldsValue {
  mode?: 'block' | 'inline' | 'template';
  responseBlockId?: string;
  statusCode?: number;
  headers?: Record<string, string>;
  body?: string;
}

/**
 * The "how should this respond" field set shared by a block-kind ResponseNode,
 * a `respond` WorkflowAction, and a `return_response` ResponseWorkflowStep:
 * pick an existing Response Block, or write an inline/templated status+body.
 */
@Component({
  standalone: true,
  selector: 'app-respond-fields',
  imports: [CommonModule, FormsModule, MatFormFieldModule, MatInputModule, MatButtonToggleModule, MatSelectModule, TemplatePreviewComponent],
  template: `
    <div class="respond-fields">
      <mat-button-toggle-group [ngModel]="value.mode ?? 'block'" (ngModelChange)="set('mode', $event)">
        <mat-button-toggle value="block">Block</mat-button-toggle>
        <mat-button-toggle value="inline">Inline</mat-button-toggle>
        <mat-button-toggle value="template">Template</mat-button-toggle>
      </mat-button-toggle-group>

      @if ((value.mode ?? 'block') === 'block') {
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Response Block</mat-label>
          <mat-select [ngModel]="value.responseBlockId" (ngModelChange)="set('responseBlockId', $event)">
            @for (rb of responseBlocks; track rb.id) {
              <mat-option [value]="rb.id">{{ rb.name }} — {{ rb.statusCode }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      }
      @if ((value.mode ?? 'block') === 'inline' || value.mode === 'template') {
        <mat-form-field appearance="outline">
          <mat-label>Status Code</mat-label>
          <input matInput type="number" [ngModel]="value.statusCode" (ngModelChange)="set('statusCode', $event)" />
        </mat-form-field>
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Body</mat-label>
          <textarea matInput rows="4" [ngModel]="value.body" (ngModelChange)="set('body', $event)"></textarea>
        </mat-form-field>
      }
      @if (value.mode === 'template') {
        <app-template-preview [template]="value.body ?? ''"></app-template-preview>
      }
    </div>
  `,
  styles: [`
    .respond-fields { display: flex; flex-direction: column; gap: 8px; }
    .full-width { width: 100%; }
  `],
})
export class RespondFieldsComponent {
  @Input() value: RespondFieldsValue = {};
  @Input() responseBlocks: ResponseBlockDto[] = [];
  @Output() valueChange = new EventEmitter<RespondFieldsValue>();

  set<K extends keyof RespondFieldsValue>(key: K, val: RespondFieldsValue[K]): void {
    this.valueChange.emit({ ...this.value, [key]: val });
  }
}
