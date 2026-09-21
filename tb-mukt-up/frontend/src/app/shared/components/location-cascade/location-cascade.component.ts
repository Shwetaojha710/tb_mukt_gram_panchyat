import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LocationItem, LocationService } from '../../../core/services/location.service';

export interface LocationSelection {
  stateId?: number | null;
  divisionId?: number | null;
  districtId?: number | null;
  tehsilId?: number | null;
  /** Block IDs from dbo.Block */
  blockId?: number | null;
  gpId?: number | null;
  villageId?: number | null;
}

@Component({
  selector: 'app-location-cascade',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './location-cascade.component.html',
  styleUrl: './location-cascade.component.scss',
})
export class LocationCascadeComponent implements OnInit, OnChanges {
  @Input() showVillage = true;
  @Input() disabled = false;
  /** Compact single-row filter layout */
  @Input() compact = false;
  /** Show red * on required labels (hide on dashboard/list filters) */
  @Input() showRequiredMark = true;
  /** Hide district dropdown (district already locked from login) */
  @Input() hideDistrict = false;
  /** Hide block dropdown (block already locked from login) */
  @Input() hideBlock = false;
  /** Lock district/block (and optionally gp/village) for scoped users */
  @Input() lockDistrict = false;
  @Input() lockBlock = false;
  @Input() lockGp = false;
  @Input() lockVillage = false;
  @Input() value: LocationSelection = {};
  @Output() valueChange = new EventEmitter<LocationSelection>();
  @Output() gpSelected = new EventEmitter<LocationItem | null>();

  districts: LocationItem[] = [];
  blocks: LocationItem[] = [];
  gps: LocationItem[] = [];
  villages: LocationItem[] = [];
  loading = false;
  private hydrating = false;
  private districtsLoaded = false;

  constructor(private locationService: LocationService) {}

  ngOnInit() {
    this.loadDistrictsAndHydrate();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (!changes['value'] || !this.districtsLoaded) return;
    // Parent often echoes the same selection after emit — skip reload so mobile
    // native <select> pickers are not rebuilt mid-interaction.
    const prev = changes['value'].previousValue as LocationSelection | undefined;
    const curr = changes['value'].currentValue as LocationSelection | undefined;
    if (prev && curr && this.sameSelection(prev, curr)) return;
    this.hydrateFromValue();
  }

  /** Native option values are strings — required for Android/Samsung pickers. */
  idStr(id: number | null | undefined): string {
    return id == null ? '' : String(id);
  }

  private normalizeItems(items: LocationItem[]): LocationItem[] {
    return (items || []).map((item) => ({
      ...item,
      id: Number(item.id),
    }));
  }

