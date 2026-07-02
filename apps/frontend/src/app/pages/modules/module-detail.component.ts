import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDividerModule } from '@angular/material/divider';
import { ApiService } from '../../core/api.service';
import type { ResponseWorkflowDto } from '../../core/api.service';
import type { ModuleDto, KafkaListener, KafkaSendTrigger, KafkaMessageBlock } from '@mockingbird/shared-types';
import { KafkaTopicStatementsComponent } from './kafka-topic-statements.component';

@Component({
  standalone: true,
  selector: 'app-module-detail',
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatTooltipModule,
    MatSnackBarModule,
    MatDividerModule,
    KafkaTopicStatementsComponent,
  ],
  template: `
    <div class="detail-page">
      @if (loading) {
        <div class="loading-center"><mat-spinner diameter="40"></mat-spinner></div>
      }

      @if (!loading && !module) {
        <div class="not-found">
          <p>Module not found.</p>
          <a routerLink="/modules">← Back to Modules</a>
        </div>
      }

      @if (module) {
        <div class="detail-header">
          <a routerLink="/modules" class="back-link">
            <mat-icon>arrow_back</mat-icon>
            <span>Modules</span>
          </a>
          <h1>{{ module.name }}</h1>
          <mat-chip [class]="'type-chip type-' + module.type">{{ module.type }}</mat-chip>
          <span class="header-spacer"></span>
          <button mat-stroked-button (click)="testConnection()" [disabled]="testing">
            @if (testing) { <mat-spinner diameter="16"></mat-spinner> }
            Test Connection
          </button>
        </div>

        @if (module.type === 'kafka') {
          <section class="section">
            <div class="section-header">
              <h3>Listen to topics</h3>
              <button mat-stroked-button type="button" (click)="addListener()">
                <mat-icon>add</mat-icon> Add Topic
              </button>
            </div>
            @if (listeners.length === 0) {
              <p class="hint">Not listening on any topics — this module will only send messages.</p>
            }
            @for (listener of listeners; track listener.id) {
              <div class="listener-block">
                <div class="row">
                  <mat-form-field appearance="outline" class="row-topic">
                    <mat-label>Topic</mat-label>
                    <input matInput [(ngModel)]="listener.topic" [ngModelOptions]="{standalone: true}"
                      placeholder="e.g. orders.created, or * for all topics" />
                  </mat-form-field>
                  <button mat-icon-button type="button" (click)="persist()" matTooltip="Save topic name">
                    <mat-icon>save</mat-icon>
                  </button>
                  <button mat-icon-button type="button" color="warn" (click)="removeListener(listener)" matTooltip="Delete topic">
                    <mat-icon>delete</mat-icon>
                  </button>
                </div>
                <div class="row">
                  <mat-form-field appearance="outline" class="row-topic">
                    <mat-label>Trigger</mat-label>
                    <mat-select [value]="listener.workflowId ?? ''" (selectionChange)="setListenerWorkflow(listener, $event.value)">
                      <mat-option value="">Inline statements</mat-option>
                      @for (wf of responseWorkflows; track wf.id) {
                        <mat-option [value]="wf.id">{{ wf.name }}</mat-option>
                      }
                    </mat-select>
                  </mat-form-field>
                  @if (listener.workflowId) {
                    <a mat-icon-button [routerLink]="['/workflows', listener.workflowId]" matTooltip="Open workflow">
                      <mat-icon>open_in_new</mat-icon>
                    </a>
                  } @else {
                    <span class="stmt-count">{{ listener.statements.length }} statement(s)</span>
                    <button mat-icon-button type="button" (click)="editListenerStatements(listener)" matTooltip="Edit statements">
                      <mat-icon>rule</mat-icon>
                    </button>
                  }
                </div>
              </div>
            }
            @if (listeners.length) {
              <p class="hint">
                Tip: use <code>*</code> as the topic to match every topic on the broker (except Kafka's own internal ones).
                The actual topic name is available as the <code>topic</code> header if you need to filter within it.
              </p>
            }
          </section>

          <mat-divider></mat-divider>

          <section class="section">
            <div class="section-header">
              <h3>Send buttons</h3>
              <button mat-stroked-button type="button" (click)="addTrigger()">
                <mat-icon>add</mat-icon> Add Button
              </button>
            </div>
            @if (triggers.length === 0) {
              <p class="hint">No send buttons yet — add one to manually publish a message, e.g. to mock the start of a process.</p>
            }
            @for (trigger of triggers; track trigger.id) {
              <div class="card">
                <div class="row">
                  <mat-form-field appearance="outline" class="row-topic">
                    <mat-label>Button label</mat-label>
                    <input matInput [(ngModel)]="trigger.name" [ngModelOptions]="{standalone: true}" />
                  </mat-form-field>
                  <button mat-stroked-button color="accent" (click)="fireTrigger(trigger)" [disabled]="firing[trigger.id]">
                    @if (firing[trigger.id]) { <mat-spinner diameter="14"></mat-spinner> } @else { <mat-icon>send</mat-icon> }
                    Send
                  </button>
                  <button mat-icon-button type="button" (click)="persist()" matTooltip="Save">
                    <mat-icon>save</mat-icon>
                  </button>
                  <button mat-icon-button type="button" color="warn" (click)="removeTrigger(trigger)" matTooltip="Delete">
                    <mat-icon>delete</mat-icon>
                  </button>
                </div>
                <mat-form-field appearance="outline" class="full-width">
                  <mat-label>Topic</mat-label>
                  <input matInput [(ngModel)]="trigger.topic" [ngModelOptions]="{standalone: true}" />
                </mat-form-field>
                <mat-form-field appearance="outline" class="full-width">
                  <mat-label>Key (optional)</mat-label>
                  <input matInput [(ngModel)]="trigger.key" [ngModelOptions]="{standalone: true}" />
                </mat-form-field>
                <mat-form-field appearance="outline" class="full-width">
                  <mat-label>Payload</mat-label>
                  <textarea matInput rows="3" [(ngModel)]="trigger.payload" [ngModelOptions]="{standalone: true}"></textarea>
                </mat-form-field>
              </div>
            }
          </section>

          <mat-divider></mat-divider>

          <section class="section">
            <div class="section-header">
              <h3>Message blocks</h3>
              <button mat-stroked-button type="button" (click)="addBlock()">
                <mat-icon>add</mat-icon> Add Block
              </button>
            </div>
            @if (messageBlocks.length === 0) {
              <p class="hint">No message blocks yet — reusable payloads you can pick from a kafka_publish workflow action instead of typing them inline each time.</p>
            }
            @for (block of messageBlocks; track block.id) {
              <div class="row block-row">
                <span class="block-name">{{ block.name || '(unnamed)' }}</span>
                <span class="block-preview">{{ block.payload | slice:0:60 }}</span>
                <button mat-icon-button type="button" (click)="editBlock(block)" matTooltip="Edit">
                  <mat-icon>edit</mat-icon>
                </button>
                <button mat-icon-button type="button" color="warn" (click)="removeBlock(block)" matTooltip="Delete">
                  <mat-icon>delete</mat-icon>
                </button>
              </div>
            }
          </section>
        }
      }
    </div>

    @if (editingListener) {
      <div class="drawer-backdrop" (click)="closeListenerEditor()"></div>
      <div class="drawer-panel">
        <div class="drawer-head">
          <span>Statements for topic "{{ editingListener.topic || '(unnamed)' }}"</span>
          <button mat-icon-button (click)="closeListenerEditor()"><mat-icon>close</mat-icon></button>
        </div>
        <div class="drawer-body">
          <app-kafka-topic-statements
            [statements]="editingListener.statements"
            [modules]="modules"
            (statementsChange)="onListenerStatementsChange($event)">
          </app-kafka-topic-statements>
        </div>
      </div>
    }

    @if (editingBlock) {
      <div class="drawer-backdrop" (click)="closeBlockEditor()"></div>
      <div class="drawer-panel">
        <div class="drawer-head">
          <span>{{ editingBlock.isNew ? 'New Message Block' : 'Edit Message Block' }}</span>
          <button mat-icon-button (click)="closeBlockEditor()"><mat-icon>close</mat-icon></button>
        </div>
        <div class="drawer-body">
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Name</mat-label>
            <input matInput [(ngModel)]="editingBlock.name" [ngModelOptions]="{standalone: true}" placeholder="e.g. Ping" />
          </mat-form-field>
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Key (optional)</mat-label>
            <input matInput [(ngModel)]="editingBlock.key" [ngModelOptions]="{standalone: true}" />
          </mat-form-field>
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Payload</mat-label>
            <textarea matInput rows="6" [(ngModel)]="editingBlock.payload" [ngModelOptions]="{standalone: true}"></textarea>
          </mat-form-field>
        </div>
        <div class="drawer-foot">
          <button mat-button (click)="closeBlockEditor()">Cancel</button>
          <button mat-flat-button color="primary" (click)="saveBlock()">Save Block</button>
        </div>
      </div>
    }
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
    .type-chip { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 12px; color: white; }
    .type-kafka { background: #f97316; }
    .type-http { background: #3b82f6; }
    .section { padding: 20px 0; }
    .section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
    .section-header h3 { margin: 0; font-size: 15px; }
    .hint { font-size: 12px; color: #64748b; margin: 0 0 8px; }
    .hint code { background: #f1f5f9; border-radius: 3px; padding: 1px 4px; font-family: 'JetBrains Mono', monospace; }
    .row { display: flex; align-items: center; gap: 8px; }
    .row-topic { flex: 1; }
    .stmt-count { font-size: 11px; color: #64748b; white-space: nowrap; }
    .listener-block { display: flex; flex-direction: column; gap: 4px; padding-bottom: 8px; margin-bottom: 8px; border-bottom: 1px solid #f1f5f9; }
    .listener-block:last-child { border-bottom: none; }
    .block-row { margin-bottom: 8px; }
    .block-name { font-weight: 600; font-size: 13px; min-width: 140px; }
    .block-preview { flex: 1; font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #64748b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 12px 0; margin-bottom: 12px; }
    .full-width { width: 100%; }
    .drawer-backdrop { position: fixed; inset: 0; background: rgba(15,23,42,0.4); z-index: 1000; }
    .drawer-panel { position: fixed; top: 0; right: 0; bottom: 0; width: 520px; max-width: 100vw; background: white; z-index: 1001; display: flex; flex-direction: column; box-shadow: -4px 0 24px rgba(0,0,0,0.15); }
    .drawer-head { display: flex; align-items: center; justify-content: space-between; padding: 16px; border-bottom: 1px solid #e2e8f0; font-weight: 700; }
    .drawer-body { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 16px; }
    .drawer-foot { display: flex; justify-content: flex-end; gap: 8px; padding: 16px; border-top: 1px solid #e2e8f0; }
  `]
})
export class ModuleDetailComponent implements OnInit {
  module: ModuleDto | null = null;
  modules: ModuleDto[] = [];
  loading = false;
  testing = false;
  firing: Record<string, boolean> = {};

