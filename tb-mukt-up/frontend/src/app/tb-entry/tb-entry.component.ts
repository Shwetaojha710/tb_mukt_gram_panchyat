import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { LocationCascadeComponent, LocationSelection } from '../shared/components/location-cascade/location-cascade.component';
import { LocationItem, LocationService } from '../core/services/location.service';
import { TbService } from '../core/services/tb.service';
import { NotifyService } from '../core/services/notify.service';
import { AuthService } from '../core/services/auth.service';
import Swal from 'sweetalert2';
import { SettingsService } from '../core/services/settings.service';
import { ActivatedRoute} from '@angular/router';
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
  private settingsApi = inject(SettingsService);
  private route = inject(ActivatedRoute);
  isEditMode = false;
  loading = false;
  location: LocationSelection = {};
  context: Record<string, any> = {};
  tbUnits: LocationItem[] = [];
  selectedTbUnitId: number | null = null;
  isBlockUser = false;
  lockDistrict = false;
  lockBlock = false;
  lockGp = false;
  lockVillage = false;
  entryId: number | null = null;
  duplicateEntry = false;
  duplicateStatus: string | null = null;
  checkingDuplicate = false;

  months = [
    { id: 1, name: 'January' }, { id: 2, name: 'February' }, { id: 3, name: 'March' },
    { id: 4, name: 'April' }, { id: 5, name: 'May' }, { id: 6, name: 'June' },
    { id: 7, name: 'July' }, { id: 8, name: 'August' }, { id: 9, name: 'September' },
    { id: 10, name: 'October' }, { id: 11, name: 'November' }, { id: 12, name: 'December' },
  ];
  /** Allowed year/month pairs for last 6 completed months (excludes current month) */
  private allowedPeriods: Array<{ year: number; month: number }> = [];
  years: number[] = [];
  availableMonths: Array<{ id: number; name: string }> = [];
  entrySettings = { reportingMonthsBack: 6, submitDeadlineDay: 10, editDeadlineDay: 15 };
  form = this.fb.group({
    reportingYear: [null as number | null, Validators.required],
    reportingMonth: [{ value: null as number | null, disabled: true }, Validators.required],
    testedNaat: [null as number | null, [Validators.required, Validators.min(0)]],
    tbDiagnosed: [null as number | null, [Validators.required, Validators.min(0)]],
    prevYearSuccessTreatment: [null as number | null, [Validators.required, Validators.min(0), Validators.max(100)]],
    poshanEligible: [null as number | null, [Validators.required, Validators.min(0)]],
    poshanReceived: [null as number | null, [Validators.required, Validators.min(0)]],
  });

  get availableMonthNames(): string {
    return this.availableMonths.map((m) => m.name.slice(0, 3)).join(', ');
  }

  /** Soft recommended hint only — never blocks save */
  digitRecommend(name: 'testedNaat' | 'tbDiagnosed' | 'poshanEligible' | 'poshanReceived'): string | null {
    const c = this.form.get(name);
    if (!c || !(c.touched || c.dirty)) return null;
    if (c.value == null) return null;
    const v = Number(c.value);
    if (Number.isNaN(v)) return null;
    if (name === 'testedNaat' && v > 999) return 'Recommended: maximum 3 digits (999)';
    if (name === 'tbDiagnosed' && v > 99) return 'Recommended: maximum 2 digits (99)';
    if ((name === 'poshanEligible' || name === 'poshanReceived') && v > 99) {
      return 'Recommended: value between 0 and 99 only.';
    }
    return null;
  }

  /** Live relation highlight while filling (same style for both Poshan rules) */
  poshanRelationHint(field: 'poshanEligible' | 'poshanReceived'): string | null {
    const eligibleCtrl = this.form.get('poshanEligible');
    const receivedCtrl = this.form.get('poshanReceived');
    const diagnosedCtrl = this.form.get('tbDiagnosed');
    if (!eligibleCtrl || !receivedCtrl || !diagnosedCtrl) return null;

    const eligible = eligibleCtrl.value;
    const received = receivedCtrl.value;
    const diagnosed = diagnosedCtrl.value;

    if (field === 'poshanEligible') {
      if (eligible == null || diagnosed == null) return null;
      if (!(eligibleCtrl.touched || eligibleCtrl.dirty || diagnosedCtrl.touched || diagnosedCtrl.dirty)) {
        return null;
      }
      if (Number(eligible) > Number(diagnosed)) {
        return 'Eligible / consented to Poshan Potli should not be more than TB cases diagnosed against tested.';
      }
      return null;
    }

    if (received == null || eligible == null) return null;
    if (!(receivedCtrl.touched || receivedCtrl.dirty || eligibleCtrl.touched || eligibleCtrl.dirty)) {
      return null;
    }
    if (Number(received) > Number(eligible)) {
      return 'TB patients received Poshan Potli should not be more than Eligible / consented to Poshan Potli.';
    }
    return null;
  }

  isInvalid(name: string): boolean {
    const c = this.form.get(name);
    return !!(c && c.invalid && (c.touched || c.dirty));
  }

  fieldError(name: string): string | null {
    const c = this.form.get(name);
    if (!c || !(c.touched || c.dirty) || !c.errors) return null;
    if (c.errors['max']) {
      if (name === 'prevYearSuccessTreatment') return 'Value must be between 0 and 100 only.';
      return 'Value too high';
    }
    if (c.errors['required']) return 'This field is required';
    if (c.errors['min']) return 'Value cannot be negative';
    return 'Invalid value';
  }

  /** Percentage only: if over 100, clear field */
  enforceMax(field: 'prevYearSuccessTreatment') {
    const c = this.form.get(field);
    if (!c || c.value == null) return;
    let raw = String(c.value).replace(/[^\d]/g, '');
    if (raw.length > 3) {
      c.setValue(null);
      return;
    }
    if (raw === '') {
      c.setValue(null, { emitEvent: false });
      return;
    }
    const v = Number(raw);
    if (Number.isNaN(v) || v < 0 || v > 100) {
      c.setValue(null);
      return;
    }
    if (Number(c.value) !== v) {
      c.setValue(v, { emitEvent: false });
    }
  }

  ngOnInit() {
    const qp = this.route.snapshot.queryParamMap;
    const isEdit = !!(qp.get('gpId') && qp.get('month') && qp.get('year'));

    this.settingsApi.getTbEntrySettings().subscribe({
      next: (res) => {
        this.entrySettings = res.data;
        this.buildAllowedPeriods();
        if (isEdit) this.tryLoadEditFromQuery();
        else this.applyUserLocationDefaults();
      },
      error: () => {
        this.buildAllowedPeriods();
        if (isEdit) this.tryLoadEditFromQuery();
        else this.applyUserLocationDefaults();
      },
    });

    this.form.get('reportingYear')?.valueChanges.subscribe((year) => {
      if (this.isEditMode) return; // edit mein year change mat allow
      this.onYearSelected(year);
    });
    this.form.get('reportingMonth')?.valueChanges.subscribe(() => {
      if (this.isEditMode) return;
      this.checkDuplicate();
    });
  }
  // ngOnInit() {
  //   this.settingsApi.getTbEntrySettings().subscribe({
  //     next: (res) => {
  //       this.entrySettings = res.data;
  //       this.buildAllowedPeriods();
  //       this.tryLoadEditFromQuery();
  //     },
  //     error: () => {
  //       this.buildAllowedPeriods();
  //       this.tryLoadEditFromQuery();
  //     },
  //   });
  //   this.applyUserLocationDefaults();
  //   this.form.get('reportingYear')?.valueChanges.subscribe((year) => this.onYearSelected(year));
  //   this.form.get('reportingMonth')?.valueChanges.subscribe(() => this.checkDuplicate());
  // }

  // ngOnInit() {
  //   this.buildAllowedPeriods();
  //   this.applyUserLocationDefaults();
  //   this.form.get('reportingYear')?.valueChanges.subscribe((year) => this.onYearSelected(year));
  //   this.form.get('reportingMonth')?.valueChanges.subscribe(() => this.checkDuplicate());
  // }

  /** Last 6 completed months before current month. Ex: Aug → Feb–Jul */
  private buildAllowedPeriods() {
    const now = new Date();
    const periods: Array<{ year: number; month: number }> = [];
    // Start from previous month, go back 6 months
    let y = now.getFullYear();
    let m = now.getMonth(); // 0-based; previous month = m (since getMonth is current 0-based, going back once first)
    // current month index 0-11; we want months before current
    const back = Number(this.entrySettings?.reportingMonthsBack) || 6;

    for (let i = 0; i < back; i++) {
      m -= 1;
      if (m < 0) {
        m = 11;
        y -= 1;
      }
      periods.push({ year: y, month: m + 1 });
    }
    this.allowedPeriods = periods;
    const yearSet = [...new Set(periods.map((p) => p.year))].filter((yr) => yr <= now.getFullYear());
    this.years = yearSet.sort((a, b) => b - a);
  }

  private onYearSelected(year: number | null) {
    const monthCtrl = this.form.get('reportingMonth');
    if (!year) {
      this.availableMonths = [];
      monthCtrl?.reset(null);
      monthCtrl?.disable({ emitEvent: false });
      this.checkDuplicate();
      return;
    }
    const monthIds = this.allowedPeriods.filter((p) => p.year === year).map((p) => p.month);
    this.availableMonths = this.months.filter((m) => monthIds.includes(m.id));
    monthCtrl?.enable({ emitEvent: false });
    const currentMonth = monthCtrl?.value;
    if (currentMonth && !monthIds.includes(Number(currentMonth))) {
      monthCtrl?.setValue(null);
    }
    this.checkDuplicate();
  }

  monthLabel(id: number | null | undefined): string {
    if (!id) return '';
    return this.months.find((m) => m.id === id)?.name || String(id);
  }

  checkDuplicate() {
    const gpId = this.location.gpId;
    const month = this.form.get('reportingMonth')?.value;
    const year = this.form.get('reportingYear')?.value;
    if (!gpId || !month || !year) {
      this.duplicateEntry = false;
      this.duplicateStatus = null;
      // Edit mode mein entryId mat clear karo
      if (!this.isEditMode) this.entryId = null;
      return;
    }
    this.checkingDuplicate = true;
    this.tb.getEntry(gpId, Number(month), Number(year)).subscribe({
      next: (res) => {
        this.checkingDuplicate = false;
        const entry = res.data;
        if (entry && this.entryId && entry.id === this.entryId) {
          this.duplicateEntry = false;
          this.duplicateStatus = entry.status || null;
          return;
        }
        if (entry && (!this.entryId || entry.id !== this.entryId)) {
          this.duplicateEntry = true;
          this.duplicateStatus = entry.status || null;
          if (!this.isEditMode) this.entryId = null;
          return;
        }
        this.duplicateEntry = false;
        this.duplicateStatus = null;
      },
      error: () => {
        this.checkingDuplicate = false;
        this.duplicateEntry = false;
        this.duplicateStatus = null;
      },
    });
  }

  // checkDuplicate() {
  //   const gpId = this.location.gpId;
  //   const month = this.form.get('reportingMonth')?.value;
  //   const year = this.form.get('reportingYear')?.value;
  //   if (!gpId || !month || !year) {
  //     this.duplicateEntry = false;
  //     this.duplicateStatus = null;
  //     this.entryId = null;
  //     return;
  //   }
  //   this.checkingDuplicate = true;
  //   this.tb.getEntry(gpId, Number(month), Number(year)).subscribe({
  //     next: (res) => {
  //       this.checkingDuplicate = false;
  //       const entry = res.data;
  //       if (entry && (!this.entryId || entry.id !== this.entryId)) {
  //         this.duplicateEntry = true;
  //         this.duplicateStatus = entry.status || null;
  //         this.entryId = null;
  //       } else if (entry && this.entryId && entry.id === this.entryId) {
  //         this.duplicateEntry = false;
  //         this.duplicateStatus = entry.status || null;
  //       } else {
  //         this.duplicateEntry = false;
  //         this.duplicateStatus = null;
  //       }
  //     },
  //     error: () => {
  //       this.checkingDuplicate = false;
  //       this.duplicateEntry = false;
  //       this.duplicateStatus = null;
  //     },
  //   });
  // }

  private async hasDuplicateEntry(): Promise<boolean> {
    // Edit mode: same entry update ho rahi hai — duplicate mat check karo
    if (this.isEditMode && this.entryId) return false;

    const gpId = this.location.gpId;
    const month = this.form.get('reportingMonth')?.value;
    const year = this.form.get('reportingYear')?.value;
    if (!gpId || !month || !year) return false;
    if (this.entryId) return false;

    try {
      const res = await firstValueFrom(this.tb.getEntry(gpId, Number(month), Number(year)));
      if (res.data) {
        this.duplicateEntry = true;
        this.duplicateStatus = res.data.status || null;
        return true;
      }
    } catch {
      this.notify.error(' allow server-side validation to handle errors ');
      /* allow server-side validation to handle errors */
    }
    return false;
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
      this.checkDuplicate();
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
        if (this.location.gpId) {
          this.refreshContext();
          this.checkDuplicate();
        }
      },
      error: (err) => this.notify.fromHttpError(err, 'Failed to load district for block'),
    });
  }

  onLocationChange(loc: LocationSelection) {
    if (this.isEditMode) return;
    const next: LocationSelection = {
      ...loc,
      blockId: loc.blockId || loc.tehsilId || null,
      tehsilId: loc.blockId || loc.tehsilId || null,
    };

    const same =
      this.location.districtId === next.districtId &&
      (this.location.blockId || this.location.tehsilId || null) === (next.blockId || next.tehsilId || null) &&
      this.location.gpId === next.gpId &&
      this.location.villageId === next.villageId;

    // Always sync location from emit (copy), then refresh if GP/village present
    this.location = { ...next };

    if (same) {
      // Mutation pehle hi IDs sync kar chuki thi — context phir bhi load karo
      if (this.location.gpId) this.refreshContext();
      return;
    }

    this.refreshContext();
    this.checkDuplicate();
  }

  onGpSelected(gp: LocationItem | null) {
    if (gp) {
      this.context = { ...this.context, gpName: gp.name, gpPopulation: gp.population || 0 };
      this.refreshContext(); // add this
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
          this.tbUnits = Array.isArray(this.context['tbUnits']) ? this.context['tbUnits'] : [];
          const currentId = Number(this.context['tbUnitId']) || null;
          if (currentId && this.tbUnits.some((u) => u.id === currentId)) {
            this.selectedTbUnitId = currentId;
          } else if (this.tbUnits.length) {
            this.selectedTbUnitId = this.tbUnits[0].id;
            this.applyTbUnit(this.tbUnits[0]);
          } else {
            this.selectedTbUnitId = currentId;
          }
        },
        error: (err) => this.notify.fromHttpError(err),
      });
  }

  onTbUnitChange(ev: Event) {
    const raw = (ev.target as HTMLSelectElement).value;
    const id = Number(raw) || null;
    this.selectedTbUnitId = id;
    const unit = this.tbUnits.find((u) => u.id === id) || null;
    this.applyTbUnit(unit);
  }

  private applyTbUnit(unit: LocationItem | null) {
    if (!unit) return;
    this.context = {
      ...this.context,
      tbUnitId: unit.id,
      tbUnitName: unit.name,
      tbUnitCode: unit.code || this.context['tbUnitCode'] || null,
    };
  }

  private payload() {
    const blockId = this.location.blockId || this.location.tehsilId || null;
    const raw = this.form.getRawValue();
    return {
      ...this.location,
      tehsilId: blockId,
      blockId,
      ...raw,
      testedNaat: Number(raw.testedNaat ?? 0),
      tbDiagnosed: Number(raw.tbDiagnosed ?? 0),
      prevYearSuccessTreatment: Number(raw.prevYearSuccessTreatment ?? 0),
      poshanEligible: Number(raw.poshanEligible ?? 0),
      poshanReceived: Number(raw.poshanReceived ?? 0),
      gpPopulation: Number(this.context['gpPopulation'] || 0),
      villagePopulation: Number(this.context['villagePopulation'] || 0),
      tbUnitId: this.selectedTbUnitId || this.context['tbUnitId'] || null,
      tbUnitName: this.context['tbUnitName'] || null,
      ...(this.entryId ? { entryId: this.entryId } : {}),
    };
  }

  validateLocal(): boolean {
    this.form.markAllAsTouched();
    const year = Number(this.form.getRawValue().reportingYear);
    const month = Number(this.form.getRawValue().reportingMonth);
    if (!year) {
      this.notify.error('Please select reporting year first');
      return false;
    }
    if (!month) {
      this.notify.error('Please select reporting month');
      return false;
    }
    const back = Number(this.entrySettings?.reportingMonthsBack) || 6;

    const periodOk = this.allowedPeriods.some((p) => p.year == year && p.month == month);
    if (!periodOk) {
      this.notify.error(`Only last ${back} completed months are allowed (current month not included)`);
      // this.notify.error('Only last 6 completed months are allowed (current month not included)');
      return false;
    }
    if (!this.location.districtId || !(this.location.blockId || this.location.tehsilId) || !this.location.gpId) {
      this.notify.error('District, Block and Gram Panchayat are required');
      return false;
    }
    if (!this.location.villageId) {
      this.notify.error('Please select Village');
      return false;
    }
    if (this.form.invalid) {
      const firstInvalid = ['testedNaat', 'tbDiagnosed', 'prevYearSuccessTreatment', 'poshanEligible', 'poshanReceived']
        .map((name) => this.fieldError(name))
        .find(Boolean);
      this.notify.error(firstInvalid || 'Please fill all required numeric fields');
      return false;
    }
    const v = this.form.getRawValue();
    if ((v.prevYearSuccessTreatment ?? 0) > 100 || (v.prevYearSuccessTreatment ?? 0) < 0) {
      void Swal.fire({
        icon: 'warning',
        title: 'Invalid value',
        text: 'Value must be between 0 and 100 only.',
        confirmButtonText: 'OK',
      });
      return false;
    }
    if ((v.tbDiagnosed || 0) > (v.testedNaat || 0)) {
      void Swal.fire({
        icon: 'warning',
        title: 'Invalid value',
        text: 'TB cases diagnosed cannot exceed Presumptive tested through NAAT.',
        confirmButtonText: 'OK',
      });
      return false;
    }
    if ((v.poshanEligible || 0) > (v.tbDiagnosed || 0)) {
      void Swal.fire({
        icon: 'warning',
        title: 'Invalid value',
        text: 'Eligible / consented to Poshan Potli should not be more than TB cases diagnosed against tested.',
        confirmButtonText: 'OK',
      });
      return false;
    }
    if ((v.poshanReceived || 0) > (v.poshanEligible || 0)) {
      void Swal.fire({
        icon: 'warning',
        title: 'Invalid value',
        text: 'TB patients received Poshan Potli should not be more than Eligible / consented to Poshan Potli.',
        confirmButtonText: 'OK',
      });
      return false;
    }
    return true;
  }

  /** Clear poshan field if relation rule fails on blur */
  onPoshanRelationBlur(field: 'poshanEligible' | 'poshanReceived') {
    const eligible = Number(this.form.get('poshanEligible')?.value);
    const received = Number(this.form.get('poshanReceived')?.value);
    const diagnosed = Number(this.form.get('tbDiagnosed')?.value);

    if (field === 'poshanEligible') {
      if (this.form.get('poshanEligible')?.value == null) return;
      if (!Number.isNaN(eligible) && !Number.isNaN(diagnosed) && eligible > diagnosed) {
        void Swal.fire({
          icon: 'warning',
          title: 'Invalid value',
          text: 'Eligible / consented to Poshan Potli should not be more than TB cases diagnosed against tested.',
          confirmButtonText: 'OK',
        });
        this.form.get('poshanEligible')?.setValue(null);
      }
      return;
    }

    if (this.form.get('poshanReceived')?.value == null) return;
    if (!Number.isNaN(received) && !Number.isNaN(eligible) && received > eligible) {
      void Swal.fire({
        icon: 'warning',
        title: 'Invalid value',
        text: 'TB patients received Poshan Potli should not be more than Eligible / consented to Poshan Potli.',
        confirmButtonText: 'OK',
      });
      this.form.get('poshanReceived')?.setValue(null);
    }
  }

  async saveDraft() {
    if (!this.validateLocal()) return;
    if (await this.hasDuplicateEntry()) {
      this.notify.error('Duplicate entry: data already exists for this GP in the selected month and year');
      return;
    }
    if (!confirm('Save this entry as draft?')) return;
    this.loading = true;
    this.tb.saveDraft(this.payload()).subscribe({
      next: (res) => {
        this.loading = false;
        this.entryId = res.data?.entry?.id ?? this.entryId;
        this.duplicateEntry = false;
        this.notify.success(res.message);
        this.router.navigate(['/tb-entries']);
      },
      error: (err) => {
        this.loading = false;
        this.notify.fromHttpError(err);
      },
    });
  }

  async submit() {
    if (!this.validateLocal()) return;

    if (!this.isEditMode && (await this.hasDuplicateEntry())) {
      this.notify.error('Duplicate entry: data already exists for this GP in the selected month and year');
      return;
    }

    const result = await Swal.fire({
      title: this.isEditMode ? 'Update this TB entry?' : 'Submit this TB entry?',
      text: this.isEditMode
        ? 'Are you sure you want to update and submit?'
        : 'Are you sure you want to submit?',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: this.isEditMode ? 'Yes, update' : 'Yes, submit',
      cancelButtonText: 'Cancel',
    });
    if (!result.isConfirmed) return;

    this.loading = true;
    this.tb.submit(this.payload()).subscribe({
      next: (res) => {
        this.loading = false;
        this.entryId = res.data?.entry?.id ?? this.entryId;
        this.duplicateEntry = false;
        this.notify.success(res.message);
        this.router.navigate(['/tb-entries']);
      },
      error: (err) => {
        this.loading = false;
        this.notify.fromHttpError(err);
      },
    });
  }
  private tryLoadEditFromQuery() {
    const qp = this.route.snapshot.queryParamMap;
    const gpId = Number(qp.get('gpId'));
    const month = Number(qp.get('month'));
    const year = Number(qp.get('year'));
    const entryId = Number(qp.get('entryId'));

    if (!gpId || !month || !year) return;

    this.isEditMode = true;
    this.loading = true;

    this.tb.getEntry(gpId, month, year).subscribe({
      next: (res) => {
        this.loading = false;
        const e = res.data;

        if (!e) {
          this.notify.error('Entry not found');
          this.router.navigate(['/tb-entries']);
          return;
        }

        // Deadline check
        const day =
          e.status === 'SUBMITTED'
            ? Number(this.entrySettings?.editDeadlineDay) || 15
            : Number(this.entrySettings?.submitDeadlineDay) || 10;

        let nm = Number(e.reportingMonth) + 1;
        let ny = Number(e.reportingYear);
        if (nm > 12) {
          nm = 1;
          ny += 1;
        }

        const deadline = new Date(ny, nm - 1, day, 23, 59, 59, 999);
        if (new Date() > deadline) {
          this.notify.error(
            e.status === 'SUBMITTED'
              ? `Edit closed for this month (till ${deadline.toLocaleDateString('en-IN')})`
              : `Submit/edit closed (till ${deadline.toLocaleDateString('en-IN')})`
          );
          this.router.navigate(['/tb-entries']);
          return;
        }

        this.entryId = e.id;
        this.duplicateEntry = false;
        this.duplicateStatus = e.status || null;

        // Reporting period dropdowns ke liye
        if (!this.allowedPeriods.some((p) => p.year === e.reportingYear && p.month === e.reportingMonth)) {
          this.allowedPeriods = [
            { year: e.reportingYear, month: e.reportingMonth },
            ...this.allowedPeriods,
          ];
        }
        if (!this.years.includes(e.reportingYear)) {
          this.years = [e.reportingYear, ...this.years].sort((a, b) => b - a);
        }
        this.availableMonths = this.months.filter((m) =>
          this.allowedPeriods.some((p) => p.year === e.reportingYear && p.month === m.id)
        );

        // Location set
        this.location = {
          districtId: e.districtId || null,
          blockId: e.blockId || e.tehsilId || null,
          tehsilId: e.blockId || e.tehsilId || null,
          gpId: e.gpId || null,
          villageId: e.villageId || null,
        };

        this.lockDistrict = true;
        this.lockBlock = true;
        this.lockGp = true;
        if (e.villageId) this.lockVillage = true;

        // Form fill (disabled fields ke liye enable → patch → disable)
        this.form.get('reportingYear')?.enable({ emitEvent: false });
        this.form.get('reportingMonth')?.enable({ emitEvent: false });

        this.form.patchValue(
          {
            reportingYear: e.reportingYear,
            reportingMonth: e.reportingMonth,
            testedNaat: e.testedNaat,
            tbDiagnosed: e.tbDiagnosed,
            prevYearSuccessTreatment: e.prevYearSuccessTreatment,
            poshanEligible: e.poshanEligible,
            poshanReceived: e.poshanReceived,
          },
          { emitEvent: false }
        );

        this.form.get('reportingYear')?.disable({ emitEvent: false });
        this.form.get('reportingMonth')?.disable({ emitEvent: false });

        this.selectedTbUnitId = e.tbUnitId || null;
        this.context = {
          ...this.context,
          gpName: e.gpName,
          gpPopulation: e.gpPopulation,
          villageName: e.villageName,
          villagePopulation: e.villagePopulation,
          tbUnitName: e.tbUnitName,
          tbUnitId: e.tbUnitId,
        };

        if (entryId && entryId !== e.id) {
          this.entryId = e.id;
        }

        this.refreshContext();
      },
      error: (err) => {
        this.loading = false;
        this.notify.fromHttpError(err, 'Failed to load entry for edit');
        this.router.navigate(['/tb-entries']);
      },
    });
  }
