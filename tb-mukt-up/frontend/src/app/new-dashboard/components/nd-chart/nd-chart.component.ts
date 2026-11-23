import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

/** Single-series bar chart (vertical or horizontal) on the app's Chart.js. */
@Component({
  selector: 'app-nd-chart',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="nd-chart" [style.height.px]="height">
      <canvas #canvas [hidden]="empty" role="img" [attr.aria-label]="ariaLabel"></canvas>
      <div class="nd-chart-empty" *ngIf="empty">{{ emptyText }}</div>
    </div>
  `,
  styles: [
    `
      .nd-chart {
        position: relative;
        width: 100%;
      }
      .nd-chart-empty {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        text-align: center;
        padding: 0.75rem;
        color: var(--tb-muted);
        background: #f7fbfe;
        border: 1px dashed var(--tb-line);
        border-radius: 12px;
      }
    `,
  ],
})
export class NdChartComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() labels: string[] = [];
  @Input() values: number[] = [];
  /** One colour for the series, or one per bar when the bars are named categories */
  @Input() colors: string | string[] = '#0a4f7a';
  @Input() seriesLabel = '';
  /** Optional extra tooltip line per bar */
  @Input() notes: string[] = [];
  @Input() horizontal = false;
  @Input() height = 240;
  @Input() ariaLabel = '';
  @Input() emptyText = 'No data for the selected filters';

  @ViewChild('canvas') canvasRef?: ElementRef<HTMLCanvasElement>;

  empty = true;
  private chart?: Chart;
  private ready = false;

  constructor(private zone: NgZone) {}

  ngAfterViewInit() {
    this.ready = true;
    this.render();
  }

  ngOnChanges() {
    this.empty = !this.labels.length || !this.values.some((v) => Number(v) > 0);
    if (this.ready) this.render();
  }

  ngOnDestroy() {
    this.chart?.destroy();
  }

  private render() {
    this.chart?.destroy();
    this.chart = undefined;
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas || this.empty) return;

    const valueAxis = {
      beginAtZero: true,
      ticks: { precision: 0, color: '#5a6f82' },
      grid: { color: '#e6eef5' },
      border: { display: false },
    };
    const categoryAxis = {
      ticks: { color: '#0c2438', autoSkip: false },
      grid: { display: false },
      border: { color: '#d3e2ee' },
    };

    this.zone.runOutsideAngular(() => {
      this.chart = new Chart(canvas, {
        type: 'bar',
        data: {
          labels: this.labels,
          datasets: [
            {
              label: this.seriesLabel,
              data: this.values,
              backgroundColor: this.colors,
              borderRadius: 4,
              maxBarThickness: 30,
            },
          ],
        },
        options: {
          indexAxis: this.horizontal ? 'y' : 'x',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            // Single series — the panel title names it
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (item) => `${this.seriesLabel}: ${Number(item.raw).toLocaleString('en-IN')}`,
                afterLabel: (item) => this.notes[item.dataIndex] || '',
              },
            },
          },
          scales: this.horizontal ? { x: valueAxis, y: categoryAxis } : { x: categoryAxis, y: valueAxis },
        },
      });
    });
  }
}
