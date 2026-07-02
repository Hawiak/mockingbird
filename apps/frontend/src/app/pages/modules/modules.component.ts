import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ApiService } from '../../core/api.service';
import type { ModuleDto, CreateModuleDto } from '@mockingbird/shared-types';

@Component({
  standalone: true,
  selector: 'app-modules',
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatSidenavModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatTooltipModule,
    MatSnackBarModule,
  ],
  template: `
    <mat-sidenav-container class="page-container">
      <mat-sidenav #drawer mode="over" position="end" class="module-drawer">
        <div class="drawer-header">
          <h3>{{ editingId ? 'Edit Module' : 'Add Module' }}</h3>
          <button mat-icon-button (click)="drawer.close()"><mat-icon>close</mat-icon></button>
        </div>
        <div class="drawer-body">
          <form [formGroup]="form" (ngSubmit)="submitForm(drawer)">
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Name</mat-label>
              <input matInput formControlName="name" />
            </mat-form-field>

            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Type</mat-label>
              <mat-select formControlName="type">
                <mat-option value="kafka">Kafka</mat-option>
                <mat-option value="http">HTTP</mat-option>
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Scope (optional service ID)</mat-label>
              <input matInput formControlName="scope" />
            </mat-form-field>

            @if (form.get('type')?.value === 'kafka') {
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Brokers (one per line)</mat-label>
                <textarea matInput rows="3" formControlName="brokers"></textarea>
              </mat-form-field>
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Group ID</mat-label>
                <input matInput formControlName="groupId" />
              </mat-form-field>
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>SASL Username</mat-label>
                <input matInput formControlName="saslUsername" />
              </mat-form-field>
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>SASL Password</mat-label>
                <input matInput type="password" formControlName="saslPassword" />
              </mat-form-field>
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>SASL Mechanism</mat-label>
                <mat-select formControlName="saslMechanism">
                  <mat-option value="PLAIN">PLAIN</mat-option>
                  <mat-option value="SCRAM-SHA-256">SCRAM-SHA-256</mat-option>
                  <mat-option value="SCRAM-SHA-512">SCRAM-SHA-512</mat-option>
                </mat-select>
              </mat-form-field>
              <p class="drawer-hint">Listeners, send buttons and message blocks are configured on the module's own page after it's created.</p>
            }

            @if (form.get('type')?.value === 'http') {
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Base URL</mat-label>
                <input matInput formControlName="baseUrl" />
              </mat-form-field>
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Auth Type</mat-label>
                <mat-select formControlName="authType">
                  <mat-option value="none">None</mat-option>
                  <mat-option value="bearer">Bearer</mat-option>
                  <mat-option value="basic">Basic</mat-option>
                  <mat-option value="apikey">API Key</mat-option>
                </mat-select>
              </mat-form-field>
              @if (form.get('authType')?.value === 'bearer') {
                <mat-form-field appearance="outline" class="full-width">
                  <mat-label>Token</mat-label>
                  <input matInput formControlName="authToken" />
                </mat-form-field>
              }
              @if (form.get('authType')?.value === 'basic') {
                <mat-form-field appearance="outline" class="full-width">
                  <mat-label>Username</mat-label>
                  <input matInput formControlName="authUsername" />
                </mat-form-field>
                <mat-form-field appearance="outline" class="full-width">
                  <mat-label>Password</mat-label>
                  <input matInput type="password" formControlName="authPassword" />
                </mat-form-field>
              }
              @if (form.get('authType')?.value === 'apikey') {
                <mat-form-field appearance="outline" class="full-width">
                  <mat-label>API Key Header</mat-label>
                  <input matInput formControlName="apiKeyHeader" />
                </mat-form-field>
                <mat-form-field appearance="outline" class="full-width">
                  <mat-label>API Key Value</mat-label>
                  <input matInput formControlName="apiKeyValue" />
                </mat-form-field>
              }
            }

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
          <h1>Modules</h1>
          <button mat-fab color="primary" (click)="openNew(drawer)" matTooltip="Add Module">
            <mat-icon>add</mat-icon>
          </button>
        </div>

        @if (loading) {
          <div class="loading-center"><mat-spinner diameter="40"></mat-spinner></div>
        }

        <div class="modules-grid">
          @for (mod of modules; track mod.id) {
            <mat-card class="module-card">
              <mat-card-header>
                <mat-card-title>
                  <a [routerLink]="['/modules', mod.id]" class="card-title-link">{{ mod.name }}</a>
                </mat-card-title>
                <mat-card-subtitle>
                  <mat-chip [class]="'type-chip type-' + mod.type">{{ mod.type }}</mat-chip>
                </mat-card-subtitle>
              </mat-card-header>
              <mat-card-content>
                <div class="health-row">
                  @switch (mod.health) {
                    @case ('healthy') {
                      <mat-icon class="health-icon healthy">check_circle</mat-icon>
                      <span class="health-label healthy">Healthy</span>
                    }
                    @case ('unhealthy') {
                      <mat-icon class="health-icon unhealthy">cancel</mat-icon>
                      <span class="health-label unhealthy">Unhealthy</span>
                    }
                    @case ('checking') {
                      <mat-spinner diameter="16"></mat-spinner>
                      <span class="health-label">Checking...</span>
                    }
                    @default {
                      <mat-icon class="health-icon unchecked">remove</mat-icon>
                      <span class="health-label">Unchecked</span>
                    }
                  }
                </div>
                @if (mod.scope) {
                  <p class="scope-label">Scope: {{ mod.scope }}</p>
                }
                <p class="used-by">Used by {{ mod.usedByCount }} endpoint(s)</p>
              </mat-card-content>
              <mat-card-actions>
                <button mat-stroked-button (click)="testConnection(mod)" [disabled]="testing[mod.id]">
                  @if (testing[mod.id]) { <mat-spinner diameter="16"></mat-spinner> }
                  Test Connection
                </button>
                <span class="actions-spacer"></span>
                <a mat-icon-button [routerLink]="['/modules', mod.id]" matTooltip="Open">
                  <mat-icon>open_in_new</mat-icon>
                </a>
                <button mat-icon-button (click)="openEdit(mod, drawer)" matTooltip="Edit connection">
                  <mat-icon>edit</mat-icon>
                </button>
                <button mat-icon-button color="warn" (click)="deleteModule(mod.id)" matTooltip="Delete">
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
    .module-drawer { width: 480px; }
    .drawer-header { display: flex; align-items: center; justify-content: space-between; padding: 16px; border-bottom: 1px solid #e2e8f0; }
    .drawer-header h3 { margin: 0; }
    .drawer-body { padding: 16px; overflow-y: auto; height: calc(100% - 64px); }
    .drawer-hint { font-size: 12px; color: #64748b; margin: 8px 0 0; }
    .content-area { padding: 24px; }
    .page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; }
    .page-header h1 { margin: 0; }
    .loading-center { display: flex; justify-content: center; padding: 40px; }
    .modules-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; }
    .module-card mat-card-content { padding: 0 16px 8px; }
    .card-title-link { color: inherit; text-decoration: none; }
    .card-title-link:hover { text-decoration: underline; }
    .health-row { display: flex; align-items: center; gap: 8px; margin: 8px 0; }
    .health-icon { font-size: 20px; width: 20px; height: 20px; }
    .health-icon.healthy { color: #22c55e; }
    .health-icon.unhealthy { color: #ef4444; }
    .health-icon.unchecked { color: #94a3b8; }
    .health-label { font-size: 13px; }
    .health-label.healthy { color: #22c55e; }
    .health-label.unhealthy { color: #ef4444; }
    .scope-label { font-size: 12px; color: #64748b; margin: 4px 0; }
    .used-by { font-size: 12px; color: #94a3b8; margin: 4px 0; }
    .type-chip { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 12px; color: white; }
    .type-kafka { background: #f97316; }
    .type-http { background: #3b82f6; }
    .full-width { width: 100%; }
    .form-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 8px; }
    .actions-spacer { flex: 1; }
  `]
})
export class ModulesComponent implements OnInit {
  modules: ModuleDto[] = [];
  loading = false;
  saving = false;
  testing: Record<string, boolean> = {};
  editingId: string | null = null;

