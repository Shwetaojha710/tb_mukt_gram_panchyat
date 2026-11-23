import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { ApiService } from '../core/services/api.service';
import {
  NdActionType,
  NdActionsPage,
  NdApiResponse,
  NdDrilldown,
  NdFilters,
  NdLevel,
  NdSummary,
  NdTableQuery,
} from './new-dashboard.models';

@Injectable({ providedIn: 'root' })
export class NewDashboardService {
  constructor(private api: ApiService, private http: HttpClient) {}

  summary(level: NdLevel, filters: NdFilters) {
    return this.api.get<NdApiResponse<NdSummary>>('/new-dashboard/summary', {
      params: this.params(filters, { level }),
    });
  }

  drilldown(level: NdLevel, filters: NdFilters) {
    return this.api.get<NdApiResponse<NdDrilldown>>('/new-dashboard/drilldown', {
      params: this.params(filters, { level }),
    });
  }

  actions(type: NdActionType, filters: NdFilters, q: NdTableQuery) {
    return this.api.get<NdApiResponse<NdActionsPage>>('/new-dashboard/actions', {
      params: this.params(filters, {
        type,
        page: q.page,
        pageSize: q.pageSize,
        search: q.search,
        sortBy: q.sortBy,
        sortDir: q.sortDir,
      }),
    });
  }

  /** Excel: Summary + Drilldown + all Action tables for current filters/level */
  exportExcel(level: NdLevel, filters: NdFilters) {
    const q = new URLSearchParams();
    Object.entries(this.params(filters, { level })).forEach(([k, v]) => q.set(k, String(v)));
    return this.http.get(`${environment.apiUrl}/new-dashboard/export?${q.toString()}`, {
      responseType: 'blob',
    });
  }

  private params(f: NdFilters, extra: Record<string, string | number>) {
    const all: Record<string, string | number | null> = {
      dateFrom: `${f.fromYear}-${String(f.fromMonth).padStart(2, '0')}`,
      dateTo: `${f.toYear}-${String(f.toMonth).padStart(2, '0')}`,
      districtId: f.districtId,
      blockId: f.blockId,
      gpId: f.gpId,
      ...extra,
    };
    const out: Record<string, string | number> = {};
    Object.entries(all).forEach(([k, v]) => {
      if (v !== null && v !== undefined && v !== '') out[k] = v;
    });
    return out;
  }
}
