import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ApiService } from '../../core/api.service';
import type { ResponseBlockDto, CreateResponseBlockDto } from '@mockingbird/shared-types';
import { TemplatePreviewComponent } from '../../components/template-preview.component';

interface HeaderPair { key: string; value: string; }

@Component({
  standalone: true,
  selector: 'app-response-blocks',
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatFormFieldModule,
    MatInputModule,
    MatTooltipModule,
    MatSnackBarModule,
    TemplatePreviewComponent,
  ],
  template: `
    <!-- Drawer overlay -->
    @if (drawerOpen) {
      <div class="drawer-backdrop" (click)="closeDrawer()"></div>
      <div class="drawer-panel">
        <div class="drawer-head">
          <span class="drawer-title">{{ editingId ? 'Edit Block' : 'New Response Block' }}</span>
          <button class="drawer-close" (click)="closeDrawer()">
            <span class="material-icons">close</span>
          </button>
        </div>
        <div class="drawer-body">
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Name</mat-label>
            <input matInput [(ngModel)]="formName" placeholder="e.g. Standard 404" />
          </mat-form-field>

          <mat-form-field appearance="outline" style="width:160px">
            <mat-label>Status Code</mat-label>
            <input matInput type="number" [(ngModel)]="formStatus" min="100" max="599" />
          </mat-form-field>

          <div class="headers-section">
            <div class="headers-label">
              <span>Response Headers</span>
              <button class="add-header-btn" (click)="addHeader()" matTooltip="Add header">
                <span class="material-icons">add</span>
              </button>
            </div>
            @for (h of formHeaders; track $index; let i = $index) {
              <div class="header-row">
                <mat-form-field appearance="outline" class="header-key">
                  <mat-label>Key</mat-label>
                  <input matInput [(ngModel)]="formHeaders[i].key" />
                </mat-form-field>
                <mat-form-field appearance="outline" class="header-val">
                  <mat-label>Value</mat-label>
                  <input matInput [(ngModel)]="formHeaders[i].value" />
                </mat-form-field>
                <button class="remove-header-btn" (click)="removeHeader(i)" matTooltip="Remove">
                  <span class="material-icons">remove_circle_outline</span>
                </button>
              </div>
            }
          </div>

          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Body</mat-label>
            <textarea matInput rows="10" [(ngModel)]="formBody" placeholder='{"message": "OK"}'></textarea>
          </mat-form-field>

          <app-template-preview [template]="formBody"></app-template-preview>
        </div>
        <div class="drawer-foot">
          <button class="btn-cancel" (click)="closeDrawer()">Cancel</button>
          <button class="btn-save" [disabled]="saving || !formName || !formStatus" (click)="submit()">
            @if (saving) {
              <mat-spinner diameter="14" color="accent"></mat-spinner>
            }
            {{ editingId ? 'Save Changes' : 'Create' }}
          </button>
        </div>
      </div>
    }

    <!-- Page content -->
    <div class="page-wrap">
      <div class="page-header">
        <h1 class="page-title">Response Blocks</h1>
        <button class="btn-new" (click)="openNew()">
          <span class="material-icons">add</span> New Block
        </button>
      </div>

      @if (loading) {
        <div class="loading-center"><mat-spinner diameter="40"></mat-spinner></div>
      }

      @if (!loading && blocks.length === 0) {
        <div class="empty-state">
          <span class="material-icons empty-icon">layers</span>
          <p>No response blocks yet. Create one to share across endpoints.</p>
          <button class="btn-new" (click)="openNew()">
            <span class="material-icons">add</span> New Block
          </button>
        </div>
      }

      <div class="blocks-grid">
        @for (block of blocks; track block.id) {
          <div class="block-card">
            <div class="block-top">
              <span class="block-name">{{ block.name }}</span>
              <span class="status-badge" [class]="statusClass(block.statusCode)">{{ block.statusCode }}</span>
            </div>
            <pre class="block-body">{{ bodyPreview(block.body) }}</pre>
            <div class="block-actions">
              <button class="action-btn" (click)="copyBody(block)" matTooltip="Copy body">
                <span class="material-icons">content_copy</span>
              </button>
              <button class="action-btn" (click)="openEdit(block)" matTooltip="Edit">
                <span class="material-icons">edit</span>
              </button>
              <button class="action-btn action-btn-danger" (click)="deleteBlock(block.id)" matTooltip="Delete">
                <span class="material-icons">delete</span>
              </button>
            </div>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    /* ── Drawer overlay ─────────────────────────────────────── */
    .drawer-backdrop {
      position: fixed; inset: 0;
      background: rgba(15,23,42,0.4);
      backdrop-filter: blur(2px);
      z-index: 900;
    }
    .drawer-panel {
      position: fixed; top: 0; right: 0;
      width: 520px; height: 100vh;
      background: white;
      box-shadow: -4px 0 24px rgba(0,0,0,0.12);
      z-index: 901;
      display: flex; flex-direction: column;
    }
    .drawer-head {
      display: flex; align-items: center; justify-content: space-between;
      padding: 18px 20px;
      border-bottom: 1px solid #e2e8f0;
      flex-shrink: 0;
    }
    .drawer-title { font-size: 16px; font-weight: 600; color: #1e293b; }
    .drawer-close {
      background: none; border: none; cursor: pointer;
      color: #64748b; padding: 4px; border-radius: 4px;
      display: flex; align-items: center;
    }
    .drawer-close:hover { background: #f1f5f9; color: #1e293b; }
    .drawer-body {
      flex: 1; overflow-y: auto; padding: 20px;
      display: flex; flex-direction: column; gap: 14px;
    }
    .drawer-foot {
      padding: 16px 20px;
      border-top: 1px solid #e2e8f0;
      display: flex; justify-content: flex-end; gap: 10px;
      flex-shrink: 0;
    }
    .btn-cancel {
      background: none; border: 1px solid #cbd5e1; color: #475569;
      padding: 8px 20px; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 500;
    }
    .btn-cancel:hover { background: #f8fafc; }
    .btn-save {
      background: #6366f1; color: white; border: none;
      padding: 8px 20px; border-radius: 8px; cursor: pointer;
      font-size: 14px; font-weight: 500;
      display: flex; align-items: center; gap: 6px;
    }
    .btn-save:hover:not(:disabled) { background: #4f46e5; }
    .btn-save:disabled { background: #c7d2fe; cursor: not-allowed; }

    /* ── Headers sub-section ────────────────────────────────── */
    .headers-section { display: flex; flex-direction: column; gap: 6px; }
    .headers-label {
      display: flex; align-items: center; justify-content: space-between;
      font-size: 13px; font-weight: 600; color: #374151;
    }
    .add-header-btn {
      background: none; border: 1px solid #e2e8f0; cursor: pointer;
      color: #6366f1; border-radius: 6px; padding: 2px 6px;
      display: flex; align-items: center;
    }
    .add-header-btn:hover { background: #f5f3ff; }
    .header-row { display: flex; align-items: center; gap: 8px; }
    .header-key { flex: 1; }
    .header-val { flex: 2; }
    .remove-header-btn {
      background: none; border: none; cursor: pointer;
      color: #ef4444; padding: 4px; border-radius: 4px;
      display: flex; align-items: center; flex-shrink: 0;
    }
    .remove-header-btn:hover { background: #fef2f2; }
    .full-width { width: 100%; }

    /* ── Page layout ────────────────────────────────────────── */
    .page-wrap { padding: 0; }
    .page-header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 24px;
    }
    .page-title { margin: 0; font-size: 22px; font-weight: 700; color: #1e293b; }
    .btn-new {
      background: #6366f1; color: white; border: none;
      padding: 8px 18px; border-radius: 8px; cursor: pointer;
      font-size: 14px; font-weight: 500;
      display: flex; align-items: center; gap: 6px;
    }
    .btn-new:hover { background: #4f46e5; }
    .btn-new .material-icons { font-size: 18px; }
    .loading-center { display: flex; justify-content: center; padding: 60px; }

    /* ── Empty state ────────────────────────────────────────── */
    .empty-state {
      display: flex; flex-direction: column; align-items: center;
      gap: 12px; padding: 80px 0; color: #94a3b8;
    }
    .empty-icon { font-size: 48px; color: #cbd5e1; }
    .empty-state p { margin: 0; font-size: 14px; color: #64748b; }

    /* ── Block cards ────────────────────────────────────────── */
    .blocks-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 16px;
    }
    .block-card {
      background: white; border: 1px solid #e2e8f0; border-radius: 10px;
      padding: 16px; display: flex; flex-direction: column; gap: 10px;
    }
    .block-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .block-name { font-size: 14px; font-weight: 600; color: #1e293b; flex: 1; }
    .status-badge {
      padding: 2px 10px; border-radius: 12px;
      font-size: 12px; font-weight: 700; color: white; flex-shrink: 0;
    }
    .status-2xx { background: #22c55e; }
    .status-3xx { background: #3b82f6; }
    .status-4xx { background: #f59e0b; }
    .status-5xx { background: #ef4444; }
    .block-body {
      margin: 0; font-family: 'JetBrains Mono', monospace; font-size: 11px;
      color: #475569; background: #f8fafc; padding: 8px 10px; border-radius: 6px;
      white-space: pre-wrap; word-break: break-all; min-height: 36px;
      border: 1px solid #f1f5f9;
    }
    .block-actions { display: flex; gap: 4px; }
    .action-btn {
      background: none; border: none; cursor: pointer;
      color: #64748b; padding: 5px; border-radius: 6px;
      display: flex; align-items: center;
    }
    .action-btn .material-icons { font-size: 18px; }
    .action-btn:hover { background: #f1f5f9; color: #1e293b; }
    .action-btn-danger:hover { background: #fef2f2; color: #ef4444; }
  `],
})
export class ResponseBlocksComponent implements OnInit {
  blocks: ResponseBlockDto[] = [];
  loading = false;
  saving = false;
  drawerOpen = false;
  editingId: string | null = null;

