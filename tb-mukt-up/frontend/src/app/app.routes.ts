import { Routes } from '@angular/router';
import { authGuard, guestGuard, roleGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./auth/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'register',
    canActivate: [guestGuard],
    loadComponent: () => import('./auth/register/register.component').then((m) => m.RegisterComponent),
  },
  {
    path: 'forgot-password',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./auth/forgot-password/forgot-password.component').then((m) => m.ForgotPasswordComponent),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/layout.component').then((m) => m.LayoutComponent),
    children: [
      {
        path: 'dashboard/state',
        canActivate: [roleGuard(['STATE', 'DIVISION'])],
        loadComponent: () =>
          import('./dashboard/state/state.component').then((m) => m.StateDashboardComponent),
      },
      {
        path: 'dashboard/district',
        canActivate: [roleGuard(['DISTRICT'])],
        loadComponent: () =>
          import('./dashboard/district/district.component').then((m) => m.DistrictDashboardComponent),
      },
      {
        path: 'dashboard/block',
        canActivate: [roleGuard(['TEHSIL', 'BLOCK'])],
        loadComponent: () =>
          import('./dashboard/block/block.component').then((m) => m.BlockDashboardComponent),
      },
      {
        path: 'tb-entry',
        canActivate: [roleGuard(['TEHSIL', 'BLOCK'])],
        loadComponent: () => import('./tb-entry/tb-entry.component').then((m) => m.TbEntryComponent),
      },
      {
        path: 'tb-entries',
        canActivate: [roleGuard(['TEHSIL', 'BLOCK'])],
        loadComponent: () =>
          import('./tb-entry/tb-entry-list.component').then((m) => m.TbEntryListComponent),
      },
      {
        path: 'tb-upload',
        canActivate: [roleGuard(['TEHSIL', 'BLOCK'])],
        loadComponent: () => import('./tb-upload/tb-upload.component').then((m) => m.TbUploadComponent),
      },
      {
        path: 'settings/tb-entry',
        canActivate: [roleGuard(['STATE'])],
        loadComponent: () =>
          import('./settings/tb-entry-settings/tb-entry-settings.component').then(
            (m) => m.TbEntrySettingsComponent
          ),
      },
    ],
  },
  { path: '**', redirectTo: 'login' },
];
