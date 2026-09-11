import { Injectable } from '@angular/core';
import { ApiService } from './api.service';

export interface TbEntrySettings {
  id?: number;
  reportingMonthsBack: number;
  submitDeadlineDay: number;
  editDeadlineDay: number;
  updatedAt?: string;
}

@Injectable({ providedIn: 'root' })
export class SettingsService {
  constructor(private api: ApiService) {}

  getTbEntrySettings() {
    return this.api.get<{ success: boolean; data: TbEntrySettings }>('/settings/tb-entry');
  }

  updateTbEntrySettings(body: TbEntrySettings) {
    return this.api.put<{ success: boolean; message: string; data: TbEntrySettings }>(
      '/settings/tb-entry',
      body
    );
  }
}
