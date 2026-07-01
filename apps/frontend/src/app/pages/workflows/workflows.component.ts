import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ApiService } from '../../core/api.service';
import type { ResponseWorkflowDto } from '../../core/api.service';

@Component({
  standalone: true,
  selector: 'app-workflows',
  imports: [
    CommonModule,
    RouterModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatSnackBarModule,
  ],
  template: `
    <div class="page-wrap">
      <div class="page-header">
        <h1 class="page-title">Workflows</h1>
        <button class="btn-new" (click)="createWorkflow()">
          <span class="material-icons">add</span> New Workflow
        </button>
      </div>

      @if (loading) {
        <div class="loading-center"><mat-spinner diameter="40"></mat-spinner></div>
      }

      @if (!loading && workflows.length === 0) {
        <div class="empty-state">
          <span class="material-icons empty-icon">account_tree</span>
          <p>No workflows yet. Create one to define multi-step response logic.</p>
          <button class="btn-new" (click)="createWorkflow()">
            <span class="material-icons">add</span> New Workflow
          </button>
        </div>
      }

      <div class="workflows-list">
        @for (wf of workflows; track wf.id) {
          <div class="workflow-row">
            <div class="workflow-icon">
              <span class="material-icons">account_tree</span>
            </div>
            <div class="workflow-info">
              <span class="workflow-name">{{ wf.name }}</span>
              <span class="workflow-meta">
                {{ wf.steps.length }} {{ wf.steps.length === 1 ? 'step' : 'steps' }}
              </span>
            </div>
            <div class="workflow-actions">
              <a [routerLink]="['/workflows', wf.id]" class="btn-edit" matTooltip="Edit workflow">
                <span class="material-icons">edit</span>
                <span>Edit</span>
              </a>
              <button class="btn-icon-danger" (click)="deleteWorkflow(wf.id)" matTooltip="Delete">
                <span class="material-icons">delete</span>
              </button>
            </div>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .page-wrap { padding: 0; }
    .page-header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 24px;
    }
    .page-title { margin: 0; font-size: 22px; font-weight: 700; color: #1e293b; }
    .btn-new {
      background: #6366f1; color: white; border: none;
      padding: 8px 18px; border-radius: 8px; cursor: pointer;
      font-size: 14px; font-weight: 500;
      display: flex; align-items: center; gap: 6px;
    }
    .btn-new:hover { background: #4f46e5; }
    .btn-new .material-icons { font-size: 18px; }
    .loading-center { display: flex; justify-content: center; padding: 60px; }

    .empty-state {
      display: flex; flex-direction: column; align-items: center;
      gap: 12px; padding: 80px 0; color: #94a3b8;
    }
    .empty-icon { font-size: 48px; color: #cbd5e1; }
    .empty-state p { margin: 0; font-size: 14px; color: #64748b; }

    .workflows-list { display: flex; flex-direction: column; gap: 8px; }
    .workflow-row {
      display: flex; align-items: center; gap: 14px;
      background: white; border: 1px solid #e2e8f0; border-radius: 10px;
      padding: 14px 18px; transition: box-shadow 0.15s;
    }
    .workflow-row:hover { box-shadow: 0 2px 10px rgba(0,0,0,0.06); }

    .workflow-icon {
      width: 36px; height: 36px; border-radius: 8px;
      background: #eef2ff; display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .workflow-icon .material-icons { font-size: 20px; color: #6366f1; }

    .workflow-info { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .workflow-name { font-size: 14px; font-weight: 600; color: #1e293b; }
    .workflow-meta { font-size: 12px; color: #94a3b8; }

    .workflow-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
    .btn-edit {
      display: flex; align-items: center; gap: 5px;
      background: none; border: 1px solid #e2e8f0; color: #475569;
      padding: 5px 12px; border-radius: 6px; cursor: pointer;
      font-size: 13px; font-weight: 500; text-decoration: none;
      transition: background 0.12s;
    }
    .btn-edit .material-icons { font-size: 16px; }
    .btn-edit:hover { background: #f1f5f9; color: #1e293b; }
    .btn-icon-danger {
      background: none; border: none; cursor: pointer;
      color: #94a3b8; padding: 5px; border-radius: 6px;
      display: flex; align-items: center;
    }
    .btn-icon-danger .material-icons { font-size: 18px; }
    .btn-icon-danger:hover { background: #fef2f2; color: #ef4444; }
  `],
})
export class WorkflowsComponent implements OnInit {
  workflows: ResponseWorkflowDto[] = [];
  loading = false;

  private api = inject(ApiService);
  private snack = inject(MatSnackBar);

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading = true;
    this.api.getResponseWorkflows().subscribe({
      next: (wfs) => { this.workflows = wfs; this.loading = false; },
      error: () => { this.loading = false; },
    });
  }

  createWorkflow(): void {
    const name = prompt('Workflow name:');
    if (!name?.trim()) return;
    this.api.createResponseWorkflow({ name: name.trim() }).subscribe({
      next: (wf) => {
        this.workflows = [...this.workflows, wf];
        this.snack.open('Workflow created', '', { duration: 2000 });
      },
      error: () => this.snack.open('Failed to create workflow', 'OK', { duration: 3000 }),
    });
  }

  deleteWorkflow(id: string): void {
    if (!confirm('Delete this workflow?')) return;
    this.api.deleteResponseWorkflow(id).subscribe({
      next: () => { this.workflows = this.workflows.filter(w => w.id !== id); },
      error: () => this.snack.open('Failed to delete workflow', 'OK', { duration: 3000 }),
    });
  }
}
