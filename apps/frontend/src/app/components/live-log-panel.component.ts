import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { LogSocketService } from '../core/log-socket.service';
import type { LogEntryDto } from '@mockingbird/shared-types';

@Component({
  standalone: true,
  selector: 'app-live-log-panel',
  imports: [CommonModule, FormsModule],
  template: `
<div class="lp-shell">
  <!-- Header -->
  <div class="lp-header">
    <span class="lp-title">Live Requests</span>
    @if (entries.length) {
      <span class="lp-count">{{ entries.length }}</span>
    }
    <span class="lp-spacer"></span>
    <button class="lp-clear-btn" (click)="clear()" title="Clear log">
      <span class="material-icons" style="font-size:16px">delete_sweep</span>
    </button>
  </div>

  <!-- Service filter -->
  @if (services.length > 1) {
    <div class="lp-filter">
      <select class="lp-select" [(ngModel)]="filterService">
        <option value="">All services</option>
        @for (svc of services; track svc) {
          <option [value]="svc">{{ svc }}</option>
        }
      </select>
    </div>
  }

  <!-- Empty state -->
  @if (!filtered.length) {
    <div class="lp-empty">
      <span class="material-icons" style="font-size:32px;color:rgba(255,255,255,0.15)">wifi_tethering</span>
      <p>Waiting for requests…</p>
    </div>
  }

  <!-- Log rows -->
  <div class="lp-list" #listEl>
    @for (entry of filtered; track entry.id) {
      <div class="lp-row" [class.expanded]="selectedId === entry.id" (click)="toggle(entry.id)">
        <div class="lp-row-main">
          <span class="lp-method method-{{ entry.method }}">{{ entry.method }}</span>
          <span class="lp-path">{{ entry.path }}</span>
          <span class="lp-spacer"></span>
          <span class="lp-status" [class]="statusClass(entry.statusCode)">{{ entry.statusCode }}</span>
          <span class="lp-latency">{{ entry.durationMs }}ms</span>
        </div>
        <div class="lp-row-meta">
          <span>{{ entry.serviceName || entry.serviceId }}</span>
          <span class="lp-match-tag" [class.lp-match-hit]="entry.matched" [class.lp-match-miss]="!entry.matched">
            {{ entry.matched ? (entry.statementName || 'statement') : 'default' }}
          </span>
          <span>{{ entry.timestamp | date:'HH:mm:ss' }}</span>
        </div>

        @if (selectedId === entry.id) {
          <div class="lp-detail" (click)="$event.stopPropagation()">
            <div class="lp-section">
              <div class="lp-section-title">Why</div>
              <div class="lp-why">
                @if (entry.matched) {
                  <span class="lp-why-match">Matched statement: <strong>{{ entry.statementName || entry.statementId }}</strong></span>
                } @else {
                  <span class="lp-why-default">No statement matched — returned default response</span>
                }
              </div>
            </div>
            <div class="lp-section">
              <div class="lp-section-title">Response Body</div>
              <pre class="lp-pre">{{ (entry.response.body | slice:0:600) || '(empty)' }}</pre>
            </div>
            @if (entry.request.body) {
              <div class="lp-section">
                <div class="lp-section-title">Request Body</div>
                <pre class="lp-pre">{{ entry.request.body | slice:0:400 }}</pre>
              </div>
            }
            @if (entry.workflowLog.length) {
              <div class="lp-section">
                <div class="lp-section-title">Workflow</div>
                @for (step of entry.workflowLog; track $index) {
                  <div class="lp-step">
                    <span class="lp-step-action">{{ step.action }}</span>
                    <span class="lp-step-status" [class.lp-ok]="step.status === 'ok'" [class.lp-err]="step.status === 'error'">{{ step.status }}</span>
                    @if (step.message) { <span class="lp-step-result">{{ step.message }}</span> }
                    <span class="lp-step-ms">{{ step.durationMs }}ms</span>
                  </div>
                }
              </div>
            }
          </div>
        }
      </div>
    }
  </div>
</div>
  `,
  styles: [`
:host { display: flex; flex-direction: column; height: 100%; overflow: hidden; }

.lp-shell { display: flex; flex-direction: column; height: 100%; overflow: hidden; font-size: 12px; }

.lp-header { display: flex; align-items: center; gap: 8px; padding: 12px 14px 10px; border-bottom: 1px solid rgba(255,255,255,0.07); flex-shrink: 0; }
.lp-title { font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.9); letter-spacing: 0.5px; text-transform: uppercase; }
.lp-count { background: #6366F1; color: white; font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 10px; }
.lp-spacer { flex: 1; }
.lp-clear-btn { background: none; border: none; cursor: pointer; color: rgba(255,255,255,0.35); padding: 4px; border-radius: 4px; display: flex; align-items: center; transition: color 0.12s; }
.lp-clear-btn:hover { color: rgba(255,255,255,0.7); background: rgba(255,255,255,0.06); }

.lp-filter { padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,0.05); flex-shrink: 0; }
.lp-select { width: 100%; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); color: rgba(255,255,255,0.7); font-size: 11px; padding: 4px 8px; border-radius: 5px; outline: none; }

.lp-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; }
.lp-empty p { margin: 0; color: rgba(255,255,255,0.25); font-size: 12px; }

.lp-list { flex: 1; overflow-y: auto; }
.lp-list::-webkit-scrollbar { width: 4px; }
.lp-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }

.lp-row { border-bottom: 1px solid rgba(255,255,255,0.04); cursor: pointer; padding: 7px 10px; transition: background 0.1s; }
.lp-row:hover { background: rgba(255,255,255,0.04); }
.lp-row.expanded { background: rgba(99,102,241,0.08); }

.lp-row-main { display: flex; align-items: center; gap: 6px; }
.lp-method { font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 600; padding: 1px 5px; border-radius: 3px; flex-shrink: 0; }
.method-GET    { background: rgba(16,185,129,0.15); color: #34D399; }
.method-POST   { background: rgba(99,102,241,0.2);  color: #818CF8; }
.method-PUT    { background: rgba(245,158,11,0.15); color: #FCD34D; }
.method-DELETE { background: rgba(239,68,68,0.15);  color: #FCA5A5; }
.method-PATCH  { background: rgba(168,85,247,0.15); color: #D8B4FE; }

.lp-path { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: rgba(255,255,255,0.75); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; min-width: 0; }
.lp-status { font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 600; flex-shrink: 0; }
.status-2xx { color: #34D399; }
.status-3xx { color: #60A5FA; }
.status-4xx { color: #FCD34D; }
.status-5xx { color: #FCA5A5; }
.lp-latency { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: rgba(255,255,255,0.3); flex-shrink: 0; width: 40px; text-align: right; }

.lp-row-meta { display: flex; align-items: center; gap: 6px; margin-top: 2px; }
.lp-row-meta span { font-size: 10px; color: rgba(255,255,255,0.25); font-family: 'JetBrains Mono', monospace; }
.lp-match-tag { font-size: 9px; padding: 1px 5px; border-radius: 3px; font-weight: 600; flex-shrink: 0; }
.lp-match-hit { background: rgba(52,211,153,0.15); color: #34D399; }
.lp-match-miss { background: rgba(252,211,77,0.12); color: #FCD34D; }
.lp-row-meta span:last-child { margin-left: auto; }

.lp-detail { margin-top: 8px; background: rgba(0,0,0,0.2); border-radius: 6px; padding: 10px; }
.lp-section { margin-bottom: 10px; }
.lp-section:last-child { margin-bottom: 0; }
.lp-section-title { font-size: 10px; font-weight: 600; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
.lp-pre { margin: 0; font-family: 'JetBrains Mono', monospace; font-size: 10px; color: rgba(255,255,255,0.65); white-space: pre-wrap; word-break: break-all; max-height: 120px; overflow-y: auto; }
.lp-step { display: flex; gap: 8px; padding: 3px 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
.lp-step:last-child { border-bottom: none; }
.lp-step-action { font-weight: 600; color: #818CF8; font-family: 'JetBrains Mono', monospace; font-size: 10px; min-width: 80px; }
.lp-step-status { font-size: 10px; padding: 0 4px; border-radius: 3px; }
.lp-ok { color: #34D399; }
.lp-err { color: #FCA5A5; }
.lp-step-result { flex: 1; color: rgba(255,255,255,0.5); font-size: 10px; }
.lp-step-ms { color: rgba(255,255,255,0.25); font-size: 10px; font-family: 'JetBrains Mono', monospace; }
.lp-why { font-size: 11px; padding: 6px 8px; border-radius: 4px; background: rgba(255,255,255,0.04); }
.lp-why-match { color: #34D399; }
.lp-why-default { color: #FCD34D; }
  `],
})
export class LiveLogPanelComponent implements OnInit, OnDestroy {
  private logSocket = inject(LogSocketService);
  private sub!: Subscription;

  entries: LogEntryDto[] = [];
  selectedId: string | null = null;
  filterService = '';
  services: string[] = [];

  get filtered(): LogEntryDto[] {
    const src = this.filterService
      ? this.entries.filter(e => e.serviceId === this.filterService)
      : this.entries;
    return src.slice(0, 200);
  }

  ngOnInit(): void {
    this.sub = this.logSocket.entries$.subscribe(all => {
      // newest first
      this.entries = [...all].reverse();
      const ids = new Set(all.map(e => e.serviceId));
      this.services = [...ids];
    });
  }

  ngOnDestroy(): void { this.sub.unsubscribe(); }

  toggle(id: string): void {
    this.selectedId = this.selectedId === id ? null : id;
  }

  clear(): void { this.logSocket.clear(); }

  statusClass(code: number): string {
    if (code < 300) return 'status-2xx';
    if (code < 400) return 'status-3xx';
    if (code < 500) return 'status-4xx';
    return 'status-5xx';
  }
}
