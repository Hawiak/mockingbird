import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatStepperModule } from '@angular/material/stepper';
import { MatRadioModule } from '@angular/material/radio';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import type { ServiceDto, CreateServiceDto } from '@mockingbird/shared-types';
import { AddServiceDialogComponent } from './add-service-dialog.component';

@Component({
  standalone: true,
  selector: 'app-services',
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatDialogModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    MatTooltipModule,
    MatMenuModule,
  ],
  template: `
    <div class="page-header">
      <h1>Services</h1>
      <div class="header-actions">
        <button mat-stroked-button [matMenuTriggerFor]="exportMenu">
          <span class="material-icons" style="font-size:16px;vertical-align:middle;margin-right:4px">download</span>
          Export
        </button>
        <mat-menu #exportMenu="matMenu">
          <a mat-menu-item href="/api/export/postman" download="mockingbird-postman.json">
            <span class="material-icons" style="font-size:16px">description</span>
            Postman Collection
          </a>
          <a mat-menu-item href="/api/export/bruno" download="mockingbird-bruno.zip">
            <span class="material-icons" style="font-size:16px">folder_zip</span>
            Bruno Collection
          </a>
        </mat-menu>
        <button mat-flat-button color="primary" (click)="openAddDialog()">
          <mat-icon>add</mat-icon>
          Add service
        </button>
      </div>
    </div>

    @if (loading) {
      <div class="loading-center"><mat-spinner diameter="36"></mat-spinner></div>
    }
    @if (error) {
      <div class="error-banner">{{ error }}</div>
    }

    <div class="services-grid">
      @for (svc of services; track svc.id) {
        <div class="service-card" (click)="navigate(svc.id)">
          <div class="card-top">
            <div class="card-title">{{ svc.name }}</div>
            <div class="card-port mono">:{{ svc.port }}</div>
          </div>
          <div class="card-meta">
            <span class="meta-item">
              <span class="material-icons meta-icon">api</span>
              {{ svc.endpoints?.length ?? 0 }} endpoints
            </span>
            <span class="meta-item">
              <span class="material-icons meta-icon">link</span>
              {{ svc.spec.type }}
            </span>
          </div>
          <div class="card-footer">
            <span class="status-dot running"></span>
            <span class="status-text">Running</span>
            <span class="card-arrow material-icons">chevron_right</span>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .header-actions { display: flex; gap: 8px; align-items: center; }
    .loading-center { display: flex; justify-content: center; padding: 60px; }
    .error-banner { background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.2); color: #DC2626; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; font-size: 14px; }
    .services-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; }
    .service-card { background: #ffffff; border: 1px solid #E2E8F0; border-radius: 12px; padding: 20px; cursor: pointer; transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s; display: flex; flex-direction: column; gap: 14px; }
    .service-card:hover { border-color: #6366F1; box-shadow: 0 4px 16px rgba(99,102,241,0.12); transform: translateY(-1px); }
    .card-top { display: flex; align-items: flex-start; justify-content: space-between; }
    .card-title { font-size: 16px; font-weight: 600; color: #0F172A; }
    .card-port { font-size: 13px; color: #64748B; }
    .card-meta { display: flex; gap: 16px; }
    .meta-item { display: flex; align-items: center; gap: 5px; font-size: 13px; color: #64748B; }
    .meta-icon { font-size: 14px !important; }
    .card-footer { display: flex; align-items: center; gap: 6px; padding-top: 4px; border-top: 1px solid #F1F5F9; }
    .status-dot { width: 7px; height: 7px; border-radius: 50%; background: #10B981; }
    .status-text { font-size: 12px; color: #10B981; font-weight: 500; flex: 1; }
    .card-arrow { font-size: 18px !important; color: #CBD5E1; }
  `]
})
export class ServicesComponent implements OnInit {
  services: ServiceDto[] = [];
  loading = false;
  error = '';

  private api = inject(ApiService);
  private dialog = inject(MatDialog);
  private router = inject(Router);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.api.getServices().subscribe({
      next: (svcs) => { this.services = svcs; this.loading = false; },
      error: (e) => { this.error = e.message; this.loading = false; },
    });
  }

  navigate(id: string): void {
    this.router.navigate(['/services', id]);
  }

  openAddDialog(): void {
    const ref = this.dialog.open(AddServiceDialogComponent, { width: '600px' });
    ref.afterClosed().subscribe((created: ServiceDto | undefined) => {
      if (created) {
        this.router.navigate(['/services', created.id]);
      }
    });
  }
}
