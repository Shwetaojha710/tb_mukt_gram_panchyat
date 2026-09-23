import {
  Component,
  OnInit,
  OnDestroy,
  ElementRef,
  ViewChild,
  Input,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Chart, registerables } from 'chart.js';
import { DashboardService } from '../core/services/dashboard.service';
import { NotifyService } from '../core/services/notify.service';
import { AuthService } from '../core/services/auth.service';
import { LocationService } from '../core/services/location.service';
import { LocationCascadeComponent, LocationSelection } from '../shared/components/location-cascade/location-cascade.component';
import { MonthYearPickerComponent } from '../shared/components/month-year-picker/month-year-picker.component';

Chart.register(...registerables);

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

@Component({
  selector: 'app-dashboard-view',
  standalone: true,
  imports: [CommonModule, FormsModule, LocationCascadeComponent, MonthYearPickerComponent],
  templateUrl: './dashboard-view.component.html',
  styleUrl: './dashboard-view.component.scss',
})
export class DashboardViewComponent implements OnInit, OnDestroy {
  @Input() title = 'Dashboard';
  @Input() level: 'state' | 'district' | 'block' = 'state';

  @ViewChild('monthlyChart') monthlyChartRef?: ElementRef<HTMLCanvasElement>;
  chart?: Chart;

  loading = false;
  year = Math.min(2026, Math.max(2023, new Date().getFullYear()));
  reportingMonth = new Date().getMonth() + 1;
  fromYear = this.year;
  fromMonth = 1;
  toYear = this.year;
  toMonth = this.reportingMonth;
  readonly periodMinYear = 2023;
  readonly periodMaxYear = 2026;
  location: LocationSelection = {};
  summary: any = null;
  rankings: any = null;
  lockDistrict = false;
  lockBlock = false;
  hasMonthlyData = false;
  stateName = 'Uttar Pradesh';
  locMeta: {
    districtCode?: string | null;
    districtName?: string | null;
    blockCode?: string | null;
    blockName?: string | null;
    gpCode?: string | null;
    gpName?: string | null;
    gpPopulation?: number | null;
    villageCode?: string | null;
    villageName?: string | null;
    villagePopulation?: number | null;
    tbUnitName?: string | null;
  } = {};

  constructor(
    private dashboard: DashboardService,
    private notify: NotifyService,
    private auth: AuthService,
    private locationApi: LocationService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.applyRoleDefaults();
    this.load();
  }

  ngOnDestroy() {
    this.chart?.destroy();
  }

  private toMonthInput(year: number, month: number): string {
    return `${year}-${String(month).padStart(2, '0')}`;
  }

  get dateFrom(): string {
    return this.toMonthInput(this.fromYear, this.fromMonth);
  }

  get dateTo(): string {
    return this.toMonthInput(this.toYear, this.toMonth);
  }

  get isState(): boolean {
    return this.level === 'state';
  }

  get isDistrict(): boolean {
    return this.level === 'district';
  }

  get isBlock(): boolean {
    return this.level === 'block';
  }

  get monthLabel(): string {
    return MONTH_LABELS[(this.reportingMonth || 1) - 1] || String(this.reportingMonth);
  }

  get periodRangeLabel(): string {
    const fromLabel = `${MONTH_LABELS[this.fromMonth - 1]} ${this.fromYear}`;
    const toLabel = `${MONTH_LABELS[this.toMonth - 1]} ${this.toYear}`;
    return fromLabel === toLabel ? toLabel : `${fromLabel} → ${toLabel}`;
  }

  /** Short period text for table headers, e.g. Jan–Sep 2026 */
  get selectedPeriodShort(): string {
    if (this.fromYear === this.toYear && this.fromMonth === this.toMonth) {
      return `${MONTH_LABELS[this.toMonth - 1]} ${this.toYear}`;
    }
    if (this.fromYear === this.toYear) {
      return `${MONTH_LABELS[this.fromMonth - 1]}–${MONTH_LABELS[this.toMonth - 1]} ${this.toYear}`;
    }
    return `${MONTH_LABELS[this.fromMonth - 1]} ${this.fromYear} → ${MONTH_LABELS[this.toMonth - 1]} ${this.toYear}`;
  }

