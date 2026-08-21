import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { NotifyService } from '../../core/services/notify.service';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './forgot-password.component.html',
  styleUrl: './forgot-password.component.scss',
})
export class ForgotPasswordComponent {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private notify = inject(NotifyService);

  loading = false;
  resetToken = '';
  step: 'request' | 'reset' = 'request';

  requestForm = this.fb.group({
    mobile: [''],
    email: ['', Validators.email],
  });

  resetForm = this.fb.group({
    token: ['', Validators.required],
    newPassword: ['', [Validators.required, Validators.minLength(8)]],
  });

  request() {
    const { mobile, email } = this.requestForm.value;
    if (!mobile && !email) {
      this.notify.error('Enter mobile or email');
      return;
    }
    this.loading = true;
    this.auth.forgotPassword({ mobile, email }).subscribe({
      next: (res) => {
        this.loading = false;
        this.notify.success(res.message);
        if (res.resetToken) {
          this.resetToken = res.resetToken;
          this.resetForm.patchValue({ token: res.resetToken });
          this.step = 'reset';
          this.notify.info('Dev reset token filled automatically');
        } else {
          this.step = 'reset';
        }
      },
      error: (err) => {
        this.loading = false;
        this.notify.fromHttpError(err);
      },
    });
  }

  reset() {
    if (this.resetForm.invalid) {
      this.resetForm.markAllAsTouched();
      return;
    }
    this.loading = true;
    this.auth.resetPassword(this.resetForm.getRawValue()).subscribe({
      next: (res) => {
        this.loading = false;
        this.notify.success(res.message);
      },
      error: (err) => {
        this.loading = false;
        this.notify.fromHttpError(err);
      },
    });
  }
}
