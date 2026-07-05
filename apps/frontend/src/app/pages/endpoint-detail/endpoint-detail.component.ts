import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatTabsModule } from '@angular/material/tabs';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ApiService } from '../../core/api.service';
import { LogSocketService } from '../../core/log-socket.service';
import type { EndpointDto, ResponseBlockDto, ServiceDto, ModuleDto, ResponseNode, DataStoreDto } from '@mockingbird/shared-types';
import type { ResponseWorkflowDto } from '../../core/api.service';
import { ResponseNodeEditorComponent } from '../../components/response-node-editor.component';

@Component({
  standalone: true,
  selector: 'app-endpoint-detail',
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    MatTabsModule,
    MatProgressSpinnerModule,
    MatSlideToggleModule,
    MatSnackBarModule,
    ResponseNodeEditorComponent,
  ],
  template: `
    <div class="ep-page">
      <!-- Breadcrumb -->
      <div class="breadcrumb">
        <a routerLink="/services" class="bc-link">Services</a>
        <span class="bc-sep material-icons">chevron_right</span>
        <a [routerLink]="['/services', svcId]" class="bc-link">{{ service?.name ?? svcId }}</a>
        <span class="bc-sep material-icons">chevron_right</span>
        @if (endpoint) {
          <span class="bc-current">
            <span class="method-pill method-{{ endpoint.method.toLowerCase() }}">{{ endpoint.method }}</span>
            <span class="bc-path">{{ endpoint.path }}</span>
          </span>
        }
      </div>

      @if (loading) {
        <div class="loading-center"><mat-spinner diameter="40"></mat-spinner></div>
      }

      @if (endpoint) {
        <mat-tab-group class="ep-tabs" animationDuration="120ms">

          <!-- Tab: Response -->
          <mat-tab>
            <ng-template mat-tab-label>Response</ng-template>
            <div class="tab-body">
              <div class="section-card">
                <div class="section-title">Endpoint Status</div>
                <mat-slide-toggle
                  [checked]="!!endpoint.disabled"
                  (change)="toggleDisabled($event.checked)">
                  Disable this endpoint (always returns 404)
                </mat-slide-toggle>
              </div>

              <div class="section-card">
                <div class="section-title">Response</div>
                <p class="section-hint">A simple response block or a workflow — optionally gated behind a condition, with a fallback case. Leave it as a single, unconditional case to use the spec-generated default.</p>
                <app-response-node-editor
                  [node]="endpoint.responseNode ?? defaultNode"
                  context="http"
                  [responseBlocks]="responseBlocks"
                  [responseWorkflows]="responseWorkflows"
                  [modules]="modules"
                  [stores]="stores"
                  [pathParams]="endpointPathParams()"
                  (nodeChange)="setResponseNode($event)">
                </app-response-node-editor>
              </div>
            </div>
          </mat-tab>

          <!-- Tab: Log -->
          <mat-tab>
            <ng-template mat-tab-label>Log</ng-template>
            <div class="tab-body">
              <div class="log-list">
                @for (entry of filteredLog(); track entry.id) {
                  <div class="log-entry" [class.log-open]="expandedLogId === entry.id">
                    <div class="log-row" (click)="expandedLogId = expandedLogId === entry.id ? null : entry.id">
                      <span class="log-time">{{ entry.timestamp | date:'HH:mm:ss' }}</span>
                      <span class="method-pill method-{{ entry.method.toLowerCase() }}">{{ entry.method }}</span>
                      <span class="log-status" [class]="statusClass(entry.statusCode)">{{ entry.statusCode }}</span>
                      <span class="log-path">{{ entry.path }}</span>
                      <span class="log-why" [class.why-hit]="entry.matched" [class.why-miss]="!entry.matched">
                        {{ entry.matched ? 'matched' : 'default' }}
                      </span>
                      <span class="log-ms">{{ entry.durationMs }}ms</span>
                      <span class="material-icons log-chevron">{{ expandedLogId === entry.id ? 'expand_less' : 'expand_more' }}</span>
                    </div>
                    @if (expandedLogId === entry.id) {
                      <div class="log-detail">
                        <div class="log-detail-col">
                          <div class="log-detail-label">Response Body</div>
                          <pre class="log-pre">{{ entry.response.body || '(empty)' }}</pre>
                        </div>
                        @if (entry.request.body) {
                          <div class="log-detail-col">
                            <div class="log-detail-label">Request Body</div>
                            <pre class="log-pre">{{ entry.request.body }}</pre>
                          </div>
                        }
                        @if (entry.workflowLog.length) {
                          <div class="log-detail-col">
                            <div class="log-detail-label">Workflow Steps</div>
                            @for (step of entry.workflowLog; track $index) {
                              <div class="log-step">
                                <span class="step-action">{{ step.action }}</span>
                                <span class="step-status" [class.step-ok]="step.status==='ok'" [class.step-err]="step.status==='error'">{{ step.status }}</span>
                                @if (step.message) { <span class="step-msg">{{ step.message }}</span> }
                                <span class="step-ms">{{ step.durationMs }}ms</span>
                              </div>
                            }
                          </div>
                        }
                      </div>
                    }
                  </div>
                }
                @if (filteredLog().length === 0) {
                  <div class="empty-state">
                    <span class="material-icons empty-icon">receipt_long</span>
                    <p>No log entries for this endpoint yet.</p>
                  </div>
                }
              </div>
            </div>
          </mat-tab>

        </mat-tab-group>
      }
    </div>
  `,
  styles: [`
    :host { display: block; height: 100%; }
    .ep-page { display: flex; flex-direction: column; height: 100%; }

    /* Breadcrumb */
    .breadcrumb { display: flex; align-items: center; gap: 4px; margin-bottom: 20px; font-size: 13px; }
    .bc-link { color: #6366F1; text-decoration: none; font-weight: 500; }
    .bc-link:hover { text-decoration: underline; }
    .bc-sep { font-size: 16px; color: #CBD5E1; }
    .bc-current { display: flex; align-items: center; gap: 8px; }
    .bc-path { font-family: 'JetBrains Mono', monospace; font-size: 13px; color: #1E293B; }

    /* Method pills */
    .method-pill { font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 4px; color: white; flex-shrink: 0; }
    .method-get    { background: #10B981; }
    .method-post   { background: #6366F1; }
    .method-put    { background: #F59E0B; }
    .method-delete { background: #EF4444; }
    .method-patch  { background: #8B5CF6; }

    .loading-center { display: flex; justify-content: center; padding: 48px; }

    /* Tabs */
    .ep-tabs { flex: 1; }

    .tab-body { padding: 24px 0; display: flex; flex-direction: column; gap: 20px; }

    /* Section cards */
    .section-card { background: white; border: 1px solid #E2E8F0; border-radius: 10px; padding: 20px 24px; display: flex; flex-direction: column; gap: 14px; }
    .section-title { font-size: 13px; font-weight: 700; color: #1E293B; letter-spacing: 0.2px; }
    .section-hint { margin: 0; font-size: 12px; color: #94A3B8; }

    /* Empty state */
    .empty-state { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 48px 24px; text-align: center; color: #94A3B8; }
    .empty-icon { font-size: 40px; opacity: 0.4; }
    .empty-state p { margin: 0; font-size: 14px; }

    /* Log tab */
    .log-list { display: flex; flex-direction: column; gap: 4px; }
    .log-entry { border-radius: 8px; overflow: hidden; border: 1px solid #E2E8F0; }
    .log-open { border-color: #6366F1; }
    .log-row { display: flex; align-items: center; gap: 10px; padding: 9px 14px; font-size: 12px; cursor: pointer; background: white; transition: background 0.1s; }
    .log-row:hover { background: #F8FAFC; }
    .log-open .log-row { background: #EEF2FF; }
    .log-time { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #94A3B8; min-width: 72px; flex-shrink: 0; }
    .log-status { font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 700; flex-shrink: 0; }
    .status-2xx { color: #10B981; }
    .status-3xx { color: #3B82F6; }
    .status-4xx { color: #F59E0B; }
    .status-5xx { color: #EF4444; }
    .log-path { font-family: 'JetBrains Mono', monospace; font-size: 11px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #334155; }
    .log-why { font-size: 10px; font-weight: 700; padding: 1px 7px; border-radius: 8px; flex-shrink: 0; }
    .why-hit { background: #D1FAE5; color: #065F46; }
    .why-miss { background: #FEF3C7; color: #92400E; }
    .log-ms { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #CBD5E1; flex-shrink: 0; width: 50px; text-align: right; }
    .log-chevron { font-size: 16px; color: #CBD5E1; flex-shrink: 0; }
    .log-detail { background: #0F172A; padding: 14px 16px; display: flex; flex-direction: column; gap: 14px; }
    .log-detail-col { display: flex; flex-direction: column; gap: 5px; }
    .log-detail-label { font-size: 10px; font-weight: 700; color: rgba(255,255,255,0.35); text-transform: uppercase; letter-spacing: 0.6px; }
    .log-pre { margin: 0; font-family: 'JetBrains Mono', monospace; font-size: 11px; color: rgba(255,255,255,0.75); white-space: pre-wrap; word-break: break-all; max-height: 160px; overflow-y: auto; }
    .log-step { display: flex; gap: 8px; align-items: center; padding: 3px 0; border-bottom: 1px solid rgba(255,255,255,0.04); font-size: 11px; }
    .log-step:last-child { border-bottom: none; }
    .step-action { font-family: 'JetBrains Mono', monospace; color: #818CF8; min-width: 80px; font-weight: 600; }
    .step-ok { color: #34D399; }
    .step-err { color: #FCA5A5; }
    .step-msg { flex: 1; color: rgba(255,255,255,0.45); }
    .step-ms { color: rgba(255,255,255,0.2); font-family: 'JetBrains Mono', monospace; }
  `]
})
export class EndpointDetailComponent implements OnInit {
  endpoint: EndpointDto | null = null;
  service: ServiceDto | null = null;
  responseBlocks: ResponseBlockDto[] = [];
  modules: ModuleDto[] = [];
  stores: DataStoreDto[] = [];
  responseWorkflows: ResponseWorkflowDto[] = [];
  loading = false;
  expandedLogId: string | null = null;