  private toId(raw: string | number | null | undefined): number | null {
    if (raw === '' || raw == null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  private sameSelection(a: LocationSelection, b: LocationSelection): boolean {
    const blockA = a.blockId || a.tehsilId || null;
    const blockB = b.blockId || b.tehsilId || null;
    return (
      (a.districtId || null) === (b.districtId || null) &&
      blockA === blockB &&
      (a.gpId || null) === (b.gpId || null) &&
      (a.villageId || null) === (b.villageId || null)
    );
  }

  private syncBlockIds() {
    const blockId = this.value.blockId || this.value.tehsilId || null;
    this.value.blockId = blockId;
    this.value.tehsilId = blockId;
  }

  onDistrictIdChange(raw: string | number | null) {
    this.value.districtId = this.toId(raw);
    this.onDistrictChange();
  }

  onBlockIdChange(raw: string | number | null) {
    this.value.blockId = this.toId(raw);
    this.onBlockChange();
  }

  onGpIdChange(raw: string | number | null) {
    this.value.gpId = this.toId(raw);
    this.onGpChange();
  }

  onVillageIdChange(raw: string | number | null) {
    this.value.villageId = this.toId(raw);
    this.onVillageChange();
  }

  loadDistrictsAndHydrate() {
    this.loading = true;
    this.locationService.getDistricts().subscribe({
      next: (res) => {
        this.districts = this.normalizeItems(res.data || []);
        this.districtsLoaded = true;
        this.loading = false;
        this.hydrateFromValue();
      },
      error: () => {
        this.loading = false;
      },
    });
  }

  hydrateFromValue() {
    this.syncBlockIds();

    // Only blockId known → resolve parent district, then continue cascade
    if (!this.value.districtId && this.value.blockId) {
      this.hydrating = true;
      this.locationService.resolveBlock(this.value.blockId).subscribe({
        next: (res) => {
          const d = res.data;
          if (d?.districtId) {
            this.value.districtId = d.districtId;
            this.value.blockId = d.blockId || this.value.blockId;
            this.syncBlockIds();
            this.loadBlocksAndBelow();
          } else {
            this.hydrating = false;
            this.emit();
          }
        },
        error: () => {
          this.hydrating = false;
          this.emit();
        },
      });
      return;
    }

    if (!this.value.districtId) {
      this.emit();
      return;
    }

    this.loadBlocksAndBelow();
  }

  private loadBlocksAndBelow() {
    if (!this.value.districtId) {
      this.hydrating = false;
      this.emit();
      return;
    }
    this.hydrating = true;
    this.locationService.getBlocks(this.value.districtId).subscribe({
      next: (res) => {
        this.blocks = this.normalizeItems(res.data || []);
        if (!this.value.blockId) {
          this.hydrating = false;
          this.emit();
          return;
        }
        this.locationService.getGps(this.value.blockId).subscribe({
          next: (gpRes) => {
            this.gps = this.normalizeItems(gpRes.data || []);
            const gp = this.gps.find((g) => g.id === this.value.gpId) || null;
            this.gpSelected.emit(gp);
            if (!this.value.gpId || !this.showVillage) {
              this.hydrating = false;
              this.emit();
              return;
            }
            this.locationService.getVillages(this.value.gpId).subscribe({
              next: (vRes) => {
                this.villages = this.normalizeItems(vRes.data || []);
                this.hydrating = false;
                this.emit();
              },
              error: () => {
                this.hydrating = false;
                this.emit();
              },
            });
          },
          error: () => {
            this.hydrating = false;
            this.emit();
          },
        });
      },
      error: () => {
        this.hydrating = false;
        this.emit();
      },
    });
  }

  onDistrictChange() {
    if (this.hydrating) return;
    this.resetFrom('block');
    this.emit();
    if (!this.value.districtId) return;
    this.locationService.getBlocks(this.value.districtId).subscribe((res) => {
      this.blocks = this.normalizeItems(res.data || []);
    });
  }

  onBlockChange() {
    if (this.hydrating) return;
    this.syncBlockIds();
    this.resetFrom('gp');
    this.emit();
    if (!this.value.blockId) return;
    this.locationService.getGps(this.value.blockId).subscribe((res) => {
      this.gps = this.normalizeItems(res.data || []);
    });
  }

  onGpChange() {
    if (this.hydrating) return;
    this.resetFrom('village');
    const gp = this.gps.find((g) => g.id === this.value.gpId) || null;
    this.gpSelected.emit(gp);
    this.emit();
    if (!this.value.gpId || !this.showVillage) return;
    this.locationService.getVillages(this.value.gpId).subscribe((res) => {
      this.villages = this.normalizeItems(res.data || []);
    });
  }

  onVillageChange() {
    if (this.hydrating) return;
    this.emit();
  }

  private resetFrom(level: 'block' | 'gp' | 'village') {
    if (level === 'block') {
      this.value.blockId = null;
      this.value.tehsilId = null;
      this.blocks = [];
      this.value.gpId = null;
      this.gps = [];
      this.gpSelected.emit(null);
      this.value.villageId = null;
      this.villages = [];
      return;
    }
    if (level === 'gp') {
      this.value.gpId = null;
      this.gps = [];
      this.gpSelected.emit(null);
      this.value.villageId = null;
      this.villages = [];
      return;
    }
    this.value.villageId = null;
    this.villages = [];
  }

  private emit() {
    this.syncBlockIds();
    this.valueChange.emit({ ...this.value });
  }
}
