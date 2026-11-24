import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { NotifyService } from '../services/notify.service';

let sessionExpiredHandling = false;

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const notify = inject(NotifyService);
  const token = auth.getToken();
  const authReq = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(authReq).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse && err.status === 401) {
        const url = req.url || '';
        const isAuthPublic =
          url.includes('/auth/login') ||
          url.includes('/auth/register') ||
          url.includes('/auth/forgot-password') ||
          url.includes('/auth/reset-password');

        if (!isAuthPublic && auth.getToken() && !sessionExpiredHandling) {
          sessionExpiredHandling = true;
          notify.error('Session expired. Please log in again.');
          auth.logout();
          // Allow future 401s after user logs in again
          setTimeout(() => {
            sessionExpiredHandling = false;
          }, 1500);
        }
      }
      return throwError(() => err);
    })
  );
};
