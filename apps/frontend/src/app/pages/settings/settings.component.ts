import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ApiService } from '../../core/api.service';
import type { HealthDto } from '@mockingbird/shared-types';

@Component({
  standalone: true,
  selector: 'app-settings',
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    MatTooltipModule,
  ],
  template: `
    <div class="page-header">
      <h1>Settings</h1>
      <button mat-stroked-button (click)="load()" [disabled]="loading">
        <mat-icon>refresh</mat-icon> Refresh
      </button>
    </div>

    @if (loading) {
      <div class="loading-center"><mat-spinner diameter="40"></mat-spinner></div>
    }

    @if (health) {
      <div class="settings-grid">
        <!-- Overall Status Card -->
        <mat-card class="status-card">
          <mat-card-header>
            <mat-card-title>System Status</mat-card-title>
          </mat-card-header>
          <mat-card-content>
            <div class="status-row">
              @if (health.status === 'ok') {
                <mat-icon class="status-icon ok">check_circle</mat-icon>
                <span class="status-text ok">All systems operational</span>
              } @else {
                <mat-icon class="status-icon degraded">warning</mat-icon>
                <span class="status-text degraded">Degraded</span>
              }
            </div>
            <div class="counts">
              <div class="count-item">
                <span class="count-number">{{ health.services.length }}</span>
                <span class="count-label">Services</span>
              </div>
              <div class="count-item">
                <span class="count-number">{{ health.modules.length }}</span>
                <span class="count-label">Modules</span>
              </div>
            </div>
          </mat-card-content>
        </mat-card>

        <!-- Services Status Card -->
        <mat-card class="services-card">
          <mat-card-header>
            <mat-card-title>Mock Servers</mat-card-title>
          </mat-card-header>
          <mat-card-content>
            @if (health.services.length === 0) {
              <p class="empty-msg">No services configured.</p>
            }
            @for (svc of health.services; track svc.id) {
              <div class="svc-row">
                <div class="svc-info">
                  <span class="svc-name">{{ svc.name }}</span>
                  <span class="svc-port">:{{ svc.port }}</span>
                </div>
                <div class="svc-status">
                  @if (svc.running) {
                    <mat-chip class="chip-running">Running</mat-chip>
                  } @else {
                    <mat-chip class="chip-stopped">Stopped</mat-chip>
                  }
                  @if (svc.specLoaded) {
                    <mat-icon class="spec-icon loaded" matTooltip="Spec loaded">description</mat-icon>
                  } @else {
                    <mat-icon class="spec-icon unloaded" matTooltip="Spec not loaded">description</mat-icon>
                  }
                </div>
              </div>
              <mat-divider></mat-divider>
            }
          </mat-card-content>
        </mat-card>

        <!-- Modules Status Card -->
        @if (health.modules.length > 0) {
          <mat-card class="modules-card">
            <mat-card-header>
              <mat-card-title>Module Health</mat-card-title>
            </mat-card-header>
            <mat-card-content>
              @for (mod of health.modules; track mod.id) {
                <div class="mod-row">
                  <span class="mod-name">{{ mod.name }}</span>
                  @switch (mod.health) {
                    @case ('healthy') {
                      <mat-icon class="health-icon healthy">check_circle</mat-icon>
                    }
                    @case ('unhealthy') {
                      <mat-icon class="health-icon unhealthy">cancel</mat-icon>
                    }
                    @case ('checking') {
                      <mat-spinner diameter="16"></mat-spinner>
                    }
                    @default {
                      <mat-icon class="health-icon unchecked">remove</mat-icon>
                    }
                  }
                </div>
                <mat-divider></mat-divider>
              }
            </mat-card-content>
          </mat-card>
        }
      </div>
    }

    @if (error) {
      <p class="error-msg">{{ error }}</p>
    }
  `,
  styles: [`
    .page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; }
    .page-header h1 { margin: 0; }
    .loading-center { display: flex; justify-content: center; padding: 40px; }
    .settings-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }
    .status-card mat-card-content,
    .services-card mat-card-content,
    .modules-card mat-card-content { padding: 0 16px 16px; }
    .status-row { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; }
    .status-icon { font-size: 24px; width: 24px; height: 24px; }
    .status-icon.ok { color: #22c55e; }
    .status-icon.degraded { color: #f59e0b; }
    .status-text.ok { color: #22c55e; font-weight: 600; }
    .status-text.degraded { color: #f59e0b; font-weight: 600; }
    .counts { display: flex; gap: 24px; }
    .count-item { display: flex; flex-direction: column; align-items: center; }
    .count-number { font-size: 32px; font-weight: 700; color: #1e293b; }
    .count-label { font-size: 12px; color: #64748b; }
    .svc-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 0; }
    .svc-info { display: flex; align-items: baseline; gap: 4px; }
    .svc-name { font-weight: 500; }
    .svc-port { color: #64748b; font-size: 13px; }
    .svc-status { display: flex; align-items: center; gap: 8px; }
    .chip-running { background: #dcfce7 !important; color: #166534 !important; }
    .chip-stopped { background: #fee2e2 !important; color: #991b1b !important; }
    .spec-icon { font-size: 18px; width: 18px; height: 18px; }
    .spec-icon.loaded { color: #3b82f6; }
    .spec-icon.unloaded { color: #cbd5e1; }
    .mod-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 0; }
    .mod-name { font-weight: 500; }
    .health-icon { font-size: 20px; width: 20px; height: 20px; }
    .health-icon.healthy { color: #22c55e; }
    .health-icon.unhealthy { color: #ef4444; }
    .health-icon.unchecked { color: #94a3b8; }
    .empty-msg { color: #94a3b8; font-style: italic; }
    .error-msg { color: #ef4444; }
  `]
})
export class SettingsComponent implements OnInit {
  health: HealthDto | null = null;
  loading = false;
  error = '';

  private api = inject(ApiService);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.error = '';
    this.api.getHealth().subscribe({
      next: (h) => { this.health = h; this.loading = false; },
      error: (e) => { this.error = e.message ?? 'Failed to load health'; this.loading = false; },
    });
  }
}
