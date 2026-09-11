import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
// import { RouterLink } from '@angular/router';
// import { TbService } from '../core/services/tb.service';
import { NotifyService } from '../core/services/notify.service';
import { AuthService } from '../core/services/auth.service';
import { LocationService } from '../core/services/location.service';
import { LocationCascadeComponent, LocationSelection } from '../shared/components/location-cascade/location-cascade.component';
import { Router, RouterLink } from '@angular/router';
import { TbService } from '../core/services/tb.service';
import { SettingsService } from '../core/services/settings.service';
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
  private auth = inject(AuthService);
  private locationService = inject(LocationService);
  private router = inject(Router);
  private settingsApi = inject(SettingsService);
  loading = false;
  items: any[] = [];
  total = 0;
  page = 1;
  pageSize = 20;
  year = new Date().getFullYear();
  month: number | null = null;
  status = '';
  location: LocationSelection = {};
  lockDistrict = false;
  lockBlock = false;
  editDeadlineDay = 15;
submitDeadlineDay = 10;
  months = [
    { id: 1, name: 'January' }, { id: 2, name: 'February' }, { id: 3, name: 'March' },
    { id: 4, name: 'April' }, { id: 5, name: 'May' }, { id: 6, name: 'June' },
    { id: 7, name: 'July' }, { id: 8, name: 'August' }, { id: 9, name: 'September' },
    { id: 10, name: 'October' }, { id: 11, name: 'November' }, { id: 12, name: 'December' },
  ];

  ngOnInit() {
    this.settingsApi.getTbEntrySettings().subscribe({
      next: (res) => {
        this.editDeadlineDay = Number(res.data?.editDeadlineDay) || 15;
        this.submitDeadlineDay = Number(res.data?.submitDeadlineDay) || 10;
      },
      error: () => {
        this.editDeadlineDay = 15;
        this.submitDeadlineDay = 10;
      },
    });
    this.applyUserLocationDefaults();
    this.load();
  }
  // ngOnInit() {
  //   this.applyUserLocationDefaults();
  //   this.load();
  // }

  get totalPages() {
    return Math.max(1, Math.ceil(this.total / this.pageSize));
  }

  monthName(m: number) {
    return this.months.find((x) => x.id === m)?.name || m;
  }
  /** Next month after reporting month */
private nextMonthYear(year: number, month: number) {
  let m = Number(month) + 1;
  let y = Number(year);
  if (m > 12) {
    m = 1;
    y += 1;
  }
  return { year: y, month: m };
}

/** Deadline = next month ki editDeadlineDay (end of day) */
private editDeadlineDate(reportingYear: number, reportingMonth: number): Date {
  const next = this.nextMonthYear(reportingYear, reportingMonth);
  return new Date(next.year, next.month - 1, this.editDeadlineDay, 23, 59, 59, 999);
}

private submitDeadlineDate(reportingYear: number, reportingMonth: number): Date {
  const next = this.nextMonthYear(reportingYear, reportingMonth);
  return new Date(next.year, next.month - 1, this.submitDeadlineDay, 23, 59, 59, 999);
}

/** Prefer API canEdit from master settings; fallback to local calc */
canEdit(e: any): boolean {
  if (typeof e?.canEdit === 'boolean') return e.canEdit;
  if (!e?.reportingYear || !e?.reportingMonth) return false;
  const now = new Date();

  if (e.status === 'DRAFT') {
    return now <= this.submitDeadlineDate(e.reportingYear, e.reportingMonth);
  }
  if (e.status === 'SUBMITTED') {
    return now <= this.editDeadlineDate(e.reportingYear, e.reportingMonth);
  }
  return false;
}

editClosedReason(e: any): string {
  if (e?.status === 'SUBMITTED') {
    const d = this.editDeadlineDate(e.reportingYear, e.reportingMonth);
    return `Edit closed (till ${d.toLocaleDateString('en-IN')})`;
  }
  if (e?.status === 'DRAFT') {
    const d = this.submitDeadlineDate(e.reportingYear, e.reportingMonth);
    return `Submit/edit closed (till ${d.toLocaleDateString('en-IN')})`;
  }
  return 'Edit closed';
}

openEdit(e: any) {
  if (!this.canEdit(e)) {
    this.notify.error(this.editClosedReason(e));
    return;
  }
  this.router.navigate(['/tb-entry'], {
    queryParams: {
      gpId: e.gpId,
      month: e.reportingMonth,
      year: e.reportingYear,
      entryId: e.id,
    },
  });
}

  onLocationChange(loc: LocationSelection) {
    this.location = {
      ...loc,
      blockId: loc.blockId || loc.tehsilId || null,
      tehsilId: loc.blockId || loc.tehsilId || null,
    };
  }

  private applyUserLocationDefaults() {
    const u = this.auth.currentUser();
    if (!u) return;

    const blockId = u.blockId || u.tehsilId || null;
    this.location = {
      stateId: u.stateId || null,
      divisionId: u.divisionId || null,
      districtId: u.districtId || null,
      blockId,
      tehsilId: blockId,
      gpId: null,
      villageId: null,
    };

    // District + Block fixed from login; only GP is filterable
    this.lockDistrict = !!(this.location.districtId || blockId);
    this.lockBlock = !!blockId;

    if (blockId && !this.location.districtId) {
      this.resolveDistrictFromBlock(blockId);
    }
  }

  private resolveDistrictFromBlock(blockId: number) {
    this.locationService.resolveBlock(blockId).subscribe({
      next: (res) => {
        const d = res.data;
        if (!d?.districtId) return;
        this.location = {
          ...this.location,
          districtId: d.districtId,
          blockId: d.blockId || blockId,
          tehsilId: d.blockId || blockId,
        };
        this.lockDistrict = true;
        this.lockBlock = true;
        this.auth.patchCurrentUser({
          districtId: d.districtId,
          blockId: d.blockId || blockId,
          tehsilId: d.blockId || blockId,
        });
      },
      error: () => this.notify.error('Could not resolve district for your block'),
    });
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
          if (res.data?.settings) {
            this.editDeadlineDay = Number(res.data.settings.editDeadlineDay) || this.editDeadlineDay;
            this.submitDeadlineDay = Number(res.data.settings.submitDeadlineDay) || this.submitDeadlineDay;
          }
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
