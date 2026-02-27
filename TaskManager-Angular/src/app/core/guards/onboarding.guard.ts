import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { SupabaseService } from '../services/supabase';
import { AuthService } from '../services/auth';
import { from, Observable } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

/**
 * Counts the user's projects via a HEAD request (no data transferred).
 */
function countProjects(supabase: SupabaseService): Observable<number> {
  return from(
    supabase.client
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null)
  ).pipe(
    map(({ count }) => count ?? 0)
  );
}

/**
 * Applied on all protected routes (dashboard, projects, documents, etc.).
 * Redirects to /onboarding if the user has zero projects.
 */
export const onboardingGuard: CanActivateFn = (): Observable<boolean | UrlTree> => {
  const supabase = inject(SupabaseService);
  const authService = inject(AuthService);
  const router = inject(Router);

  return from(authService.supabase.auth.getSession()).pipe(
    switchMap(({ data: { session } }) => {
      if (!session) {
        return from([router.createUrlTree(['/login'])]);
      }
      return countProjects(supabase).pipe(
        map(count => count > 0 ? true : router.createUrlTree(['/onboarding']))
      );
    })
  );
};

/**
 * Applied on /onboarding route.
 * Redirects to /dashboard if the user already has projects.
 */
export const requireNoProjectsGuard: CanActivateFn = (): Observable<boolean | UrlTree> => {
  const supabase = inject(SupabaseService);
  const router = inject(Router);

  return countProjects(supabase).pipe(
    map(count => count === 0 ? true : router.createUrlTree(['/dashboard']))
  );
};
