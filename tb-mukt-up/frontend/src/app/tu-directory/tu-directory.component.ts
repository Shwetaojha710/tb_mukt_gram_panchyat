import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NotifyService } from '../core/services/notify.service';
import {
  TuDirectoryDetail,
  TuDirectoryService,
  TuDirectorySummary,
  TuDistrictSummary,
} from '../core/services/tu-directory.service';

@Component({
  selector: 'app-tu-directory',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './tu-directory.component.html',
  styleUrl: './tu-directory.component.scss',
})
export class TuDirectoryComponent implements OnInit {
  private api = inject(TuDirectoryService);
  private notify = inject(NotifyService);

  years = [2024, 2025, 2026];
  availableYears: number[] = [];
  year = 2025;
  districtQuery = '';
  tuQuery = '';
  loading = false;
  detailLoading = false;

  summary: TuDirectorySummary | null = null;
  selected: TuDistrictSummary | null = null;
  detail: TuDirectoryDetail | null = null;
  scopedDistrict: string | null = null;

  ngOnInit() {
    this.api.meta().subscribe({
      next: (res) => {
        this.years = res.data?.years?.length ? res.data.years : this.years;
        this.availableYears = res.data?.availableYears || [];
        this.year = res.data?.defaultYear || 2025;
        this.scopedDistrict = res.data?.scopedDistrict || null;
        this.loadSummary();
      },
      error: (err) => {
        this.notify.fromHttpError(err, 'Failed to load TU directory');
        this.loadSummary();
      },
    });
  }

  get districts(): TuDistrictSummary[] {
    const list = this.summary?.districts || [];
    const q = this.districtQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter((d) => d.name.toLowerCase().includes(q));
  }

  get tus() {
    const list = this.detail?.tus || [];
    const q = this.tuQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter((t) => t.name.toLowerCase().includes(q));
  }

  selectYear(y: number) {
    if (this.loading || this.year === y || !this.isYearAvailable(y)) return;
    this.year = y;
    this.districtQuery = '';
    this.tuQuery = '';
    this.selected = null;
    this.detail = null;
    this.loadSummary();
  }

  isYearAvailable(y: number): boolean {
    return this.availableYears.includes(y);
  }

  loadSummary() {
    this.loading = true;
    this.api.summary(this.year).subscribe({
      next: (res) => {
        this.summary = res.data;
        this.loading = false;
        const list = res.data?.districts || [];
        if (list.length === 1) this.openDistrict(list[0]);
        else if (list.length && !this.selected) this.openDistrict(list[0]);
      },
      error: (err) => {
        this.loading = false;
        this.summary = null;
        this.notify.fromHttpError(err, 'Failed to load districts');
      },
    });
  }

  openDistrict(d: TuDistrictSummary) {
    if (this.selected?.name === d.name && this.detail) return;
    this.selected = d;
    this.tuQuery = '';
    this.detailLoading = true;
    this.detail = null;
    this.api.district(this.year, d.name).subscribe({
      next: (res) => {
        this.detail = res.data;
        this.detailLoading = false;
      },
      error: (err) => {
        this.detailLoading = false;
        this.notify.fromHttpError(err, 'Failed to load TUs');
      },
    });
  }

  clearDistrictSearch() {
    this.districtQuery = '';
  }

  fmt(n: number | null | undefined): string {
    if (n == null || Number.isNaN(Number(n))) return '0';
    return Number(n).toLocaleString('en-IN');
  }
}