// async submit() {
//   if (!this.validateLocal()) return;
//   if (await this.hasDuplicateEntry()) {
//     this.notify.error('Duplicate entry: data already exists for this GP in the selected month and year');
//     return;
//   }

//   const result = await Swal.fire({
//     title: 'Submit this TB entry?',
//     text: 'Are you sure you want to submit?',
//     icon: 'question',
//     showCancelButton: true,
//     confirmButtonText: 'Yes, submit',
//     cancelButtonText: 'Cancel',
//   });
//   if (!result.isConfirmed) return;

//   this.loading = true;
//   this.tb.submit(this.payload()).subscribe({
//     next: (res) => {
//       this.loading = false;
//       this.entryId = res.data?.entry?.id ?? this.entryId;
//       this.notify.success(res.message); // success toaster rahe
//       this.router.navigate(['/tb-entries']);
//     },
//     error: (err) => {
//       this.loading = false;
//       this.notify.fromHttpError(err);
//     },
//   });
// }

  // async submit() {
  //   if (!this.validateLocal()) return;
  //   if (await this.hasDuplicateEntry()) {
  //     this.notify.error('Duplicate entry: data already exists for this GP in the selected month and year');
  //     return;
  //   }
  //   if (!confirm('Submit this TB entry?')) return;
  //   this.loading = true;
  //   this.tb.submit(this.payload()).subscribe({
  //     next: (res) => {
  //       this.loading = false;
  //       this.entryId = res.data?.entry?.id ?? this.entryId;
  //       this.notify.success(res.message);
  //       this.router.navigate(['/tb-entries']);
  //     },
  //     error: (err) => {
  //       this.loading = false;
  //       this.notify.fromHttpError(err);
  //     },
  //   });
  // }