  listeners: KafkaListener[] = [];
  editingListener: KafkaListener | null = null;
  triggers: KafkaSendTrigger[] = [];
  messageBlocks: KafkaMessageBlock[] = [];
  editingBlock: (KafkaMessageBlock & { isNew?: boolean }) | null = null;
  responseWorkflows: ResponseWorkflowDto[] = [];

  private route = inject(ActivatedRoute);
  private api = inject(ApiService);
  private snack = inject(MatSnackBar);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.loading = true;
    this.api.getModules().subscribe({
      next: (mods) => {
        this.modules = mods;
        this.module = mods.find(m => m.id === id) ?? null;
        this.syncLocalState();
        this.loading = false;
      },
      error: () => { this.loading = false; },
    });
    this.api.getResponseWorkflows().subscribe({ next: (wfs) => { this.responseWorkflows = wfs; }, error: () => {} });
  }

  private syncLocalState(): void {
    if (!this.module) return;
    const cfg = this.module.config as Record<string, any>;
    this.listeners = cfg['listeners'] ?? [];
    this.triggers = cfg['triggers'] ?? [];
    this.messageBlocks = cfg['messageBlocks'] ?? [];
  }

  /** Persists listeners/triggers/messageBlocks, preserving the connection fields untouched. */
  persist(): void {
    if (!this.module) return;
    const config = { ...(this.module.config as unknown as Record<string, unknown>), listeners: this.listeners, triggers: this.triggers, messageBlocks: this.messageBlocks };
    this.api.updateModule(this.module.id, { config }).subscribe({
      next: (mod) => { this.module = mod; },
      error: () => this.snack.open('Failed to save changes', 'OK', { duration: 3000 }),
    });
  }

  testConnection(): void {
    if (!this.module) return;
    this.testing = true;
    this.api.getModuleHealth(this.module.id).subscribe({
      next: (result) => {
        this.testing = false;
        const msg = result.success
          ? `Connected successfully${result.latencyMs != null ? ' (' + result.latencyMs + 'ms)' : ''}`
          : `Failed: ${result.message ?? 'unknown error'}`;
        this.snack.open(msg, 'OK', { duration: 4000 });
      },
      error: () => {
        this.testing = false;
        this.snack.open('Connection test failed', 'OK', { duration: 3000 });
      },
    });
  }

  addListener(): void {
    this.listeners = [...this.listeners, { id: crypto.randomUUID(), topic: '', statements: [] }];
    this.persist();
  }

  editListenerStatements(listener: KafkaListener): void {
    this.editingListener = listener;
  }

  closeListenerEditor(): void {
    this.editingListener = null;
  }

  onListenerStatementsChange(statements: KafkaListener['statements']): void {
    if (!this.editingListener) return;
    this.editingListener.statements = statements;
    this.persist();
  }

  removeListener(listener: KafkaListener): void {
    this.listeners = this.listeners.filter(l => l.id !== listener.id);
    this.persist();
  }

  setListenerWorkflow(listener: KafkaListener, workflowId: string): void {
    listener.workflowId = workflowId || undefined;
    this.persist();
  }

  addTrigger(): void {
    this.triggers = [...this.triggers, { id: crypto.randomUUID(), name: '', topic: '', key: '', payload: '' }];
    this.persist();
  }

  removeTrigger(trigger: KafkaSendTrigger): void {
    this.triggers = this.triggers.filter(t => t.id !== trigger.id);
    this.persist();
  }

  fireTrigger(trigger: KafkaSendTrigger): void {
    if (!this.module) return;
    this.firing[trigger.id] = true;
    this.api.fireModuleTrigger(this.module.id, trigger.id).subscribe({
      next: (result) => {
        this.firing[trigger.id] = false;
        const msg = result.success
          ? `Sent to "${trigger.topic}"${result.latencyMs != null ? ' (' + result.latencyMs + 'ms)' : ''}`
          : `Failed: ${result.message ?? 'unknown error'}`;
        this.snack.open(msg, 'OK', { duration: 3000 });
      },
      error: () => {
        this.firing[trigger.id] = false;
        this.snack.open('Failed to send message', 'OK', { duration: 3000 });
      },
    });
  }

  addBlock(): void {
    this.editingBlock = { id: crypto.randomUUID(), name: '', key: '', payload: '', isNew: true };
  }

  editBlock(block: KafkaMessageBlock): void {
    this.editingBlock = { ...block };
  }

  closeBlockEditor(): void {
    this.editingBlock = null;
  }

  saveBlock(): void {
    if (!this.editingBlock) return;
    const clean: KafkaMessageBlock = {
      id: this.editingBlock.id,
      name: this.editingBlock.name,
      key: this.editingBlock.key,
      payload: this.editingBlock.payload,
    };
    const idx = this.messageBlocks.findIndex(b => b.id === clean.id);
    this.messageBlocks = idx === -1
      ? [...this.messageBlocks, clean]
      : this.messageBlocks.map(b => (b.id === clean.id ? clean : b));
    this.closeBlockEditor();
    this.persist();
  }

  removeBlock(block: KafkaMessageBlock): void {
    this.messageBlocks = this.messageBlocks.filter(b => b.id !== block.id);
    this.persist();
  }
}
