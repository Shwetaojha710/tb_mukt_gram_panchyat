import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, forkJoin, of } from 'rxjs';
import { catchError, map, switchMap, tap } from 'rxjs/operators';
import { AuthService } from '../core/services/auth.service';
import { NotifyService } from '../core/services/notify.service';
import { NewDashboardService } from './new-dashboard.service';
import {
  ND_MONTHS,
  NdActionType,
  NdColumn,
  NdDrilldown,
  NdFilters,
  NdKpi,
  NdLevel,
  NdSummary,
  NdView,
  ndDescribeError,
  ndFormat,
  ndLevelFromFilters,
} from './new-dashboard.models';
import { NdKpiCardsComponent } from './components/nd-kpi-cards/nd-kpi-cards.component';
import { NdChartComponent } from './components/nd-chart/nd-chart.component';
import { NdFiltersComponent } from './components/nd-filters/nd-filters.component';
import { NdDataTableComponent } from './components/nd-data-table/nd-data-table.component';
import { NdActionItemsComponent } from './components/nd-action-items/nd-action-items.component';
import { buildNewDashboardWorkbook } from './nd-export.util';

interface BarChart {
  labels: string[];
  values: number[];
  notes: string[];
  height: number;
}

const TAB_LABELS: Record<NdView, string> = {
  overview: 'Overview',
  actions: 'Action Items',
};

const LEVEL_LABELS: Record<NdLevel, string> = {
  state: 'State Overview',
  district: 'District Overview',
  block: 'Block Overview',
};

const AWARD_LABELS: Record<string, string> = {
  BRONZE: 'Bronze',
  SILVER: 'Silver',
  GOLD: 'Gold',
  NOT_QUALIFIED: 'Not qualified',
};

const num = (key: string, label: string): NdColumn => ({ key, label, type: 'num' });

/** Columns shared by the district-wise and block-wise drilldowns (Excel order). */
const GROUP_COLUMNS: NdColumn[] = [
  num('totalGps', 'Total GPs'),
  num('reportingGps', 'Reporting GPs'),
  num('eligibleGps', 'Eligible GPs'),
  num('qualifiedGps', 'Qualified GPs'),
  { key: 'qualifiedPct', label: '% Qualified', type: 'pct' },
  num('pendingAbove50', 'Pending Above 50'),
  num('zeroCaseGps', '0-Case GPs'),
  num('zeroCasePendingGps', '0-Case GPs but test pending'),
  num('consented', 'Consented for Poshan Potli'),
  num('poshanPending', 'Poshan Potli Pending'),
  num('goldGps', 'Gold'),
  num('silverGps', 'Silver'),
  num('bronzeGps', 'Bronze'),
];

const DRILL_COLUMNS: Record<NdLevel, NdColumn[]> = {
  state: [{ key: 'name', label: 'District' }, num('totalBlocks', 'Total Blocks'), ...GROUP_COLUMNS],
  district: [{ key: 'name', label: 'Blocks' }, ...GROUP_COLUMNS],
  block: [
    { key: 'name', label: 'GP name' },
    num('population', 'Population'),
    { key: 'eligible', label: 'Eligible', type: 'yesno' },
    { key: 'qualified', label: 'Qualified', type: 'yesno' },
    num('testsPending', 'No. of tests pending to qualify'),
    { key: 'zeroCase', label: '0-Case GPs', type: 'check' },
    { key: 'zeroCasePending', label: '0-Case GPs but test pending', type: 'check' },
    num('consented', 'Consented for Poshan Potli'),
    num('poshanPending', 'Poshan Potli Pending'),
    { key: 'gold', label: 'Gold', type: 'check' },
    { key: 'silver', label: 'Silver', type: 'check' },
    { key: 'bronze', label: 'Bronze', type: 'check' },
  ],
};

