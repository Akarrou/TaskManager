import { DestroyRef, inject } from '@angular/core';
import { withHooks } from '@ngrx/signals';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime, merge } from 'rxjs';
import { RealtimeService } from '../../services/realtime.service';

export interface RealtimeSyncConfig {
  /** Static table names to listen to */
  tables?: string[];
  /** Dynamic table name prefixes to listen to (e.g., 'database_') */
  dynamicPrefixes?: string[];
  /** Callback invoked when any monitored table changes */
  onTableChange: (store: Record<string, unknown>) => void;
  /** Debounce time in ms (default: 300) */
  debounceMs?: number;
}

/**
 * Composable SignalStore feature that subscribes to Supabase Realtime
 * table changes and triggers a store refresh callback.
 *
 * All monitored tables/prefixes are merged into a single observable
 * with a single debounce, so batch operations across multiple tables
 * trigger only one refresh.
 *
 * Must be placed LAST in the signalStore() chain so the store
 * parameter includes all previously defined state/methods.
 *
 * @example
 * ```typescript
 * export const MyStore = signalStore(
 *   { providedIn: 'root' },
 *   withState({ ... }),
 *   withMethods(() => ({ loadData: rxMethod<void>(...) })),
 *   withRealtimeSync({
 *     tables: ['my_table'],
 *     onTableChange: (store) => {
 *       const fn = store['loadData'];
 *       if (typeof fn === 'function') fn();
 *     },
 *   }),
 * );
 * ```
 */
export function withRealtimeSync(config: RealtimeSyncConfig) {
  return withHooks({
    onInit(store) {
      const realtimeService = inject(RealtimeService);
      const destroyRef = inject(DestroyRef);
      const debounceMs = config.debounceMs ?? 300;

      const tables = config.tables ?? [];
      const prefixes = config.dynamicPrefixes ?? [];

      const sources = [
        ...tables.map((t) => realtimeService.onTableChange(t)),
        ...prefixes.map((p) => realtimeService.onDynamicTableChange(p)),
      ];

      if (sources.length === 0) return;

      merge(...sources).pipe(
        debounceTime(debounceMs),
        takeUntilDestroyed(destroyRef),
      ).subscribe(() => config.onTableChange(store as Record<string, unknown>));
    },
  });
}