  readonly defaultNode: ResponseNode = { id: 'root', kind: 'block' };

  svcId = '';
  eid = '';

  private route = inject(ActivatedRoute);
  private api = inject(ApiService);
  private logSocket = inject(LogSocketService);
  private snack = inject(MatSnackBar);

  filteredLog() {
    const entries = this.logSocket.entries$.value;
    if (!this.endpoint) return [];
    return entries
      .filter(e => e.serviceId === this.svcId && e.path === this.endpoint!.path)
      .slice(-30)
      .reverse();
  }

  statusClass(code: number): string {
    if (code < 300) return 'log-status status-2xx';
    if (code < 400) return 'log-status status-3xx';
    if (code < 500) return 'log-status status-4xx';
    return 'log-status status-5xx';
  }

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      this.svcId = params['id'];
      this.eid = params['eid'];
      this.load();
    });
  }

  load(): void {
    this.loading = true;
    this.api.getService(this.svcId).subscribe({ next: (svc) => { this.service = svc; }, error: () => {} });
    this.api.getEndpoints(this.svcId).subscribe({
      next: (eps) => {
        this.endpoint = (eps.find(e => e.id === this.eid) ?? null) as EndpointDto | null;
        this.loading = false;
      },
      error: () => { this.loading = false; },
    });
    this.api.getResponseBlocks().subscribe({ next: (rbs) => { this.responseBlocks = rbs; }, error: () => {} });
    this.api.getModules().subscribe({ next: (mods) => { this.modules = mods; }, error: () => {} });
    this.api.getDataStores().subscribe({ next: (stores) => { this.stores = stores; }, error: () => {} });
    this.api.getResponseWorkflows().subscribe({ next: (wfs) => { this.responseWorkflows = wfs; }, error: () => {} });
  }

  toggleDisabled(checked: boolean): void {
    if (!this.endpoint) return;
    // Optimistic update — apply immediately so the toggle doesn't fight the [checked] binding
    this.endpoint = { ...this.endpoint, disabled: checked };
    this.api.updateEndpoint(this.svcId, this.eid, { disabled: checked }).subscribe({
      next: (ep) => { this.endpoint = ep as EndpointDto; },
      error: () => {
        // Roll back on failure
        this.endpoint = { ...this.endpoint!, disabled: !checked };
        this.snack.open('Failed to update endpoint', 'OK', { duration: 3000 });
      },
    });
  }

  setResponseNode(responseNode: ResponseNode): void {
    if (!this.endpoint) return;
    this.endpoint = { ...this.endpoint, responseNode };
    this.api.updateEndpoint(this.svcId, this.eid, { responseNode }).subscribe({
      next: (ep) => { this.endpoint = ep as EndpointDto; },
      error: () => this.snack.open('Failed to save response', 'OK', { duration: 3000 }),
    });
  }

  /** Reused by the workflow-parameter-binding form to offer this endpoint's path params for pathParam-typed parameters. */
  endpointPathParams(): string[] {
    if (!this.endpoint) return [];
    return this.endpoint.path.split('/').filter(s => s.startsWith(':')).map(s => s.slice(1));
  }
}
