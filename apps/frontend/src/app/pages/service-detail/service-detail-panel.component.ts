import { Component, Input, OnInit, OnChanges, OnDestroy, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterOutlet, NavigationEnd, ActivatedRoute } from '@angular/router';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatMenuModule } from '@angular/material/menu';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { filter } from 'rxjs/operators';
import { Subscription } from 'rxjs';
import { ApiService } from '../../core/api.service';
import type { ServiceDto, EndpointDto } from '@mockingbird/shared-types';

@Component({
  standalone: true,
  selector: 'app-service-detail-panel',
  imports: [
    CommonModule,
    RouterOutlet,
    MatDialogModule,
    MatMenuModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
  ],
  template: `
    <!-- Panel 2: endpoints list (compact when endpoint is open) -->
    <div class="panel-endpoints" [class.compact]="!!activeEid">
      <div class="panel-header">
        <div class="svc-info">
          <span class="svc-name">{{ service?.name ?? '…' }}</span>
          <span class="svc-port">:{{ service?.port }}</span>
        </div>
        <div class="panel-actions">
          <button class="icon-btn" (click)="refreshSpec()" [disabled]="refreshing" title="Refresh spec">
            <span class="material-icons" [class.spin]="refreshing">refresh</span>
          </button>
          <button class="icon-btn" [matMenuTriggerFor]="svcMenu" title="Service options">
            <span class="material-icons">more_vert</span>
          </button>
        </div>
        <mat-menu #svcMenu="matMenu">
          <button mat-menu-item (click)="toggleCors()">
            <span class="material-icons mnu-icon">{{ corsEnabled ? 'toggle_on' : 'toggle_off' }}</span>
            CORS {{ corsEnabled ? 'Enabled' : 'Disabled' }}
          </button>
          <button mat-menu-item (click)="confirmDelete()" class="menu-danger">
            <span class="material-icons mnu-icon danger">delete</span>
            <span class="danger">Delete Service</span>
          </button>
        </mat-menu>
      </div>

      @if (loading) {
        <div class="panel-loading"><mat-spinner diameter="24"></mat-spinner></div>
      }

      <div class="panel-list">
        @for (ep of endpoints; track ep.id) {
          <div
            class="ep-item"
            [class.active]="activeEid === ep.id"
            [class.ep-disabled]="ep.disabled"
            (click)="navigate(ep.id)">
            <span class="method-tag method-{{ ep.method.toLowerCase() }}">{{ ep.method }}</span>
            <span class="ep-path">{{ ep.path }}</span>
            @if (ep.responseNode) {
              <span class="stmt-badge" title="Response configured">&#x2713;</span>
            }
          </div>
        }
        @if (!loading && endpoints.length === 0) {
          <div class="list-empty">No endpoints</div>
        }
      </div>
    </div>

    <!-- Right area: endpoint detail outlet -->
    <div class="detail-outlet">
      @if (!activeEid) {
        <div class="empty-detail">
          <span class="material-icons empty-icon">touch_app</span>
          <p>Select an endpoint to view details</p>
        </div>
      }
      <router-outlet />
    </div>
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: row;
      flex: 1;
      min-width: 0;
      overflow: hidden;
    }

    /* Endpoints list panel */
    .panel-endpoints {
      width: 220px;
      min-width: 220px;
      background: #FAFBFC;
      border-right: 1px solid #E2E8F0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      flex-shrink: 0;
      transition: width 0.2s ease, min-width 0.2s ease;
    }
    /* Compact mode when an endpoint is open */
    .panel-endpoints.compact { width: 140px; min-width: 140px; }
    .panel-endpoints.compact .svc-port { display: none; }
    .panel-endpoints.compact .stmt-badge { display: none; }
    .panel-header {
      display: flex;
      align-items: center;
      padding: 12px 12px 12px 14px;
      border-bottom: 1px solid #F1F5F9;
      flex-shrink: 0;
      gap: 4px;
    }
    .svc-info { flex: 1; min-width: 0; }
    .svc-name {
      display: block;
      font-size: 13.5px;
      font-weight: 600;
      color: #0F172A;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .svc-port { font-size: 11px; color: #94A3B8; font-family: 'JetBrains Mono', monospace; }
    .panel-actions { display: flex; gap: 2px; flex-shrink: 0; }
    .icon-btn {
      background: none;
      border: none;
      cursor: pointer;
      color: #94A3B8;
      padding: 4px;
      border-radius: 5px;
      display: flex;
      align-items: center;
    }
    .icon-btn .material-icons { font-size: 18px; }
    .icon-btn:hover:not(:disabled) { background: #F1F5F9; color: #475569; }
    .icon-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .spin { animation: spin 0.9s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .mnu-icon { font-size: 16px; margin-right: 8px; vertical-align: middle; }
    .danger { color: #EF4444; }
    .panel-loading { display: flex; justify-content: center; padding: 20px; }
    .panel-list { flex: 1; overflow-y: auto; padding: 4px 0; }
    .ep-item {
      display: flex;
      align-items: center;
      gap: 7px;
      padding: 7px 12px;
      cursor: pointer;
      transition: background 0.1s;
      min-width: 0;
    }
    .ep-item:hover { background: #F1F5F9; }
    .ep-item.active { background: #EEF2FF; }
    .ep-item.ep-disabled { opacity: 0.4; }
    .method-tag {
      font-size: 10px;
      font-weight: 700;
      padding: 2px 5px;
      border-radius: 4px;
      font-family: 'JetBrains Mono', monospace;
      white-space: nowrap;
      flex-shrink: 0;
      min-width: 44px;
      text-align: center;
    }
    .method-get    { background: #DCFCE7; color: #16A34A; }
    .method-post   { background: #DBEAFE; color: #1D4ED8; }
    .method-put    { background: #FEF9C3; color: #A16207; }
    .method-patch  { background: #FEF3C7; color: #B45309; }
    .method-delete { background: #FEE2E2; color: #DC2626; }
    .method-head   { background: #F3E8FF; color: #7C3AED; }
    .method-options { background: #F1F5F9; color: #64748B; }
    .ep-path {
      font-size: 12px;
      font-family: 'JetBrains Mono', monospace;
      color: #334155;
      flex: 1;
      min-width: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .ep-item.active .ep-path { color: #4F46E5; }
    .stmt-badge {
      font-size: 10px;
      font-weight: 600;
      background: #E0E7FF;
      color: #4338CA;
      border-radius: 10px;
      padding: 1px 6px;
      flex-shrink: 0;
    }
    .list-empty { padding: 20px 14px; font-size: 13px; color: #94A3B8; text-align: center; }

    /* Endpoint detail outlet */
    .detail-outlet {
      flex: 1;
      min-width: 0;
      overflow-y: auto;
      background: #ffffff;
      padding: 20px 24px;
      box-sizing: border-box;
    }
    .empty-detail {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 60px 0;
      pointer-events: none;
    }
    .empty-icon { font-size: 36px; color: #E2E8F0; }
    .empty-detail p { margin: 0; font-size: 13px; color: #94A3B8; }
  `],
})
export class ServiceDetailPanelComponent implements OnInit, OnChanges, OnDestroy {
  @Input() id!: string;

