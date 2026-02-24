import { computed } from '@angular/core';
import { signalStore, withState, withMethods, withComputed, patchState } from '@ngrx/signals';
import { inject } from '@angular/core';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { pipe, tap, switchMap, catchError, EMPTY } from 'rxjs';
import { debounceTime, filter } from 'rxjs/operators';
import { GlobalSearchService } from '../services/global-search.service';
import { SearchResponse } from '../../shared/models/search.model';

interface GlobalSearchState {
  query: string;
  results: SearchResponse | null;
  loading: boolean;
  error: string | null;
}

export const GlobalSearchStore = signalStore(
  { providedIn: 'root' },

  withState<GlobalSearchState>({
    query: '',
    results: null,
    loading: false,
    error: null,
  }),

  withComputed((store) => ({
    hasResults: computed(() => {
      const results = store.results();
      return results !== null && results.total > 0;
    }),
    totalCount: computed(() => store.results()?.total ?? 0),
  })),

  withMethods((store, searchService = inject(GlobalSearchService)) => ({
    search: rxMethod<string>(
      pipe(
        tap((query) => patchState(store, { query })),
        debounceTime(300),
        filter((query) => query.trim().length >= 2),
        tap(() => patchState(store, { loading: true, error: null })),
        switchMap((query) =>
          searchService.search(query).pipe(
            tap((results) => {
              patchState(store, { results, loading: false });
            }),
            catchError((error: unknown) => {
              const message = error instanceof Error ? error.message : 'Erreur inconnue';
              patchState(store, { error: message, loading: false });
              return EMPTY;
            })
          )
        )
      )
    ),

    clear(): void {
      patchState(store, {
        query: '',
        results: null,
        loading: false,
        error: null,
      });
    },
  }))
);
