import {
  Component,
  inject,
  OnInit,
  ChangeDetectionStrategy,
  signal,
  computed,
  DestroyRef,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { CommonModule } from '@angular/common';
import {
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  FormControl,
  Validators,
  AbstractControl,
  ValidationErrors,
} from '@angular/forms';
import {
  MatDialogModule,
  MatDialogRef,
  MAT_DIALOG_DATA,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TextFieldModule } from '@angular/cdk/text-field';
import { EventEntry } from '../../../../core/services/event-database.service';
import {
  EventCategory,
  CategoryDefinition,
  CATEGORY_COLOR_PALETTE,
  getCategoryColors,
  slugify,
} from '../../../../shared/models/event-constants';
import { LinkedItem } from '../../../../features/documents/models/database.model';
import { GoogleCalendarReminder } from '../../../google-calendar/models/google-calendar.model';
import { EventAttendee, EventGuestPermissions, DEFAULT_GUEST_PERMISSIONS } from '../../models/attendee.model';
import { RecurrencePickerComponent } from '../recurrence-picker/recurrence-picker.component';
import { LinkedItemsPickerComponent } from '../linked-items-picker/linked-items-picker.component';
import { EventAttendeesPickerComponent } from '../event-attendees-picker/event-attendees-picker.component';
import { EventGuestPermissionsComponent } from '../event-guest-permissions/event-guest-permissions.component';
import { CalendarStore } from '../../store/calendar.store';
import { EventCategoryStore } from '../../../../core/stores/event-category.store';

// =====================================================================
// Interfaces
// =====================================================================

export interface EventFormDialogData {
  mode: 'create' | 'edit';
  event?: EventEntry;
  startDate?: string;
  endDate?: string;
  allDay?: boolean;
}

export interface EventFormDialogResult {
  title: string;
  description: string;
  start_date: string;
  end_date: string;
  all_day: boolean;
  category: EventCategory;
  location: string;
  recurrence: string;
  linked_items: LinkedItem[];
  reminders: GoogleCalendarReminder[];
  attendees: EventAttendee[];
  guest_permissions: EventGuestPermissions;
  databaseId: string;
  add_google_meet: boolean;
}

interface EventForm {
  title: FormControl<string>;
  description: FormControl<string>;
  startDate: FormControl<Date | null>;
  startTime: FormControl<string>;
  endDate: FormControl<Date | null>;
  endTime: FormControl<string>;
  allDay: FormControl<boolean>;
  addGoogleMeet: FormControl<boolean>;
  category: FormControl<string>;
  location: FormControl<string>;
  recurrence: FormControl<string>;
  linkedItems: FormControl<LinkedItem[]>;
  reminders: FormControl<GoogleCalendarReminder[]>;
  attendees: FormControl<EventAttendee[]>;
  guestPermissions: FormControl<EventGuestPermissions>;
  databaseId: FormControl<string>;
}

interface CategoryOption {
  value: string;
  label: string;
  colors: { bg: string; text: string; border: string };
}

@Component({
  selector: 'app-event-form-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatCheckboxModule,
    MatDatepickerModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    TextFieldModule,
    RecurrencePickerComponent,
    LinkedItemsPickerComponent,
    EventAttendeesPickerComponent,
    EventGuestPermissionsComponent,
  ],
  templateUrl: './event-form-dialog.component.html',
  styleUrls: ['./event-form-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventFormDialogComponent implements OnInit {
  private readonly dialogRef = inject(MatDialogRef<EventFormDialogComponent>);
  protected readonly data: EventFormDialogData = inject(MAT_DIALOG_DATA);
  private readonly fb = inject(FormBuilder);
  protected readonly calendarStore = inject(CalendarStore);
  protected readonly categoryStore = inject(EventCategoryStore);
  private readonly destroyRef = inject(DestroyRef);

  // State signals
  readonly isLoading = signal(false);
  readonly showDatabaseSelector = signal(false);

  // Panel state
  readonly showCategoryPanel = signal(false);
  readonly showAttendeesPanel = signal(false);
  readonly editingKey = signal<string | null>(null);
  readonly editLabel = new FormControl('', { nonNullable: true });
  readonly editColorKey = signal('blue');
  readonly confirmDeleteKey = signal<string | null>(null);
  readonly newCategoryLabel = new FormControl('', { nonNullable: true });
  readonly selectedColorKey = signal('blue');
  readonly paletteKeys = Object.keys(CATEGORY_COLOR_PALETTE);
  readonly palette = CATEGORY_COLOR_PALETTE;

  // Mode
  readonly isEditMode = this.data.mode === 'edit';
  readonly dialogTitle = this.isEditMode ? "Modifier l'événement" : 'Nouvel événement';

  // Whether to show guest permissions (at least 1 attendee)
  readonly hasAttendees = signal(false);

  // Category options from store
  readonly categoryOptions = computed<CategoryOption[]>(() =>
    this.categoryStore.allCategories().map(cat => ({
      value: cat.key,
      label: cat.label,
      colors: getCategoryColors(cat.key, this.categoryStore.allCategories()),
    }))
  );

  // Form
  readonly form: FormGroup<EventForm> = this.fb.group<EventForm>({
    title: new FormControl<string>('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    description: new FormControl<string>('', { nonNullable: true }),
    startDate: new FormControl<Date | null>(null, {
      validators: [Validators.required],
    }),
    startTime: new FormControl<string>('09:00', { nonNullable: true }),
    endDate: new FormControl<Date | null>(null, {
      validators: [Validators.required],
    }),
    endTime: new FormControl<string>('10:00', { nonNullable: true }),
    allDay: new FormControl<boolean>(false, { nonNullable: true }),
    addGoogleMeet: new FormControl<boolean>(false, { nonNullable: true }),
    category: new FormControl<string>('other', { nonNullable: true }),
    location: new FormControl<string>('', { nonNullable: true }),
    recurrence: new FormControl<string>('', { nonNullable: true }),
    linkedItems: new FormControl<LinkedItem[]>([], { nonNullable: true }),
    reminders: new FormControl<GoogleCalendarReminder[]>([], { nonNullable: true }),
    attendees: new FormControl<EventAttendee[]>([], { nonNullable: true }),
    guestPermissions: new FormControl<EventGuestPermissions>({ ...DEFAULT_GUEST_PERMISSIONS }, { nonNullable: true }),
    databaseId: new FormControl<string>('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  }, { validators: [EventFormDialogComponent.dateRangeValidator] });

  /**
   * Cross-field validator: ensures end date/time is not before start date/time
   */
  private static dateRangeValidator(control: AbstractControl): ValidationErrors | null {
    const group = control as FormGroup<EventForm>;
    const startDate = group.controls.startDate?.value;
    const endDate = group.controls.endDate?.value;

    if (!startDate || !endDate) return null;

    const allDay = group.controls.allDay?.value;
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (allDay) {
      start.setHours(0, 0, 0, 0);
      end.setHours(0, 0, 0, 0);
    } else {
      const startTime = group.controls.startTime?.value ?? '00:00';
      const endTime = group.controls.endTime?.value ?? '00:00';
      const [sh, sm] = startTime.split(':').map(Number);
      const [eh, em] = endTime.split(':').map(Number);
      start.setHours(isNaN(sh) ? 0 : sh, isNaN(sm) ? 0 : sm, 0, 0);
      end.setHours(isNaN(eh) ? 0 : eh, isNaN(em) ? 0 : em, 0, 0);
    }

    return end < start ? { dateRange: true } : null;
  }

  // =====================================================================
  // Lifecycle
  // =====================================================================

  ngOnInit(): void {
    this.calendarStore.loadEventDatabases();
    this.setupDatabaseWatcher();
    this.populateFormFromData();

    // Track whether attendees exist for showing permissions
    this.form.controls.attendees.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(attendees => this.hasAttendees.set(attendees.length > 0));
    this.hasAttendees.set(this.form.controls.attendees.value.length > 0);
  }

  // =====================================================================
  // Category Panel
  // =====================================================================

  toggleCategoryPanel(): void {
    this.showAttendeesPanel.set(false);
    this.showCategoryPanel.update(v => !v);
    this.editingKey.set(null);
    this.confirmDeleteKey.set(null);
  }

  toggleAttendeesPanel(): void {
    this.showCategoryPanel.set(false);
    this.showAttendeesPanel.update(v => !v);
  }

  onAddCategory(): void {
    const label = this.newCategoryLabel.value.trim();
    if (!label) return;

    const key = slugify(label);
    const allKeys = this.categoryStore.allCategories().map(c => c.key);
    if (allKeys.includes(key)) return;

    this.categoryStore.addCategory({
      key,
      label,
      colorKey: this.selectedColorKey(),
    });

    this.newCategoryLabel.reset('');
    this.selectedColorKey.set('blue');
  }

  startEdit(cat: CategoryDefinition): void {
    this.editingKey.set(cat.key);
    this.editLabel.setValue(cat.label);
    this.editColorKey.set(cat.colorKey);
  }

  cancelEdit(): void {
    this.editingKey.set(null);
  }

  saveEdit(cat: CategoryDefinition): void {
    const label = this.editLabel.value.trim();
    if (!label) return;

    this.categoryStore.updateCategory({
      key: cat.key,
      label,
      colorKey: this.editColorKey(),
    });
    this.editingKey.set(null);
  }

  requestDelete(key: string): void {
    this.confirmDeleteKey.set(key);
  }

  confirmDelete(key: string): void {
    this.categoryStore.deleteCategory({ key });
    this.confirmDeleteKey.set(null);
  }

  cancelDelete(): void {
    this.confirmDeleteKey.set(null);
  }

  selectNewColor(key: string): void {
    this.selectedColorKey.set(key);
  }

  selectEditColor(key: string): void {
    this.editColorKey.set(key);
  }

  // =====================================================================
  // Data Loading
  // =====================================================================

  private setupDatabaseWatcher(): void {
    toObservable(this.calendarStore.eventDatabases)
      .pipe(
        filter(databases => databases.length > 0),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(databases => {
        if (!this.isEditMode) {
          this.form.controls.databaseId.setValue(databases[0].database_id);
        }
        this.showDatabaseSelector.set(databases.length > 1);
      });
  }

  private populateFormFromData(): void {
    if (this.isEditMode && this.data.event) {
      const event = this.data.event;

      const startDateObj = new Date(event.start_date);
      const endDateObj = new Date(event.end_date);

      this.form.patchValue({
        title: event.title,
        description: event.description ?? '',
        startDate: startDateObj,
        startTime: this.formatTime(startDateObj),
        endDate: endDateObj,
        endTime: this.formatTime(endDateObj),
        allDay: event.all_day,
        category: event.category,
        location: event.location ?? '',
        recurrence: event.recurrence ?? '',
        linkedItems: event.linked_items ?? [],
        reminders: event.reminders ?? [],
        attendees: event.attendees ?? [],
        guestPermissions: event.guest_permissions ?? { ...DEFAULT_GUEST_PERMISSIONS },
        databaseId: event.databaseId,
      });

      this.form.controls.databaseId.disable();

      // If a Meet link already exists, check the toggle and disable it
      if (event.meet_link) {
        this.form.controls.addGoogleMeet.setValue(true);
        this.form.controls.addGoogleMeet.disable();
      }
    } else {
      if (this.data.startDate) {
        const start = new Date(this.data.startDate);
        this.form.controls.startDate.setValue(start);
        this.form.controls.startTime.setValue(this.formatTime(start));
      } else {
        const now = new Date();
        const minutes = now.getMinutes();
        now.setMinutes(minutes < 30 ? 30 : 0);
        if (minutes >= 30) now.setHours(now.getHours() + 1);
        now.setSeconds(0, 0);
        this.form.controls.startDate.setValue(now);
        this.form.controls.startTime.setValue(this.formatTime(now));
      }

      if (this.data.endDate) {
        const end = new Date(this.data.endDate);
        this.form.controls.endDate.setValue(end);
        this.form.controls.endTime.setValue(this.formatTime(end));
      } else {
        const startDate = this.form.controls.startDate.value!;
        const [h, m] = this.form.controls.startTime.value.split(':').map(Number);
        const defaultEnd = new Date(startDate);
        defaultEnd.setHours((isNaN(h) ? 0 : h) + 1, isNaN(m) ? 0 : m, 0, 0);
        this.form.controls.endDate.setValue(defaultEnd);
        this.form.controls.endTime.setValue(this.formatTime(defaultEnd));
      }

      if (this.data.allDay !== undefined) {
        this.form.controls.allDay.setValue(this.data.allDay);
      }
    }
  }

  // =====================================================================
  // UI Helpers
  // =====================================================================

  get isAllDay(): boolean {
    return this.form.controls.allDay.value;
  }

  onCancel(): void {
    this.dialogRef.close(null);
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const formValue = this.form.getRawValue();
    const startIso = this.combineDateAndTime(
      formValue.startDate,
      formValue.allDay ? '00:00' : formValue.startTime
    );

    let endIso: string;
    // For all-day events, end date should be start of next day (exclusive end, per iCal/Google convention)
    if (formValue.allDay) {
      const endDate = new Date(formValue.endDate!);
      endDate.setDate(endDate.getDate() + 1);
      endIso = endDate.toISOString().split('T')[0] + 'T00:00:00.000Z';
    } else {
      endIso = this.combineDateAndTime(formValue.endDate, formValue.endTime);
    }

    const result: EventFormDialogResult = {
      title: formValue.title.trim(),
      description: formValue.description.trim(),
      start_date: startIso,
      end_date: endIso,
      all_day: formValue.allDay,
      category: formValue.category,
      location: formValue.location.trim(),
      recurrence: formValue.recurrence,
      linked_items: formValue.linkedItems,
      reminders: formValue.reminders,
      attendees: formValue.attendees,
      guest_permissions: formValue.guestPermissions,
      databaseId: formValue.databaseId,
      add_google_meet: formValue.addGoogleMeet,
    };

    this.dialogRef.close(result);
  }

  // =====================================================================
  // Reminder Helpers
  // =====================================================================

  addReminder(): void {
    const current = this.form.controls.reminders.value;
    this.form.controls.reminders.setValue([
      ...current,
      { method: 'popup', minutes: 15 },
    ]);
  }

  removeReminder(index: number): void {
    const current = [...this.form.controls.reminders.value];
    current.splice(index, 1);
    this.form.controls.reminders.setValue(current);
  }

  updateReminderMethod(index: number, method: 'popup' | 'email'): void {
    const current = [...this.form.controls.reminders.value];
    current[index] = { ...current[index], method };
    this.form.controls.reminders.setValue(current);
  }

  updateReminderMinutes(index: number, minutes: number): void {
    const current = [...this.form.controls.reminders.value];
    current[index] = { ...current[index], minutes };
    this.form.controls.reminders.setValue(current);
  }

  // =====================================================================
  // Date/Time Helpers
  // =====================================================================

  private combineDateAndTime(date: Date | null, time: string): string {
    if (!date) {
      throw new Error('combineDateAndTime called with null date — form validation should prevent this');
    }

    const [hours, minutes] = time.split(':').map(Number);
    const combined = new Date(date);
    combined.setHours(hours ?? 0, minutes ?? 0, 0, 0);
    return combined.toISOString();
  }

  private formatTime(date: Date): string {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }
}
