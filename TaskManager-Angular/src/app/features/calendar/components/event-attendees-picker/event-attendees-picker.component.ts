import {
  Component,
  ChangeDetectionStrategy,
  forwardRef,
  signal,
  inject,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ControlValueAccessor,
  NG_VALUE_ACCESSOR,
  ReactiveFormsModule,
  FormControl,
} from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import {
  Subject,
  debounceTime,
  distinctUntilChanged,
  takeUntil,
} from 'rxjs';

import { EventAttendee } from '../../models/attendee.model';
import { getInitials, getRsvpIcon, getRsvpLabel } from '../../../../shared/utils/attendee.utils';
import { UserService } from '../../../../core/services/user.service';
import { SupabaseService } from '../../../../core/services/supabase';
import { GoogleCalendarApiService } from '../../../google-calendar/services/google-calendar-api.service';
import { GoogleCalendarAuthService } from '../../../google-calendar/services/google-calendar-auth.service';

interface UserSuggestion {
  id: string;
  email: string;
  source: 'kodo' | 'google';
  displayName?: string;
  photoUrl?: string;
}

@Component({
  selector: 'app-event-attendees-picker',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatAutocompleteModule,
    MatIconModule,
    MatMenuModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './event-attendees-picker.component.html',
  styleUrls: ['./event-attendees-picker.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => EventAttendeesPickerComponent),
      multi: true,
    },
  ],
})
export class EventAttendeesPickerComponent implements ControlValueAccessor, OnInit, OnDestroy {
  private userService = inject(UserService);
  private supabaseService = inject(SupabaseService);
  private googleApiService = inject(GoogleCalendarApiService);
  private googleAuthService = inject(GoogleCalendarAuthService);

  protected attendees = signal<EventAttendee[]>([]);
  protected suggestions = signal<UserSuggestion[]>([]);
  protected isDisabled = signal(false);
  protected isSearching = signal(false);
  private googleConnected = signal(false);

  searchControl = new FormControl<string>('', { nonNullable: true });

  private allUsers: UserSuggestion[] = [];
  private usersLoaded = false;
  private destroy$ = new Subject<void>();
  private onChange: (value: EventAttendee[]) => void = () => { /* noop */ };
  private onTouched: () => void = () => { /* noop */ };

  ngOnInit(): void {
    this.loadUsers();
    this.checkGoogleConnection();

    this.searchControl.valueChanges.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntil(this.destroy$),
    ).subscribe(query => {
      this.filterSuggestions(query);
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ControlValueAccessor

  writeValue(value: EventAttendee[] | null): void {
    this.attendees.set(value ?? []);
  }

  registerOnChange(fn: (value: EventAttendee[]) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.isDisabled.set(isDisabled);
    if (isDisabled) {
      this.searchControl.disable();
    } else {
      this.searchControl.enable();
    }
  }

  // Public methods

  addAttendeeFromSuggestion(user: UserSuggestion): void {
    this.addByEmail(user.email, user.source === 'kodo' ? user.id : undefined, user.displayName);
  }

  addAttendeeFromInput(): void {
    const email = this.searchControl.value.trim();
    if (!email || !this.isValidEmail(email)) return;

    const matchingUser = this.allUsers.find(u => u.email === email);
    this.addByEmail(email, matchingUser?.id);
  }

  removeAttendee(attendee: EventAttendee): void {
    if (attendee.isOrganizer) return;
    const current = this.attendees();
    const updated = current.filter(a => a.email !== attendee.email);
    this.attendees.set(updated);
    this.onChange(updated);
    this.onTouched();
  }

  toggleOptional(attendee: EventAttendee): void {
    if (attendee.isOrganizer) return;
    const current = this.attendees();
    const updated = current.map(a =>
      a.email === attendee.email ? { ...a, isOptional: !a.isOptional } : a
    );
    this.attendees.set(updated);
    this.onChange(updated);
  }

  getInitials(attendee: EventAttendee): string {
    return getInitials(attendee.displayName, attendee.email);
  }

  getRsvpIcon(status: Parameters<typeof getRsvpIcon>[0]): string {
    return getRsvpIcon(status);
  }

  getRsvpLabel(status: Parameters<typeof getRsvpLabel>[0]): string {
    return getRsvpLabel(status);
  }

  // Private

  private async loadUsers(): Promise<void> {
    if (this.usersLoaded) return;
    const users = await this.userService.getUsers();
    this.allUsers = users.map(u => ({ ...u, source: 'kodo' as const }));
    this.usersLoaded = true;
  }

  private async checkGoogleConnection(): Promise<void> {
    try {
      const connection = await this.googleAuthService.getConnection();
      this.googleConnected.set(connection !== null);
    } catch {
      this.googleConnected.set(false);
    }
  }

  private filterSuggestions(query: string): void {
    if (!query || query.trim().length < 2) {
      this.suggestions.set([]);
      return;
    }

    const lower = query.toLowerCase();
    const currentEmails = new Set(this.attendees().map(a => a.email));

    // Local Kodo users
    const kodoResults: UserSuggestion[] = this.allUsers
      .filter(u =>
        u.email.toLowerCase().includes(lower) &&
        !currentEmails.has(u.email)
      )
      .slice(0, 10);

    this.suggestions.set(kodoResults);

    // Google contacts (async, merged after)
    if (this.googleConnected() && query.trim().length >= 3) {
      this.isSearching.set(true);
      this.googleApiService.searchContacts(query.trim()).then(contacts => {
        const googleSuggestions: UserSuggestion[] = contacts
          .filter(c => !currentEmails.has(c.email))
          .map(c => ({
            id: `google-${c.email}`,
            email: c.email,
            source: 'google' as const,
            displayName: c.displayName,
            photoUrl: c.photoUrl,
          }));

        // Merge: Kodo first, then Google (deduplicated by email)
        const kodoEmails = new Set(kodoResults.map(u => u.email));
        const deduped = googleSuggestions.filter(g => !kodoEmails.has(g.email));
        this.suggestions.set([...kodoResults, ...deduped]);
        this.isSearching.set(false);
      }).catch(() => {
        this.isSearching.set(false);
      });
    }
  }

  private addByEmail(email: string, userId?: string, displayName?: string): void {
    const current = this.attendees();
    if (current.some(a => a.email === email)) {
      this.searchControl.setValue('');
      this.suggestions.set([]);
      return;
    }

    const newAttendee: EventAttendee = {
      email,
      displayName: displayName ?? email.split('@')[0],
      userId,
      rsvpStatus: 'needsAction',
      isOrganizer: false,
      isOptional: false,
    };

    const updated = [...current, newAttendee];
    this.attendees.set(updated);
    this.onChange(updated);
    this.onTouched();

    this.searchControl.setValue('');
    this.suggestions.set([]);
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  async ensureOrganizer(): Promise<void> {
    const current = this.attendees();
    if (current.some(a => a.isOrganizer)) return;

    const session = await this.supabaseService.client.auth.getSession();
    const user = session.data.session?.user;
    if (!user?.email) return;

    const organizer: EventAttendee = {
      email: user.email,
      displayName: user.user_metadata?.['full_name'] ?? user.email.split('@')[0],
      userId: user.id,
      rsvpStatus: 'accepted',
      isOrganizer: true,
      isOptional: false,
    };

    const updated = [organizer, ...current];
    this.attendees.set(updated);
    this.onChange(updated);
  }
}
