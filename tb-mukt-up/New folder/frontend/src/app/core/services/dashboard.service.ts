import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ApiService } from './api.service';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class DashboardService {
  constructor(private api: ApiService, private http: HttpClient) {}

  summary(params: Record<string, string | number | undefined>) {
    return this.api.get<{ success: boolean; data: any }>(`/dashboard/summary?${this.qs(params)}`);
  }

  rankings(params: Record<string, string | number | undefined>) {
    return this.api.get<{ success: boolean; data: any }>(`/dashboard/rankings?${this.qs(params)}`);
  }

  exportExcel(params: Record<string, string | number | undefined>) {
    return this.http.get(`${environment.apiUrl}/dashboard/export?${this.qs(params)}`, {
      responseType: 'blob',
    });
  }

  private qs(params: Record<string, string | number | undefined>) {
    return Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
  }
}
