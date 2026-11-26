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
  year = this.books[0]?.year ?? 2025;
  sheetIndex = this.defaultSheetIndex(this.year);
  query = '';

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

  get rows(): Cell[][] {
    const list = this.sheet?.rows ?? [];
    const q = this.query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((row) => row.some((cell) => String(cell ?? '').toLowerCase().includes(q)));
  }

  selectYear(year: number) {
    if (this.year === year) return;
    this.year = year;
    this.sheetIndex = this.defaultSheetIndex(year);
    this.query = '';
  }

  selectSheet(index: number) {
    this.sheetIndex = Number(index) || 0;
    this.query = '';
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
    if (h === '%' || h.startsWith('%')) return '% qualified';
    if (h.startsWith('s. no') || h.startsWith('s no')) return '#';
    if (h.includes('district')) return 'District';
    if (h.includes('total') && h.includes('panchayat') && !h.includes('claim') && !h.includes('mukt') && !h.includes('tb free')) {
      return 'Total GPs';
    }
    if (h.includes('claim')) return 'Claims submitted';
    if (h.includes('after verification') || h.includes('qualified')) return 'Qualified GPs';
    if (h.includes('bronze')) return 'Bronze';
    if (h.includes('silver')) return 'Silver';
    if (h.includes('gold')) return 'Gold';
    if (h.includes('tb free') || h.includes('2023')) return 'TB free 2023';
    return header;
  }

  isTotal(row: Cell[]): boolean {
    return row.some((cell) => {
      const text = String(cell ?? '').trim().toLowerCase();
      return text === 'uttar pradesh' || text.startsWith('total');
    });
  }

  isPercent(header: string): boolean {
    return header.trim() === '%';
  }

  isTextHeader(header: string): boolean {
    const h = header.toLowerCase();
    return h.includes('name') || h.includes('district') || h.includes('status') || !header.trim();
  }

  isNum(value: Cell): boolean {
    return typeof value === 'number';
  }

  cellText(value: Cell, header: string): string {
    if (value == null || value === '') return '';
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
