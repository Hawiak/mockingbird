import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ApiService } from '../core/api.service';
import type { TemplatePreviewResponseDto } from '@mockingbird/shared-types';

interface KvRow { key: string; value: string; }

/**
 * Lets a user paste a sample request (body + path/query params + headers)
 * and see what a template (response block body, respond action body, etc.)
 * renders to against it — reuses POST /api/template/preview.
 */
@Component({
  standalone: true,
  selector: 'app-template-preview',
  imports: [CommonModule, FormsModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  template: `
    <div class="tpl-preview">
      <button mat-stroked-button type="button" (click)="open = !open">
        <mat-icon>{{ open ? 'expand_less' : 'visibility' }}</mat-icon>
        {{ open ? 'Hide preview' : 'Preview with sample request' }}
      </button>

      @if (open) {
        <div class="preview-body">
          <span class="field-label">Sample Request Body</span>
          <textarea class="body-input" rows="4" [(ngModel)]="body" placeholder='{"id": 123, "name": "example"}'></textarea>

          <div class="kv-block">
            <div class="kv-head">
              <span>Path Params</span>
              <button type="button" class="kv-add" (click)="add(pathParams)"><mat-icon>add</mat-icon></button>
            </div>
            @for (row of pathParams; track $index; let i = $index) {
              <div class="kv-row">
                <input [(ngModel)]="row.key" placeholder="key" />
                <input [(ngModel)]="row.value" placeholder="value" />
                <button type="button" class="kv-remove" (click)="remove(pathParams, i)"><mat-icon>close</mat-icon></button>
              </div>
            }
          </div>

          <div class="kv-block">
            <div class="kv-head">
              <span>Query Params</span>
              <button type="button" class="kv-add" (click)="add(queryParams)"><mat-icon>add</mat-icon></button>
            </div>
            @for (row of queryParams; track $index; let i = $index) {
              <div class="kv-row">
                <input [(ngModel)]="row.key" placeholder="key" />
                <input [(ngModel)]="row.value" placeholder="value" />
                <button type="button" class="kv-remove" (click)="remove(queryParams, i)"><mat-icon>close</mat-icon></button>
              </div>
            }
          </div>

          <div class="kv-block">
            <div class="kv-head">
              <span>Headers</span>
              <button type="button" class="kv-add" (click)="add(headers)"><mat-icon>add</mat-icon></button>
            </div>
            @for (row of headers; track $index; let i = $index) {
              <div class="kv-row">
                <input [(ngModel)]="row.key" placeholder="key" />
                <input [(ngModel)]="row.value" placeholder="value" />
                <button type="button" class="kv-remove" (click)="remove(headers, i)"><mat-icon>close</mat-icon></button>
              </div>
            }
          </div>

          <button mat-flat-button color="primary" type="button" (click)="runPreview()" [disabled]="loading" class="render-btn">
            @if (loading) { <mat-spinner diameter="14"></mat-spinner> }
            Render Preview
          </button>

          @if (result) {
            <div class="result-block">
              <div class="result-label">Rendered Output</div>
              <pre class="result-pre">{{ result.rendered }}</pre>
              @if (result.unresolvedVariables.length) {
                <div class="unresolved">
                  <mat-icon>warning</mat-icon>
                  Unresolved: {{ result.unresolvedVariables.join(', ') }}
                </div>
              }
            </div>
          }
          @if (error) {
            <div class="error-block">{{ error }}</div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .tpl-preview { display: flex; flex-direction: column; gap: 10px; }
    .preview-body { display: flex; flex-direction: column; gap: 10px; padding: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; }
    .field-label { font-size: 12px; font-weight: 600; color: #374151; }
    .body-input { width: 100%; font-family: 'JetBrains Mono', monospace; font-size: 12px; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; resize: vertical; box-sizing: border-box; }
    .kv-block { display: flex; flex-direction: column; gap: 4px; }
    .kv-head { display: flex; align-items: center; justify-content: space-between; font-size: 12px; font-weight: 600; color: #374151; }
    .kv-add { background: none; border: 1px solid #e2e8f0; cursor: pointer; color: #6366f1; border-radius: 6px; display: flex; align-items: center; padding: 0; width: 22px; height: 22px; }
    .kv-add mat-icon { font-size: 16px; width: 16px; height: 16px; }
    .kv-row { display: flex; align-items: center; gap: 6px; }
    .kv-row input { flex: 1; min-width: 0; font-size: 12px; padding: 5px 8px; border: 1px solid #cbd5e1; border-radius: 5px; }
    .kv-remove { background: none; border: none; cursor: pointer; color: #ef4444; display: flex; align-items: center; padding: 0; flex-shrink: 0; }
    .kv-remove mat-icon { font-size: 16px; width: 16px; height: 16px; }
    .render-btn { align-self: flex-start; }
    .result-block { display: flex; flex-direction: column; gap: 4px; }
    .result-label { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.4px; }
    .result-pre { margin: 0; font-family: 'JetBrains Mono', monospace; font-size: 12px; background: white; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px; max-height: 220px; overflow: auto; white-space: pre-wrap; word-break: break-all; }
    .unresolved { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #b45309; background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 6px 10px; }
    .unresolved mat-icon { font-size: 16px; width: 16px; height: 16px; }
    .error-block { font-size: 12px; color: #dc2626; }
  `]
})
export class TemplatePreviewComponent {
  @Input() template = '';

  open = false;
  loading = false;
  body = '';
  pathParams: KvRow[] = [];
  queryParams: KvRow[] = [];
  headers: KvRow[] = [];
  result: TemplatePreviewResponseDto | null = null;
  error: string | null = null;

  private api = inject(ApiService);

  add(arr: KvRow[]): void {
    arr.push({ key: '', value: '' });
  }

  remove(arr: KvRow[], i: number): void {
    arr.splice(i, 1);
  }

  private toRecord(arr: KvRow[]): Record<string, string> {
    const result: Record<string, string> = {};
    for (const { key, value } of arr) {
      if (key.trim()) result[key.trim()] = value;
    }
    return result;
  }

  runPreview(): void {
    this.loading = true;
    this.error = null;
    this.api.previewTemplate({
      template: this.template,
      language: 'plaintext',
      context: {
        body: this.body,
        pathParams: this.toRecord(this.pathParams),
        queryParams: this.toRecord(this.queryParams),
        headers: this.toRecord(this.headers),
      },
    }).subscribe({
      next: (res) => { this.result = res; this.loading = false; },
      error: () => { this.error = 'Failed to render preview'; this.loading = false; },
    });
  }
}
