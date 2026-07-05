import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDividerModule } from '@angular/material/divider';
import { ApiService } from '../../core/api.service';
import type { DataStoreDto, DataStoreRecordDto } from '@mockingbird/shared-types';

@Component({
  standalone: true,
  selector: 'app-data-store-detail',
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatFormFieldModule,
    MatInputModule,
    MatTooltipModule,
    MatSnackBarModule,
    MatDividerModule,
  ],
  template: `
    <div class="detail-page">
      @if (loading) {
        <div class="loading-center"><mat-spinner diameter="40"></mat-spinner></div>
      }

      @if (!loading && !store) {
        <div class="not-found">
          <p>Data store not found.</p>
          <a routerLink="/data-stores">&larr; Back to Data Stores</a>
        </div>
      }

      @if (store) {
        <div class="detail-header">
          <a routerLink="/data-stores" class="back-link">
            <mat-icon>arrow_back</mat-icon>
            <span>Data Stores</span>
          </a>
          <h1>{{ store.name }}</h1>
          <span class="header-spacer"></span>
          <span class="record-count-badge">{{ records.length }} live record(s)</span>
        </div>

        <section class="section">
          <div class="section-header">
            <h3>Seed Data</h3>
          </div>
          <p class="hint">
            Starting records applied automatically the first time this store is used after a restart.
            Never silently reapplied over live data on a config reload.
          </p>
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Seed Records (JSON object, keyed by record key)</mat-label>
            <textarea matInput rows="6" [(ngModel)]="seedText" placeholder='{"1": {"id": "1", "name": "Widget"}}'></textarea>
          </mat-form-field>
          @if (seedError) {
            <p class="error-text">{{ seedError }}</p>
          }
          <div class="button-row">
            <button mat-stroked-button (click)="saveSeedText()" [disabled]="savingSeed">
              @if (savingSeed) { <mat-spinner diameter="14"></mat-spinner> }
              Save Seed Data
            </button>
            <button mat-stroked-button (click)="saveCurrentAsSeed()" [disabled]="savingSeed">
              <mat-icon>bookmark_add</mat-icon> Save Current as Seed
            </button>
            <button mat-stroked-button (click)="resetToSeedData()" [disabled]="savingSeed">
              <mat-icon>restart_alt</mat-icon> Reset to Seed Data
            </button>
          </div>
        </section>

        <mat-divider></mat-divider>

        <section class="section">
          <div class="section-header">
            <h3>Live Records</h3>
            <div class="header-actions">
              <button mat-icon-button (click)="loadRecords()" matTooltip="Refresh">
                <mat-icon>refresh</mat-icon>
              </button>
              <button mat-stroked-button color="warn" (click)="clearAll()" [disabled]="records.length === 0">
                <mat-icon>delete_sweep</mat-icon> Clear All
              </button>
            </div>
          </div>

          @if (loadingRecords) {
            <div class="loading-center"><mat-spinner diameter="28"></mat-spinner></div>
          }

          @if (!loadingRecords && records.length === 0) {
            <p class="hint">No live records yet. Records appear here once a workflow's store_save action runs against this store.</p>
          }

          @for (record of records; track record.key) {
            <div class="record-row">
              <div class="record-body">
                <span class="record-key">{{ record.key }}</span>
                <pre class="record-value">{{ pretty(record.value) }}</pre>
              </div>
              <button mat-icon-button color="warn" (click)="deleteRecord(record.key)" matTooltip="Delete record">
                <mat-icon>delete</mat-icon>
              </button>
            </div>
          }
        </section>
      }
    </div>
  `,
  styles: [`
    .detail-page { padding: 24px; max-width: 900px; }
    .loading-center { display: flex; justify-content: center; padding: 40px; }
    .not-found { padding: 40px; text-align: center; color: #64748b; }
    .detail-header { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; }
    .back-link { display: flex; align-items: center; gap: 4px; color: #6366F1; text-decoration: none; font-weight: 500; font-size: 13px; margin-right: 8px; }
    .back-link:hover { text-decoration: underline; }
    .detail-header h1 { margin: 0; font-size: 22px; }
    .header-spacer { flex: 1; }
    .record-count-badge { font-size: 12px; font-weight: 700; color: #6366f1; background: #eef2ff; padding: 3px 10px; border-radius: 12px; }
    .section { padding: 20px 0; }
    .section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
    .section-header h3 { margin: 0; font-size: 15px; }
    .header-actions { display: flex; align-items: center; gap: 4px; }
    .hint { font-size: 12px; color: #64748b; margin: 0 0 8px; }
    .error-text { font-size: 12px; color: #ef4444; margin: -4px 0 8px; }
    .full-width { width: 100%; }
    .button-row { display: flex; gap: 8px; flex-wrap: wrap; }
    .record-row { display: flex; align-items: flex-start; gap: 8px; padding: 8px 0; border-bottom: 1px solid #f1f5f9; }
    .record-body { flex: 1; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .record-key { font-weight: 600; font-size: 13px; font-family: 'JetBrains Mono', monospace; color: #1e293b; }
    .record-value { margin: 0; font-family: 'JetBrains Mono', monospace; font-size: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px; white-space: pre-wrap; word-break: break-all; color: #334155; }
  `]
})
export class DataStoreDetailComponent implements OnInit {
  store: DataStoreDto | null = null;
  loading = false;
  loadingRecords = false;
  savingSeed = false;
  records: DataStoreRecordDto[] = [];
  seedText = '';
  seedError = '';

