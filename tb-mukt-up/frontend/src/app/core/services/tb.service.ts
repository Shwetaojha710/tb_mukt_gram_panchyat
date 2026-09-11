import { Injectable } from '@angular/core';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class TbService {
  constructor(private api: ApiService) {}

  preview(body: Record<string, unknown>) {
    return this.api.post<{ success: boolean; data: any }>('/tb/preview', body);
  }

  saveDraft(body: Record<string, unknown>) {
    return this.api.post<{ success: boolean; message: string; data: any }>('/tb/draft', body);
  }

  submit(body: Record<string, unknown>) {
    return this.api.post<{ success: boolean; message: string; data: any }>('/tb/submit', body);
  }

  getEntry(gpId: number, month: number, year: number) {
    return this.api.get<{ success: boolean; data: any }>(
      `/tb/entry?gpId=${gpId}&month=${month}&year=${year}`
    );
  }

  listEntries(params: Record<string, string | number | undefined> = {}) {
    const q = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
    return this.api.get<{
      success: boolean;
      data: {
        items: any[];
        total: number;
        page: number;
        pageSize: number;
        settings?: {
          reportingMonthsBack: number;
          submitDeadlineDay: number;
          editDeadlineDay: number;
        };
      };
    }>(`/tb/entries${q ? `?${q}` : ''}`);
  }
}