//   private tryLoadEditFromQuery() {
//     const qp = this.route.snapshot.queryParamMap;
//     const gpId = Number(qp.get('gpId'));
//     const month = Number(qp.get('month'));
//     const year = Number(qp.get('year'));
//     const entryId = Number(qp.get('entryId'));

//     if (!gpId || !month || !year) return;

//     this.isEditMode = true;
//     if (entryId) this.entryId = entryId;

//     this.tb.getEntry(gpId, month, year).subscribe({
//       next: (res) => {
//         const e = res.data;
//         if (!e) {
//           this.notify.error('Entry not found');
//           return;
//         }
// // Ensure editing period is in allowed lists
// if (!this.allowedPeriods.some((p) => p.year == e.reportingYear && p.month == e.reportingMonth)) {
//   this.allowedPeriods = [
//     { year: e.reportingYear, month: e.reportingMonth },
//     ...this.allowedPeriods,
//   ];
// }
// if (!this.years.includes(e.reportingYear)) {
//   this.years = [e.reportingYear, ...this.years].sort((a, b) => b - a);
// }
// this.availableMonths = this.months.filter((m) =>
//   this.allowedPeriods.some((p) => p.year == e.reportingYear && p.month == m.id)
// );
//         // Deadline check (list ke barabar)
//         const day =
//           e.status === 'SUBMITTED'
//             ? Number(this.entrySettings?.editDeadlineDay) || 15
//             : Number(this.entrySettings?.submitDeadlineDay) || 10;
//         let nm = Number(e.reportingMonth) + 1;
//         let ny = Number(e.reportingYear);
//         if (nm > 12) {
//           nm = 1;
//           ny += 1;
//         }
//         const deadline = new Date(ny, nm - 1, day, 23, 59, 59, 999);
//         if (new Date() > deadline) {
//           this.notify.error(
//             e.status === 'SUBMITTED'
//               ? `Edit closed for this month (till ${deadline.toLocaleDateString('en-IN')})`
//               : `Submit/edit closed (till ${deadline.toLocaleDateString('en-IN')})`
//           );
//           this.router.navigate(['/tb-entries']);
//           return;
//         }