  private id = '';
  private route = inject(ActivatedRoute);
  private api = inject(ApiService);
  private snack = inject(MatSnackBar);

  ngOnInit(): void {
    this.id = this.route.snapshot.paramMap.get('id')!;
    this.loading = true;
    this.api.getDataStores().subscribe({
      next: (stores) => {
        this.store = stores.find(s => s.id === this.id) ?? null;
        this.seedText = JSON.stringify(this.store?.seedRecords ?? {}, null, 2);
        this.loading = false;
        this.loadRecords();
      },
      error: () => { this.loading = false; },
    });
  }

  loadRecords(): void {
    this.loadingRecords = true;
    this.api.getDataStoreRecords(this.id).subscribe({
      next: (records) => { this.records = records; this.loadingRecords = false; },
      error: () => { this.loadingRecords = false; },
    });
  }

  pretty(value: unknown): string {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  saveSeedText(): void {
    this.seedError = '';
    let seedRecords: Record<string, unknown>;
    try {
      seedRecords = JSON.parse(this.seedText || '{}');
    } catch {
      this.seedError = 'Seed data must be valid JSON.';
      return;
    }
    this.savingSeed = true;
    this.api.updateDataStore(this.id, { seedRecords }).subscribe({
      next: (store) => {
        this.store = store;
        this.savingSeed = false;
        this.snack.open('Seed data saved', '', { duration: 2000 });
      },
      error: () => {
        this.savingSeed = false;
        this.snack.open('Failed to save seed data', 'OK', { duration: 3000 });
      },
    });
  }

  saveCurrentAsSeed(): void {
    this.savingSeed = true;
    this.api.saveDataStoreSeed(this.id).subscribe({
      next: (store) => {
        this.store = store;
        this.seedText = JSON.stringify(store.seedRecords ?? {}, null, 2);
        this.savingSeed = false;
        this.snack.open('Current records saved as seed data', '', { duration: 2000 });
      },
      error: () => {
        this.savingSeed = false;
        this.snack.open('Failed to save current records as seed', 'OK', { duration: 3000 });
      },
    });
  }

  resetToSeedData(): void {
    if (!confirm('Reset this store to its seed data? All other live records will be lost.')) return;
    this.savingSeed = true;
    this.api.resetDataStoreToSeed(this.id).subscribe({
      next: () => {
        this.savingSeed = false;
        this.loadRecords();
        this.snack.open('Reset to seed data', '', { duration: 2000 });
      },
      error: () => {
        this.savingSeed = false;
        this.snack.open('Failed to reset to seed data', 'OK', { duration: 3000 });
      },
    });
  }

  clearAll(): void {
    if (!confirm('Clear all live records in this store?')) return;
    this.api.clearDataStoreRecords(this.id).subscribe({
      next: () => this.loadRecords(),
      error: () => this.snack.open('Failed to clear records', 'OK', { duration: 3000 }),
    });
  }

  deleteRecord(key: string): void {
    this.api.deleteDataStoreRecord(this.id, key).subscribe({
      next: () => { this.records = this.records.filter(r => r.key !== key); },
      error: () => this.snack.open('Failed to delete record', 'OK', { duration: 3000 }),
    });
  }
}
