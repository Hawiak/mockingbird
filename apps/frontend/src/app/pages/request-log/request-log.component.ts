import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatDividerModule } from '@angular/material/divider';
import { Subscription } from 'rxjs';
import { LogSocketService } from '../../core/log-socket.service';
import type { LogEntryDto } from '@mockingbird/shared-types';

const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'KAFKA'];
const STATUS_RANGES = ['2xx', '3xx', '4xx', '5xx'];

@Component({
  standalone: true,
  selector: 'app-request-log',
  imports: [
    CommonModule,
    FormsModule,
    ScrollingModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatFormFieldModule,
    MatInputModule,
    MatTooltipModule,
    MatSidenavModule,
    MatDividerModule,
  ],
  template: `
    <mat-sidenav-container class="page-container">
      <mat-sidenav #detailDrawer mode="side" position="end" class="detail-drawer">
        @if (selectedEntry) {
          <div class="drawer-header">
            <h3>Request Detail</h3>
            <button mat-icon-button (click)="detailDrawer.close()"><mat-icon>close</mat-icon></button>
          </div>
          <div class="drawer-body">
            <div class="detail-row">
              <span class="method-chip" [class]="'method-' + selectedEntry.method.toLowerCase()">{{ selectedEntry.method }}</span>
              <span class="detail-path">{{ selectedEntry.path }}</span>
              <span class="status-badge" [class]="statusClass(selectedEntry.statusCode)">{{ selectedEntry.statusCode }}</span>
            </div>

            <div class="detail-meta">
              <span>{{ selectedEntry.timestamp | date:'medium' }}</span>
              <span>{{ selectedEntry.durationMs }}ms</span>
              <span>{{ selectedEntry.serviceName }}</span>
            </div>

            <mat-divider></mat-divider>

            <section>
              <h4>Request Headers</h4>
              <div class="kv-table">
                @for (pair of headersOf(selectedEntry.request.headers); track pair.key) {
                  <div class="kv-row">
                    <span class="kv-key">{{ pair.key }}</span>
                    <span class="kv-val">{{ pair.value }}</span>
                  </div>
                }
              </div>
            </section>

            @if (selectedEntry.request.body) {
              <section>
                <h4>Request Body</h4>
                <pre class="body-pre">{{ selectedEntry.request.body }}</pre>
              </section>
            }

            <mat-divider></mat-divider>

            <section>
              <h4>Response Headers</h4>
              <div class="kv-table">
                @for (pair of headersOf(selectedEntry.response.headers); track pair.key) {
                  <div class="kv-row">
                    <span class="kv-key">{{ pair.key }}</span>
                    <span class="kv-val">{{ pair.value }}</span>
                  </div>
                }
              </div>
            </section>

            @if (selectedEntry.response.body) {
              <section>
                <h4>Response Body</h4>
                <pre class="body-pre">{{ selectedEntry.response.body }}</pre>
              </section>
            }

            @if (selectedEntry.workflowLog?.length) {
              <mat-divider></mat-divider>
              <section>
                <h4>Workflow Log</h4>
                @for (step of selectedEntry.workflowLog; track $index) {
                  <div class="workflow-step" [class.step-error]="step.status === 'error'">
                    <span class="step-action">{{ step.action }}</span>
                    <span class="step-status" [class]="'step-' + step.status">{{ step.status }}</span>
                    @if (step.message) {
                      <span class="step-msg">{{ step.message }}</span>
                    }
                    <span class="step-dur">{{ step.durationMs }}ms</span>
                  </div>
                }
              </section>
            }
          </div>
        }
      </mat-sidenav>

      <mat-sidenav-content class="content-area">
        <div class="page-header">
          <h1>Request Log</h1>
          <button mat-stroked-button color="warn" (click)="clearLog()">
            <mat-icon>clear_all</mat-icon> Clear
          </button>
        </div>

        <div class="filter-bar">
          <mat-form-field appearance="outline" class="search-field">
            <mat-label>Filter by path</mat-label>
            <input matInput [(ngModel)]="searchText" (ngModelChange)="applyFilters()" />
            <mat-icon matSuffix>search</mat-icon>
          </mat-form-field>

          <div class="method-filters">
            @for (m of methods; track m) {
              <button
                mat-stroked-button
                [class]="'method-toggle method-' + m.toLowerCase() + (activeMethods.has(m) ? ' active' : '')"
                (click)="toggleMethod(m)">
                {{ m }}
              </button>
            }
          </div>

          <div class="status-filters">
            @for (r of statusRanges; track r) {
              <button
                mat-stroked-button
                [class]="'status-toggle status-' + r.charAt(0) + 'xx' + (activeStatuses.has(r) ? ' active' : '')"
                (click)="toggleStatus(r)">
                {{ r }}
              </button>
            }
          </div>
        </div>

        <div class="log-count">
          {{ filteredEntries.length }} entries
          @if (allEntries.length !== filteredEntries.length) {
            (filtered from {{ allEntries.length }})
          }
        </div>

        <cdk-virtual-scroll-viewport itemSize="56" class="virtual-list">
          @for (entry of filteredEntries; track entry.id) {
            <div class="log-row" (click)="selectEntry(entry, detailDrawer)">
              <span class="log-time">{{ entry.timestamp | date:'HH:mm:ss' }}</span>
              <span class="method-chip" [class]="'method-' + entry.method.toLowerCase()">{{ entry.method }}</span>
              <span class="status-badge" [class]="statusClass(entry.statusCode)">{{ entry.statusCode }}</span>
              <span class="log-path">{{ entry.path }}</span>
              <span class="log-service">{{ entry.serviceName }}</span>
              <span class="log-dur">{{ entry.durationMs }}ms</span>
            </div>
          }
          @if (filteredEntries.length === 0) {
            <div class="empty-msg">No log entries match the current filters.</div>
          }
        </cdk-virtual-scroll-viewport>
      </mat-sidenav-content>
    </mat-sidenav-container>
  `,
  styles: [`
    .page-container { height: calc(100vh - 64px); }
    .detail-drawer { width: 520px; }
    .drawer-header { display: flex; align-items: center; justify-content: space-between; padding: 16px; border-bottom: 1px solid #e2e8f0; }
    .drawer-header h3 { margin: 0; }
    .drawer-body { padding: 16px; display: flex; flex-direction: column; gap: 12px; overflow-y: auto; height: calc(100% - 64px); }
    .content-area { padding: 24px; display: flex; flex-direction: column; height: 100%; }
    .page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
    .page-header h1 { margin: 0; }
    .filter-bar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 8px; }
    .search-field { min-width: 200px; }
    .method-filters, .status-filters { display: flex; gap: 4px; }
    .method-toggle, .status-toggle { min-width: 60px; font-size: 12px; font-weight: 700; padding: 0 8px; height: 36px; opacity: 0.5; }
    .method-toggle.active, .status-toggle.active { opacity: 1; }
    .method-get { color: #3b82f6; border-color: #3b82f6; }
    .method-post { color: #22c55e; border-color: #22c55e; }
    .method-put { color: #f59e0b; border-color: #f59e0b; }
    .method-delete { color: #ef4444; border-color: #ef4444; }
    .method-patch { color: #a78bfa; border-color: #a78bfa; }
    .method-kafka { color: #f97316; border-color: #f97316; }
    .status-2xx { color: #22c55e; border-color: #22c55e; }
    .status-3xx { color: #3b82f6; border-color: #3b82f6; }
    .status-4xx { color: #f59e0b; border-color: #f59e0b; }
    .status-5xx { color: #ef4444; border-color: #ef4444; }
    .log-count { font-size: 12px; color: #94a3b8; margin-bottom: 8px; }
    .virtual-list { flex: 1; height: calc(100vh - 260px); }
    .log-row { display: flex; align-items: center; gap: 12px; padding: 0 8px; height: 56px; border-bottom: 1px solid #f1f5f9; cursor: pointer; font-size: 13px; }
    .log-row:hover { background: #f8fafc; }
    .log-time { color: #64748b; font-family: monospace; min-width: 70px; }
    .log-path { flex: 1; font-family: monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .log-service { color: #94a3b8; min-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .log-dur { color: #94a3b8; min-width: 55px; text-align: right; }
    .method-chip { padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 700; color: white; white-space: nowrap; }
    .method-get { background: #3b82f6; }
    .method-post { background: #22c55e; }
    .method-put { background: #f59e0b; }
    .method-patch { background: #a78bfa; }
    .method-delete { background: #ef4444; }
    .method-kafka { background: #f97316; }
    .status-badge { padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 700; color: white; white-space: nowrap; }
    .status-2xx { background: #22c55e; }
    .status-3xx { background: #3b82f6; }
    .status-4xx { background: #f59e0b; }
    .status-5xx { background: #ef4444; }
    .empty-msg { padding: 24px; text-align: center; color: #94a3b8; font-style: italic; }
    .detail-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .detail-path { flex: 1; font-family: monospace; font-size: 14px; }
    .detail-meta { display: flex; gap: 16px; font-size: 12px; color: #64748b; }
    section h4 { font-size: 13px; color: #475569; font-weight: 600; margin: 12px 0 6px; text-transform: uppercase; letter-spacing: 0.5px; }
    .kv-table { display: flex; flex-direction: column; gap: 2px; }
    .kv-row { display: flex; gap: 8px; font-size: 12px; font-family: monospace; }
    .kv-key { color: #64748b; min-width: 160px; word-break: break-all; }
    .kv-val { color: #1e293b; flex: 1; word-break: break-all; }
    .body-pre { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; padding: 8px; font-size: 12px; overflow-x: auto; white-space: pre-wrap; word-break: break-all; margin: 0; }
    .workflow-step { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 12px; border-bottom: 1px solid #f1f5f9; }
    .step-action { font-weight: 600; min-width: 100px; }
    .step-status { padding: 1px 6px; border-radius: 8px; font-size: 11px; font-weight: 700; color: white; }
    .step-ok { background: #22c55e; }
    .step-error { background: #ef4444; }
    .step-msg { flex: 1; color: #64748b; }
    .step-dur { color: #94a3b8; }
  `]
})
export class RequestLogComponent implements OnInit, OnDestroy {
  allEntries: LogEntryDto[] = [];
  filteredEntries: LogEntryDto[] = [];
  selectedEntry: LogEntryDto | null = null;