@Component({
  selector: 'app-new-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    NdKpiCardsComponent,
    NdChartComponent,
    NdFiltersComponent,
    NdDataTableComponent,
    NdActionItemsComponent,
  ],
  templateUrl: './new-dashboard.component.html',
  styleUrl: './new-dashboard.component.scss',
})
export class NewDashboardComponent implements OnInit {
  readonly tabLabels = TAB_LABELS;
  readonly levelLabels = LEVEL_LABELS;
  /** Bronze, Silver, Gold, Not qualified — bars are labelled on the axis as well */
  readonly awardColors = ['#a85a24', '#8795a1', '#c99700', '#3f6f94'];
  readonly poshanOnly: NdActionType[] = ['poshan-pending'];

  views: NdView[] = ['overview', 'actions'];
  view: NdView = 'overview';
  filters!: NdFilters;
  lockDistrict = false;
  lockBlock = false;

  loading = false;
  exporting = false;
  prompt = '';
  error: ReturnType<typeof ndDescribeError> | null = null;
  summary: NdSummary | null = null;
  drilldown: NdDrilldown | null = null;

  kpiRows: NdKpi[][] = [];
  qualifiedChart: BarChart | null = null;
  bucketChart: BarChart | null = null;
  awardChart: BarChart | null = null;
  tableRows: any[] = [];
  tableColumns: NdColumn[] = [];

  private load$ = new Subject<void>();
  private destroyRef = inject(DestroyRef);

  constructor(
    private api: NewDashboardService,
    private auth: AuthService,
    private notify: NotifyService
  ) {}

