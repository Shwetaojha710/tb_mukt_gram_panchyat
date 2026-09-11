import { Component, OnInit, AfterViewInit, ElementRef, ViewChild, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Chart, registerables } from 'chart.js';
import { DashboardService } from '../core/services/dashboard.service';
import { NotifyService } from '../core/services/notify.service';
import { LocationCascadeComponent, LocationSelection } from '../shared/components/location-cascade/location-cascade.component';

Chart.register(...registerables);

@Component({
  selector: 'app-dashboard-view',
  standalone: true,
  imports: [CommonModule, FormsModule, LocationCascadeComponent],
  templateUrl: './dashboard-view.component.html',
  styleUrl: './dashboard-view.component.scss',
})
export class DashboardViewComponent implements OnInit, AfterViewInit {
  @Input() title = 'Dashboard';
  @Input() level: 'state' | 'district' | 'block' = 'state';

  @ViewChild('monthlyChart') monthlyChartRef?: ElementRef<HTMLCanvasElement>;
  chart?: Chart;

  loading = false;
  year = new Date().getFullYear();
  dateFrom = '';
  dateTo = '';
  location: LocationSelection = {};
  summary: any = null;
  rankings: any = null;

  constructor(private dashboard: DashboardService, private notify: NotifyService) {}

  ngOnInit() {
    this.load();
  }

  ngAfterViewInit() {
    // chart rendered after data load
  }

  filters() {
    return {
      year: this.year,
      dateFrom: this.dateFrom || undefined,
      dateTo: this.dateTo || undefined,
      districtId: this.location.districtId || undefined,
      blockId: this.location.blockId || this.location.tehsilId || undefined,
      gpId: this.location.gpId || undefined,
    };
  }

  load() {
    this.loading = true;
    const f = this.filters();
    this.dashboard.summary(f).subscribe({
      next: (res: any) => {
        this.summary = res.data;
        this.renderChart();
        this.dashboard.rankings(f).subscribe({
          next: (r: any) => {
            this.rankings = r.data;
            this.loading = false;
          },
          error: (err: any) => {
            this.loading = false;
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

  renderChart() {
    if (!this.monthlyChartRef || !this.summary?.monthly) return;
    const labels = this.summary.monthly.map((m: any) => `M${m.month}`);
    const tested = this.summary.monthly.map((m: any) => m.tested);
    const qualified = this.summary.monthly.map((m: any) => m.qualified);
    this.chart?.destroy();
    this.chart = new Chart(this.monthlyChartRef.nativeElement, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Testing Done', data: tested, borderColor: '#0b4f8a', tension: 0.3 },
          { label: 'Qualified GPs', data: qualified, borderColor: '#2e7d32', tension: 0.3 },
        ],
      },
      options: { responsive: true, plugins: { legend: { position: 'bottom' } } },
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
        this.notify.success('Excel downloaded');
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
}
