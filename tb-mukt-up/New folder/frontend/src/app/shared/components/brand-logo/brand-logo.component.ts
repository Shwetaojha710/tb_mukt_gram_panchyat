import { Component, Input } from '@angular/core';
import { APP_LOGO, APP_NAME } from '../../../core/constants/branding';

@Component({
  selector: 'app-brand-logo',
  standalone: true,
  template: `<img [src]="logoUrl" [alt]="alt" [class]="'app-brand-logo size-' + size" />`,
  styleUrl: './brand-logo.component.scss',
})
export class BrandLogoComponent {
  @Input() size: 'xs' | 'sm' | 'md' | 'lg' | 'hero' = 'md';
  @Input() alt = APP_NAME;

  readonly logoUrl = APP_LOGO;
}