  service: ServiceDto | null = null;
  endpoints: EndpointDto[] = [];
  loading = false;
  refreshing = false;
  activeEid: string | null = null;

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private api = inject(ApiService);
  private dialog = inject(MatDialog);
  private snack = inject(MatSnackBar);
  private routerSub: Subscription | null = null;

  get corsEnabled(): boolean {
    return this.service?.cors?.enabled !== false;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['id'] && this.id) {
      this.service = null;
      this.endpoints = [];
      this.activeEid = null;
      this.loading = true;
      this.api.getService(this.id).subscribe({
        next: (svc) => { this.service = svc; this.loading = false; this.loadEndpoints(); },
        error: () => { this.loading = false; },
      });
    }
  }

  ngOnInit(): void {
    this.updateActiveEid();
    this.routerSub = this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe(() => this.updateActiveEid());
  }

  ngOnDestroy(): void { this.routerSub?.unsubscribe(); }

  private updateActiveEid(): void {
    this.activeEid = this.route.firstChild?.snapshot.params['eid'] ?? null;
  }

  loadEndpoints(): void {
    this.api.getEndpoints(this.id).subscribe({
      next: (eps) => { this.endpoints = eps; },
    });
  }

  navigate(eid: string): void {
    this.router.navigate(['/services', this.id, 'endpoints', eid]);
  }

  toggleCors(): void {
    if (!this.service) return;
    this.api.updateService(this.id, {
      cors: { ...this.service.cors, enabled: !this.corsEnabled },
    }).subscribe({ next: (svc) => { this.service = svc; } });
  }

  refreshSpec(): void {
    if (this.refreshing) return;
    this.refreshing = true;
    this.api.refreshSpec(this.id).subscribe({
      next: (r) => {
        this.refreshing = false;
        this.loadEndpoints();
        this.snack.open(`Spec refreshed — ${r.endpointCount} endpoints`, '', { duration: 2500 });
      },
      error: () => {
        this.refreshing = false;
        this.snack.open('Spec refresh failed', 'OK', { duration: 3000 });
      },
    });
  }

  confirmDelete(): void {
    if (!this.service) return;
    if (!confirm(`Delete service "${this.service.name}"? This cannot be undone.`)) return;
    this.api.deleteService(this.id).subscribe({
      next: () => { this.router.navigate(['/services']); },
      error: () => { this.snack.open('Failed to delete service', 'OK', { duration: 3000 }); },
    });
  }
}
