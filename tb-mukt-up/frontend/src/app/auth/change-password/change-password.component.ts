import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { NotifyService } from '../../core/services/notify.service';

@Component({
  selector: 'app-change-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './change-password.component.html',
  styleUrl: './change-password.component.scss',
})
export class ChangePasswordComponent {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private notify = inject(NotifyService);

  saving = false;

  form = this.fb.group({
    currentPassword: ['', [Validators.required]],
    newPassword: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(64)]],
    confirmPassword: ['', [Validators.required]],
  });

  save() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.notify.error('Please fill all fields correctly');
      return;
    }
    const v = this.form.getRawValue();
    if (v.newPassword !== v.confirmPassword) {
      this.notify.error('New password and confirm password do not match');
      return;
    }
    if (v.currentPassword === v.newPassword) {
      this.notify.error('New password must be different from current password');
      return;
    }

    this.saving = true;
    this.auth
      .changePassword({
        currentPassword: String(v.currentPassword),
        newPassword: String(v.newPassword),
        confirmPassword: String(v.confirmPassword),
      })
      .subscribe({
        next: (res) => {
          this.saving = false;
          this.notify.success(res.message || 'Password changed successfully');
          this.form.reset();
        },
        error: (err) => {
          this.saving = false;
          this.notify.fromHttpError(err, 'Failed to change password');
        },
      });
  }
}
