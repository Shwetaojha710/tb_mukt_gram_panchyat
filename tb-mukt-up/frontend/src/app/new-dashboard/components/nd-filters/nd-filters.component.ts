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
import { LocationItem, LocationService } from '../../../core/services/location.service';
import { MonthYearPickerComponent } from '../../../shared/components/month-year-picker/month-year-picker.component';
import { NdFilters, NdView } from '../../new-dashboard.models';

@Component({
  selector: 'app-nd-filters',
  standalone: true,
  imports: [CommonModule, FormsModule, MonthYearPickerComponent],
  templateUrl: './nd-filters.component.html',
  styleUrl: './nd-filters.component.scss',
})
export class NdFiltersComponent implements OnInit, OnChanges {
  @Input() view: NdView = 'overview';
  @Input({ required: true }) value!: NdFilters;
  /** District / block fixed by the logged-in user's role */
  @Input() lockDistrict = false;
  @Input() lockBlock = false;
  @Input() loading = false;

  @Output() apply = new EventEmitter<NdFilters>();
  @Output() reset = new EventEmitter<void>();

  readonly minYear = 2023;
  readonly maxYear = new Date().getFullYear();

  draft!: NdFilters;
  districts: LocationItem[] = [];
  blocks: LocationItem[] = [];
  gps: LocationItem[] = [];
  error = '';

  private blocksFor: number | null = null;
  private gpsFor: number | null = null;
  private destroyRef = inject(DestroyRef);

  constructor(private locations: LocationService) {}

  ngOnInit() {
    if (!this.lockDistrict) {
      this.locations
        .getDistricts()
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (res) => (this.districts = this.normalize(res.data)),
          error: () => (this.districts = []),
        });
    }
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['value']) {
      this.draft = { ...this.value };
      this.error = '';
    }
    this.loadChildren();
  }

  get showDistrict(): boolean {
    return !this.lockDistrict;
  }

  /** Block filter on Overview + Action Items (locked for Block users). */
  get showBlock(): boolean {
    return !this.lockBlock;
  }

  /** Optional GP filter once a block is chosen (Overview only). */
  get showGp(): boolean {
    return this.view === 'overview' && !!this.draft?.blockId;
  }

  /** Native option values are strings — required for Android/Samsung pickers. */
  idStr(id: number | null): string {
    return id == null ? '' : String(id);
  }

  onDistrict(raw: string) {
    this.draft.districtId = this.toId(raw);
    this.draft.blockId = null;
    this.draft.gpId = null;
    this.loadChildren();
  }

  onBlock(raw: string) {
    this.draft.blockId = this.toId(raw);
    this.draft.gpId = null;
    this.loadChildren();
  }

  onGp(raw: string) {
    this.draft.gpId = this.toId(raw);
  }

  submit() {
    const d = this.draft;
    if (d.fromYear > d.toYear || (d.fromYear === d.toYear && d.fromMonth > d.toMonth)) {
      this.error = 'From period cannot be after To period.';
      return;
    }
    this.error = '';
    this.apply.emit({ ...d });
  }

  private loadChildren() {
    if (!this.draft) return;

    const districtId = this.draft.districtId;
    if (this.showBlock && districtId !== this.blocksFor) {
      this.blocksFor = districtId;
      this.blocks = [];
      if (districtId) {
        this.locations
          .getBlocks(districtId)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: (res) => {
              if (this.blocksFor === districtId) this.blocks = this.normalize(res.data);
            },
            error: () => (this.blocks = []),
          });
      }
    }

    const blockId = this.draft.blockId;
    if (this.showGp && blockId !== this.gpsFor) {
      this.gpsFor = blockId;
      this.gps = [];
      if (blockId) {
        this.locations
          .getGps(blockId)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: (res) => {
              if (this.gpsFor === blockId) this.gps = this.normalize(res.data);
            },
            error: () => (this.gps = []),
          });
      }
    } else if (!blockId) {
      this.gpsFor = null;
      this.gps = [];
    }
  }

  private normalize(items: LocationItem[]): LocationItem[] {
    return (items || []).map((item) => ({ ...item, id: Number(item.id) }));
  }

  private toId(raw: string): number | null {
    const n = Number(raw);
    return raw !== '' && Number.isFinite(n) && n > 0 ? n : null;
  }
}
