import { Component, DestroyRef, Input, OnChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, of } from 'rxjs';
import { catchError, map, switchMap, tap } from 'rxjs/operators';
import { NewDashboardService } from '../../new-dashboard.service';
import {
  NdActionType,
  NdActionsPage,
  NdColumn,
  NdFilters,
  NdTableQuery,
  ndDescribeError,
} from '../../new-dashboard.models';
import { NdDataTableComponent } from '../nd-data-table/nd-data-table.component';

interface ActionList {
  type: NdActionType;
  title: string;
  hint: string;
  emptyText: string;
  allColumns: NdColumn[];
  columns: NdColumn[];
  rows: any[];
  total: number;
  loading: boolean;
  exporting: boolean;
  error: string;
  resetKey: number;
  query: NdTableQuery;
  load$: Subject<void>;
}

const GP: NdColumn = { key: 'gpName', label: 'GP Name' };
const BLOCK: NdColumn = { key: 'blockName', label: 'Block' };
const DISTRICT: NdColumn = { key: 'districtName', label: 'District' };

/** GP action lists from the Excel "Action" sheet — server-side search, sort and paging. */
@Component({
  selector: 'app-nd-action-items',
  standalone: true,
  imports: [CommonModule, NdDataTableComponent],
  templateUrl: './nd-action-items.component.html',
  styleUrl: './nd-action-items.component.scss',
})
export class NdActionItemsComponent implements OnChanges {
  @Input({ required: true }) filters!: NdFilters;
  @Input() types: NdActionType[] = ['pending-tests', 'zero-case-pending', 'poshan-pending'];
  @Input() showDistrict = true;
  @Input() numbered = true;

  visible: ActionList[] = [];

  private destroyRef = inject(DestroyRef);
  private api = inject(NewDashboardService);
  private lists: ActionList[] = [
    this.createList(
      'pending-tests',
      'GPs with the highest pending presumptive tests',
      'Tests still needed to reach 30 per 1,000 population',
      'No GP has presumptive tests pending for the selected filters.',
      'testsPending',
      [
        GP,
        BLOCK,
        DISTRICT,
        { key: 'population', label: 'Population', type: 'num' },
        { key: 'testsPending', label: 'Tests Pending', type: 'num' },
        { key: 'bucket', label: 'Pendency Bucket', type: 'bucket', sortable: false },
      ]
    ),
    this.createList(
      'zero-case-pending',
      'GPs with 0 cases identified but presumptive testing still pending',
      'Highest under-testing risk · Cases in period = 0',
      'No zero-case GP has tests pending for the selected filters.',
      'testsPending',
      [
        GP,
        BLOCK,
        DISTRICT,
        { key: 'population', label: 'Population', type: 'num' },
        { key: 'tests', label: 'Tests till the month', type: 'num' },
        { key: 'testsPending', label: 'Tests Pending', type: 'num' },
      ]
    ),
    this.createList(
      'poshan-pending',
      'GPs pending Poshan Potli distribution',
      'Nutrition support gap for diagnosed patients',
      'No GP has Poshan Potli pending for the selected filters.',
      'poshanPending',
      [
        GP,
        BLOCK,
        DISTRICT,
        { key: 'cases', label: 'Cases till the month', type: 'num' },
        { key: 'consented', label: 'Consented for Poshan Potli', type: 'num' },
        { key: 'poshanPending', label: 'Poshan Potli Pending', type: 'num' },
      ]
    ),
  ];

  ngOnChanges() {
    this.visible = this.lists.filter((l) => this.types.includes(l.type));
    this.visible.forEach((list) => {
      list.columns = list.allColumns.filter((c) => this.showDistrict || c !== DISTRICT);
      list.query = { ...list.query, page: 1 };
      list.resetKey++;
      list.load$.next();
    });
  }

  onQuery(list: ActionList, query: NdTableQuery) {
    list.query = query;
    list.load$.next();
  }

  exportList(list: ActionList) {
    if (list.exporting) return;
    list.exporting = true;
    this.api
      .actions(list.type, this.filters, {
        page: 1,
        pageSize: 50000,
        search: list.query.search || '',
        sortBy: list.query.sortBy,
        sortDir: list.query.sortDir,
      })
      .subscribe({
        next: (res) => {
          list.exporting = false;
          this.downloadCsv(`tb-mukt-${list.type}`, list.columns, res.data?.rows || []);
        },
        error: () => {
          list.exporting = false;
        },
      });
  }

  private downloadCsv(name: string, columns: NdColumn[], rows: any[]) {
    const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const cell = (row: any, col: NdColumn) => {
      const v = row[col.key];
      if (col.type === 'yesno' || col.type === 'check') return Number(v) === 1 ? 'Yes' : 'No';
      return v;
    };
    const lines = [columns.map((c) => escape(c.label)).join(',')];
    rows.forEach((row) => lines.push(columns.map((c) => escape(cell(row, c))).join(',')));
    const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  private createList(
    type: NdActionType,
    title: string,
    hint: string,
    emptyText: string,
    sortBy: string,
    allColumns: NdColumn[]
  ): ActionList {
    const list: ActionList = {
      type,
      title,
      hint,
      emptyText,
      allColumns,
      columns: allColumns,
      rows: [],
      total: 0,
      loading: false,
      exporting: false,
      error: '',
      resetKey: 0,
      query: { page: 1, pageSize: 10, search: '', sortBy, sortDir: 'desc' },
      load$: new Subject<void>(),
    };

    list.load$
      .pipe(
        tap(() => {
          list.loading = true;
          list.error = '';
        }),
        switchMap(() =>
          this.api.actions(type, this.filters, list.query).pipe(
            map((res) => ({ data: res.data as NdActionsPage | null, error: '' })),
            catchError((err) => of({ data: null, error: ndDescribeError(err).message }))
          )
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(({ data, error }) => {
        list.loading = false;
        list.error = error;
        list.rows = data?.rows || [];
        list.total = data?.total || 0;
      });

    return list;
  }
}
