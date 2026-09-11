import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { NotifyService } from '../../core/services/notify.service';
import { BrandLogoComponent } from '../../shared/components/brand-logo/brand-logo.component';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, BrandLogoComponent],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private notify = inject(NotifyService);
  private router = inject(Router);

  loading = false;
  showPassword = false;

  form = this.fb.group({
    username: ['', Validators.required],
    password: ['', Validators.required],
  });

  submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.notify.error('Please enter username/userid and password');
      return;
    }
    this.loading = true;
    const payload = {
      username: this.form.value.username,
      password: this.form.value.password,
    };
    this.auth.login(payload).subscribe({
      next: (res) => {
        this.loading = false;
        this.notify.success(res.message || 'Login successful');
        this.router.navigate([this.auth.dashboardRouteForRole(res.data.user.role)]);
      },
      error: (err) => {
        this.loading = false;
        this.notify.fromHttpError(err, 'Login failed');
      },
    });
  }
}
