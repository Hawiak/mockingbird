import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import type { ChaosConfig, ChaosFailureType } from '@mockingbird/shared-types';

const FAILURE_TYPE_OPTIONS: { value: ChaosFailureType; label: string }[] = [
  { value: 'http_400', label: '400 Bad Request' },
  { value: 'http_500', label: '500 Internal Server Error' },
  { value: 'http_503', label: '503 Service Unavailable' },
  { value: 'timeout', label: 'Slow response / timeout (504)' },
  { value: 'connection_reset', label: 'Connection reset' },
];

const ALL_FAILURE_TYPES = FAILURE_TYPE_OPTIONS.map(o => o.value);

/**
 * Enable/uptime%/failure-type controls shared by a Service's and an Endpoint's
 * chaos config. An endpoint's own config (when enabled) overrides its service's.
 */
@Component({
  standalone: true,
  selector: 'app-chaos-settings',
  imports: [CommonModule, FormsModule, MatSlideToggleModule, MatFormFieldModule, MatInputModule, MatCheckboxModule],
  template: `
    <div class="chaos-settings">
      <mat-slide-toggle [checked]="enabled" (change)="setEnabled($event.checked)">
        Enable chaos testing
      </mat-slide-toggle>
      @if (hint) {
        <p class="chaos-hint">{{ hint }}</p>
      }

      @if (enabled) {
        <div class="chaos-body">
          <mat-form-field appearance="outline" style="width:140px">
            <mat-label>Uptime %</mat-label>
            <input matInput type="number" min="0" max="100" [ngModel]="uptimePercent" (ngModelChange)="setUptime($event)" />
          </mat-form-field>
          <p class="chaos-hint">
            {{ uptimePercent }}% of requests are served normally; the remaining {{ 100 - uptimePercent }}%
            randomly trigger one of the failure types below.
          </p>

          <div class="failure-types">
            <span class="failure-types-label">Failure types</span>
            @for (opt of failureTypeOptions; track opt.value) {
              <mat-checkbox [checked]="failureTypes.includes(opt.value)" (change)="toggleFailureType(opt.value, $event.checked)">
                {{ opt.label }}
              </mat-checkbox>
            }
          </div>

          @if (failureTypes.includes('timeout')) {
            <div class="timeout-range">
              <mat-form-field appearance="outline" style="width:150px">
                <mat-label>Min delay (ms)</mat-label>
                <input matInput type="number" min="0" [ngModel]="timeoutMinMs" (ngModelChange)="setTimeoutMin($event)" />
              </mat-form-field>
              <mat-form-field appearance="outline" style="width:150px">
                <mat-label>Max delay (ms)</mat-label>
                <input matInput type="number" min="0" [ngModel]="timeoutMaxMs" (ngModelChange)="setTimeoutMax($event)" />
              </mat-form-field>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .chaos-settings { display: flex; flex-direction: column; gap: 10px; }
    .chaos-hint { margin: 0; font-size: 12px; color: #64748b; }
    .chaos-body { display: flex; flex-direction: column; gap: 12px; padding: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; }
    .failure-types { display: flex; flex-direction: column; gap: 4px; }
    .failure-types-label { font-size: 12px; font-weight: 600; color: #374151; }
    .timeout-range { display: flex; gap: 10px; }
  `],
})
export class ChaosSettingsComponent {
  @Input() value?: ChaosConfig;
  @Input() hint = '';
  @Output() valueChange = new EventEmitter<ChaosConfig>();

  readonly failureTypeOptions = FAILURE_TYPE_OPTIONS;

  get enabled(): boolean { return this.value?.enabled ?? false; }
  get uptimePercent(): number { return this.value?.uptimePercent ?? 90; }
  get failureTypes(): ChaosFailureType[] { return this.value?.failureTypes?.length ? this.value.failureTypes : ALL_FAILURE_TYPES; }
  get timeoutMinMs(): number { return this.value?.timeoutMinMs ?? 5000; }
  get timeoutMaxMs(): number { return this.value?.timeoutMaxMs ?? 30000; }

  private emit(patch: Partial<ChaosConfig>): void {
    this.valueChange.emit({
      enabled: this.enabled,
      uptimePercent: this.uptimePercent,
      failureTypes: this.failureTypes,
      timeoutMinMs: this.timeoutMinMs,
      timeoutMaxMs: this.timeoutMaxMs,
      ...patch,
    });
  }

  setEnabled(enabled: boolean): void { this.emit({ enabled }); }

  setUptime(v: number): void { this.emit({ uptimePercent: Math.max(0, Math.min(100, Number(v) || 0)) }); }

  toggleFailureType(type: ChaosFailureType, checked: boolean): void {
    const set = new Set(this.failureTypes);
    if (checked) set.add(type); else set.delete(type);
    this.emit({ failureTypes: [...set] });
  }

  setTimeoutMin(v: number): void { this.emit({ timeoutMinMs: Number(v) || 0 }); }
  setTimeoutMax(v: number): void { this.emit({ timeoutMaxMs: Number(v) || 0 }); }
}
