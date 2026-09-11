import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { NotifyService } from '../../core/services/notify.service';
import { APP_LOGO, NHM_LOGO, NTEP_LOGO } from '../../core/constants/branding';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private notify = inject(NotifyService);
  private router = inject(Router);

  readonly appLogo = APP_LOGO;
  readonly nhmLogo = NHM_LOGO;
  readonly ntepLogo = NTEP_LOGO;

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
