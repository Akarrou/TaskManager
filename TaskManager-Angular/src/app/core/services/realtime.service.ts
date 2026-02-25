import { Injectable, inject, effect } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import { filter } from 'rxjs/operators';
import { RealtimeChannel } from '@supabase/supabase-js';
import { SupabaseService } from './supabase';
import { AuthService } from './auth';

export interface TableChangeEvent {
  table: string;
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  recordId: string | null;
}

const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_RECONNECT_DELAY_MS = 5000;
const MAX_RECONNECT_DELAY_MS = 30000;

/**
 * Centralized Supabase Realtime service.
 *
 * Manages a single WebSocket channel listening to all `postgres_changes`
 * on the `public` schema. Consumers subscribe to specific tables via
 * `onTableChange()` or `onDynamicTableChange()`.
 *
 * Lifecycle is driven by the auth state: the channel is opened when a
 * user is authenticated and closed on sign-out. Reconnection uses
 * exponential backoff (5 s → 30 s, up to 10 attempts).
 *
 * Because this service is `providedIn: 'root'`, it lives for the entire
 * application lifetime. Cleanup on sign-out is handled by the `effect()`
 * watching `AuthService.currentUser`.
 */
@Injectable({
  providedIn: 'root',
})
export class RealtimeService {
  private supabaseService = inject(SupabaseService);
  private authService = inject(AuthService);

  private channel: RealtimeChannel | null = null;
  private changes$ = new Subject<TableChangeEvent>();
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;

  constructor() {
    effect(() => {
      const user = this.authService.currentUser();
      if (user) {
        this.connect();
      } else {
        this.disconnect();
      }
    });
  }

  onTableChange(table: string): Observable<TableChangeEvent> {
    return this.changes$.pipe(
      filter((event) => event.table === table),
    );
  }

  onDynamicTableChange(prefix: string): Observable<TableChangeEvent> {
    return this.changes$.pipe(
      filter((event) => event.table.startsWith(prefix)),
    );
  }

  private connect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.channel) return;

    const channel = this.supabaseService.client
      .channel('app-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public' },
        (payload) => {
          if (this.channel !== channel) return;
          if (!payload.table) return;
          const newRecord = payload.new as Record<string, unknown> | undefined;
          const oldRecord = payload.old as Record<string, unknown> | undefined;
          const recordId = ((newRecord?.['id'] ?? oldRecord?.['id']) as string) || null;
          this.changes$.next({
            table: payload.table,
            eventType: payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
            recordId,
          });
        },
      );

    this.channel = channel;

    channel.subscribe((status) => {
      if (this.channel !== channel) return;

      if (status === 'SUBSCRIBED') {
        this.reconnectAttempts = 0;
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        this.handleError();
      }
    });
  }

  private disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    this.reconnectAttempts = 0;
    this.removeCurrentChannel();
  }

  private handleError(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    this.removeCurrentChannel();

    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return;

    const delay = Math.min(
      BASE_RECONNECT_DELAY_MS * Math.pow(1.5, this.reconnectAttempts),
      MAX_RECONNECT_DELAY_MS,
    );
    this.reconnectAttempts++;

    this.reconnectTimeout = setTimeout(() => {
      if (this.authService.currentUser()) {
        this.connect();
      }
    }, delay);
  }

  private removeCurrentChannel(): void {
    if (!this.channel) return;
    const ch = this.channel;
    this.channel = null;
    this.supabaseService.client.removeChannel(ch);
  }
}