  /** YTD window: Jan till selected To month/year */
  get ytdPeriodShort(): string {
    if (this.toMonth <= 1) return `Jan ${this.toYear}`;
    return `Jan–${MONTH_LABELS[this.toMonth - 1]} ${this.toYear}`;
  }

  /** Same months in previous year (for Tx success compare) */
  get prevYearPeriodShort(): string {
    const py = this.toYear - 1;
    if (this.fromYear === this.toYear && this.fromMonth === this.toMonth) {
      return `${MONTH_LABELS[this.toMonth - 1]} ${py}`;
    }
    if (this.fromYear === this.toYear) {
      return `${MONTH_LABELS[this.fromMonth - 1]}–${MONTH_LABELS[this.toMonth - 1]} ${py}`;
    }
    return `${MONTH_LABELS[this.fromMonth - 1]} ${this.fromYear - 1} → ${MONTH_LABELS[this.toMonth - 1]} ${py}`;
  }

  /** District → Block label for block dashboard table header */
  get blockScopeLabel(): string {
    const row = (this.rankings?.tbUnitGpLineList || [])[0];
    const district =
      this.locMeta.districtName ||
      row?.districtName ||
      (this.auth.currentUser() as any)?.districtName ||
      '';
    const block =
      this.locMeta.blockName ||
      row?.blockName ||
      (this.auth.currentUser() as any)?.blockName ||
      (this.auth.currentUser() as any)?.tehsilName ||
      '';
    if (district && block) return `${district} → ${block}`;
    if (district) return district;
    if (block) return block;
    return '';
  }

  private applyRoleDefaults() {
    const u = this.auth.currentUser() as any;
    if (!u) return;
    const role = String(u.role || '').toUpperCase();
    this.stateName = u.stateName || 'Uttar Pradesh';
    this.location = {
      districtId: u.districtId || null,
      blockId: u.blockId || u.tehsilId || null,
      tehsilId: u.blockId || u.tehsilId || null,
      gpId: u.gpId || null,
    };
    if (role === 'DISTRICT') {
      this.lockDistrict = !!u.districtId;
    }
    if (role === 'BLOCK' || role === 'TEHSIL') {
      this.lockDistrict = !!u.districtId;
      this.lockBlock = !!(u.blockId || u.tehsilId);
    }
  }

  private resetPeriodDefaults() {
    this.year = Math.min(2026, Math.max(2023, new Date().getFullYear()));
    this.reportingMonth = new Date().getMonth() + 1;
    this.fromYear = this.year;
    this.fromMonth = 1;
    this.toYear = this.year;
    this.toMonth = this.reportingMonth;
  }

  resetFilters() {
    this.resetPeriodDefaults();
    this.lockDistrict = false;
    this.lockBlock = false;
    this.location = {};
    this.applyRoleDefaults();
    this.load();
  }

  filters() {
    this.year = this.toYear;
    this.reportingMonth = this.toMonth;
    return {
      year: this.year,
      reportingMonth: this.reportingMonth || undefined,
      dateFrom: this.dateFrom,
      dateTo: this.dateTo,
      districtId: this.location.districtId || undefined,
      blockId: this.location.blockId || this.location.tehsilId || undefined,
      gpId: this.location.gpId || undefined,
    };
  }

