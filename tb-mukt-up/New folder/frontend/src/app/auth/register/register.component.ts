import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LocationCascadeComponent, LocationSelection } from '../../shared/components/location-cascade/location-cascade.component';
import { AuthService } from '../../core/services/auth.service';
import { NotifyService } from '../../core/services/notify.service';
import { BrandLogoComponent } from '../../shared/components/brand-logo/brand-logo.component';

function matchPasswords(group: AbstractControl): ValidationErrors | null {
  const p = group.get('password')?.value;
  const c = group.get('confirmPassword')?.value;
  return p && c && p !== c ? { mismatch: true } : null;
}

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, LocationCascadeComponent, BrandLogoComponent],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss',
})
export class RegisterComponent {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private notify = inject(NotifyService);
  private router = inject(Router);

  loading = false;
  showPassword = false;
  location: LocationSelection = {};

  form = this.fb.group(
    {
      fullName: ['', [Validators.required, Validators.minLength(2)]],
      mobile: ['', [Validators.required, Validators.pattern(/^[6-9]\d{9}$/)]],
      email: ['', [Validators.required, Validators.email]],
      username: ['', [Validators.required, Validators.minLength(4)]],
      password: ['', [Validators.required, Validators.minLength(8), Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/)]],
      confirmPassword: ['', Validators.required],
      designation: [''],
    },
    { validators: matchPasswords }
  );

  onLocationChange(loc: LocationSelection) {
    this.location = loc;
  }

  submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.notify.error('Please fix validation errors');
      return;
    }
    if (!this.location.districtId || !(this.location.blockId || this.location.tehsilId) || !this.location.gpId) {
      this.notify.error('District, Block and Gram Panchayat are required');
      return;
    }
    this.loading = true;
    const payload = { ...this.form.getRawValue(), ...this.location };
    this.auth.register(payload).subscribe({
      next: (res) => {
        this.loading = false;
        this.notify.success(res.message || 'Registration successful');
        this.router.navigate([this.auth.dashboardRouteForRole(res.data.user.role)]);
      },
      error: (err) => {
        this.loading = false;
        this.notify.fromHttpError(err, 'Registration failed');
      },
    });
  }
}
