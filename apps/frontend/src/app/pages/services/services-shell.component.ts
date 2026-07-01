import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterOutlet, NavigationEnd, ActivatedRoute } from '@angular/router';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatMenuModule } from '@angular/material/menu';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { filter } from 'rxjs/operators';
import { Subscription } from 'rxjs';
import { ApiService } from '../../core/api.service';
import type { ServiceDto } from '@mockingbird/shared-types';
import { AddServiceDialogComponent } from './add-service-dialog.component';

@Component({
  standalone: true,
  selector: 'app-services-shell',
  imports: [
    CommonModule,
    RouterOutlet,
    MatDialogModule,
    MatMenuModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <!-- Panel 1: services list -->
    <div class="panel-services">
      <div class="panel-header">
        <span class="panel-title">Services</span>
        <div class="panel-actions">
          <button class="icon-btn" [matMenuTriggerFor]="exportMenu" title="Export">
            <span class="material-icons">download</span>
          </button>
          <button class="icon-btn" (click)="openAdd()" title="Add service">
            <span class="material-icons">add</span>
          </button>
        </div>
        <mat-menu #exportMenu="matMenu">
          <a mat-menu-item href="/api/export/postman" download="mockingbird-postman.json">
            <span class="material-icons" style="font-size:16px;margin-right:6px">description</span>Postman Collection
          </a>
          <a mat-menu-item href="/api/export/bruno" download="mockingbird-bruno.zip">
            <span class="material-icons" style="font-size:16px;margin-right:6px">folder_zip</span>Bruno Collection
          </a>
        </mat-menu>
      </div>

      @if (loading) {
        <div class="panel-loading"><mat-spinner diameter="24"></mat-spinner></div>
      }

      <div class="panel-list">
        @for (svc of services; track svc.id) {
          <div class="list-item" [class.active]="activeId === svc.id" (click)="navigate(svc.id)">
            <div class="item-dot" [class.dot-active]="activeId === svc.id"></div>
            <div class="item-body">
              <span class="item-name">{{ svc.name }}</span>
              <span class="item-port">:{{ svc.port }}</span>
            </div>
          </div>
        }
        @if (!loading && services.length === 0) {
          <div class="list-empty">No services yet</div>
        }
      </div>
    </div>

    <!-- Right area: child route outlet -->
    <div class="panel-outlet">
      @if (!activeId) {
        <div class="empty-panel">
          <span class="material-icons empty-icon">dns</span>
          <p>Select a service to view its endpoints</p>
        </div>
      }
      <router-outlet />
    </div>
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: row;
      margin: -24px -28px;
      height: calc(100% + 48px);
      overflow: hidden;
    }

    /* Services list panel */
    .panel-services {
      width: 180px;
      min-width: 180px;
      background: #ffffff;
      border-right: 1px solid #E2E8F0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      flex-shrink: 0;
    }
    .panel-header {
      display: flex;
      align-items: center;
      padding: 14px 14px 14px 16px;
      border-bottom: 1px solid #F1F5F9;
      flex-shrink: 0;
      gap: 4px;
    }
    .panel-title {
      flex: 1;
      font-size: 11px;
      font-weight: 700;
      color: #64748B;
      text-transform: uppercase;
      letter-spacing: 0.8px;
    }
    .panel-actions { display: flex; gap: 2px; }
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
    .icon-btn:hover { background: #F1F5F9; color: #475569; }
    .panel-loading { display: flex; justify-content: center; padding: 20px; }
    .panel-list { flex: 1; overflow-y: auto; padding: 6px 0; }
    .list-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 9px 14px;
      cursor: pointer;
      transition: background 0.1s;
    }
    .list-item:hover { background: #F8FAFC; }
    .list-item.active { background: #EEF2FF; }
    .item-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #10B981;
      flex-shrink: 0;
      transition: box-shadow 0.1s;
    }
    .item-dot.dot-active { box-shadow: 0 0 0 2px #EEF2FF, 0 0 0 3px #6366F1; }
    .item-body { display: flex; flex-direction: column; min-width: 0; }
    .item-name {
      font-size: 13.5px;
      font-weight: 500;
      color: #1E293B;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .list-item.active .item-name { color: #4F46E5; font-weight: 600; }
    .item-port { font-size: 11px; color: #94A3B8; font-family: 'JetBrains Mono', monospace; }
    .list-empty { padding: 20px 16px; font-size: 13px; color: #94A3B8; text-align: center; }

    /* Outlet */
    .panel-outlet {
      flex: 1;
      min-width: 0;
      display: flex;
      overflow: hidden;
      position: relative;
    }
    .empty-panel {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 10px;
      color: #CBD5E1;
      pointer-events: none;
    }
    .empty-icon { font-size: 40px; color: #E2E8F0; }
    .empty-panel p { margin: 0; font-size: 13px; color: #94A3B8; }
  `],
})
export class ServicesShellComponent implements OnInit, OnDestroy {
  services: ServiceDto[] = [];
  loading = false;
  activeId: string | null = null;

  private api = inject(ApiService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private dialog = inject(MatDialog);
  private routerSub: Subscription | null = null;

  ngOnInit(): void {
    this.load();
    this.updateState();
    this.routerSub = this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe(() => {
        const prev = this.activeId;
        this.updateState();
        if (!this.activeId && prev !== null) this.load();
      });
  }

  ngOnDestroy(): void { this.routerSub?.unsubscribe(); }

  private updateState(): void {
    this.activeId = this.route.firstChild?.snapshot.params['id'] ?? null;
  }

  load(): void {
    this.loading = true;
    this.api.getServices().subscribe({
      next: (svcs) => { this.services = svcs; this.loading = false; },
      error: () => { this.loading = false; },
    });
  }

  navigate(id: string): void {
    this.router.navigate(['/services', id]);
  }

  openAdd(): void {
    const ref = this.dialog.open(AddServiceDialogComponent, { width: '600px' });
    ref.afterClosed().subscribe((created: ServiceDto | undefined) => {
      if (created) {
        this.services = [...this.services, created];
        this.router.navigate(['/services', created.id]);
      }
    });
  }
}
