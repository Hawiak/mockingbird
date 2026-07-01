import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatStepperModule } from '@angular/material/stepper';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatRadioModule } from '@angular/material/radio';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { ApiService } from '../../core/api.service';
import type { ServiceDto, CreateServiceDto } from '@mockingbird/shared-types';

@Component({
  standalone: true,
  selector: 'app-add-service-dialog',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatStepperModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatRadioModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatIconModule,
  ],
  template: `
    <h2 mat-dialog-title>Add Service</h2>
    <mat-dialog-content>
      <mat-stepper linear #stepper>
        <!-- Step 1: Basic info -->
        <mat-step [stepControl]="step1Form" label="Basic Info">
          <form [formGroup]="step1Form" class="step-form">
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Service Name</mat-label>
              <input matInput formControlName="name" placeholder="My Service" />
              @if (step1Form.get('name')?.hasError('required')) {
                <mat-error>Name is required</mat-error>
              }
            </mat-form-field>
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Port</mat-label>
              <input matInput type="number" formControlName="port" placeholder="8081" />
              @if (step1Form.get('port')?.hasError('required')) {
                <mat-error>Port is required</mat-error>
              }
              @if (step1Form.get('port')?.hasError('min') || step1Form.get('port')?.hasError('max')) {
                <mat-error>Port must be between 1 and 65535</mat-error>
              }
              @if (step1Form.get('port')?.hasError('portInUse')) {
                <mat-error>Port is already in use</mat-error>
              }
            </mat-form-field>
            <div class="step-actions">
              <button mat-button matStepperNext [disabled]="step1Form.invalid">Next</button>
            </div>
          </form>
        </mat-step>

        <!-- Step 2: Spec source -->
        <mat-step [stepControl]="step2Form" label="Spec Source">
          <form [formGroup]="step2Form" class="step-form">
            <mat-radio-group formControlName="sourceType" class="radio-group">
              <mat-radio-button value="url">URL — fetch from remote endpoint</mat-radio-button>
              <mat-radio-button value="upload">Upload — upload a .json or .yaml file</mat-radio-button>
              <mat-radio-button value="hosted">Upload &amp; Host — also serve the spec via Mockingbird</mat-radio-button>
            </mat-radio-group>

            @if (step2Form.get('sourceType')?.value === 'url') {
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Spec URL</mat-label>
                <input matInput formControlName="url" placeholder="https://example.com/api-docs" />
              </mat-form-field>
            }

            @if (step2Form.get('sourceType')?.value === 'upload' || step2Form.get('sourceType')?.value === 'hosted') {
              <div class="upload-zone" (click)="fileInput.click()" (dragover)="$event.preventDefault()" (drop)="onDrop($event)">
                <mat-icon>upload_file</mat-icon>
                <span>{{ uploadedFileName || 'Drop file here or click to browse' }}</span>
                <input #fileInput type="file" accept=".json,.yaml,.yml" style="display:none" (change)="onFileChange($event)" />
              </div>
            }

            <div class="step-actions">
              <button mat-button matStepperPrevious>Back</button>
              <button mat-button matStepperNext [disabled]="step2Form.invalid">Next</button>
            </div>
          </form>
        </mat-step>

        <!-- Step 3: Review & Create -->
        <mat-step label="Review">
          <div class="review-card">
            <h3>Summary</h3>
            <p><strong>Name:</strong> {{ step1Form.get('name')?.value }}</p>
            <p><strong>Port:</strong> {{ step1Form.get('port')?.value }}</p>
            <p><strong>Spec source:</strong> {{ step2Form.get('sourceType')?.value }}</p>
            @if (step2Form.get('sourceType')?.value === 'url') {
              <p><strong>URL:</strong> {{ step2Form.get('url')?.value }}</p>
            }
          </div>
          @if (createError) {
            <p class="error-msg">{{ createError }}</p>
          }
          <div class="step-actions">
            <button mat-button matStepperPrevious>Back</button>
            <button mat-raised-button color="primary" (click)="create()" [disabled]="creating">
              @if (creating) { <mat-spinner diameter="16"></mat-spinner> }
              Create Service
            </button>
          </div>
        </mat-step>
      </mat-stepper>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .step-form { display: flex; flex-direction: column; gap: 16px; padding: 16px 0; }
    .full-width { width: 100%; }
    .radio-group { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
    .step-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 8px; }
    .upload-zone { border: 2px dashed #cbd5e1; border-radius: 8px; padding: 32px; text-align: center; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 8px; }
    .upload-zone:hover { border-color: #3b82f6; }
    .review-card { background: #f8fafc; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
    .error-msg { color: #ef4444; }
  `]
})
export class AddServiceDialogComponent {
  private fb = inject(FormBuilder);
  private api = inject(ApiService);
  private dialogRef = inject(MatDialogRef<AddServiceDialogComponent>);

  step1Form = this.fb.group({
    name: ['', Validators.required],
    port: [8081, [Validators.required, Validators.min(1), Validators.max(65535)]],
  });

  step2Form = this.fb.group({
    sourceType: ['url', Validators.required],
    url: [''],
  });

  uploadedFileName = '';
  creating = false;
  createError = '';

  onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.[0]) {
      this.uploadedFileName = input.files[0].name;
    }
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    const file = event.dataTransfer?.files[0];
    if (file) this.uploadedFileName = file.name;
  }

  create(): void {
    const name = this.step1Form.get('name')?.value ?? '';
    const port = Number(this.step1Form.get('port')?.value ?? 8081);
    const sourceType = (this.step2Form.get('sourceType')?.value ?? 'url') as 'url' | 'upload' | 'hosted';
    const url = this.step2Form.get('url')?.value ?? '';

    const dto: CreateServiceDto = {
      name,
      port,
      spec: { type: sourceType, url: sourceType === 'url' ? url : undefined },
    };

    this.creating = true;
    this.createError = '';
    this.api.createService(dto).subscribe({
      next: (svc) => { this.creating = false; this.dialogRef.close(svc); },
      error: (e) => { this.creating = false; this.createError = e.message ?? 'Failed to create service'; },
    });
  }
}
