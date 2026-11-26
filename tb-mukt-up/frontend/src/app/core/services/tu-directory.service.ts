import { Injectable } from '@angular/core';
import { ApiService } from './api.service';

export interface TuDirectoryMeta {
  years: number[];
  availableYears: number[];
  defaultYear: number;
  scopedDistrict: string | null;
}

export interface TuDistrictSummary {
  name: string;
  tuCount: number;
  annualTarget: number;
}

export interface TuDirectorySummary {
  year: number;
  available: boolean;
  source?: string | null;
  totalDistricts: number;
  totalTus: number;
  totalAnnualTarget: number;
  districts: TuDistrictSummary[];
  message?: string;
}

export interface TuDirectoryDetail {
  year: number;
  district: string;
  tuCount: number;
  annualTarget: number;
  tus: { name: string; annualTarget: number }[];
}

@Injectable({ providedIn: 'root' })
export class TuDirectoryService {
  constructor(private api: ApiService) {}

  meta() {
    return this.api.get<{ success: boolean; data: TuDirectoryMeta }>('/tu-directory/meta');
  }

  summary(year: number, q?: string) {
    const qs = new URLSearchParams({ year: String(year) });
    if (q?.trim()) qs.set('q', q.trim());
    return this.api.get<{ success: boolean; data: TuDirectorySummary }>(
      `/tu-directory/summary?${qs.toString()}`
    );
  }

  district(year: number, district: string) {
    const qs = new URLSearchParams({ year: String(year), district });
    return this.api.get<{ success: boolean; data: TuDirectoryDetail }>(
      `/tu-directory/district?${qs.toString()}`
    );
  }
}
