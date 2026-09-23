import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';

@Component({
  selector: 'app-tb-upload',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './tb-upload.component.html',
  styleUrl: './tb-upload.component.scss',
})
export class TbUploadComponent {
  readonly requiredColumns = [
    'district_id',
    'block_id',
    'gp_id',
    'village_id (optional)',
    'reporting_month',
    'reporting_year',
    'tested_naat',
    'tb_diagnosed',
    'prev_year_success_treatment',
    'poshan_eligible',
    'poshan_consented',
    'poshan_received',
  ];

  readonly sampleRows = [
    'district_id,block_id,gp_id,village_id,reporting_month,reporting_year,tested_naat,tb_diagnosed,prev_year_success_treatment,poshan_eligible,poshan_consented,poshan_received',
    '35,416,12001,550001,8,2024,65,14,82,22,20,18',
    '35,416,12002,,8,2024,48,2,90,10,9,9',
  ];

  downloadTemplateCsv() {
    const blob = new Blob([this.sampleRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tb-entry-upload-template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  }
}
