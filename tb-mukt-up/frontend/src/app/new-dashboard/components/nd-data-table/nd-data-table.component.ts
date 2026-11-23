import {
  Component,
  DestroyRef,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { NdColumn, NdTableQuery, ndFormat } from '../../new-dashboard.models';

/**
 * Table with search, sorting and pagination.
 * Client mode (default): pass all rows, the table does the work.
 * Server mode: pass one page of rows + total and reload on (queryChange).
 */
@Component({
  selector: 'app-nd-data-table',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './nd-data-table.component.html',
  styleUrl: './nd-data-table.component.scss',
})
export class NdDataTableComponent implements OnInit, OnChanges {
  @Input() columns: NdColumn[] = [];
  @Input() rows: any[] = [];
  @Input() serverSide = false;
  @Input() total = 0;
  @Input() loading = false;
  @Input() error = '';
  @Input() emptyText = 'No records found for the selected filters.';
  @Input() searchPlaceholder = 'Search…';
  /** Client mode: row fields matched by the search box */
  @Input() searchKeys: string[] = ['name'];
  @Input() pageSize = 10;
  @Input() sortBy = '';
  @Input() sortDir: 'asc' | 'desc' = 'asc';
  /** Server mode: change to jump back to page 1 (e.g. when outer filters change) */
  @Input() resetKey: unknown;
  @Input() rowClass?: (row: any) => string;
  @Input() clickable = false;
  /** File name (without extension) enables the CSV download */
  @Input() exportName = '';
  @Input() exporting = false;

  @Output() rowClick = new EventEmitter<any>();
  @Output() queryChange = new EventEmitter<NdTableQuery>();
  @Output() retry = new EventEmitter<void>();
  /** Server mode: parent should fetch all rows and save CSV */
  @Output() exportRequest = new EventEmitter<void>();

  readonly pageSizes = [10, 25, 50];
  search = '';
  page = 1;
  pageRows: any[] = [];
  matched = 0;

  private processed: any[] = [];
  private search$ = new Subject<string>();
  private destroyRef = inject(DestroyRef);

  ngOnInit() {
    this.search$
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.page = 1;
        this.update(true);
      });
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['resetKey'] || (!this.serverSide && changes['rows'])) this.page = 1;
    this.update(false);
  }

  get pageCount(): number {
    return Math.max(1, Math.ceil(this.matched / this.pageSize));
  }

  get rangeStart(): number {
    return this.matched ? (this.page - 1) * this.pageSize + 1 : 0;
  }

  get rangeEnd(): number {
    return Math.min(this.matched, this.page * this.pageSize);
  }

  onSearch(text: string) {
    this.search = text;
    this.search$.next(text.trim());
  }

  sort(col: NdColumn) {
    if (col.sortable === false) return;
    if (this.sortBy === col.key) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortBy = col.key;
      this.sortDir = !col.type || col.type === 'text' ? 'asc' : 'desc';
    }
    this.page = 1;
    this.update(true);
  }

  ariaSort(col: NdColumn): string | null {
    if (this.sortBy !== col.key) return null;
    return this.sortDir === 'asc' ? 'ascending' : 'descending';
  }

  goTo(page: number) {
    this.page = Math.min(this.pageCount, Math.max(1, page));
    this.update(true);
  }

  setPageSize(size: string | number) {
    this.pageSize = Number(size) || 10;
    this.page = 1;
    this.update(true);
  }

  isOn(value: unknown): boolean {
    return Number(value) === 1;
  }

  fmt = ndFormat;

  onExport() {
    if (this.serverSide) {
      this.exportRequest.emit();
      return;
    }
    this.exportCsv(this.processed);
  }

  /** Public so parents can download after a server-side fetch */
  exportCsv(rows: any[] = this.processed) {
    const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [this.columns.map((c) => escape(c.label)).join(',')];
    rows.forEach((row) => lines.push(this.columns.map((c) => escape(this.csvValue(row, c))).join(',')));
    const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.exportName || 'export'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  private csvValue(row: any, col: NdColumn): unknown {
    const v = row[col.key];
    if (col.type === 'yesno' || col.type === 'check') return this.isOn(v) ? 'Yes' : 'No';
    return v;
  }

  private update(userAction: boolean) {
    if (this.serverSide) {
      this.pageRows = this.rows;
      this.matched = this.total;
      if (userAction) {
        this.queryChange.emit({
          page: this.page,
          pageSize: this.pageSize,
          search: this.search.trim(),
          sortBy: this.sortBy,
          sortDir: this.sortDir,
        });
      }
      return;
    }

    const term = this.search.trim().toLowerCase();
    let list = term
      ? this.rows.filter((r) => this.searchKeys.some((k) => String(r[k] ?? '').toLowerCase().includes(term)))
      : [...this.rows];

    if (this.sortBy) {
      const key = this.sortBy;
      const dir = this.sortDir === 'asc' ? 1 : -1;
      list = list.sort((a, b) => {
        const x = a[key];
        const y = b[key];
        if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir;
        return String(x ?? '').localeCompare(String(y ?? ''), undefined, { numeric: true }) * dir;
      });
    }

    this.processed = list;
    this.matched = list.length;
    this.page = Math.min(this.page, this.pageCount);
    this.pageRows = list.slice((this.page - 1) * this.pageSize, this.page * this.pageSize);
  }
}
