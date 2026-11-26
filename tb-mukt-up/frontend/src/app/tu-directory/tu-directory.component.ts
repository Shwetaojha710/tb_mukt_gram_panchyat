import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import data from './tbmp-year-data.json';

type Cell = string | number | null;

interface Sheet {
  name: string;
  title: string | null;
  headers: string[];
  rows: Cell[][];
}

interface YearBook {
  year: number;
  label: string;
  sheets: Sheet[];
}

@Component({
  selector: 'app-tu-directory',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './tu-directory.component.html',
  styleUrl: './tu-directory.component.scss',
})
export class TuDirectoryComponent {
  readonly books = (data as YearBook[]).slice().sort((a, b) => b.year - a.year);
  readonly pageSize = 20;

  year = this.books[0]?.year ?? 2025;
  sheetIndex = this.defaultSheetIndex(this.year);
  query = '';
  page = 1;

  get book(): YearBook | undefined {
    return this.books.find((b) => b.year === this.year) ?? this.books[0];
  }

  get sheet(): Sheet | undefined {
    const sheets = this.book?.sheets ?? [];
    return sheets[this.sheetIndex] ?? sheets[0];
  }

  /** Skip unnamed Excel helper columns so the table stays readable. */
  get columns(): number[] {
    const headers = this.sheet?.headers ?? [];
    const named = headers.map((h, i) => (h.trim() ? i : -1)).filter((i) => i >= 0);
    return named.length ? named : headers.map((_, i) => i);
  }

  get filteredRows(): Cell[][] {
    const list = this.sheet?.rows ?? [];
    const q = this.query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((row) => row.some((cell) => String(cell ?? '').toLowerCase().includes(q)));
  }

  get totalRows(): number {
    return this.filteredRows.length;
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.totalRows / this.pageSize));
  }

  get pageRows(): Cell[][] {
    const start = (this.page - 1) * this.pageSize;
    return this.filteredRows.slice(start, start + this.pageSize);
  }

  /** Compact page buttons around current page (max 5). */
  get pageNumbers(): number[] {
    const total = this.totalPages;
    if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1);
    let start = Math.max(1, this.page - 2);
    let end = Math.min(total, start + 4);
    start = Math.max(1, end - 4);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }

  selectYear(year: number) {
    if (this.year === year) return;
    this.year = year;
    this.sheetIndex = this.defaultSheetIndex(year);
    this.query = '';
    this.page = 1;
  }

  selectSheet(index: number) {
    this.sheetIndex = Number(index) || 0;
    this.query = '';
    this.page = 1;
  }

  onSearch(value: string) {
    this.query = value;
    this.page = 1;
  }

  goToPage(p: number) {
    if (p < 1 || p > this.totalPages || p === this.page) return;
    this.page = p;
  }

  prevPage() {
    this.goToPage(this.page - 1);
  }

  nextPage() {
    this.goToPage(this.page + 1);
  }

  sheetLabel(name: string): string {
    const labels: Record<string, string> = {
      'Final Sheet of Qualified GP': 'Qualified GPs',
      '% wise TBMP Data': 'Percent of GPs',
      'In Increasing order': 'Highest % first',
      'Decreased order': 'Lowest % first',
      '1 april 2025': '1 April 2025 list',
      'Final Sheet Analysis raw': 'Claim check',
      Sheet1: 'District list',
    };
    return labels[name] || name;
  }

  headerLabel(header: string): string {
    const h = header.trim().toLowerCase();
    if (!h) return '';
    if (h === '%' || h.startsWith('%')) return '% Qualified';
    if (h.startsWith('s. no') || h.startsWith('s no') || h === 's.no') return '#';
    if (h.includes('bronze')) return 'Bronze';
    if (h.includes('silver')) return 'Silver';
    if (h.includes('gold')) return 'Gold';
    if (h.includes('claim')) return 'Claims submitted';
    if (h.includes('after verification') || (h.includes('qualified') && h.includes('panchayat'))) {
      return 'Qualified GPs';
    }
    if (h.includes('tb free') || (h.includes('declared') && h.includes('2023'))) return 'TB free 2023';
    if (
      (h.includes('total') && h.includes('panchayat')) ||
      (h.includes('no of') && h.includes('gram panchayat')) ||
      (h.includes('number of') && h.includes('panchayat') && h.includes('district') && !h.includes('claim') && !h.includes('qualified') && !h.includes('mukt'))
    ) {
      return 'Total GPs';
    }
    if (h.includes('district') || h.includes('name of the district') || h.includes('district name')) {
      return 'District';
    }
    return header;
  }

  isTotal(row: Cell[]): boolean {
    return row.some((cell) => {
      const text = String(cell ?? '').trim().toLowerCase();
      return text === 'uttar pradesh' || text.startsWith('total');
    });
  }

  isPercent(header: string): boolean {
    const h = header.trim();
    return h === '%' || h.toLowerCase().startsWith('%');
  }

  isTextHeader(header: string): boolean {
    const label = this.headerLabel(header).toLowerCase();
    return label === 'district' || label === '#' || !header.trim();
  }

  isNum(value: Cell): boolean {
    return typeof value === 'number';
  }

  cellText(value: Cell, header: string): string {
    if (value == null || value === '') return '—';
    if (typeof value === 'number') {
      if (this.isPercent(header)) {
        return `${value.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}%`;
      }
      if (Number.isInteger(value)) return value.toLocaleString('en-IN');
      return value.toLocaleString('en-IN', { maximumFractionDigits: 2 });
    }
    return value;
  }

  private defaultSheetIndex(year: number): number {
    const sheets = this.books.find((b) => b.year === year)?.sheets ?? [];
    const preferred = sheets.findIndex((s) => s.name === 'Final Sheet of Qualified GP');
    return preferred >= 0 ? preferred : 0;
  }
}