  formName = '';
  formStatus = 200;
  formBody = '';
  formHeaders: HeaderPair[] = [];

  private api = inject(ApiService);
  private snack = inject(MatSnackBar);

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading = true;
    this.api.getResponseBlocks().subscribe({
      next: (blocks) => { this.blocks = blocks; this.loading = false; },
      error: () => { this.loading = false; },
    });
  }

  statusClass(code: number): string {
    if (code < 300) return 'status-2xx';
    if (code < 400) return 'status-3xx';
    if (code < 500) return 'status-4xx';
    return 'status-5xx';
  }

  bodyPreview(body?: string): string {
    if (!body) return '(empty)';
    return body.length > 120 ? body.slice(0, 120) + '…' : body;
  }

  openNew(): void {
    this.editingId = null;
    this.formName = '';
    this.formStatus = 200;
    this.formBody = '';
    this.formHeaders = [];
    this.drawerOpen = true;
  }

  openEdit(block: ResponseBlockDto): void {
    this.editingId = block.id;
    this.formName = block.name;
    this.formStatus = block.statusCode;
    this.formBody = block.body ?? '';
    this.formHeaders = Object.entries(block.headers ?? {}).map(([key, value]) => ({ key, value }));
    this.drawerOpen = true;
  }

  closeDrawer(): void { this.drawerOpen = false; }

  addHeader(): void { this.formHeaders = [...this.formHeaders, { key: '', value: '' }]; }

  removeHeader(i: number): void { this.formHeaders = this.formHeaders.filter((_, idx) => idx !== i); }

  headersToRecord(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const h of this.formHeaders) {
      if (h.key.trim()) result[h.key.trim()] = h.value;
    }
    return result;
  }

  submit(): void {
    const dto: CreateResponseBlockDto = {
      name: this.formName,
      statusCode: this.formStatus,
      headers: this.headersToRecord(),
      body: this.formBody || undefined,
    };
    this.saving = true;
    const req$ = this.editingId
      ? this.api.updateResponseBlock(this.editingId, dto)
      : this.api.createResponseBlock(dto);

    req$.subscribe({
      next: () => {
        this.saving = false;
        this.closeDrawer();
        this.load();
        this.snack.open(this.editingId ? 'Block updated' : 'Block created', '', { duration: 2000 });
      },
      error: () => {
        this.saving = false;
        this.snack.open('Failed to save block', 'OK', { duration: 3000 });
      },
    });
  }

  copyBody(block: ResponseBlockDto): void {
    navigator.clipboard.writeText(block.body ?? '').then(() => {
      this.snack.open('Copied to clipboard', '', { duration: 1500 });
    });
  }

  deleteBlock(id: string): void {
    if (!confirm('Delete this response block?')) return;
    this.api.deleteResponseBlock(id).subscribe({
      next: () => { this.blocks = this.blocks.filter(b => b.id !== id); },
      error: () => this.snack.open('Failed to delete block', 'OK', { duration: 3000 }),
    });
  }
}
