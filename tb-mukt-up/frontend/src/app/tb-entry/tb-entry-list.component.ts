import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TbService } from '../core/services/tb.service';
import { NotifyService } from '../core/services/notify.service';
import { LocationCascadeComponent, LocationSelection } from '../shared/components/location-cascade/location-cascade.component';

@Component({
  selector: 'app-tb-entry-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LocationCascadeComponent],
  templateUrl: './tb-entry-list.component.html',
  styleUrl: './tb-entry-list.component.scss',
})
export class TbEntryListComponent implements OnInit {
  private tb = inject(TbService);
  private notify = inject(NotifyService);

  loading = false;
  items: any[] = [];
  total = 0;
  page = 1;
  pageSize = 20;
  year = new Date().getFullYear();
  month: number | null = null;
  status = '';
  location: LocationSelection = {};

  months = [
    { id: 1, name: 'January' }, { id: 2, name: 'February' }, { id: 3, name: 'March' },
    { id: 4, name: 'April' }, { id: 5, name: 'May' }, { id: 6, name: 'June' },
    { id: 7, name: 'July' }, { id: 8, name: 'August' }, { id: 9, name: 'September' },
    { id: 10, name: 'October' }, { id: 11, name: 'November' }, { id: 12, name: 'December' },
  ];

  ngOnInit() {
    this.load();
  }

  get totalPages() {
    return Math.max(1, Math.ceil(this.total / this.pageSize));
  }

  monthName(m: number) {
    return this.months.find((x) => x.id === m)?.name || m;
  }

  load(resetPage = false) {
    if (resetPage) this.page = 1;
    this.loading = true;
    this.tb
      .listEntries({
        year: this.year || undefined,
        month: this.month || undefined,
        status: this.status || undefined,
        districtId: this.location.districtId || undefined,
        blockId: this.location.blockId || this.location.tehsilId || undefined,
        gpId: this.location.gpId || undefined,
        page: this.page,
        pageSize: this.pageSize,
      })
      .subscribe({
        next: (res) => {
          this.items = res.data?.items || [];
          this.total = res.data?.total || 0;
          this.page = res.data?.page || 1;
          this.pageSize = res.data?.pageSize || 20;
          this.loading = false;
        },
        error: (err) => {
          this.loading = false;
          this.notify.fromHttpError(err, 'Failed to load entries');
        },
      });
  }

  prevPage() {
    if (this.page <= 1) return;
    this.page -= 1;
    this.load();
  }

  nextPage() {
    if (this.page >= this.totalPages) return;
    this.page += 1;
    this.load();
  }
}
