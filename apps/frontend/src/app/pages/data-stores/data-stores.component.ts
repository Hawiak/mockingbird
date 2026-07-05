import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ApiService } from '../../core/api.service';
import type { DataStoreDto, CreateDataStoreDto } from '@mockingbird/shared-types';

@Component({
  standalone: true,
  selector: 'app-data-stores',
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSidenavModule,
    MatFormFieldModule,
    MatInputModule,
    MatTooltipModule,
    MatSnackBarModule,
  ],
  template: `
    <mat-sidenav-container class="page-container">
      <mat-sidenav #drawer mode="over" position="end" class="store-drawer">
        <div class="drawer-header">
          <h3>{{ editingId ? 'Edit Data Store' : 'Add Data Store' }}</h3>
          <button mat-icon-button (click)="drawer.close()"><mat-icon>close</mat-icon></button>
        </div>
        <div class="drawer-body">
          <form [formGroup]="form" (ngSubmit)="submitForm(drawer)">
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Name</mat-label>
              <input matInput formControlName="name" placeholder="e.g. Orders" />
            </mat-form-field>
            <p class="drawer-hint">Seed data and live records are managed on the store's own page after it's created.</p>
            <div class="form-actions">
              <button mat-button type="button" (click)="drawer.close()">Cancel</button>
              <button mat-raised-button color="primary" type="submit" [disabled]="form.invalid || saving">
                @if (saving) { <mat-spinner diameter="16"></mat-spinner> }
                {{ editingId ? 'Save' : 'Create' }}
              </button>
            </div>
          </form>
        </div>
      </mat-sidenav>

      <mat-sidenav-content class="content-area">
        <div class="page-header">
          <h1>Data Stores</h1>
          <button mat-fab color="primary" (click)="openNew(drawer)" matTooltip="Add Data Store">
            <mat-icon>add</mat-icon>
          </button>
        </div>

        @if (loading) {
          <div class="loading-center"><mat-spinner diameter="40"></mat-spinner></div>
        }

        @if (!loading && stores.length === 0) {
          <div class="empty-state">
            <mat-icon class="empty-icon">storage</mat-icon>
            <p>No data stores yet. Create one to give your mocks persistent, stateful records.</p>
          </div>
        }

        <div class="stores-grid">
          @for (store of stores; track store.id) {
            <mat-card class="store-card">
              <mat-card-header>
                <mat-card-title>
                  <a [routerLink]="['/data-stores', store.id]" class="card-title-link">{{ store.name }}</a>
                </mat-card-title>
              </mat-card-header>
              <mat-card-content>
                <p class="record-count">{{ store.recordCount }} record(s)</p>
              </mat-card-content>
              <mat-card-actions>
                <a mat-icon-button [routerLink]="['/data-stores', store.id]" matTooltip="Open">
                  <mat-icon>open_in_new</mat-icon>
                </a>
                <button mat-icon-button (click)="openEdit(store, drawer)" matTooltip="Edit">
                  <mat-icon>edit</mat-icon>
                </button>
                <button mat-icon-button color="warn" (click)="deleteStore(store.id)" matTooltip="Delete">
                  <mat-icon>delete</mat-icon>
                </button>
              </mat-card-actions>
            </mat-card>
          }
        </div>
      </mat-sidenav-content>
    </mat-sidenav-container>
  `,
  styles: [`
    .page-container { height: calc(100vh - 64px); }
    .store-drawer { width: 420px; }
    .drawer-header { display: flex; align-items: center; justify-content: space-between; padding: 16px; border-bottom: 1px solid #e2e8f0; }
    .drawer-header h3 { margin: 0; }
    .drawer-body { padding: 16px; overflow-y: auto; height: calc(100% - 64px); }
    .drawer-hint { font-size: 12px; color: #64748b; margin: 8px 0 0; }
    .content-area { padding: 24px; }
    .page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; }
    .page-header h1 { margin: 0; }
    .loading-center { display: flex; justify-content: center; padding: 40px; }
    .empty-state { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 60px 0; color: #94a3b8; }
    .empty-icon { font-size: 40px; width: 40px; height: 40px; color: #cbd5e1; }
    .stores-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
    .store-card mat-card-content { padding: 0 16px 8px; }
    .card-title-link { color: inherit; text-decoration: none; }
    .card-title-link:hover { text-decoration: underline; }
    .record-count { font-size: 13px; color: #64748b; margin: 8px 0; }
    .full-width { width: 100%; }
    .form-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 8px; }
  `]
})
export class DataStoresComponent implements OnInit {
  stores: DataStoreDto[] = [];
  loading = false;
  saving = false;
  editingId: string | null = null;

  private api = inject(ApiService);
  private snack = inject(MatSnackBar);
  private fb = inject(FormBuilder);

  form = this.fb.group({
    name: ['', Validators.required],
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.api.getDataStores().subscribe({
      next: (stores) => { this.stores = stores; this.loading = false; },
      error: () => { this.loading = false; },
    });
  }

  openNew(drawer: any): void {
    this.editingId = null;
    this.form.reset({ name: '' });
    drawer.open();
  }

  openEdit(store: DataStoreDto, drawer: any): void {
    this.editingId = store.id;
    this.form.patchValue({ name: store.name });
    drawer.open();
  }

  submitForm(drawer: any): void {
    if (this.form.invalid) return;
    const v = this.form.value;
    const dto: CreateDataStoreDto = { name: v.name! };
    this.saving = true;
    const req$ = this.editingId
      ? this.api.updateDataStore(this.editingId, dto)
      : this.api.createDataStore(dto);

    req$.subscribe({
      next: () => {
        this.saving = false;
        drawer.close();
        this.load();
        this.snack.open(this.editingId ? 'Data store updated' : 'Data store created', '', { duration: 2000 });
      },
      error: () => {
        this.saving = false;
        this.snack.open('Failed to save data store', 'OK', { duration: 3000 });
      },
    });
  }

  deleteStore(id: string): void {
    if (!confirm('Delete this data store? All live records will be lost.')) return;
    this.api.deleteDataStore(id).subscribe({
      next: () => { this.stores = this.stores.filter(s => s.id !== id); },
      error: () => this.snack.open('Failed to delete data store', 'OK', { duration: 3000 }),
    });
  }
}
