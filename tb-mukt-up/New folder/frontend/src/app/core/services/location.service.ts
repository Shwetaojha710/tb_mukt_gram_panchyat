import { Injectable } from '@angular/core';
import { ApiService } from './api.service';

export interface LocationItem {
  id: number;
  name: string;
  code?: string | null;
  population?: number | null;
}

@Injectable({ providedIn: 'root' })
export class LocationService {
  constructor(private api: ApiService) {}

  getDistricts() {
    return this.api.get<{ success: boolean; data: LocationItem[] }>('/locations/districts');
  }

  /** Blocks under a district (dbo.Block) */
  getBlocks(districtId: number) {
    return this.api.get<{ success: boolean; data: LocationItem[] }>(`/locations/tehsils/${districtId}`);
  }

  /** Resolve district (and names) from a blockId */
  resolveBlock(blockId: number) {
    return this.api.get<{
      success: boolean;
      data: {
        blockId: number;
        tehsilId?: number;
        blockName?: string | null;
        blockCode?: string | null;
        districtId: number | null;
        districtName?: string | null;
        districtCode?: string | null;
      };
    }>(`/locations/blocks/resolve/${blockId}`);
  }

  getGps(blockId: number) {
    return this.api.get<{ success: boolean; data: LocationItem[] }>(`/locations/gps/${blockId}`);
  }

  getVillages(gpId: number) {
    return this.api.get<{ success: boolean; data: LocationItem[] }>(`/locations/villages/${gpId}`);
  }

  getTbUnits(gpId: number) {
    return this.api.get<{ success: boolean; data: LocationItem[] }>(`/locations/tb-units/${gpId}`);
  }

  getContext(params: Record<string, number | undefined>) {
    const q = Object.entries(params)
      .filter(([, v]) => v != null)
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
    return this.api.get<{ success: boolean; data: Record<string, unknown> }>(`/locations/context?${q}`);
  }
}