  searchText = '';
  activeMethods = new Set<string>(METHODS);
  activeStatuses = new Set<string>(STATUS_RANGES);

  methods = METHODS;
  statusRanges = STATUS_RANGES;

  private logSocket = inject(LogSocketService);
  private sub: Subscription | null = null;

  ngOnInit(): void {
    this.logSocket.connect();
    this.sub = this.logSocket.entries$.subscribe(entries => {
      this.allEntries = entries;
      this.applyFilters();
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  applyFilters(): void {
    let result = this.allEntries;

    if (this.searchText.trim()) {
      const q = this.searchText.trim().toLowerCase();
      result = result.filter(e => e.path.toLowerCase().includes(q));
    }

    if (this.activeMethods.size < METHODS.length) {
      result = result.filter(e => this.activeMethods.has(e.method.toUpperCase()));
    }

    if (this.activeStatuses.size < STATUS_RANGES.length) {
      result = result.filter(e => {
        const range = Math.floor(e.statusCode / 100) + 'xx';
        return this.activeStatuses.has(range);
      });
    }

    this.filteredEntries = result;
  }

  toggleMethod(method: string): void {
    if (this.activeMethods.has(method)) {
      this.activeMethods.delete(method);
    } else {
      this.activeMethods.add(method);
    }
    this.activeMethods = new Set(this.activeMethods);
    this.applyFilters();
  }

  toggleStatus(range: string): void {
    if (this.activeStatuses.has(range)) {
      this.activeStatuses.delete(range);
    } else {
      this.activeStatuses.add(range);
    }
    this.activeStatuses = new Set(this.activeStatuses);
    this.applyFilters();
  }

  selectEntry(entry: LogEntryDto, drawer: any): void {
    this.selectedEntry = entry;
    drawer.open();
  }

  clearLog(): void {
    this.logSocket.clear();
  }

  statusClass(code: number): string {
    if (code < 300) return 'status-2xx';
    if (code < 400) return 'status-3xx';
    if (code < 500) return 'status-4xx';
    return 'status-5xx';
  }

  headersOf(headers: Record<string, string>): { key: string; value: string }[] {
    return Object.entries(headers ?? {}).map(([key, value]) => ({ key, value }));
  }
}