  /** Preserved untouched from the module being edited — this drawer never edits them,
   *  but must not wipe them out when it saves the rest of the config. */
  private existingListeners: unknown[] = [];
  private existingTriggers: unknown[] = [];
  private existingMessageBlocks: unknown[] = [];

  private api = inject(ApiService);
  private snack = inject(MatSnackBar);
  private fb = inject(FormBuilder);

  form = this.fb.group({
    name: ['', Validators.required],
    type: ['kafka', Validators.required],
    scope: [''],
    // Kafka
    brokers: [''],
    groupId: [''],
    saslUsername: [''],
    saslPassword: [''],
    saslMechanism: ['PLAIN'],
    // HTTP
    baseUrl: [''],
    authType: ['none'],
    authToken: [''],
    authUsername: [''],
    authPassword: [''],
    apiKeyHeader: [''],
    apiKeyValue: [''],
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.api.getModules().subscribe({
      next: (mods) => { this.modules = mods; this.loading = false; },
      error: () => { this.loading = false; },
    });
  }

  openNew(drawer: any): void {
    this.editingId = null;
    this.existingListeners = [];
    this.existingTriggers = [];
    this.existingMessageBlocks = [];
    this.form.reset({ type: 'kafka', authType: 'none', saslMechanism: 'PLAIN' });
    drawer.open();
  }

  openEdit(mod: ModuleDto, drawer: any): void {
    this.editingId = mod.id;
    const cfg = mod.config as Record<string, any>;
    if (mod.type === 'kafka') {
      const brokers = Array.isArray(cfg['brokers']) ? (cfg['brokers'] as string[]).join('\n') : '';
      const sasl = cfg['sasl'] as Record<string, string> | undefined;
      this.existingListeners = cfg['listeners'] ?? [];
      this.existingTriggers = cfg['triggers'] ?? [];
      this.existingMessageBlocks = cfg['messageBlocks'] ?? [];
      this.form.patchValue({
        name: mod.name,
        type: 'kafka',
        scope: mod.scope ?? '',
        brokers,
        groupId: (cfg['groupId'] as string) ?? '',
        saslUsername: sasl?.['username'] ?? '',
        saslPassword: sasl?.['password'] ?? '',
        saslMechanism: sasl?.['mechanism'] ?? 'PLAIN',
      });
    } else {
      this.existingListeners = [];
      this.existingTriggers = [];
      this.existingMessageBlocks = [];
      const auth = cfg['auth'] as Record<string, string> | undefined;
      this.form.patchValue({
        name: mod.name,
        type: 'http',
        scope: mod.scope ?? '',
        baseUrl: (cfg['baseUrl'] as string) ?? '',
        authType: auth?.['type'] ?? 'none',
        authToken: auth?.['token'] ?? '',
        authUsername: auth?.['username'] ?? '',
        authPassword: auth?.['password'] ?? '',
        apiKeyHeader: auth?.['header'] ?? '',
        apiKeyValue: auth?.['value'] ?? '',
      });
    }
    drawer.open();
  }

  buildConfig(): Record<string, unknown> {
    const v = this.form.value;
    if (v.type === 'kafka') {
      const brokers = (v.brokers ?? '').split('\n').map((b: string) => b.trim()).filter((b: string) => b);
      const config: Record<string, unknown> = {
        brokers, groupId: v.groupId,
        listeners: this.existingListeners, triggers: this.existingTriggers, messageBlocks: this.existingMessageBlocks,
      };
      if (v.saslUsername) {
        config['sasl'] = { mechanism: v.saslMechanism, username: v.saslUsername, password: v.saslPassword };
      }
      return config;
    } else {
      const config: Record<string, unknown> = { baseUrl: v.baseUrl };
      const authType = v.authType;
      if (authType === 'bearer') {
        config['auth'] = { type: 'bearer', token: v.authToken };
      } else if (authType === 'basic') {
        config['auth'] = { type: 'basic', username: v.authUsername, password: v.authPassword };
      } else if (authType === 'apikey') {
        config['auth'] = { type: 'apikey', header: v.apiKeyHeader, value: v.apiKeyValue };
      }
      return config;
    }
  }

  submitForm(drawer: any): void {
    if (this.form.invalid) return;
    const v = this.form.value;
    const dto: CreateModuleDto = {
      name: v.name!,
      type: v.type as 'kafka' | 'http',
      scope: v.scope || undefined,
      config: this.buildConfig(),
    };
    this.saving = true;
    const req$ = this.editingId
      ? this.api.updateModule(this.editingId, dto)
      : this.api.createModule(dto);

    req$.subscribe({
      next: () => {
        this.saving = false;
        drawer.close();
        this.load();
        this.snack.open(this.editingId ? 'Module updated' : 'Module created', '', { duration: 2000 });
      },
      error: () => {
        this.saving = false;
        this.snack.open('Failed to save module', 'OK', { duration: 3000 });
      },
    });
  }

  testConnection(mod: ModuleDto): void {
    this.testing[mod.id] = true;
    this.api.getModuleHealth(mod.id).subscribe({
      next: (result) => {
        this.testing[mod.id] = false;
        const msg = result.success
          ? `Connected successfully${result.latencyMs != null ? ' (' + result.latencyMs + 'ms)' : ''}`
          : `Failed: ${result.message ?? 'unknown error'}`;
        this.snack.open(msg, 'OK', { duration: 4000 });
        this.load();
      },
      error: () => {
        this.testing[mod.id] = false;
        this.snack.open('Connection test failed', 'OK', { duration: 3000 });
      },
    });
  }

  deleteModule(id: string): void {
    if (!confirm('Delete this module?')) return;
    this.api.deleteModule(id).subscribe({
      next: () => { this.modules = this.modules.filter(m => m.id !== id); },
      error: () => this.snack.open('Failed to delete module', 'OK', { duration: 3000 }),
    });
  }
}
