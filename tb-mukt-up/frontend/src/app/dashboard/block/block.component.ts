import { Component } from '@angular/core';
import { DashboardViewComponent } from '../dashboard-view.component';

@Component({
  selector: 'app-block-dashboard',
  standalone: true,
  imports: [DashboardViewComponent],
  template: `<app-dashboard-view title="Block Dashboard" level="block"></app-dashboard-view>`,
})
export class BlockDashboardComponent {}
