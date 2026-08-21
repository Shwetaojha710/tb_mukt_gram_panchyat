import { Component } from '@angular/core';
import { DashboardViewComponent } from '../dashboard-view.component';

@Component({
  selector: 'app-district-dashboard',
  standalone: true,
  imports: [DashboardViewComponent],
  template: `<app-dashboard-view title="District Dashboard" level="district"></app-dashboard-view>`,
})
export class DistrictDashboardComponent {}