  ngOnInit() {
    this.filters = this.defaultFilters();

    this.load$
      .pipe(
        tap(() => {
          this.loading = true;
          this.error = null;
        }),
        switchMap(() => {
          const level = this.level!;
          return forkJoin({
            summary: this.api.summary(level, this.filters),
            drilldown: this.api.drilldown(level, this.filters),
          }).pipe(
            map((res) => ({ summary: res.summary.data, drilldown: res.drilldown.data, error: null })),
            catchError((err) => of({ summary: null, drilldown: null, error: ndDescribeError(err) }))
          );
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((res) => {
        this.loading = false;
        this.error = res.error;
        this.summary = res.summary;
        this.drilldown = res.drilldown;
        if (res.summary && res.drilldown) this.buildView(res.summary, res.drilldown);
      });

    this.load();
  }

  /** Geography level from District / Block filters (all roles). */
  get level(): NdLevel | null {
    return this.view === 'actions' ? null : ndLevelFromFilters(this.filters);
  }

  get pageTitle(): string {
    if (this.view === 'actions') return this.tabLabels.actions;
    return this.level ? this.levelLabels[this.level] : this.tabLabels.overview;
  }

  get periodLabel(): string {
    const f = this.filters;
    const from = `${ND_MONTHS[f.fromMonth - 1]} ${f.fromYear}`;
    const to = `${ND_MONTHS[f.toMonth - 1]} ${f.toYear}`;
    return from === to ? to : `${from} → ${to}`;
  }

  get scopeLabel(): string {
    const s = this.summary?.scope;
    if (!s || this.view === 'actions' || !this.level) return '';
    if (this.level === 'block') return [s.districtName, s.blockName].filter(Boolean).join(' → ');
    if (this.level === 'district') return s.districtName || '';
    return s.districtName || 'Uttar Pradesh';
  }

  get childLabel(): string {
    return this.level === 'state' ? 'district' : this.level === 'district' ? 'block' : 'GP';
  }

  get childTitle(): string {
    return this.level === 'state' ? 'District' : this.level === 'district' ? 'Block' : 'GP';
  }

  get noEntries(): boolean {
    return !!this.summary && !this.summary.kpis['reportingGps'];
  }

  setView(view: NdView) {
    if (view === this.view) return;
    this.view = view;
    this.load();
  }

  onApply(filters: NdFilters) {
    this.filters = filters;
    this.load();
  }

  onReset() {
    this.filters = this.defaultFilters();
    this.load();
  }

  /** Excel with Summary + Drilldown + all Action tables (State / District / Block). */
  exportExcel() {
    const level = this.level || ndLevelFromFilters(this.filters);
    if (this.exporting) return;
    this.exporting = true;
    // Client-side export using existing summary/drilldown/actions APIs
    // (works even when /new-dashboard/export is not deployed yet).
    this.exportExcelClient(level);
  }

  private async exportExcelClient(level: NdLevel) {
    try {
      const blob = await buildNewDashboardWorkbook(this.api, level, this.filters, {
        summary: this.summary,
        drilldown: this.drilldown,
      });
      this.saveExcelBlob(blob, level);
    } catch (err: any) {
      this.exporting = false;
      this.notify.fromHttpError(err, 'Could not export dashboard tables');
    }
  }

  private saveExcelBlob(blob: Blob, level: NdLevel) {
    this.exporting = false;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tb-mukt-${level}-dashboard.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    this.notify.success('Dashboard tables exported to Excel');
  }

  /** Table row → set District/Block filter and stay on Overview. */
  drill(row: any) {
    if (this.level === 'state') {
      this.filters = { ...this.filters, districtId: row.id, blockId: null, gpId: null };
    } else if (this.level === 'district') {
      this.filters = { ...this.filters, blockId: row.id, gpId: null };
    } else {
      return;
    }
    this.load();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  load() {
    this.prompt = '';
    if (this.view === 'actions') return;

    const level = this.level!;
    if (level === 'district' && !this.filters.districtId) {
      this.prompt = 'Select a district and click Apply to see the district overview.';
    } else if (level === 'block' && !this.filters.blockId) {
      this.prompt = 'Select a district and block, then click Apply to see the block overview.';
    }
    if (this.prompt) {
      this.summary = null;
      this.drilldown = null;
      this.error = null;
      return;
    }
    this.load$.next();
  }

  logout() {
    this.auth.logout();
  }

  rowClass = (row: any): string => {
    if (this.level === 'block') return row.testedPct < 50 ? 'row-alert' : '';
    if (!row.reportingGps) return 'row-muted';
    return row.qualifiedPct < 50 ? 'row-alert' : '';
  };

  private defaultFilters(): NdFilters {
    const u = this.auth.currentUser();
    const role = String(u?.role || '').toUpperCase();
    const now = new Date();
    const districtId = role === 'DISTRICT' || role === 'BLOCK' || role === 'TEHSIL' ? u?.districtId || null : null;
    const blockId = role === 'BLOCK' || role === 'TEHSIL' ? u?.blockId || u?.tehsilId || null : null;
    this.lockDistrict = !!districtId;
    this.lockBlock = !!blockId;
    return {
      fromYear: now.getFullYear(),
      fromMonth: 1,
      toYear: now.getFullYear(),
      toMonth: now.getMonth() + 1,
      districtId,
      blockId,
      gpId: null,
    };
  }

  private buildView(s: NdSummary, d: NdDrilldown) {
    const k = s.kpis;
    const v = (key: string) => ndFormat(k[key]);
    const reporting = `${v('reportingGps')} GPs reporting`;
    const medals: NdKpi[] = [
      { label: 'Gold GPs', value: v('goldGps'), tone: 'gold' },
      { label: 'Silver GPs', value: v('silverGps'), tone: 'silver' },
      { label: 'Bronze GPs', value: v('bronzeGps'), tone: 'bronze' },
    ];
    const above50: NdKpi = { label: 'Pending Above 50', value: v('pendingAbove50'), tone: 'warn', sub: 'GPs · tests pending' };
    const qualified: NdKpi = { label: 'GPs Qualified (YTD)', value: v('qualifiedGps'), tone: 'ok', sub: reporting };
    const followUps: NdKpi[] = [
      { label: 'GPs with 0 Cases till date', value: v('zeroCaseGps') },
      { label: 'GPs with 0 Cases but tests pending', value: v('zeroCasePendingGps'), tone: 'warn' },
      { label: 'GPs with Poshan Potli Pending', value: v('poshanPendingGps'), tone: 'warn' },
    ];

    if (s.level === 'state') {
      const below50 = s.buckets
        .filter((b) => b.bucket !== 'None' && b.bucket !== 'Above 50')
        .reduce((sum, b) => sum + b.count, 0);
      this.kpiRows = [
        [
          { label: 'Total Districts', value: v('totalDistricts'), sub: `${v('reportingDistricts')} reporting` },
          { label: 'Total Blocks', value: v('totalBlocks'), sub: `${v('reportingBlocks')} reporting` },
          { label: 'Total GPs (in view)', value: v('totalGps'), sub: reporting },
          qualified,
        ],
        [...medals, { label: 'Tests Pending Below 50', value: ndFormat(below50), sub: 'GPs · 1–50 tests pending' }],
        [
          { label: 'Districts with Gold GPs', value: v('districtsWithGold'), tone: 'gold' },
          { label: 'Districts with Silver GPs', value: v('districtsWithSilver'), tone: 'silver' },
          { label: 'Districts with Bronze GPs', value: v('districtsWithBronze'), tone: 'bronze' },
          ...followUps,
        ],
      ];
    } else if (s.level === 'district') {
      this.kpiRows = [
        [
          { label: 'Total Blocks', value: v('totalBlocks'), sub: `${v('reportingBlocks')} reporting` },
          { label: 'Total GPs', value: v('totalGps'), sub: reporting },
          { label: 'Eligible GPs', value: v('eligibleGps'), sub: '≤1 case per 1,000 population' },
          qualified,
        ],
        [...medals, above50],
        [
          { label: 'Blocks with Gold GPs', value: v('blocksWithGold'), tone: 'gold' },
          { label: 'Blocks with Silver GPs', value: v('blocksWithSilver'), tone: 'silver' },
          { label: 'Blocks with Bronze GPs', value: v('blocksWithBronze'), tone: 'bronze' },
          ...followUps,
        ],
      ];
    } else {
      this.kpiRows = [
        [
          { ...qualified, label: 'GPs qualified (YTD)' },
          ...medals,
          { ...above50, label: 'Pending above 50' },
        ],
        [
          { label: 'Total GPs (in view)', value: v('totalGps'), sub: reporting },
          { label: 'Eligible GPs', value: v('eligibleGps'), sub: '≤1 case per 1,000 population' },
          ...followUps,
        ],
      ];
    }

    this.bucketChart = {
      labels: s.buckets.map((b) => b.bucket),
      values: s.buckets.map((b) => b.count),
      notes: [],
      height: 240,
    };
    this.awardChart = {
      labels: s.awards.map((a) => AWARD_LABELS[a.award] || a.award),
      values: s.awards.map((a) => a.count),
      notes: [],
      height: 240,
    };

    if (s.level === 'block') {
      this.qualifiedChart = null;
      this.tableRows = d.rows.map((r) => ({
        ...r,
        bronze: r.award === 'BRONZE' ? 1 : 0,
        silver: r.award === 'SILVER' ? 1 : 0,
        gold: r.award === 'GOLD' ? 1 : 0,
      }));
    } else {
      const top = d.rows
        .filter((r) => r.reportingGps > 0)
        .sort((a, b) => b.qualifiedGps - a.qualifiedGps || a.name.localeCompare(b.name))
        .slice(0, 15);
      this.qualifiedChart = {
        labels: top.map((r) => r.name),
        values: top.map((r) => r.qualifiedGps),
        notes: top.map((r) => `${ndFormat(r.reportingGps)} of ${ndFormat(r.totalGps)} GPs reporting`),
        height: Math.max(240, top.length * 26 + 60),
      };
      this.tableRows = d.rows;
    }
    this.tableColumns = DRILL_COLUMNS[s.level];
  }
}
