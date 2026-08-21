import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LocationCascadeComponent, LocationSelection } from '../shared/components/location-cascade/location-cascade.component';
import { LocationItem, LocationService } from '../core/services/location.service';
import { TbService } from '../core/services/tb.service';
import { NotifyService } from '../core/services/notify.service';
import { AuthService } from '../core/services/auth.service';

@Component({
  selector: 'app-tb-entry',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, LocationCascadeComponent],
  templateUrl: './tb-entry.component.html',
  styleUrl: './tb-entry.component.scss',
})
export class TbEntryComponent implements OnInit {
  private fb = inject(FormBuilder);
  private locationService = inject(LocationService);
  private tb = inject(TbService);
  private notify = inject(NotifyService);
  private auth = inject(AuthService);
  private router = inject(Router);

  loading = false;
  location: LocationSelection = {};
  context: Record<string, any> = {};
  isBlockUser = false;
  lockDistrict = false;
  lockBlock = false;
  lockGp = false;
  lockVillage = false;

  months = [
    { id: 1, name: 'January' }, { id: 2, name: 'February' }, { id: 3, name: 'March' },
    { id: 4, name: 'April' }, { id: 5, name: 'May' }, { id: 6, name: 'June' },
    { id: 7, name: 'July' }, { id: 8, name: 'August' }, { id: 9, name: 'September' },
    { id: 10, name: 'October' }, { id: 11, name: 'November' }, { id: 12, name: 'December' },
  ];
  years = [2024, 2025, 2026, 2027];

  form = this.fb.group({
    reportingMonth: [new Date().getMonth() + 1, Validators.required],
    reportingYear: [new Date().getFullYear(), Validators.required],
    testedNaat: [0, [Validators.required, Validators.min(0)]],
    tbDiagnosed: [0, [Validators.required, Validators.min(0)]],
    prevYearSuccessTreatment: [0, [Validators.required, Validators.min(0)]],
    poshanEligible: [0, [Validators.required, Validators.min(0)]],
    poshanReceived: [0, [Validators.required, Validators.min(0)]],
  });

  ngOnInit() {
    this.applyUserLocationDefaults();
  }

  private applyUserLocationDefaults() {
    const u = this.auth.currentUser();
    if (!u) return;

    const role = String(u.role || '').toUpperCase();
    this.isBlockUser = role === 'BLOCK' || role === 'TEHSIL' || role === 'GP' || role === 'VILLAGE';

    const blockId = u.blockId || u.tehsilId || null;
    this.location = {
      stateId: u.stateId || null,
      divisionId: u.divisionId || null,
      districtId: u.districtId || null,
      blockId,
      tehsilId: blockId,
      gpId: u.gpId || null,
      villageId: u.villageId || null,
    };

    // Block-scoped users: lock district + block once we have blockId
    if (role === 'BLOCK' || role === 'TEHSIL') {
      this.lockBlock = !!blockId;
      this.lockDistrict = !!this.location.districtId || !!blockId;
      this.lockGp = !!this.location.gpId;
      this.lockVillage = !!this.location.villageId;
    }
    if (role === 'GP' || role === 'VILLAGE') {
      this.lockDistrict = true;
      this.lockBlock = true;
      this.lockGp = !!this.location.gpId;
      this.lockVillage = role === 'VILLAGE' && !!this.location.villageId;
    }

    // Have blockId but missing district → resolve parent district from Block master
    if (blockId && !this.location.districtId) {
      this.resolveDistrictFromBlock(blockId);
      return;
    }

    if (this.location.districtId && this.location.blockId && this.location.gpId) {
      this.refreshContext();
    }
  }

  private resolveDistrictFromBlock(blockId: number) {
    this.locationService.resolveBlock(blockId).subscribe({
      next: (res) => {
        const d = res.data;
        if (!d?.districtId) {
          this.notify.error('Could not resolve district for your block');
          return;
        }
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
        if (this.location.gpId) this.refreshContext();
      },
      error: (err) => this.notify.fromHttpError(err, 'Failed to load district for block'),
    });
  }

  onLocationChange(loc: LocationSelection) {
    this.location = {
      ...loc,
      blockId: loc.blockId || loc.tehsilId || null,
      tehsilId: loc.blockId || loc.tehsilId || null,
    };
    this.refreshContext();
  }

  onGpSelected(gp: LocationItem | null) {
    if (gp) {
      this.context = { ...this.context, gpName: gp.name, gpPopulation: gp.population || 0 };
    }
  }

  refreshContext() {
    const blockId = this.location.blockId || this.location.tehsilId;
    if (!this.location.districtId || !blockId || !this.location.gpId) return;
    this.locationService
      .getContext({
        districtId: this.location.districtId || undefined,
        tehsilId: this.location.tehsilId || undefined,
        blockId: blockId || undefined,
        gpId: this.location.gpId || undefined,
        villageId: this.location.villageId || undefined,
      })
      .subscribe({
        next: (res) => {
          this.context = res.data || {};
        },
        error: (err) => this.notify.fromHttpError(err),
      });
  }

  private payload() {
    const blockId = this.location.blockId || this.location.tehsilId || null;
    return {
      ...this.location,
      tehsilId: blockId,
      blockId,
      ...this.form.getRawValue(),
      gpPopulation: Number(this.context['gpPopulation'] || 0),
    };
  }

  validateLocal(): boolean {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.notify.error('Please fill all required numeric fields');
      return false;
    }
    if (!this.location.districtId || !(this.location.blockId || this.location.tehsilId) || !this.location.gpId) {
      this.notify.error('District, Block and Gram Panchayat are required');
      return false;
    }
    const v = this.form.getRawValue();
    if ((v.tbDiagnosed || 0) > (v.testedNaat || 0)) {
      this.notify.error('TB diagnosed cannot exceed tested');
      return false;
    }
    if ((v.poshanReceived || 0) > (v.poshanEligible || 0)) {
      this.notify.error('Poshan received cannot exceed eligible');
      return false;
    }
    return true;
  }

  saveDraft() {
    if (!this.validateLocal()) return;
    if (!confirm('Save this entry as draft?')) return;
    this.loading = true;
    this.tb.saveDraft(this.payload()).subscribe({
      next: (res) => {
        this.loading = false;
        this.notify.success(res.message);
        this.router.navigate(['/tb-entries']);
      },
      error: (err) => {
        this.loading = false;
        this.notify.fromHttpError(err);
      },
    });
  }

  submit() {
    if (!this.validateLocal()) return;
    if (!confirm('Submit this TB entry? Duplicate GP + month + year will update existing record.')) return;
    this.loading = true;
    this.tb.submit(this.payload()).subscribe({
      next: (res) => {
        this.loading = false;
        this.notify.success(res.message);
        this.router.navigate(['/tb-entries']);
      },
      error: (err) => {
        this.loading = false;
        this.notify.fromHttpError(err);
      },
    });
  }
}
