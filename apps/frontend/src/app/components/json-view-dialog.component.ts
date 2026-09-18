import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { formatJson, isJsonString } from '../core/json-format.util';

export interface JsonViewDialogData {
  title: string;
  content: string;
  headers?: Record<string, string>;
}

/**
 * Full-size, read-only viewer for a request/response body (e.g. from the live
 * traffic log), with a raw/formatted JSON toggle and copy-to-clipboard.
 */
@Component({
  standalone: true,
  selector: 'app-json-view-dialog',
  imports: [CommonModule, FormsModule, MatDialogModule, MatButtonModule, MatIconModule, MatButtonToggleModule, MatTooltipModule, MatSnackBarModule],
  template: `
    <h2 mat-dialog-title class="jvd-title">
      <span>{{ data.title }}</span>
      <span class="jvd-spacer"></span>
      @if (isJson) {
        <mat-button-toggle-group [(ngModel)]="viewMode" [ngModelOptions]="{standalone: true}" class="jvd-toggle">
          <mat-button-toggle value="formatted">Formatted</mat-button-toggle>
          <mat-button-toggle value="raw">Raw</mat-button-toggle>
        </mat-button-toggle-group>
      }
      <button mat-icon-button (click)="copy()" matTooltip="Copy to clipboard">
        <mat-icon>content_copy</mat-icon>
      </button>
      <button mat-icon-button mat-dialog-close>
        <mat-icon>close</mat-icon>
      </button>
    </h2>
    <mat-dialog-content class="jvd-content">
      @if (data.headers && headerEntries.length) {
        <div class="jvd-headers">
          @for (h of headerEntries; track h[0]) {
            <div class="jvd-header-row"><span class="jvd-header-key">{{ h[0] }}</span><span class="jvd-header-val">{{ h[1] }}</span></div>
          }
        </div>
      }
      <pre class="jvd-pre">{{ displayed || '(empty)' }}</pre>
    </mat-dialog-content>
  `,
  styles: [`
    .jvd-title { display: flex; align-items: center; gap: 8px; }
    .jvd-spacer { flex: 1; }
    .jvd-toggle { height: 32px; margin-right: 4px; }
    .jvd-toggle ::ng-deep .mat-button-toggle-label-content { line-height: 30px; font-size: 12px; padding: 0 10px; }
    .jvd-content { min-width: 480px; max-width: 80vw; }
    .jvd-headers { display: flex; flex-direction: column; gap: 2px; margin-bottom: 12px; padding: 8px 10px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; }
    .jvd-header-row { display: flex; gap: 8px; font-family: 'JetBrains Mono', monospace; font-size: 11px; }
    .jvd-header-key { font-weight: 600; color: #475569; flex-shrink: 0; }
    .jvd-header-val { color: #64748b; word-break: break-all; }
    .jvd-pre {
      margin: 0; font-family: 'JetBrains Mono', monospace; font-size: 12.5px; line-height: 1.5;
      white-space: pre-wrap; word-break: break-word;
      background: #0f172a; color: #e2e8f0; border-radius: 8px; padding: 16px;
      max-height: 65vh; min-height: 120px; overflow: auto; width: 100%; box-sizing: border-box;
    }
  `],
})
export class JsonViewDialogComponent {
  isJson: boolean;
  viewMode: 'formatted' | 'raw';
  headerEntries: [string, string][];

  constructor(
    private snack: MatSnackBar,
    @Inject(MAT_DIALOG_DATA) public data: JsonViewDialogData,
  ) {
    this.isJson = isJsonString(data.content);
    this.viewMode = this.isJson ? 'formatted' : 'raw';
    this.headerEntries = Object.entries(data.headers ?? {});
  }

  get displayed(): string {
    return this.viewMode === 'formatted' ? formatJson(this.data.content) : this.data.content;
  }

  copy(): void {
    navigator.clipboard.writeText(this.displayed).then(() => {
      this.snack.open('Copied to clipboard', '', { duration: 1500 });
    });
  }
}
