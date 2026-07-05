import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { MatTabsModule } from '@angular/material/tabs';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatListModule } from '@angular/material/list';
import { ApiService } from '../../core/api.service';
import type { ServiceDto, EndpointDto } from '@mockingbird/shared-types';

@Component({
  standalone: true,
  selector: 'app-service-detail',
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    MatTabsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatDialogModule,
    MatSlideToggleModule,
    MatFormFieldModule,
    MatInputModule,
    MatTooltipModule,
    MatListModule,
  ],
  template: `
    <div class="service-header">
      <button mat-icon-button routerLink="/services">
        <mat-icon>arrow_back</mat-icon>
      </button>
      <h1>{{ service?.name }}</h1>
      @if (service) {
        <mat-chip>Port {{ service.port }}</mat-chip>
      }
    </div>

    @if (loading) {
      <div class="loading-center"><mat-spinner diameter="40"></mat-spinner></div>
    }

    @if (service) {
      <mat-tab-group>
        <!-- Endpoints Tab -->
        <mat-tab label="Endpoints">
          <div class="tab-content">
            @if (endpointsLoading) {
              <mat-spinner diameter="32"></mat-spinner>
            }
            @for (group of endpointGroups; track group.method) {
              <div class="method-group">
                <div class="method-header">
                  <span class="method-pill method-{{group.method}}">{{group.method}}</span>
                </div>
                <mat-list>
                  @for (ep of group.endpoints; track ep.id) {
                    <mat-list-item class="endpoint-item" (click)="navigateEndpoint(ep.id)">
                      <span>{{ ep.path }}</span>
                      <span class="stmt-count">{{ ep.responseNode ? 'response configured' : 'no response' }}</span>
                    </mat-list-item>
                  }
                </mat-list>
              </div>
            }
          </div>
        </mat-tab>

        <!-- Settings Tab -->
        <mat-tab label="Settings">
          <div class="tab-content settings-form">
            <h3>CORS</h3>
            <mat-slide-toggle
              [checked]="service.cors?.enabled !== false"
              (change)="toggleCors($event.checked)">
              CORS Enabled
            </mat-slide-toggle>

            <h3>Spec Source</h3>
            <p class="spec-info">
              <strong>Type:</strong> {{ service.spec?.type }}<br>
              @if (service.spec?.url) {
                <strong>URL:</strong> {{ service.spec.url }}
              }
            </p>
            <button mat-stroked-button (click)="refreshSpec()" [disabled]="refreshing">
              @if (refreshing) { <mat-spinner diameter="16"></mat-spinner> }
              Refresh Spec
            </button>
            @if (refreshResult) {
              <p class="success-msg">Refreshed — {{ refreshResult }} endpoints</p>
            }

            <div class="danger-zone">
              <h3>Danger Zone</h3>
              <button mat-raised-button color="warn" (click)="confirmDelete()">
                <mat-icon>delete</mat-icon> Delete Service
              </button>
            </div>
          </div>
        </mat-tab>
      </mat-tab-group>
    }
  `,
  styles: [`
    .service-header { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; }
    .service-header h1 { margin: 0; font-size: 20px; font-weight: 700; color: #0F172A; }
    .loading-center { display: flex; justify-content: center; padding: 40px; }
    .tab-content { padding: 20px 0; }
    .method-group { margin-bottom: 20px; }
    .method-header { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
    .endpoint-item { cursor: pointer; border-radius: 8px; border: 1px solid #F1F5F9; margin-bottom: 4px; font-family: 'JetBrains Mono', monospace; font-size: 13px; }
    .endpoint-item:hover { background: #F8FAFC; border-color: #E2E8F0; }
    .stmt-count { font-size: 11px; color: #94A3B8; margin-left: auto; }
    .settings-form { max-width: 480px; display: flex; flex-direction: column; gap: 16px; }
    .spec-info { background: #f8fafc; padding: 12px; border-radius: 4px; }
    .danger-zone { margin-top: 24px; padding-top: 16px; border-top: 1px solid #fca5a5; }
    .success-msg { color: #22c55e; }
  `]
})
export class ServiceDetailComponent implements OnInit {
  service: ServiceDto | null = null;
  endpoints: EndpointDto[] = [];
  loading = false;
  endpointsLoading = false;
  refreshing = false;
  refreshResult: number | null = null;

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private api = inject(ApiService);
  private dialog = inject(MatDialog);

  get endpointGroups(): { method: string; endpoints: EndpointDto[] }[] {
    const map = new Map<string, EndpointDto[]>();
    for (const ep of this.endpoints) {
      const list = map.get(ep.method) ?? [];
      list.push(ep);
      map.set(ep.method, list);
    }
    return Array.from(map.entries()).map(([method, endpoints]) => ({ method, endpoints }));
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.loading = true;
    this.api.getService(id).subscribe({
      next: (svc) => { this.service = svc; this.loading = false; this.loadEndpoints(id); },
      error: () => { this.loading = false; },
    });
  }

  loadEndpoints(id: string): void {
    this.endpointsLoading = true;
    this.api.getEndpoints(id).subscribe({
      next: (eps) => { this.endpoints = eps; this.endpointsLoading = false; },
      error: () => { this.endpointsLoading = false; },
    });
  }

  navigateEndpoint(eid: string): void {
    this.router.navigate(['/services', this.service!.id, 'endpoints', eid]);
  }

  toggleCors(enabled: boolean): void {
    if (!this.service) return;
    this.api.updateService(this.service.id, {
      cors: { ...this.service.cors, enabled },
    }).subscribe({ next: (svc) => { this.service = svc; } });
  }

  refreshSpec(): void {
    if (!this.service) return;
    this.refreshing = true;
    this.api.refreshSpec(this.service.id).subscribe({
      next: (r) => { this.refreshing = false; this.refreshResult = r.endpointCount; },
      error: () => { this.refreshing = false; },
    });
  }

  confirmDelete(): void {
    if (!confirm(`Delete service "${this.service?.name}"? This cannot be undone.`)) return;
    this.api.deleteService(this.service!.id).subscribe({
      next: () => this.router.navigate(['/services']),
    });
  }
}