  load() {
    if (
      this.fromYear > this.toYear ||
      (this.fromYear === this.toYear && this.fromMonth > this.toMonth)
    ) {
      this.notify.error('From period cannot be after To period');
      return;
    }

    this.loading = true;
    this.chart?.destroy();
    this.chart = undefined;
    const f = this.filters();
    this.refreshLocMeta();

    this.dashboard.summary(f).subscribe({
      next: (res: any) => {
        this.summary = res.data;
        this.hasMonthlyData = Array.isArray(this.summary?.monthly) && this.summary.monthly.length > 0;
        this.dashboard.rankings(f).subscribe({
          next: (r: any) => {
            this.rankings = r.data;
            this.loading = false;
            this.cdr.detectChanges();
            setTimeout(() => this.renderChart(), 0);
          },
          error: (err: any) => {
            this.loading = false;
            this.cdr.detectChanges();
            setTimeout(() => this.renderChart(), 0);
            this.notify.fromHttpError(err);
          },
        });
      },
      error: (err: any) => {
        this.loading = false;
        this.notify.fromHttpError(err);
      },
    });
  }

  private refreshLocMeta() {
    const districtId = this.location.districtId || undefined;
    const blockId = this.location.blockId || this.location.tehsilId || undefined;
    const gpId = this.location.gpId || undefined;
    if (!districtId && !blockId && !gpId) {
      this.locMeta = {};
      return;
    }
    this.locationApi
      .getContext({ districtId, blockId, tehsilId: blockId, gpId })
      .subscribe({
        next: (res) => {
          this.locMeta = (res.data || {}) as typeof this.locMeta;
          this.cdr.detectChanges();
        },
        error: () => {
          this.locMeta = {};
        },
      });
  }

  codeName(code?: string | null, name?: string | null): string {
    if (code && name) return `${code} / ${name}`;
    if (name) return name;
    if (code) return String(code);
    return 'All (filter not set)';
  }

  renderChart() {
    if (this.isState || this.isDistrict || this.isBlock) return; // table views — no chart
    if (!this.monthlyChartRef?.nativeElement || !this.summary?.monthly?.length) return;

    const labels = this.summary.monthly.map((m: any) => MONTH_LABELS[(Number(m.month) || 1) - 1] || `M${m.month}`);
    const tested = this.summary.monthly.map((m: any) => Number(m.tested) || 0);
    const qualified = this.summary.monthly.map((m: any) => Number(m.qualified) || 0);
    const pending = this.summary.monthly.map((m: any) => Number(m.pending) || 0);

    this.chart?.destroy();
    this.chart = new Chart(this.monthlyChartRef.nativeElement, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            type: 'bar',
            label: 'Testing Done',
            data: tested,
            backgroundColor: 'rgba(10, 79, 122, 0.75)',
            borderRadius: 6,
            order: 2,
          },
          {
            type: 'line',
            label: 'Qualified GPs',
            data: qualified,
            borderColor: '#1f7a4c',
            tension: 0.35,
            fill: false,
            yAxisID: 'y1',
            order: 1,
          },
          {
            type: 'line',
            label: 'Testing Pending',
            data: pending,
            borderColor: '#e07a1a',
            borderDash: [5, 4],
            tension: 0.3,
            fill: false,
            order: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } },
        },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, title: { display: true, text: 'Tests' } },
          y1: {
            beginAtZero: true,
            position: 'right',
            title: { display: true, text: 'Qualified GPs' },
            grid: { drawOnChartArea: false },
            ticks: { precision: 0 },
          },
        },
      },
    });
  }

  exportExcel() {
    this.dashboard.exportExcel(this.filters()).subscribe({
      next: (blob: Blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `tb-mukt-${this.level}-dashboard.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
        this.notify.success(
          this.isState || this.isDistrict || this.isBlock
            ? 'Table exported to Excel'
            : 'Excel / line list downloaded'
        );
      },
      error: (err: any) => this.notify.fromHttpError(err),
    });
  }

  medalClass(medal?: string) {
    return {
      bronze: medal === 'BRONZE',
      silver: medal === 'SILVER',
      gold: medal === 'GOLD',
    };
  }

  yesNoClass(yes: boolean | number) {
    return Number(yes) ? 'yes' : 'no';
  }

  isYes(value: boolean | number | null | undefined): boolean {
    return Number(value) === 1;
  }

  fmt(n: number | string | null | undefined): string {
    const v = Number(n) || 0;
    return v.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  }
}
