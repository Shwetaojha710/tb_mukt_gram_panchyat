import { Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { tap } from 'rxjs/operators';
import { ApiService } from './api.service';

export interface AuthUser {
  id?: number;
  userId?: number;
  fullName?: string;
  username?: string;
  role?: string;
  stateId?: number;
  divisionId?: number;
  districtId?: number;
  tehsilId?: number;
  blockId?: number;
  gpId?: number;
  villageId?: number;
  designation?: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly tokenKey = 'tb_mukt_token';
  private readonly userKey = 'tb_mukt_user';
  readonly currentUser = signal<AuthUser | null>(this.readUser());

  constructor(private api: ApiService, private router: Router) {}

  login(payload: Record<string, unknown>) {
    return this.api.post<{ success: boolean; data: { token: string; user: AuthUser }; message: string }>(
      '/auth/login',
      payload
    ).pipe(tap((res) => this.persist(res.data.token, res.data.user)));
  }

  register(payload: Record<string, unknown>) {
    return this.api.post<{ success: boolean; data: { token: string; user: AuthUser }; message: string }>(
      '/auth/register',
      payload
    ).pipe(tap((res) => this.persist(res.data.token, res.data.user)));
  }

  forgotPassword(payload: Record<string, unknown>) {
    return this.api.post<{ success: boolean; message: string; resetToken?: string }>(
      '/auth/forgot-password',
      payload
    );
  }

  resetPassword(payload: Record<string, unknown>) {
    return this.api.post<{ success: boolean; message: string }>('/auth/reset-password', payload);
  }

  logout() {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.userKey);
    this.currentUser.set(null);
    this.router.navigate(['/login']);
  }

  getToken() {
    return localStorage.getItem(this.tokenKey);
  }

  isLoggedIn() {
    return !!this.getToken();
  }

  dashboardRouteForRole(role?: string) {
    switch (role) {
      case 'STATE':
      case 'DIVISION':
        return '/dashboard/state';
      case 'DISTRICT':
      case 'TEHSIL':
        return '/dashboard/district';
      default:
        return '/dashboard/block';
    }
  }

  private persist(token: string, user: AuthUser) {
    localStorage.setItem(this.tokenKey, token);
    localStorage.setItem(this.userKey, JSON.stringify(user));
    this.currentUser.set(user);
  }

  /** Merge location fields into stored user (e.g. district resolved from blockId) */
  patchCurrentUser(partial: Partial<AuthUser>) {
    const current = this.currentUser();
    if (!current) return;
    const next = { ...current, ...partial };
    localStorage.setItem(this.userKey, JSON.stringify(next));
    this.currentUser.set(next);
  }

  private readUser(): AuthUser | null {
    try {
      const raw = localStorage.getItem(this.userKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
}
