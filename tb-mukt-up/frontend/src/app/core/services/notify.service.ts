import { Injectable } from '@angular/core';
import { ToastrService } from 'ngx-toastr';

@Injectable({ providedIn: 'root' })
export class NotifyService {
  constructor(private toastr: ToastrService) {}

  success(message: string, title = 'Success') {
    this.toastr.success(message, title);
  }

  error(message: string, title = 'Error') {
    this.toastr.error(message, title);
  }

  info(message: string, title = 'Info') {
    this.toastr.info(message, title);
  }

  fromHttpError(err: any, fallback = 'Something went wrong') {
    const msg =
      err?.error?.details?.join?.('; ') ||
      err?.error?.message ||
      err?.message ||
      fallback;
    this.error(msg);
  }
}
