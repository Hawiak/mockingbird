import { Routes } from '@angular/router';

export const appRoutes: Routes = [
  { path: '', redirectTo: 'services', pathMatch: 'full' },
  {
    path: 'services',
    loadComponent: () => import('./pages/services/services-shell.component').then(m => m.ServicesShellComponent),
    children: [
      {
        path: ':id',
        loadComponent: () => import('./pages/service-detail/service-detail-panel.component').then(m => m.ServiceDetailPanelComponent),
        children: [
          {
            path: 'endpoints/:eid',
            loadComponent: () => import('./pages/endpoint-detail/endpoint-detail.component').then(m => m.EndpointDetailComponent),
          },
        ],
      },
    ],
  },
  { path: 'modules', loadComponent: () => import('./pages/modules/modules.component').then(m => m.ModulesComponent) },
  { path: 'workflows', loadComponent: () => import('./pages/workflows/workflows.component').then(m => m.WorkflowsComponent) },
  { path: 'workflows/:id', loadComponent: () => import('./pages/workflows/workflow-builder.component').then(m => m.WorkflowBuilderComponent) },
  { path: 'response-blocks', loadComponent: () => import('./pages/response-blocks/response-blocks.component').then(m => m.ResponseBlocksComponent) },
  { path: 'log', loadComponent: () => import('./pages/request-log/request-log.component').then(m => m.RequestLogComponent) },
  { path: 'settings', loadComponent: () => import('./pages/settings/settings.component').then(m => m.SettingsComponent) },
];
