import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { AuthService } from '../services/auth';
import { from, Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export const authGuard: CanActivateFn = (): Observable<boolean | UrlTree> => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return from(authService.supabase.auth.getSession()).pipe(
    map(({ data: { session } }) => {
      if (session) {
        return true;
      }
      return router.createUrlTree(['/login']);
    })
  );
};

export const publicGuard: CanActivateFn = (): Observable<boolean | UrlTree> => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return from(authService.supabase.auth.getSession()).pipe(
    map(({ data: { session } }) => {
      if (session) {
        return router.createUrlTree(['/dashboard']);
      }
      return true;
    })
  );
}; 