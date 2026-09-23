import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

@Component({
  selector: 'app-month-year-picker',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './month-year-picker.component.html',
  styleUrl: './month-year-picker.component.scss',
})
export class MonthYearPickerComponent implements OnChanges {
  @Input() year = new Date().getFullYear();
  @Input() month = new Date().getMonth() + 1;
  @Input() minYear = 2023;
  @Input() maxYear = 2026;
  @Input() label = '';
  @Input() placeholder = 'Select month';

  @Output() yearChange = new EventEmitter<number>();
  @Output() monthChange = new EventEmitter<number>();
  @Output() periodChange = new EventEmitter<{ year: number; month: number }>();

  open = false;
  viewYear = this.year;
  months = MONTH_SHORT.map((name, i) => ({ id: i + 1, name }));

  constructor(private host: ElementRef<HTMLElement>) {}

  ngOnChanges(changes: SimpleChanges) {
    if (changes['year'] && this.year) {
      this.viewYear = this.year;
    }
  }

  get displayLabel(): string {
    if (!this.year || !this.month) return this.placeholder;
    return `${MONTH_FULL[this.month - 1]} ${this.year}`;
  }

  get canPrevYear(): boolean {
    return this.viewYear > this.minYear;
  }

  get canNextYear(): boolean {
    return this.viewYear < this.maxYear;
  }

  toggle(event?: Event) {
    event?.stopPropagation();
    this.open = !this.open;
    if (this.open) this.viewYear = this.year || this.maxYear;
  }

  close() {
    this.open = false;
  }

  prevYear(event: Event) {
    event.stopPropagation();
    if (!this.canPrevYear) return;
    this.viewYear -= 1;
  }

  nextYear(event: Event) {
    event.stopPropagation();
    if (!this.canNextYear) return;
    this.viewYear += 1;
  }

  selectMonth(month: number, event: Event) {
    event.stopPropagation();
    this.year = this.viewYear;
    this.month = month;
    this.yearChange.emit(this.year);
    this.monthChange.emit(this.month);
    this.periodChange.emit({ year: this.year, month: this.month });
    this.close();
  }

  isSelected(month: number): boolean {
    return this.year === this.viewYear && this.month === month;
  }

  selectThisMonth(event: Event) {
    event.stopPropagation();
    const now = new Date();
    let y = now.getFullYear();
    let m = now.getMonth() + 1;
    if (y > this.maxYear) {
      y = this.maxYear;
      m = 12;
    }
    if (y < this.minYear) {
      y = this.minYear;
      m = 1;
    }
    this.viewYear = y;
    this.selectMonth(m, event);
  }

  @HostListener('document:click', ['$event'])
  onDocClick(event: MouseEvent) {
    if (!this.open) return;
    if (!this.host.nativeElement.contains(event.target as Node)) {
      this.close();
    }
  }

  @HostListener('document:keydown.escape')
  onEsc() {
    if (this.open) this.close();
  }
}
