import { Component } from '@angular/core';
import { DashboardViewComponent } from '../dashboard-view.component';

@Component({
  selector: 'app-state-dashboard',
  standalone: true,
  imports: [DashboardViewComponent],
  template: `<app-dashboard-view title="State Dashboard" level="state"></app-dashboard-view>`,
})
export class StateDashboardComponent {}