//         this.entryId = e.id;
//         this.duplicateEntry = false;
//         this.duplicateStatus = e.status || null;

//         this.location = {
//           districtId: e.districtId || null,
//           blockId: e.blockId || e.tehsilId || null,
//           tehsilId: e.blockId || e.tehsilId || null,
//           gpId: e.gpId || null,
//           villageId: e.villageId || null,
//         };

//         // Year/month set
//         this.form.get('reportingYear')?.setValue(e.reportingYear);
//         this.onYearSelected(e.reportingYear);
//         this.form.get('reportingMonth')?.setValue(e.reportingMonth);

//         // Edit mode: period lock
//         this.form.get('reportingYear')?.disable({ emitEvent: false });
//         this.form.get('reportingMonth')?.disable({ emitEvent: false });

//         this.form.patchValue({
//           testedNaat: e.testedNaat,
//           tbDiagnosed: e.tbDiagnosed,
//           prevYearSuccessTreatment: e.prevYearSuccessTreatment,
//           poshanEligible: e.poshanEligible,
//           poshanReceived: e.poshanReceived,
//         });

//         this.selectedTbUnitId = e.tbUnitId || null;
//         this.context = {
//           ...this.context,
//           gpName: e.gpName,
//           gpPopulation: e.gpPopulation,
//           villageName: e.villageName,
//           villagePopulation: e.villagePopulation,
//           tbUnitName: e.tbUnitName,
//           tbUnitId: e.tbUnitId,
//         };

//         this.lockDistrict = true;
//         this.lockBlock = true;
//         this.lockGp = true;
//         if (e.villageId) this.lockVillage = true;

//         this.refreshContext();
//       },
//       error: (err) => this.notify.fromHttpError(err, 'Failed to load entry for edit'),
//     });
//   }
}
