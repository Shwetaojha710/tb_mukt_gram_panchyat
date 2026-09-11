import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { SettingsService } from '../../core/services/settings.service';
import { NotifyService } from '../../core/services/notify.service';

@Component({
  selector: 'app-tb-entry-settings',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './tb-entry-settings.component.html',
  styleUrl: './tb-entry-settings.component.scss',
})
export class TbEntrySettingsComponent implements OnInit {
  private fb = inject(FormBuilder);
  private settings = inject(SettingsService);
  private notify = inject(NotifyService);

  loading = false;
  saving = false;

  form = this.fb.group({
    reportingMonthsBack: [6, [Validators.required, Validators.min(1), Validators.max(24)]],
    submitDeadlineDay: [10, [Validators.required, Validators.min(1), Validators.max(28)]],
    editDeadlineDay: [15, [Validators.required, Validators.min(1), Validators.max(28)]],
  });

  ngOnInit() {
    this.loading = true;
    this.settings.getTbEntrySettings().subscribe({
      next: (res) => {
        this.form.patchValue(res.data);
        this.loading = false;
      },
      error: (err) => {
        this.loading = false;
        this.notify.fromHttpError(err, 'Failed to load settings');
      },
    });
  }

  save() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.notify.error('Please fill valid values');
      return;
    }
    const v = this.form.getRawValue();
    if ((v.editDeadlineDay || 0) < (v.submitDeadlineDay || 0)) {
      this.notify.error('Edit deadline day must be >= submit deadline day');
      return;
    }
    this.saving = true;
    this.settings
      .updateTbEntrySettings({
        reportingMonthsBack: Number(v.reportingMonthsBack),
        submitDeadlineDay: Number(v.submitDeadlineDay),
        editDeadlineDay: Number(v.editDeadlineDay),
      })
      .subscribe({
        next: () => {
          this.saving = false;
          this.notify.success('Settings saved');
        },
        error: (err) => {
          this.saving = false;
          this.notify.fromHttpError(err, 'Failed to save settings');
        },
      });
  }
}
