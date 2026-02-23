import { computed, inject } from '@angular/core';
import { signalStore, withState, withMethods, withComputed, patchState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { pipe, tap, switchMap, catchError, of } from 'rxjs';
import { EventCategoryService } from '../services/event-category.service';
import {
  CategoryDefinition,
  DEFAULT_CATEGORIES,
} from '../../shared/models/event-constants';

interface EventCategoryStoreState {
  customCategories: CategoryDefinition[];
  loading: boolean;
  error: string | null;
}

export const EventCategoryStore = signalStore(
  { providedIn: 'root' },

  withState<EventCategoryStoreState>({
    customCategories: [],
    loading: false,
    error: null,
  }),

  withComputed((store) => ({
    allCategories: computed(() => [
      ...DEFAULT_CATEGORIES,
      ...store.customCategories(),
    ]),
  })),

  withMethods((
    store,
    categoryService = inject(EventCategoryService),
  ) => ({
    loadCategories: rxMethod<void>(
      pipe(
        tap(() => patchState(store, { loading: true, error: null })),
        switchMap(() =>
          categoryService.getCustomCategories().pipe(
            tap((categories) => {
              patchState(store, { customCategories: categories, loading: false });
            }),
            catchError((error: Error) => {
              patchState(store, { loading: false, error: error.message });
              return of(null);
            }),
          ),
        ),
      ),
    ),

    addCategory: rxMethod<{ key: string; label: string; colorKey: string }>(
      pipe(
        tap(() => patchState(store, { loading: true, error: null })),
        switchMap(({ key, label, colorKey }) => {
          const existingOrders = store.customCategories().map(c => c.sortOrder ?? 0);
          const nextOrder = existingOrders.length > 0 ? Math.max(...existingOrders) + 1 : 0;
          return categoryService.addCategory({
            key,
            label,
            colorKey,
            sortOrder: nextOrder,
          }).pipe(
            tap((created) => {
              patchState(store, {
                customCategories: [...store.customCategories(), created],
                loading: false,
              });
            }),
            catchError((error: Error) => {
              patchState(store, { loading: false, error: error.message });
              return of(null);
            }),
          );
        }),
      ),
    ),

    updateCategory: rxMethod<{ key: string; label?: string; colorKey?: string }>(
      pipe(
        tap(() => patchState(store, { loading: true, error: null })),
        switchMap(({ key, label, colorKey }) =>
          categoryService.updateCategory(key, { label, colorKey }).pipe(
            tap((updated) => {
              patchState(store, {
                customCategories: store.customCategories().map(c =>
                  c.key === key ? updated : c
                ),
                loading: false,
              });
            }),
            catchError((error: Error) => {
              patchState(store, { loading: false, error: error.message });
              return of(null);
            }),
          ),
        ),
      ),
    ),

    deleteCategory: rxMethod<{ key: string }>(
      pipe(
        tap(() => patchState(store, { loading: true, error: null })),
        switchMap(({ key }) =>
          categoryService.deleteCategory(key).pipe(
            tap(() => {
              patchState(store, {
                customCategories: store.customCategories().filter(c => c.key !== key),
                loading: false,
              });
            }),
            catchError((error: Error) => {
              patchState(store, { loading: false, error: error.message });
              return of(null);
            }),
          ),
        ),
      ),
    ),
  })),
);
