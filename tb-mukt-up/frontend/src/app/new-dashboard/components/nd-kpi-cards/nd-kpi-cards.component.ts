import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NdKpi } from '../../new-dashboard.models';

@Component({
  selector: 'app-nd-kpi-cards',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="kpi-row">
      <div class="kpi-card" *ngFor="let k of cards" [ngClass]="k.tone || ''">
        <span class="kpi-label">{{ k.label }}</span>
        <strong class="kpi-value">{{ k.value }}</strong>
        <small class="kpi-sub" *ngIf="k.sub">{{ k.sub }}</small>
      </div>
    </div>
  `,
  styleUrl: './nd-kpi-cards.component.scss',
})
export class NdKpiCardsComponent {
  @Input() cards: NdKpi[] = [];
}
